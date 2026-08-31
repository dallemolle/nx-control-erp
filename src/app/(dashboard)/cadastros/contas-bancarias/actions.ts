"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { contaBancariaSchema } from "@/lib/schemas/contaBancaria";
import * as contaBancariaService from "@/server/services/contaBancaria";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

export async function criarContaBancariaAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = contaBancariaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await contaBancariaService.criarContaBancaria(sessao, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/cadastros/contas-bancarias");
  return { sucesso: true };
}

export async function atualizarContaBancariaAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const parsed = contaBancariaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await contaBancariaService.atualizarContaBancaria(sessao, id, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/cadastros/contas-bancarias");
  return { sucesso: true };
}

export async function alternarAtivoContaBancariaAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";

  await contaBancariaService.definirAtivoContaBancaria(sessao, id, ativo);
  revalidatePath("/cadastros/contas-bancarias");
}
