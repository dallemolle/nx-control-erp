"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { dadosEditaveisPedidoSchema, pedidoVendaSchema } from "@/lib/schemas/pedidoVenda";
import * as pedidoService from "@/server/services/pedidoVenda";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

function revalidar() {
  revalidatePath("/vendas", "layout");
  revalidatePath("/producao/estoque");
}

export async function criarPedidoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = pedidoVendaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  let numero: number;
  try {
    ({ numero } = await pedidoService.criarPedido(sessao, parsed.data));
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
  revalidar();
  // Fora do try: o redirect funciona lançando um erro próprio do Next.
  redirect(`/vendas/pedidos/${numero}`);
}

export async function cancelarPedidoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "");
  try {
    await pedidoService.cancelarPedido(sessao, id, motivo);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
  revalidar();
  return { sucesso: true };
}

export async function editarObservacaoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const parsed = dadosEditaveisPedidoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  try {
    await pedidoService.atualizarDadosPedido(sessao, id, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
  revalidar();
  return { sucesso: true };
}
