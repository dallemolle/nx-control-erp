"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { contaBancariaSchema } from "@/lib/schemas/contaBancaria";
import * as contaBancariaService from "@/server/services/contaBancaria";
import type { EstadoAlternarAtivo } from "../../_shared/botao-alternar-ativo";

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

export async function alternarAtivoContaBancariaAction(
  _anterior: EstadoAlternarAtivo,
  formData: FormData,
): Promise<EstadoAlternarAtivo> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";

  try {
    await contaBancariaService.definirAtivoContaBancaria(sessao, id, ativo);
  } catch (erro) {
    // Ex.: conta com saldo não inativa; a mensagem vai para o lado do botão.
    return { erro: erro instanceof Error ? erro.message : "Ocorreu um erro inesperado" };
  }
  revalidatePath("/cadastros/contas-bancarias");
  return {};
}
