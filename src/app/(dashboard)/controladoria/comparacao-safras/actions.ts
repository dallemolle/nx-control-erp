"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { valorOrcamentoSchema } from "@/lib/schemas/orcamento";
import { salvarValorOrcamentoSafra } from "@/server/services/orcamentoSafra";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

export async function salvarOrcamentoSafraAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const safraId = String(formData.get("safraId") ?? "");
  if (!safraId) {
    return { erro: "Dados inválidos" };
  }

  const parsed = valorOrcamentoSchema.safeParse(formData.get("valor"));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Valor inválido" };
  }

  try {
    await salvarValorOrcamentoSafra(sessao, safraId, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/controladoria/comparacao-safras");
  return { sucesso: true };
}
