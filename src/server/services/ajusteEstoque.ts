import type { MotivoAjusteEstoque } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireAlteracaoFilial, requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { AjusteFormValues } from "@/lib/schemas/ajusteEstoque";
import { registrarMovimento } from "./estoque";

/** Ajuste de estoque (RN-25): entrada ou saída com motivo; saída nunca passa do saldo. */
export async function criarAjuste(sessao: SessaoAtiva, dados: AjusteFormValues) {
  requirePermission(sessao.perfil, "estoque:ajustar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const quantidadeKg = dados.sentido === "SAIDA" ? -dados.quantidadeKg : dados.quantidadeKg;

  return prisma.$transaction(async (tx) => {
    const lote = await tx.lote.findFirst({
      where: { id: dados.loteId, filialId: sessao.filialId },
      select: { id: true, codigo: true, recepcao: { select: { status: true } } },
    });
    if (!lote) throw new Error("Lote não encontrado");
    // Recepção excluída: o lote ficou zerado de propósito e não volta a ter saldo.
    if (lote.recepcao?.status === "CANCELADA") {
      throw new Error("O lote é de uma recepção excluída e não recebe ajustes");
    }

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
    },
    orderBy: [{ data: "desc" }, { criadoEm: "desc" }],
  });
  return ajustes.map(({ lote, ...ajuste }) => ({ ...ajuste, lote: { codigo: lote.codigo }, produto: lote.produto }));
}

export type AjusteListado = Awaited<ReturnType<typeof listarAjustes>>[number];
