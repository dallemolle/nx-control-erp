import { prisma } from "@/server/db/client";
import { hashChaveApi } from "@/server/services/apiKey";
import { requireVinculoAtivo, AcessoNegadoError } from "@/server/services/usuarioEmpresa";
import { requireVinculoFilialAtivo, AcessoFilialNegadoError } from "@/server/services/usuarioEmpresaFilial";
import type { SessaoAtiva } from "@/server/auth/sessao";

export class ApiAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiAuthError";
    this.status = status;
  }
}

export async function requireSessaoApi(request: Request): Promise<SessaoAtiva> {
  const cabecalhoAuth = request.headers.get("authorization") ?? "";
  const [esquema, chave] = cabecalhoAuth.split(" ");
  if (esquema !== "Bearer" || !chave) {
    throw new ApiAuthError(401, "Chave de API ausente ou mal formada");
  }

  const apiKey = await prisma.apiKey.findUnique({
    where: { chaveHash: hashChaveApi(chave) },
    include: { usuario: true },
  });
  if (!apiKey) {
    throw new ApiAuthError(401, "Chave de API inválida");
  }
  if (apiKey.revogadaEm) {
    throw new ApiAuthError(401, "Chave de API revogada");
  }

  await prisma.apiKey.update({ where: { id: apiKey.id }, data: { ultimoUsoEm: new Date() } });

  const empresaId = request.headers.get("x-empresa-id");
  const filialId = request.headers.get("x-filial-id");
  if (!empresaId || !filialId) {
    throw new ApiAuthError(400, "Informe os headers X-Empresa-Id e X-Filial-Id");
  }

  let perfil;
  try {
    perfil = await requireVinculoAtivo(apiKey.usuarioId, empresaId);
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      throw new ApiAuthError(403, "Usuário sem vínculo com a empresa informada");
    }
    throw erro;
  }

  try {
    const { podeAlterar } = await requireVinculoFilialAtivo(apiKey.usuarioId, empresaId, filialId);
    return {
      usuarioId: apiKey.usuarioId,
      nome: apiKey.usuario.nome,
      empresaId,
      perfil,
      filialId,
      podeAlterarFilial: podeAlterar,
    };
  } catch (erro) {
    if (erro instanceof AcessoFilialNegadoError) {
      throw new ApiAuthError(403, "Usuário sem vínculo com a filial informada");
    }
    throw erro;
  }
}
