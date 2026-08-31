"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { projetoSchema } from "@/lib/schemas/projeto";
import * as projetoService from "@/server/services/projeto";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

export async function criarProjetoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = projetoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await projetoService.criarProjeto(sessao, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/cadastros/projetos");
  return { sucesso: true };
}

export async function atualizarProjetoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const parsed = projetoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await projetoService.atualizarProjeto(sessao, id, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/cadastros/projetos");
  return { sucesso: true };
}

export async function alternarAtivoProjetoAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";

  await projetoService.definirAtivoProjeto(sessao, id, ativo);
  revalidatePath("/cadastros/projetos");
}
