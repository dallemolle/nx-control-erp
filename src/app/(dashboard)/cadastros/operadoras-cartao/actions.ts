"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { operadoraCartaoSchema } from "@/lib/schemas/operadoraCartao";
import * as operadoraService from "@/server/services/operadoraCartao";

export type FormState = { erro?: string; sucesso?: boolean };

const CAMINHO = "/cadastros/operadoras-cartao";

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

export async function salvarOperadoraAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const parsed = operadoraCartaoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    if (id) await operadoraService.atualizarOperadora(sessao, id, parsed.data);
    else await operadoraService.criarOperadora(sessao, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath(CAMINHO);
  return { sucesso: true };
}

export async function alternarAtivoOperadoraAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";

  await operadoraService.definirAtivoOperadora(sessao, id, ativo);
  revalidatePath(CAMINHO);
}
