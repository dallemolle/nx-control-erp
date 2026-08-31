"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { filialSchema } from "@/lib/schemas/filial";
import * as filialService from "@/server/services/filial";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

export async function criarFilialAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = filialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await filialService.criarFilial(sessao, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/filiais");
  return { sucesso: true };
}

export async function atualizarFilialAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const parsed = filialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await filialService.atualizarFilial(sessao, id, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/filiais");
  return { sucesso: true };
}

export async function alternarAtivoFilialAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";

  await filialService.definirAtivoFilial(sessao, id, ativo);
  revalidatePath("/filiais");
}
