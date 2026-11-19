"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { confirmarRepasses, desfazerRepasse } from "@/server/services/repasseCartao";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

function revalidar() {
  revalidatePath("/financeiro", "layout");
  revalidatePath("/vendas", "layout");
}

export async function confirmarRepassesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const data = String(formData.get("data") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Informe a data do recebimento" };
  let ids: unknown;
  try {
    ids = JSON.parse(String(formData.get("parcelaIds") ?? "[]"));
  } catch {
    ids = [];
  }
  const parcelaIds = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];

  try {
    await confirmarRepasses(sessao, parcelaIds, new Date(`${data}T00:00:00.000Z`));
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
  revalidar();
  return { sucesso: true };
}

export async function desfazerRepasseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  try {
    await desfazerRepasse(sessao, String(formData.get("parcelaId") ?? ""));
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
  revalidar();
  return { sucesso: true };
}
