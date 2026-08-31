import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { CentroLucroFormValues } from "@/lib/schemas/centroLucro";

export async function listarCentrosLucro(filialId: string) {
  return prisma.centroLucro.findMany({ where: { filialId }, orderBy: { codigo: "asc" } });
}

export async function criarCentroLucro(sessao: SessaoAtiva, dados: CentroLucroFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const centro = await prisma.centroLucro.create({
    data: { ...dados, filialId: sessao.filialId },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "CentroLucro",
    entidadeId: centro.id,
    acao: "CRIAR",
    anterior: null,
    novo: dados,
  });

  return centro;
}

export async function atualizarCentroLucro(
  sessao: SessaoAtiva,
  id: string,
  dados: CentroLucroFormValues,
) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.centroLucro.findUniqueOrThrow({
    where: { id, filialId: sessao.filialId },
  });
  const centro = await prisma.centroLucro.update({ where: { id }, data: dados });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "CentroLucro",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: {
      nome: anterior.nome,
      codigo: anterior.codigo,
    },
    novo: dados,
  });

  return centro;
}

export async function definirAtivoCentroLucro(sessao: SessaoAtiva, id: string, ativo: boolean) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await prisma.centroLucro.findUniqueOrThrow({ where: { id, filialId: sessao.filialId } });
  const centro = await prisma.centroLucro.update({ where: { id }, data: { ativo } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "CentroLucro",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });

  return centro;
}
