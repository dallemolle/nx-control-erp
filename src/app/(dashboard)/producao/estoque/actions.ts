"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { prisma } from "@/server/db/client";
import { liberarLoteVencido, revogarLiberacaoLote, transferirLote } from "@/server/services/estoque";

export type FormState = { erro?: string; sucesso?: boolean };

export async function moverLoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const loteId = String(formData.get("loteId") ?? "");
  const localId = String(formData.get("localId") ?? "");
  if (!localId) return { erro: "Selecione o local de destino" };

  try {
    const lote = await prisma.lote.findFirst({ where: { id: loteId, filialId: sessao.filialId }, select: { saldoKg: true } });
    if (!lote) return { erro: "Lote não encontrado" };
    await transferirLote(sessao, loteId, localId, Number(lote.saldoKg));
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : "Ocorreu um erro inesperado" };
  }
  revalidatePath("/producao/estoque");
  return { sucesso: true };
}

async function executarNoLote(acao: () => Promise<unknown>): Promise<FormState> {
  try {
    await acao();
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : "Ocorreu um erro inesperado" };
  }
  revalidatePath("/producao/estoque");
  return { sucesso: true };
}

export async function liberarLoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const loteId = String(formData.get("loteId") ?? "");
  const motivo = String(formData.get("motivo") ?? "");
  return executarNoLote(() => liberarLoteVencido(sessao, loteId, motivo));
}

export async function revogarLiberacaoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const loteId = String(formData.get("loteId") ?? "");
  return executarNoLote(() => revogarLiberacaoLote(sessao, loteId));
}
