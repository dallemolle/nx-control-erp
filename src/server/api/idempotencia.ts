import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";

export const CABECALHO_IDEMPOTENCIA = "idempotency-key";
const TAMANHO_MAXIMO_CHAVE = 255;

/** Erro de idempotência com o status HTTP já decidido (409 ou 422). */
export class ErroIdempotencia extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ErroIdempotencia";
    this.status = status;
  }
}

async function hashDoCorpo(request: Request): Promise<string | null> {
  // Multipart não é comparável: o boundary é sorteado a cada envio, então um
  // reenvio legítimo do mesmo arquivo teria hash diferente.
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return null;
  const corpo = await request.clone().arrayBuffer();
  return createHash("sha256").update(Buffer.from(corpo)).digest("hex");
}

/**
 * Executa um POST no máximo uma vez por `Idempotency-Key` (por usuário, filial
 * e rota). Sem o cabeçalho, apenas executa — o comportamento antigo.
 *
 * - 1ª chamada: reserva a chave, executa e, em caso de sucesso (2xx), guarda a
 *   resposta. Em erro (4xx/5xx/exceção) a reserva é apagada, para o cliente
 *   poder corrigir e reenviar com a mesma chave.
 * - Reenvio após sucesso: devolve a resposta guardada, com o mesmo status e o
 *   cabeçalho `Idempotent-Replayed: true`, sem executar de novo.
 * - Reenvio enquanto a original ainda roda: 409.
 * - Mesma chave com outro corpo JSON: 422.
 */
export async function comIdempotencia(
  request: Request,
  sessao: SessaoAtiva,
  executar: () => Promise<Response>,
): Promise<Response> {
  const chave = request.headers.get(CABECALHO_IDEMPOTENCIA);
  if (request.method !== "POST" || chave === null) return executar();

  if (chave.trim() === "" || chave.length > TAMANHO_MAXIMO_CHAVE) {
    throw new ErroIdempotencia(422, `Idempotency-Key deve ter de 1 a ${TAMANHO_MAXIMO_CHAVE} caracteres`);
  }

  const rota = new URL(request.url).pathname;
  const hashCorpo = await hashDoCorpo(request);
  const identificacao = { usuarioId: sessao.usuarioId, filialId: sessao.filialId, rota, chave };

  let reservaId: string;
  try {
    const reserva = await prisma.requisicaoIdempotente.create({
      data: { ...identificacao, hashCorpo },
      select: { id: true },
    });
    reservaId = reserva.id;
  } catch (erro) {
    if (!(erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002")) throw erro;
    return await respostaDoReenvio(identificacao, hashCorpo);
  }

  let resposta: Response;
  try {
    resposta = await executar();
  } catch (erro) {
    await prisma.requisicaoIdempotente.delete({ where: { id: reservaId } });
    throw erro;
  }

  if (resposta.ok) {
    await prisma.requisicaoIdempotente.update({
      where: { id: reservaId },
      data: {
        statusHttp: resposta.status,
        resposta: (await resposta.clone().json()) as Prisma.InputJsonValue,
        concluidaEm: new Date(),
      },
    });
  } else {
    await prisma.requisicaoIdempotente.delete({ where: { id: reservaId } });
  }
  return resposta;
}

async function respostaDoReenvio(
  identificacao: { usuarioId: string; filialId: string; rota: string; chave: string },
  hashCorpo: string | null,
): Promise<Response> {
  const anterior = await prisma.requisicaoIdempotente.findUnique({
    where: { usuarioId_filialId_rota_chave: identificacao },
  });
  // Corrida rara: a original falhou e apagou a reserva entre o create e este findUnique.
  if (!anterior) {
    throw new ErroIdempotencia(409, "Requisição com esta Idempotency-Key foi interrompida; reenvie");
  }
  if (anterior.hashCorpo !== null && hashCorpo !== null && anterior.hashCorpo !== hashCorpo) {
    throw new ErroIdempotencia(422, "Idempotency-Key já usada com um corpo diferente");
  }
  if (anterior.statusHttp === null) {
    throw new ErroIdempotencia(
      409,
      "Requisição com esta Idempotency-Key ainda em processamento; consulte o recurso antes de reenviar",
    );
  }
  return Response.json(anterior.resposta, {
    status: anterior.statusHttp,
    headers: { "Idempotent-Replayed": "true" },
  });
}
