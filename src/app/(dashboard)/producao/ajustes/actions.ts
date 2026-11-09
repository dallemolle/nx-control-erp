"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { ajusteSchema } from "@/lib/schemas/ajusteEstoque";
import { criarAjuste } from "@/server/services/ajusteEstoque";

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
  revalidatePath("/producao/ajustes");
  revalidatePath("/producao/estoque");
  revalidatePath("/producao/recepcao");
  return { sucesso: true };
}
