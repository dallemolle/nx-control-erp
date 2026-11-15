"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { atualizarMarca, importarTema, restaurarTemaPadrao } from "@/server/services/temaEmpresa";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

function revalidarTudo() {
  // O tema muda o layout de todas as telas do painel.
  revalidatePath("/", "layout");
}

/** Grava o tema já validado (o texto volta num campo oculto do formulário). */
export async function aplicarTemaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const empresaId = String(formData.get("empresaId") ?? "");
  const confirmar = formData.get("confirmarAvisos") === "true";
  try {
    await importarTema(sessao, empresaId, String(formData.get("texto") ?? ""), confirmar);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
  revalidarTudo();
  return { sucesso: true };
}

export async function restaurarTemaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  try {
    await restaurarTemaPadrao(sessao, String(formData.get("empresaId") ?? ""));
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
  revalidarTudo();
  return { sucesso: true };
}

function arquivo(formData: FormData, campo: string): File | null {
  const valor = formData.get(campo);
  return valor instanceof File && valor.size > 0 ? valor : null;
}

export async function atualizarMarcaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  try {
    await atualizarMarca(sessao, String(formData.get("empresaId") ?? ""), {
      logo: arquivo(formData, "logo"),
      removerLogo: formData.get("removerLogo") === "true",
      logoEscuro: arquivo(formData, "logoEscuro"),
      favicon: arquivo(formData, "favicon"),
      removerLogoEscuro: formData.get("removerLogoEscuro") === "true",
      removerFavicon: formData.get("removerFavicon") === "true",
    });
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
  revalidarTudo();
  return { sucesso: true };
}
