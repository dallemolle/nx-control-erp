"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { categoriaFinanceiraSchema } from "@/lib/schemas/categoriaFinanceira";
import * as categoriaFinanceiraService from "@/server/services/categoriaFinanceira";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

export async function criarCategoriaFinanceiraAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = categoriaFinanceiraSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await categoriaFinanceiraService.criarCategoriaFinanceira(sessao, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/cadastros/categorias");
  return { sucesso: true };
}

export async function atualizarCategoriaFinanceiraAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const parsed = categoriaFinanceiraSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await categoriaFinanceiraService.atualizarCategoriaFinanceira(sessao, id, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/cadastros/categorias");
  return { sucesso: true };
}

export async function alternarAtivoCategoriaFinanceiraAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";

  await categoriaFinanceiraService.definirAtivoCategoriaFinanceira(sessao, id, ativo);
  revalidatePath("/cadastros/categorias");
}
