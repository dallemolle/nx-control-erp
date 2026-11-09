"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { moverLote } from "@/server/services/estoque";

export type FormState = { erro?: string; sucesso?: boolean };

export async function moverLoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const loteId = String(formData.get("loteId") ?? "");
  const localId = String(formData.get("localId") ?? "");
  if (!localId) return { erro: "Selecione o local de destino" };

  try {
    await moverLote(sessao, loteId, localId);
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : "Ocorreu um erro inesperado" };
  }
  revalidatePath("/producao/estoque");
  return { sucesso: true };
}
