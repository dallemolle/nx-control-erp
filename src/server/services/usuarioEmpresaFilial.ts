import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";

export class AcessoFilialNegadoError extends Error {
  constructor() {
    super("Usuário não possui acesso ativo a esta filial");
    this.name = "AcessoFilialNegadoError";
  }
}

export async function requireVinculoFilialAtivo(
  usuarioId: string,
  empresaId: string,
  filialId: string,
): Promise<{ podeAlterar: boolean }> {
  const vinculo = await prisma.usuarioEmpresaFilial.findFirst({
    where: {
      filialId,
      ativo: true,
      filial: { ativo: true },
      usuarioEmpresa: { usuarioId, empresaId, ativo: true },
    },
  });

  if (!vinculo) {
    throw new AcessoFilialNegadoError();
  }

  return { podeAlterar: vinculo.podeAlterar };
}

export async function listarFiliaisAcessiveis(usuarioId: string, empresaId: string) {
  return prisma.usuarioEmpresaFilial.findMany({
    where: {
      ativo: true,
      filial: { ativo: true },
      usuarioEmpresa: { usuarioId, empresaId, ativo: true },
    },
    include: { filial: true },
    orderBy: { filial: { nome: "asc" } },
  });
}

export async function listarAcessosFiliaisDoUsuario(sessao: SessaoAtiva, usuarioId: string) {
  return prisma.filial.findMany({
    where: { empresaId: sessao.empresaId, ativo: true },
    include: { usuariosFiliais: { where: { usuarioEmpresa: { usuarioId } } } },
    orderBy: { nome: "asc" },
  });
}

export async function definirAcessoFilial(
  sessao: SessaoAtiva,
  usuarioId: string,
  filialId: string,
  dados: { temAcesso: boolean; podeAlterar: boolean },
) {
  requirePermission(sessao.perfil, "usuario:gerenciar");

  const vinculo = await prisma.usuarioEmpresa.findUniqueOrThrow({
    where: { usuarioId_empresaId: { usuarioId, empresaId: sessao.empresaId } },
  });

  const anterior = await prisma.usuarioEmpresaFilial.findUnique({
    where: { usuarioEmpresaId_filialId: { usuarioEmpresaId: vinculo.id, filialId } },
  });

  const acesso = await prisma.usuarioEmpresaFilial.upsert({
    where: { usuarioEmpresaId_filialId: { usuarioEmpresaId: vinculo.id, filialId } },
    update: { ativo: dados.temAcesso, podeAlterar: dados.podeAlterar },
    create: {
      usuarioEmpresaId: vinculo.id,
      filialId,
      ativo: dados.temAcesso,
      podeAlterar: dados.podeAlterar,
    },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId,
    usuarioId: sessao.usuarioId,
    entidade: "UsuarioEmpresaFilial",
    entidadeId: acesso.id,
    acao: "ATUALIZAR",
    anterior: anterior ? { temAcesso: anterior.ativo, podeAlterar: anterior.podeAlterar } : null,
    novo: { temAcesso: dados.temAcesso, podeAlterar: dados.podeAlterar },
  });

  return acesso;
}
