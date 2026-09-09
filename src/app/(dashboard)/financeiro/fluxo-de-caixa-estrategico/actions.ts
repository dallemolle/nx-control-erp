"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { premissasCenarioSchema } from "@/lib/schemas/cenarioEstrategico";
import { atualizarPremissasCenario, TIPOS_CENARIO } from "@/server/services/fluxoDeCaixaEstrategico";
import type { TipoCenarioEstrategico } from "@prisma/client";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

function tipoValido(valor: FormDataEntryValue | null): valor is TipoCenarioEstrategico {
  return typeof valor === "string" && (TIPOS_CENARIO as string[]).includes(valor);
}

export async function atualizarPremissasCenarioAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const tipoBruto = formData.get("tipo");
  if (!tipoValido(tipoBruto)) {
    return { erro: "Cenário inválido" };
  }
  const tipo = tipoBruto;
  const parsed = premissasCenarioSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await atualizarPremissasCenario(sessao, tipo, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/fluxo-de-caixa-estrategico");
  return { sucesso: true };
}
