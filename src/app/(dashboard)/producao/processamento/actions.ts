"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ZodType } from "zod";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import {
  cabecalhoOPSchema,
  consumoSchema,
  insumoOPSchema,
  processoOPSchema,
  producaoSchema,
} from "@/lib/schemas/ordemProducao";
import * as opService from "@/server/services/ordemProducao";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

function revalidar() {
  revalidatePath("/producao", "layout");
  revalidatePath("/vendas", "layout");
}

/** Lê `campo` do form, valida com `schema` e roda a operação; devolve o erro ou `sucesso`. */
async function executar<T>(
  formData: FormData,
  schema: ZodType<T> | null,
  operacao: (dados: T, id: string) => Promise<unknown>,
  campoId = "opId",
): Promise<FormState> {
  const id = String(formData.get(campoId) ?? "");
  let dados = undefined as T;
  if (schema) {
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    dados = parsed.data;
  }
  try {
    await operacao(dados, id);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
  revalidar();
  return { sucesso: true };
}

export async function criarOPAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = cabecalhoOPSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  let numero: string;
  try {
    ({ numero } = await opService.criarOP(sessao, parsed.data));
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
  revalidar();
  // Fora do try: o redirect funciona lançando um erro próprio do Next.
  redirect(`/producao/processamento/${numero}`);
}

export async function atualizarCabecalhoOPAction(_prev: FormState, formData: FormData) {
  const sessao = await requireSessaoAtiva();
  return executar(formData, cabecalhoOPSchema, (dados, id) => opService.atualizarCabecalhoOP(sessao, id, dados));
}

export async function atualizarProcessoOPAction(_prev: FormState, formData: FormData) {
  const sessao = await requireSessaoAtiva();
  return executar(formData, processoOPSchema, (dados, id) => opService.atualizarProcessoOP(sessao, id, dados));
}

export async function adicionarConsumoAction(_prev: FormState, formData: FormData) {
  const sessao = await requireSessaoAtiva();
  return executar(formData, consumoSchema, (dados, id) => opService.adicionarConsumo(sessao, id, dados));
}

export async function adicionarProducaoAction(_prev: FormState, formData: FormData) {
  const sessao = await requireSessaoAtiva();
  return executar(formData, producaoSchema, (dados, id) => opService.adicionarProducao(sessao, id, dados));
}

export async function adicionarInsumoAction(_prev: FormState, formData: FormData) {
  const sessao = await requireSessaoAtiva();
  return executar(formData, insumoOPSchema, (dados, id) => opService.adicionarInsumo(sessao, id, dados));
}

export async function removerLinhaAction(_prev: FormState, formData: FormData) {
  const sessao = await requireSessaoAtiva();
  const tipo = String(formData.get("tipo") ?? "");
  const remover =
    tipo === "consumo"
      ? opService.removerConsumo
      : tipo === "producao"
        ? opService.removerProducao
        : tipo === "insumo"
          ? opService.removerInsumo
          : null;
  if (!remover) return { erro: "Linha inválida" };
  return executar(formData, null, (_dados, id) => remover(sessao, id), "linhaId");
}

export async function encerrarOPAction(_prev: FormState, formData: FormData) {
  const sessao = await requireSessaoAtiva();
  const confirmarVerificar = formData.get("confirmarVerificar") === "on";
  return executar(formData, null, (_dados, id) => opService.encerrarOP(sessao, id, { confirmarVerificar }));
}

export async function reabrirOPAction(_prev: FormState, formData: FormData) {
  const sessao = await requireSessaoAtiva();
  const motivo = String(formData.get("motivo") ?? "");
  return executar(formData, null, (_dados, id) => opService.reabrirOP(sessao, id, motivo));
}

export async function cancelarOPAction(_prev: FormState, formData: FormData) {
  const sessao = await requireSessaoAtiva();
  const motivo = String(formData.get("motivo") ?? "");
  return executar(formData, null, (_dados, id) => opService.cancelarOP(sessao, id, motivo));
}
