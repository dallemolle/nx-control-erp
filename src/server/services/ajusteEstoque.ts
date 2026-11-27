import type { MotivoAjusteEstoque } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireAlteracaoFilial, requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { AjusteFormValues } from "@/lib/schemas/ajusteEstoque";
import { bloqueioDaProducao, recepcaoExcluida, registrarMovimento, SELECT_SITUACAO_LOTE } from "./estoque";

/** Ajuste de estoque (RN-25): entrada ou saída com motivo; saída nunca passa do saldo. */
export async function criarAjuste(sessao: SessaoAtiva, dados: AjusteFormValues) {
  requirePermission(sessao.perfil, "estoque:ajustar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const quantidadeKg = dados.sentido === "SAIDA" ? -dados.quantidadeKg : dados.quantidadeKg;

  return prisma.$transaction(async (tx) => {
    const lote = await tx.lote.findFirst({
      where: { id: dados.loteId, filialId: sessao.filialId },
      select: { id: true, codigo: true, ...SELECT_SITUACAO_LOTE },
    });
    if (!lote) throw new Error("Lote não encontrado");
    // Recepção excluída: o lote ficou zerado de propósito e não volta a ter saldo.
    if (recepcaoExcluida(lote)) {
      throw new Error("O lote é de uma recepção excluída e não recebe ajustes");
    }
    // Polpa de OP aberta, cancelada ou removida da OP (D-07).
    const bloqueio = bloqueioDaProducao(lote);
    if (bloqueio) throw new Error(bloqueio);

    const ajuste = await tx.ajusteEstoque.create({
      data: {
        filialId: sessao.filialId,
        data: dados.data,
        loteId: lote.id,
        quantidadeKg,
        motivo: dados.motivo,
        observacao: dados.observacao ?? null,
        usuarioId: sessao.usuarioId,
      },
    });
    await registrarMovimento(tx, {
      filialId: sessao.filialId,
      loteId: lote.id,
      data: dados.data,
      tipo: "AJUSTE",
      quantidadeKg,
      usuarioId: sessao.usuarioId,
      ajusteId: ajuste.id,
    });

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "AjusteEstoque",
        entidadeId: ajuste.id,
        acao: "CRIAR",
        anterior: null,
        novo: { lote: lote.codigo, quantidadeKg, motivo: dados.motivo, observacao: dados.observacao ?? null },
      },
      tx,
    );
    return ajuste;
  });
}

/**
 * Estorna um ajuste errado: movimento contrário (ESTORNO_AJUSTE) com a data do ajuste,
 * então o par se anula em qualquer dia, e o ajuste fica marcado (sai dos totais). Estornar
 * uma entrada não pode deixar o lote negativo.
 */
export async function estornarAjuste(sessao: SessaoAtiva, ajusteId: string, motivo: string): Promise<void> {
  requirePermission(sessao.perfil, "estoque:ajustar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length < 3) throw new Error("Informe o motivo do estorno");

  await prisma.$transaction(async (tx) => {
    // Trava o ajuste: dois estornos ao mesmo tempo ficam em fila e o segundo o vê estornado.
    await tx.$queryRaw`SELECT id FROM ajustes_estoque WHERE id = ${ajusteId} FOR UPDATE`;
    const ajuste = await tx.ajusteEstoque.findFirst({
      where: { id: ajusteId, filialId: sessao.filialId },
      include: { lote: { select: { codigo: true, saldoKg: true } } },
    });
    if (!ajuste) throw new Error("Ajuste não encontrado");
    if (ajuste.estornadoEm) throw new Error("Este ajuste já foi estornado");

    const quantidadeKg = -Number(ajuste.quantidadeKg);
    const saldo = Number(ajuste.lote.saldoKg);
    if (quantidadeKg < 0 && saldo + quantidadeKg < -0.0005) {
      throw new Error(
        `O lote ${ajuste.lote.codigo} tem ${saldo.toLocaleString("pt-BR")} kg; estornar esta entrada tiraria ` +
          `${(-quantidadeKg).toLocaleString("pt-BR")} kg`,
      );
    }
    // Se outra saída entrou depois da leitura, o UPDATE condicional recusa (saldo insuficiente).
    await registrarMovimento(tx, {
      filialId: sessao.filialId,
      loteId: ajuste.loteId,
      data: ajuste.data,
      tipo: "ESTORNO_AJUSTE",
      quantidadeKg,
      usuarioId: sessao.usuarioId,
      ajusteEstornadoId: ajuste.id,
    });
    const estornadoEm = new Date();
    await tx.ajusteEstoque.update({
      where: { id: ajuste.id },
      data: { estornadoEm, estornadoPorId: sessao.usuarioId, motivoEstorno: motivoLimpo },
    });

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "AjusteEstoque",
        entidadeId: ajuste.id,
        acao: "ESTORNAR",
        anterior: { estornado: false },
        novo: {
          estornado: true,
          lote: ajuste.lote.codigo,
          quantidadeKg: Number(ajuste.quantidadeKg),
          motivo: motivoLimpo,
        },
      },
      tx,
    );
  });
}

export type FiltroAjustes = { inicio: Date; fim: Date; motivo?: MotivoAjusteEstoque };

export async function listarAjustes(filialId: string, filtros: FiltroAjustes) {
  const ajustes = await prisma.ajusteEstoque.findMany({
    where: {
      filialId,
      data: { gte: filtros.inicio, lte: filtros.fim },
      ...(filtros.motivo ? { motivo: filtros.motivo } : {}),
    },
    include: {
      lote: { select: { codigo: true, produto: { select: { descricao: true } } } },
      usuario: { select: { nome: true } },
      estornadoPor: { select: { nome: true } },
    },
    orderBy: [{ data: "desc" }, { criadoEm: "desc" }],
  });
  return ajustes.map(({ lote, ...ajuste }) => ({ ...ajuste, lote: { codigo: lote.codigo }, produto: lote.produto }));
}

export type AjusteListado = Awaited<ReturnType<typeof listarAjustes>>[number];
