"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { localArmazenamentoSchema } from "@/lib/schemas/localArmazenamento";
import * as localService from "@/server/services/localArmazenamento";
import type { EstadoAlternarAtivo } from "../../_shared/botao-alternar-ativo";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

export async function criarLocalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = localArmazenamentoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await localService.criarLocalArmazenamento(sessao, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/cadastros/locais-armazenamento");
  return { sucesso: true };
}

export async function atualizarLocalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const parsed = localArmazenamentoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await localService.atualizarLocalArmazenamento(sessao, id, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/cadastros/locais-armazenamento");
  return { sucesso: true };
}

export async function alternarAtivoLocalAction(
  _anterior: EstadoAlternarAtivo,
  formData: FormData,
): Promise<EstadoAlternarAtivo> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";

  try {
    await localService.definirAtivoLocalArmazenamento(sessao, id, ativo);
  } catch (erro) {
    // Ex.: local com lotes com saldo; a mensagem vai para o lado do botão.
    return { erro: mensagemErro(erro) };
  }
  revalidatePath("/cadastros/locais-armazenamento");
  return {};
}
