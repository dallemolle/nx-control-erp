import { Prisma } from "@prisma/client";
import { PermissionError, FilialSomenteLeituraError } from "@/server/auth/permissions";
import { ApiAuthError, requireSessaoApi } from "./sessaoApi";
import type { SessaoAtiva } from "@/server/auth/sessao";

export class ErroValidacaoApi extends Error {
  campos: string[];

  constructor(message: string, campos: string[] = []) {
    super(message);
    this.name = "ErroValidacaoApi";
    this.campos = campos;
  }
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
    if (erro instanceof ErroValidacaoApi) {
      return Response.json({ erro: erro.message, campos: erro.campos }, { status: 422 });
    }
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2025") {
      return Response.json({ erro: "Recurso não encontrado" }, { status: 404 });
    }
    console.error(erro);
    return Response.json({ erro: "Erro interno" }, { status: 500 });
  }
}
