"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { empresaSchema } from "@/lib/schemas/empresa";
import * as empresaService from "@/server/services/empresa";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

function extrairLogo(formData: FormData): File | null {
  const logo = formData.get("logo");
  return logo instanceof File && logo.size > 0 ? logo : null;
}

/** O checkbox "usarCorPersonalizada" decide se corPrimaria vale algo — nunca o
 * atributo disabled do input de cor (inputs desabilitados não são enviados no FormData). */
function normalizarDados(formData: FormData): Record<string, FormDataEntryValue> {
  const dadosBrutos = Object.fromEntries(formData);
  if (dadosBrutos.usarCorPersonalizada !== "true") {
    dadosBrutos.corPrimaria = "";
  }
  return dadosBrutos;
}

export async function criarEmpresaAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = empresaSchema.safeParse(normalizarDados(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await empresaService.criarEmpresa(sessao, parsed.data, extrairLogo(formData));
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
  const parsed = empresaSchema.safeParse(normalizarDados(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const removerLogo = formData.get("removerLogo") === "true";

  try {
    await empresaService.atualizarEmpresa(sessao, id, parsed.data, extrairLogo(formData), removerLogo);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/empresas");
  return { sucesso: true };
}

export async function alternarAtivoEmpresaAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";

  await empresaService.definirAtivoEmpresa(sessao, id, ativo);
  revalidatePath("/empresas");
}
