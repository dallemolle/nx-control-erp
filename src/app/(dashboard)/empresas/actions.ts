"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { empresaSchema } from "@/lib/schemas/empresa";
import * as empresaService from "@/server/services/empresa";
import type { EstadoAlternarAtivo } from "../_shared/botao-alternar-ativo";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

export async function criarEmpresaAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = empresaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await empresaService.criarEmpresa(sessao, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/empresas");
  return { sucesso: true };
}

export async function atualizarEmpresaAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const parsed = empresaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await empresaService.atualizarEmpresa(sessao, id, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/empresas");
  return { sucesso: true };
}

export async function alternarAtivoEmpresaAction(
  _anterior: EstadoAlternarAtivo,
  formData: FormData,
): Promise<EstadoAlternarAtivo> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";

  try {
    await empresaService.definirAtivoEmpresa(sessao, id, ativo);
  } catch (erro) {
    // Ex.: "Troque de empresa antes de inativar esta"; a mensagem vai para o lado do botão.
    return { erro: mensagemErro(erro) };
  }
  revalidatePath("/empresas");
  return {};
}
