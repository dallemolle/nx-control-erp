import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { TalhaoFormValues } from "@/lib/schemas/talhao";
import { comMensagemDeDuplicidade } from "./duplicidade";
import { requireFrutaAtiva } from "./fruta";

const MSG_DUPLICADO = "Já existe um talhão com este nome nesta filial";

export async function listarTalhoes(filialId: string) {
  return prisma.talhao.findMany({
    where: { filialId },
    include: { fruta: { select: { nome: true } } },
    orderBy: { nome: "asc" },
  });
}

function autorizar(sessao: SessaoAtiva) {
  requirePermission(sessao.perfil, "cadastroProducao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
}

function paraBanco(dados: TalhaoFormValues) {
  return {
    ...dados,
    anoPlantio: dados.anoPlantio ?? null,
    espacamento: dados.espacamento ?? null,
    observacao: dados.observacao ?? null,
  };
}

export async function criarTalhao(sessao: SessaoAtiva, dados: TalhaoFormValues) {
  autorizar(sessao);
  await requireFrutaAtiva(sessao.empresaId, dados.frutaId);
  const novo = paraBanco(dados);
  const talhao = await comMensagemDeDuplicidade(
    () => prisma.talhao.create({ data: { ...novo, filialId: sessao.filialId } }),
    MSG_DUPLICADO,
  );
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Talhao",
    entidadeId: talhao.id,
    acao: "CRIAR",
    anterior: null,
    novo,
  });
  return talhao;
}

export async function atualizarTalhao(sessao: SessaoAtiva, id: string, dados: TalhaoFormValues) {
  autorizar(sessao);
  const anterior = await prisma.talhao.findUniqueOrThrow({ where: { id, filialId: sessao.filialId } });
  await requireFrutaAtiva(sessao.empresaId, dados.frutaId);
  const novo = paraBanco(dados);
  const talhao = await comMensagemDeDuplicidade(
    () => prisma.talhao.update({ where: { id }, data: novo }),
    MSG_DUPLICADO,
  );
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Talhao",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: {
      nome: anterior.nome,
      frutaId: anterior.frutaId,
      areaHa: Number(anterior.areaHa),
      anoPlantio: anterior.anoPlantio,
      espacamento: anterior.espacamento,
      observacao: anterior.observacao,
    },
    novo,
  });
  return talhao;
}

export async function definirAtivoTalhao(sessao: SessaoAtiva, id: string, ativo: boolean) {
  autorizar(sessao);
  await prisma.talhao.findUniqueOrThrow({ where: { id, filialId: sessao.filialId } });
  const talhao = await prisma.talhao.update({ where: { id }, data: { ativo } });
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Talhao",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });
  return talhao;
}
