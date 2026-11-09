import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { InsumoFormValues } from "@/lib/schemas/insumo";
import { comMensagemDeDuplicidade } from "./duplicidade";

const MSG_DUPLICADO = "Já existe um insumo com este nome";

export async function listarInsumos(empresaId: string) {
  return prisma.insumo.findMany({ where: { empresaId }, orderBy: { nome: "asc" } });
}

function autorizar(sessao: SessaoAtiva) {
  requirePermission(sessao.perfil, "cadastroProducao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
}

export async function criarInsumo(sessao: SessaoAtiva, dados: InsumoFormValues) {
  autorizar(sessao);
  const insumo = await comMensagemDeDuplicidade(
    () => prisma.insumo.create({ data: { ...dados, empresaId: sessao.empresaId } }),
    MSG_DUPLICADO,
  );
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Insumo",
    entidadeId: insumo.id,
    acao: "CRIAR",
    anterior: null,
    novo: dados,
  });
  return insumo;
}

export async function atualizarInsumo(sessao: SessaoAtiva, id: string, dados: InsumoFormValues) {
  autorizar(sessao);
  const anterior = await prisma.insumo.findUniqueOrThrow({ where: { id, empresaId: sessao.empresaId } });
  const insumo = await comMensagemDeDuplicidade(
    () => prisma.insumo.update({ where: { id }, data: dados }),
    MSG_DUPLICADO,
  );
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Insumo",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: { nome: anterior.nome, unidade: anterior.unidade, custoUnitario: Number(anterior.custoUnitario) },
    novo: dados,
  });
  return insumo;
}

export async function definirAtivoInsumo(sessao: SessaoAtiva, id: string, ativo: boolean) {
  autorizar(sessao);
  await prisma.insumo.findUniqueOrThrow({ where: { id, empresaId: sessao.empresaId } });
  const insumo = await prisma.insumo.update({ where: { id }, data: { ativo } });
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Insumo",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });
  return insumo;
}
