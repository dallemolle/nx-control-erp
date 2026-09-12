"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { valorOrcamentoSchema } from "@/lib/schemas/orcamento";
import { salvarValoresOrcamentoDoAno } from "@/server/services/orcamento";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

export async function salvarLinhaOrcamentoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const categoriaFinanceiraId = String(formData.get("categoriaFinanceiraId") ?? "");
  const ano = Number(formData.get("ano"));
  if (!categoriaFinanceiraId || !Number.isInteger(ano)) {
    return { erro: "Dados inválidos" };
  }

  const valoresPorMes: { mes: number; valor: number }[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const bruto = formData.get(`mes-${mes}`);
    const parsed = valorOrcamentoSchema.safeParse(bruto);
    if (!parsed.success) {
      return { erro: `Mês ${mes}: ${parsed.error.issues[0]?.message ?? "valor inválido"}` };
    }
    valoresPorMes.push({ mes, valor: parsed.data });
  }

  try {
    await salvarValoresOrcamentoDoAno(sessao, categoriaFinanceiraId, ano, valoresPorMes);
  } catch (erro) {
    revalidatePath("/controladoria/orcamento");
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/controladoria/orcamento");
  return { sucesso: true };
}
