"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { valorOrcamentoSchema } from "@/lib/schemas/orcamento";
import { salvarValorOrcamento } from "@/server/services/orcamento";

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
    for (const { mes, valor } of valoresPorMes) {
      await salvarValorOrcamento(sessao, categoriaFinanceiraId, ano, mes, valor);
    }
  } catch (erro) {
    // Meses anteriores ao que falhou já podem ter sido persistidos —
    // revalida pra UI não ficar mostrando um estado que não bate mais com o banco.
    revalidatePath("/controladoria/orcamento");
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/controladoria/orcamento");
  return { sucesso: true };
}
