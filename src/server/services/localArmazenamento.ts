import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { LocalArmazenamentoFormValues } from "@/lib/schemas/localArmazenamento";
import { comMensagemDeDuplicidade } from "./duplicidade";

const MSG_DUPLICADO = "Já existe um local com este nome nesta filial";

export async function listarLocaisArmazenamento(filialId: string) {
  return prisma.localArmazenamento.findMany({ where: { filialId }, orderBy: { nome: "asc" } });
}

/**
 * Locais do filtro do Estoque: os ativos e os inativos que ainda têm lote com saldo (inativados antes de o
 * Inativar conferir os lotes). Transferência só para os ativos.
 */
export async function listarLocaisDoEstoque(filialId: string) {
  return prisma.localArmazenamento.findMany({
    where: { filialId, OR: [{ ativo: true }, { lotes: { some: { saldoKg: { gt: 0 } } } }] },
    select: { id: true, nome: true, ativo: true },
    orderBy: { nome: "asc" },
  });
}

function autorizar(sessao: SessaoAtiva) {
  requirePermission(sessao.perfil, "cadastroProducao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
}

function paraBanco(dados: LocalArmazenamentoFormValues) {
  return { ...dados, temperatura: dados.temperatura ?? null, capacidadeKg: dados.capacidadeKg ?? null };
}

export async function criarLocalArmazenamento(sessao: SessaoAtiva, dados: LocalArmazenamentoFormValues) {
  autorizar(sessao);
  const novo = paraBanco(dados);
  const local = await comMensagemDeDuplicidade(
    () => prisma.localArmazenamento.create({ data: { ...novo, filialId: sessao.filialId } }),
    MSG_DUPLICADO,
  );
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "LocalArmazenamento",
    entidadeId: local.id,
    acao: "CRIAR",
    anterior: null,
    novo,
  });
  return local;
}

export async function atualizarLocalArmazenamento(
  sessao: SessaoAtiva,
  id: string,
  dados: LocalArmazenamentoFormValues,
) {
  autorizar(sessao);
  const anterior = await prisma.localArmazenamento.findUniqueOrThrow({ where: { id, filialId: sessao.filialId } });
  const novo = paraBanco(dados);
  const local = await comMensagemDeDuplicidade(
    () => prisma.localArmazenamento.update({ where: { id }, data: novo }),
    MSG_DUPLICADO,
  );
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "LocalArmazenamento",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: {
      nome: anterior.nome,
      tipo: anterior.tipo,
      temperatura: anterior.temperatura,
      capacidadeKg: anterior.capacidadeKg === null ? null : Number(anterior.capacidadeKg),
    },
    novo,
  });
  return local;
}

export async function definirAtivoLocalArmazenamento(sessao: SessaoAtiva, id: string, ativo: boolean) {
  autorizar(sessao);
  await prisma.localArmazenamento.findUniqueOrThrow({ where: { id, filialId: sessao.filialId } });
  // Inativo, o local sai do quadro de ocupação, do filtro do Estoque e das transferências: os lotes ficariam
  // escondidos lá dentro.
  if (!ativo) {
    const comSaldo = await prisma.lote.aggregate({
      where: { localId: id, saldoKg: { gt: 0 } },
      _count: true,
      _sum: { saldoKg: true },
    });
    if (comSaldo._count > 0) {
      const kg = Number(comSaldo._sum.saldoKg ?? 0).toLocaleString("pt-BR");
      const lotes = comSaldo._count === 1 ? "1 lote" : `${comSaldo._count} lotes`;
      throw new Error(`O local tem ${lotes} com saldo (${kg} kg): transfira os lotes antes de inativar`);
    }
  }
  const local = await prisma.localArmazenamento.update({ where: { id }, data: { ativo } });
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "LocalArmazenamento",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });
  return local;
}
