// src/app/(dashboard)/financeiro/conciliacao/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import * as conciliacaoService from "@/server/services/conciliacao";
import { lancamentoDaLinhaSchema } from "@/lib/schemas/conciliacao";
import { SEM_VALOR } from "@/lib/schemas/enums";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

export async function importarExtratoAction(contaBancariaId: string, arquivo: File): Promise<FormState> {
  const sessao = await requireSessaoAtiva();

  try {
    const extrato = await conciliacaoService.importarExtratoOfx(sessao, contaBancariaId, arquivo);
    await conciliacaoService.conciliarAutomaticamente(sessao, extrato.id);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/conciliacao");
  return { sucesso: true };
}

export async function buscarCandidatosAction(linhaExtratoId: string) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "conciliacao:ler");
  const candidatos = await conciliacaoService.buscarCandidatosDaLinha(linhaExtratoId);
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
    });
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/conciliacao");
  return { sucesso: true };
}
