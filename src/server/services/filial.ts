import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { FilialFormValues } from "@/lib/schemas/filial";

export async function listarFiliais(empresaId: string) {
  return prisma.filial.findMany({ where: { empresaId }, orderBy: { nome: "asc" } });
}

export async function criarFilial(sessao: SessaoAtiva, dados: FilialFormValues) {
  requirePermission(sessao.perfil, "filial:gerenciar");

  const filial = await prisma.filial.create({
    data: { ...dados, empresaId: sessao.empresaId },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: filial.id,
    usuarioId: sessao.usuarioId,
    entidade: "Filial",
    entidadeId: filial.id,
    acao: "CRIAR",
    anterior: null,
    novo: dados,
  });

  return filial;
}

export async function atualizarFilial(sessao: SessaoAtiva, id: string, dados: FilialFormValues) {
  requirePermission(sessao.perfil, "filial:gerenciar");

  const anterior = await prisma.filial.findUniqueOrThrow({
    where: { id, empresaId: sessao.empresaId },
  });
  const filial = await prisma.filial.update({ where: { id }, data: dados });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: id,
    usuarioId: sessao.usuarioId,
    entidade: "Filial",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: { nome: anterior.nome, cnpj: anterior.cnpj },
    novo: dados,
  });

  return filial;
}

export async function definirAtivoFilial(sessao: SessaoAtiva, id: string, ativo: boolean) {
  requirePermission(sessao.perfil, "filial:gerenciar");

  await prisma.filial.findUniqueOrThrow({
    where: { id, empresaId: sessao.empresaId },
  });
  const filial = await prisma.filial.update({ where: { id }, data: { ativo } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: id,
    usuarioId: sessao.usuarioId,
    entidade: "Filial",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });

  return filial;
}
