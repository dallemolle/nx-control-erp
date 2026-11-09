"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { configuracaoProducaoSchema } from "@/lib/schemas/configuracaoProducao";
import { salvarConfiguracaoProducao } from "@/server/services/configuracaoProducao";

export type FormState = { erro?: string; sucesso?: boolean };

export async function salvarConfiguracaoProducaoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = configuracaoProducaoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await salvarConfiguracaoProducao(sessao, parsed.data);
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : "Ocorreu um erro inesperado" };
  }

  revalidatePath("/configuracao-producao");
  return { sucesso: true };
}
