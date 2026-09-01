"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { tituloSchema, tituloHeaderSchema } from "@/lib/schemas/titulo";
import * as tituloService from "@/server/services/titulo";
import type { TipoTitulo } from "@prisma/client";
import { baixaSchema } from "@/lib/schemas/baixa";
import * as baixaService from "@/server/services/baixa";
import * as renegociacaoService from "@/server/services/renegociacao";
import * as importacaoService from "@/server/services/importacaoTitulo";
import * as anexoService from "@/server/services/anexo";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

function rotaPara(tipo: TipoTitulo): string {
  return tipo === "PAGAR" ? "/financeiro/contas-a-pagar" : "/financeiro/contas-a-receber";
}

function parseParcelas(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get("parcelas") ?? "[]"));
  } catch {
    return null;
  }
}

export async function criarTituloAction(
  tipo: TipoTitulo,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parcelas = parseParcelas(formData);
  if (parcelas === null) {
    return { erro: "Parcelas inválidas" };
  }

  const parsed = tituloSchema.safeParse({ ...Object.fromEntries(formData), parcelas });
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await tituloService.criarTitulo(sessao, tipo, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath(rotaPara(tipo));
  return { sucesso: true };
}

export async function atualizarTituloAction(
  tipo: TipoTitulo,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const parsed = tituloHeaderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await tituloService.atualizarTitulo(sessao, id, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath(rotaPara(tipo));
  return { sucesso: true };
}

export async function alterarVencimentoParcelaAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const parcelaId = String(formData.get("parcelaId") ?? "");
  const novoVencimento = new Date(String(formData.get("dataVencimento") ?? ""));
  const tipo = String(formData.get("tipo") ?? "PAGAR") as TipoTitulo;

  await tituloService.alterarVencimentoParcela(sessao, parcelaId, novoVencimento);
  revalidatePath(rotaPara(tipo));
}

export async function cancelarParcelaAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const parcelaId = String(formData.get("parcelaId") ?? "");
  const tipo = String(formData.get("tipo") ?? "PAGAR") as TipoTitulo;

  await tituloService.cancelarParcela(sessao, parcelaId);
  revalidatePath(rotaPara(tipo));
}

export async function registrarBaixaAction(
  tipo: TipoTitulo,
  parcelaId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = baixaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await baixaService.registrarBaixa(sessao, parcelaId, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath(rotaPara(tipo));
  return { sucesso: true };
}

export async function renegociarParcelaAction(
  tipo: TipoTitulo,
  parcelaId: string,
  novasParcelas: { dataVencimento: string; valorOriginal: string }[],
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();

  try {
    await renegociacaoService.renegociarParcela(
      sessao,
      parcelaId,
      novasParcelas.map((parcela) => ({
        dataVencimento: new Date(parcela.dataVencimento),
        valorOriginal: Number(parcela.valorOriginal),
      })),
    );
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath(rotaPara(tipo));
  return { sucesso: true };
}

export async function validarCsvAction(conteudoCsv: string) {
  return importacaoService.validarCsv(conteudoCsv);
}

export async function confirmarImportacaoAction(
  tipo: TipoTitulo,
  linhas: importacaoService.LinhaImportacao[],
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();

  try {
    await importacaoService.confirmarImportacao(sessao, tipo, linhas);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath(rotaPara(tipo));
  return { sucesso: true };
}

export async function listarAnexosAction(tituloId: string) {
  return anexoService.listarAnexos(tituloId);
}

export async function adicionarAnexoAction(tituloId: string, arquivo: File): Promise<void> {
  const sessao = await requireSessaoAtiva();
  await anexoService.adicionarAnexo(sessao, tituloId, arquivo);
}

export async function removerAnexoAction(anexoId: string): Promise<void> {
  const sessao = await requireSessaoAtiva();
  await anexoService.removerAnexo(sessao, anexoId);
}
