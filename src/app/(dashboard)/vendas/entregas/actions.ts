"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { entregaSchema } from "@/lib/schemas/entrega";
import { atualizarEntrega } from "@/server/services/entrega";

export type FormState = { erro?: string; sucesso?: boolean };

/** Atualiza só os campos presentes no formulário (os botões "Em rota" e "Entregue" mandam poucos campos). */
export async function atualizarEntregaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const pedidoId = String(formData.get("pedidoId") ?? "");
  // O schema ignora chaves desconhecidas (pedidoId e as internas do React).
  const parsed = entregaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  try {
    await atualizarEntrega(sessao, pedidoId, parsed.data);
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : "Ocorreu um erro inesperado" };
  }
  revalidatePath("/vendas", "layout");
  return { sucesso: true };
}
