"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { safraSchema } from "@/lib/schemas/safra";
import * as safraService from "@/server/services/safra";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

export async function criarSafraAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = safraSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await safraService.criarSafra(sessao, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/cadastros/safras");
  return { sucesso: true };
}

export async function atualizarSafraAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const parsed = safraSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await safraService.atualizarSafra(sessao, id, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/cadastros/safras");
  return { sucesso: true };
}

export async function alternarAtivoSafraAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";

  await safraService.definirAtivoSafra(sessao, id, ativo);
  revalidatePath("/cadastros/safras");
}
