"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { urlGoogleFonts, variaveisDoTema } from "@/lib/tema/css";
import { analisarTexto, atualizarMarca, importarTema, restaurarTemaPadrao } from "@/server/services/temaEmpresa";

export type PreviaTema = {
  nome: string;
  claro: Record<string, string>;
  escuro: Record<string, string> | null;
  raio: string | null;
  fonteTexto: string | null;
  fonteTitulos: string | null;
  urlFontes: string | null;
};

export type EstadoValidacao = {
  erros?: string[];
  avisos?: string[];
  texto?: string;
  previa?: PreviaTema;
};

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

/** Arquivo .json (se enviado) ou o texto colado. */
async function textoDoTema(formData: FormData): Promise<string> {
  const arquivo = formData.get("arquivo");
  if (arquivo instanceof File && arquivo.size > 0) return arquivo.text();
  return String(formData.get("texto") ?? "");
}

function revalidarTudo() {
  // O tema muda o layout de todas as telas do painel.
  revalidatePath("/", "layout");
}

/** Valida sem gravar e devolve erros, avisos e a prévia. */
export async function validarTemaAction(_prev: EstadoValidacao, formData: FormData): Promise<EstadoValidacao> {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "empresa:gerenciar");
  const texto = (await textoDoTema(formData)).trim();
  if (!texto) return { erros: ["Escolha um arquivo .json ou cole o tema."] };

  const resultado = analisarTexto(texto);
  if (!resultado.ok) return { erros: resultado.erros, texto };
  const { tema, avisos } = resultado;
  const { claro, escuro } = variaveisDoTema(tema);
  return {
    avisos,
    texto,
    previa: {
      nome: tema.nome,
      claro,
      escuro,
      raio: tema.raio ?? null,
      fonteTexto: tema.fontes?.texto?.pilha ?? null,
      fonteTitulos: tema.fontes?.titulos?.pilha ?? null,
      urlFontes: urlGoogleFonts(tema),
    },
  };
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
