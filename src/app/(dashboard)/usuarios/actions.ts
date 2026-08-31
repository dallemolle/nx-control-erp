"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { criarUsuarioSchema, atualizarPerfilSchema } from "@/lib/schemas/usuario";
import * as usuarioService from "@/server/services/usuario";
import * as usuarioEmpresaFilialService from "@/server/services/usuarioEmpresaFilial";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

export async function criarUsuarioAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = criarUsuarioSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await usuarioService.criarUsuarioEVincular(sessao, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/usuarios");
  return { sucesso: true };
}

export async function atualizarPerfilAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = atualizarPerfilSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await usuarioService.atualizarPerfilVinculo(sessao, parsed.data.usuarioId, parsed.data.perfil);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/usuarios");
  return { sucesso: true };
}

export async function alternarAtivoUsuarioAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const usuarioId = String(formData.get("usuarioId") ?? "");
  const ativo = formData.get("ativo") === "true";

  await usuarioService.definirAtivoVinculo(sessao, usuarioId, ativo);
  revalidatePath("/usuarios");
}

export async function atualizarAcessoFilialAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const usuarioId = String(formData.get("usuarioId") ?? "");
  const filialId = String(formData.get("filialId") ?? "");
  const temAcesso = formData.get("temAcesso") === "true";
  const podeAlterar = formData.get("podeAlterar") === "true";

  await usuarioEmpresaFilialService.definirAcessoFilial(sessao, usuarioId, filialId, {
    temAcesso,
    podeAlterar,
  });
  revalidatePath("/usuarios");
}
