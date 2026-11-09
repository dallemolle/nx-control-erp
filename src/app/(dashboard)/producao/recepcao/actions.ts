"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { dadosEditaveisRecepcaoSchema, recepcaoSchema } from "@/lib/schemas/recepcao";
import * as recepcaoService from "@/server/services/recepcaoFruto";

export type FormState = { erro?: string; sucesso?: boolean };
export type EstadoNovaRecepcao = FormState & { loteId?: string; codigoLote?: string };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

function revalidar() {
  revalidatePath("/producao/recepcao");
  revalidatePath("/producao/estoque");
}

export async function criarRecepcaoAction(
  _prev: EstadoNovaRecepcao,
  formData: FormData,
): Promise<EstadoNovaRecepcao> {
  const sessao = await requireSessaoAtiva();
  const parsed = recepcaoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    const criada = await recepcaoService.criarRecepcao(sessao, parsed.data);
    revalidar();
    return { sucesso: true, loteId: criada.loteId, codigoLote: criada.codigoLote };
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
}

export async function editarRecepcaoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const parsed = dadosEditaveisRecepcaoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await recepcaoService.atualizarDadosRecepcao(sessao, id, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
  revalidar();
  return { sucesso: true };
}

export async function cancelarRecepcaoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "");

  try {
    await recepcaoService.cancelarRecepcao(sessao, id, motivo);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
  revalidar();
  return { sucesso: true };
}
