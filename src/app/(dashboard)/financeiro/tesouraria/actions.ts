"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import {
  lancamentoManualSchema,
  transferenciaSchema,
  saldoBancarioSchema,
} from "@/lib/schemas/lancamentoBancario";
import * as lancamentoService from "@/server/services/lancamentoBancario";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

export async function criarLancamentoManualAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = lancamentoManualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await lancamentoService.criarLancamentoManual(sessao, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/tesouraria");
  return { sucesso: true };
}

export async function criarTransferenciaAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = transferenciaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await lancamentoService.criarTransferencia(sessao, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/tesouraria");
  return { sucesso: true };
}

export async function informarSaldoBancarioAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = saldoBancarioSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await lancamentoService.informarSaldoBancario(sessao, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/tesouraria");
  return { sucesso: true };
}

export async function editarLancamentoManualAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { erro: "Lançamento não informado" };
  const parsed = lancamentoManualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await lancamentoService.editarLancamentoManual(sessao, id, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/tesouraria");
  return { sucesso: true };
}

export async function editarTransferenciaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const transferenciaId = formData.get("transferenciaId");
  if (typeof transferenciaId !== "string" || !transferenciaId) return { erro: "Transferência não informada" };
  const parsed = transferenciaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await lancamentoService.editarTransferencia(sessao, transferenciaId, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/tesouraria");
  return { sucesso: true };
}

export async function excluirLancamentoAction(id: string, motivo: string): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  if (typeof id !== "string" || typeof motivo !== "string") return { erro: "Informe o motivo da exclusão" };

  try {
    await lancamentoService.excluirLancamento(sessao, id, motivo);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/tesouraria");
  return { sucesso: true };
}
