"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { liberarLoteVencido, revogarLiberacaoLote, transferirLote } from "@/server/services/estoque";
import { transferenciaLoteSchema } from "@/lib/schemas/transferenciaLote";

export type FormState = { erro?: string; sucesso?: boolean };

async function executarNoLote(acao: () => Promise<unknown>): Promise<FormState> {
  try {
    await acao();
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : "Ocorreu um erro inesperado" };
  }
  revalidatePath("/producao/estoque");
  return { sucesso: true };
}

export async function transferirLoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const dados = transferenciaLoteSchema.safeParse({
    loteId: formData.get("loteId") ?? "",
    localId: formData.get("localId") ?? "",
    quantidadeKg: formData.get("quantidadeKg") ?? "",
  });
  if (!dados.success) return { erro: dados.error.issues[0].message };
  return executarNoLote(() => transferirLote(sessao, dados.data.loteId, dados.data.localId, dados.data.quantidadeKg));
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
