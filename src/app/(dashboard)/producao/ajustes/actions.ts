"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { ajusteSchema } from "@/lib/schemas/ajusteEstoque";
import { criarAjuste, estornarAjuste } from "@/server/services/ajusteEstoque";

export type FormState = { erro?: string; sucesso?: boolean };

export async function criarAjusteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = ajusteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await criarAjuste(sessao, parsed.data);
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : "Ocorreu um erro inesperado" };
  }
  revalidar();
  return { sucesso: true };
}

export async function estornarAjusteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  try {
    await estornarAjuste(sessao, String(formData.get("id") ?? ""), String(formData.get("motivo") ?? ""));
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : "Ocorreu um erro inesperado" };
  }
  revalidar();
  return { sucesso: true };
}

function revalidar() {
  revalidatePath("/producao/ajustes");
  revalidatePath("/producao/estoque");
  revalidatePath("/producao/recepcao");
  revalidatePath("/producao/processamento", "layout");
}
