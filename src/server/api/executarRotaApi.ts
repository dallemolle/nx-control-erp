import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { PermissionError, FilialSomenteLeituraError } from "@/server/auth/permissions";
import { ApiAuthError, requireSessaoApi } from "./sessaoApi";
import { ErroClassificacaoFiscal } from "@/server/services/classificacaoFiscal";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { ClassificacaoFiscal } from "@prisma/client";

export class ErroValidacaoApi extends Error {
  campos: string[];

  constructor(message: string, campos: string[] = []) {
    super(message);
    this.name = "ErroValidacaoApi";
    this.campos = campos;
  }
}

/**
 * Lê `?classificacao=FISCAL|GERENCIAL`. Ausente = todos; valor desconhecido é
 * 422 (na API o erro é explícito, ao contrário do filtro de URL das telas).
 */
export function classificacaoDaQuery(url: URL): ClassificacaoFiscal | undefined {
  const valor = url.searchParams.get("classificacao");
  if (valor === null || valor === "") return undefined;
  if (valor !== "FISCAL" && valor !== "GERENCIAL") {
    throw new ErroValidacaoApi('Use ?classificacao=FISCAL ou ?classificacao=GERENCIAL', ["classificacao"]);
  }
  return valor;
}

export async function executarRotaApi(
  request: Request,
  handler: (sessao: SessaoAtiva) => Promise<Response>,
): Promise<Response> {
  try {
    const sessao = await requireSessaoApi(request);
    return await handler(sessao);
  } catch (erro) {
    if (erro instanceof ApiAuthError) {
      return Response.json({ erro: erro.message }, { status: erro.status });
    }
    if (erro instanceof PermissionError || erro instanceof FilialSomenteLeituraError) {
      return Response.json({ erro: erro.message }, { status: 403 });
    }
    if (erro instanceof ErroValidacaoApi || erro instanceof ErroClassificacaoFiscal) {
      return Response.json({ erro: erro.message, campos: erro.campos }, { status: 422 });
    }
    if (erro instanceof ZodError) {
      return Response.json(
        {
          erro: erro.issues[0]?.message ?? "Dados inválidos",
          campos: erro.issues.map((issue) => issue.path[0]).filter((p) => p !== undefined).map(String),
        },
        { status: 422 },
      );
    }
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2025") {
      return Response.json({ erro: "Recurso não encontrado" }, { status: 404 });
    }
    console.error(erro);
    return Response.json({ erro: "Erro interno" }, { status: 500 });
  }
}
