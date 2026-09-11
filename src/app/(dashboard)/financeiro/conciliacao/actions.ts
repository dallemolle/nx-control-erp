// src/app/(dashboard)/financeiro/conciliacao/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import * as conciliacaoService from "@/server/services/conciliacao";
import { lancamentoDaLinhaSchema } from "@/lib/schemas/conciliacao";
import { SEM_VALOR } from "@/lib/schemas/enums";

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
  FormState & { totalProcessadas?: number; conciliadasAutomaticamente?: number }
> {
  const sessao = await requireSessaoAtiva();

  let resultado: { totalProcessadas: number; conciliadasAutomaticamente: number };
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
    data: new Date(c.data).toLocaleDateString("pt-BR"),
    valor: Number(c.valor).toFixed(2),
    descricao: c.descricao,
    conciliado: c.conciliado,
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
    await conciliacaoService.criarLancamentoDaLinha(sessao, parsed.data.linhaExtratoId, {
      descricao: parsed.data.descricao,
      categoriaFinanceiraId:
        parsed.data.categoriaFinanceiraId && parsed.data.categoriaFinanceiraId !== SEM_VALOR
          ? parsed.data.categoriaFinanceiraId
          : null,
      centroCustoId:
        parsed.data.centroCustoId && parsed.data.centroCustoId !== SEM_VALOR
          ? parsed.data.centroCustoId
          : null,
      centroLucroId:
        parsed.data.centroLucroId && parsed.data.centroLucroId !== SEM_VALOR
          ? parsed.data.centroLucroId
          : null,
      safraId:
        parsed.data.safraId && parsed.data.safraId !== SEM_VALOR
          ? parsed.data.safraId
          : null,
      projetoId:
        parsed.data.projetoId && parsed.data.projetoId !== SEM_VALOR
          ? parsed.data.projetoId
          : null,
    });
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/conciliacao");
  return { sucesso: true };
}
