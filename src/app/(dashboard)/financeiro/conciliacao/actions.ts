// src/app/(dashboard)/financeiro/conciliacao/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import * as conciliacaoService from "@/server/services/conciliacao";
import {
  lancamentoAvulsoSchema,
  lancamentoDaLinhaSchema,
  type LancamentoAvulsoFormValues,
} from "@/lib/schemas/conciliacao";
import { SEM_VALOR } from "@/lib/schemas/enums";
import { formatarData, formatarMoeda } from "@/lib/formatacao";

export type FormState = { erro?: string; sucesso?: boolean };

export type ResumoImportacao = {
  totalLinhas: number;
  linhasNovas: number;
  linhasIgnoradas: number;
  conciliadasAutomaticamente: number;
};

export type ImportarExtratoState = FormState & { resumo?: ResumoImportacao };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

function semValor(valor: string | undefined): string | null {
  return valor && valor !== SEM_VALOR ? valor : null;
}

function dadosDoLancamentoAvulso(dados: LancamentoAvulsoFormValues): conciliacaoService.DadosLancamentoAvulso {
  return {
    descricao: dados.descricao,
    categoriaFinanceiraId: semValor(dados.categoriaFinanceiraId),
    centroCustoId: semValor(dados.centroCustoId),
    centroLucroId: semValor(dados.centroLucroId),
    safraId: semValor(dados.safraId),
    projetoId: semValor(dados.projetoId),
    classificacaoFiscal: dados.classificacaoFiscal,
    tipoComprovante: semValor(dados.tipoComprovante) as conciliacaoService.DadosLancamentoAvulso["tipoComprovante"],
  };
}

export async function importarExtratoAction(
  contaBancariaId: string,
  arquivo: File,
): Promise<ImportarExtratoState> {
  const sessao = await requireSessaoAtiva();

  let resumo: ResumoImportacao;
  try {
    const extrato = await conciliacaoService.importarExtratoOfx(sessao, contaBancariaId, arquivo);
    const resultado = await conciliacaoService.conciliarAutomaticamente(sessao, extrato.id);
    resumo = {
      totalLinhas: extrato.totalLinhas,
      linhasNovas: extrato.linhasNovas,
      linhasIgnoradas: extrato.linhasIgnoradas,
      conciliadasAutomaticamente: resultado.conciliadasAutomaticamente,
    };
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/conciliacao");
  return { sucesso: true, resumo };
}

export async function reconciliarPendentesAction(): Promise<
  FormState & { totalProcessadas?: number; conciliadasAutomaticamente?: number; reclassificadas?: number }
> {
  const sessao = await requireSessaoAtiva();

  let resultado: { totalProcessadas: number; conciliadasAutomaticamente: number; reclassificadas: number };
  try {
    resultado = await conciliacaoService.reconciliarPendentes(sessao);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/conciliacao");
  return { sucesso: true, ...resultado };
}

export async function buscarCandidatosAction(linhaExtratoId: string) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "conciliacao:ler");
  const candidatos = await conciliacaoService.buscarCandidatosDaLinha(sessao, linhaExtratoId);
  return candidatos.map((c) => ({
    id: c.id,
    data: formatarData(c.data),
    valor: formatarMoeda(c.valor),
    descricao: c.descricao,
    conciliado: c.conciliado,
    valorIgual: c.valorIgual,
    diasDeDiferenca: c.diasDeDiferenca,
    dentroDaTolerancia: c.dentroDaTolerancia,
    origem: c.origem,
  }));
}

export async function confirmarConciliacaoAction(
  linhaExtratoId: string,
  lancamentoBancarioId: string,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();

  try {
    await conciliacaoService.confirmarConciliacaoManual(sessao, linhaExtratoId, lancamentoBancarioId);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/conciliacao");
  return { sucesso: true };
}

export async function desconciliarAction(linhaExtratoId: string): Promise<FormState> {
  const sessao = await requireSessaoAtiva();

  try {
    await conciliacaoService.desconciliar(sessao, linhaExtratoId);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/conciliacao");
  return { sucesso: true };
}

export async function criarLancamentoDaLinhaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = lancamentoDaLinhaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await conciliacaoService.criarLancamentoDaLinha(
      sessao,
      parsed.data.linhaExtratoId,
      dadosDoLancamentoAvulso(parsed.data),
    );
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/conciliacao");
  return { sucesso: true };
}

export type ItemDoGrupo = { id: string; data: string; valor: number; tipo: "ENTRADA" | "SAIDA"; descricao: string };
export type CandidatosDoGrupo = { linhaPartida: ItemDoGrupo; linhas: ItemDoGrupo[]; lancamentos: ItemDoGrupo[] };

export async function buscarCandidatosParaGrupoAction(
  linhaExtratoId: string,
): Promise<{ erro?: string; candidatos?: CandidatosDoGrupo }> {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "conciliacao:ler");
  try {
    const { linhaPartida, linhas, lancamentos } = await conciliacaoService.buscarCandidatosParaGrupo(
      sessao,
      linhaExtratoId,
    );
    const daLinha = (l: (typeof linhas)[number]): ItemDoGrupo => ({
      id: l.id,
      data: formatarData(l.data),
      valor: Number(l.valor),
      tipo: l.tipo,
      descricao: l.historico,
    });
    return {
      candidatos: {
        linhaPartida: daLinha(linhaPartida),
        linhas: linhas.map(daLinha),
        lancamentos: lancamentos.map((l) => ({
          id: l.id,
          data: formatarData(l.data),
          valor: Number(l.valor),
          tipo: l.tipo,
          descricao: l.descricao,
        })),
      },
    };
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
}

export async function conciliarEmGrupoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const linhaIds = formData.getAll("linhaIds").map(String);
  const lancamentoIds = formData.getAll("lancamentoIds").map(String);

  let lancamentoDiferenca: conciliacaoService.DadosLancamentoAvulso | undefined;
  if (formData.get("lancarDiferenca") === "on") {
    const parsed = lancamentoAvulsoSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    }
    lancamentoDiferenca = dadosDoLancamentoAvulso(parsed.data);
  }

  try {
    await conciliacaoService.conciliarEmGrupo(sessao, { linhaIds, lancamentoIds, lancamentoDiferenca });
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/conciliacao");
  return { sucesso: true };
}
