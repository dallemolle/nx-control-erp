"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { bancoSchema } from "@/lib/schemas/banco";
import * as bancoService from "@/server/services/banco";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

export async function criarBancoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = bancoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await bancoService.criarBanco(sessao, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/cadastros/bancos");
  return { sucesso: true };
}

export async function atualizarBancoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const parsed = bancoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await bancoService.atualizarBanco(sessao, id, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/cadastros/bancos");
  return { sucesso: true };
}
