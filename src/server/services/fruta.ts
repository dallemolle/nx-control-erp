import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { FrutaFormValues } from "@/lib/schemas/fruta";
import { comMensagemDeDuplicidade } from "./duplicidade";

const MSG_DUPLICADA = "Já existe uma fruta com este nome";

export async function listarFrutas(empresaId: string, opcoes: { somenteAtivas?: boolean } = {}) {
  return prisma.fruta.findMany({
    where: { empresaId, ...(opcoes.somenteAtivas ? { ativo: true } : {}) },
    orderBy: { nome: "asc" },
  });
}

/** Garante que a fruta é da empresa e está ativa — usado por produto e talhão. */
export async function requireFrutaAtiva(empresaId: string, frutaId: string): Promise<void> {
  const fruta = await prisma.fruta.findFirst({
    where: { id: frutaId, empresaId, ativo: true },
    select: { id: true },
  });
  if (!fruta) throw new Error("Fruta não encontrada ou inativa");
}

function autorizar(sessao: SessaoAtiva) {
  requirePermission(sessao.perfil, "cadastroProducao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
}

export async function criarFruta(sessao: SessaoAtiva, dados: FrutaFormValues) {
  autorizar(sessao);
  const fruta = await comMensagemDeDuplicidade(
    () => prisma.fruta.create({ data: { ...dados, empresaId: sessao.empresaId } }),
    MSG_DUPLICADA,
  );
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Fruta",
    entidadeId: fruta.id,
    acao: "CRIAR",
    anterior: null,
    novo: dados,
  });
  return fruta;
}

export async function atualizarFruta(sessao: SessaoAtiva, id: string, dados: FrutaFormValues) {
  autorizar(sessao);
  const anterior = await prisma.fruta.findUniqueOrThrow({ where: { id, empresaId: sessao.empresaId } });
  const fruta = await comMensagemDeDuplicidade(
    () => prisma.fruta.update({ where: { id }, data: dados }),
    MSG_DUPLICADA,
  );
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Fruta",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: {
      nome: anterior.nome,
      custoPadraoKg: Number(anterior.custoPadraoKg),
      exigeBranqueamento: anterior.exigeBranqueamento,
    },
    novo: dados,
  });
  return fruta;
}

export async function definirAtivoFruta(sessao: SessaoAtiva, id: string, ativo: boolean) {
  autorizar(sessao);
  await prisma.fruta.findUniqueOrThrow({ where: { id, empresaId: sessao.empresaId } });
  const fruta = await prisma.fruta.update({ where: { id }, data: { ativo } });
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Fruta",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });
  return fruta;
}
