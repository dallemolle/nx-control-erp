import { z } from "zod";
import { contraste, CONTRASTE_MINIMO } from "./contraste";
import { temaSchema, type CoresModo, type Tema } from "./schema";

export type ResultadoValidacao = { ok: true; tema: Tema; avisos: string[] } | { ok: false; erros: string[] };

export type PapelCor = keyof Omit<CoresModo, "graficos">;

export type ParContraste = {
  texto: PapelCor;
  fundo: PapelCor;
  razao: number;
  nivel: "essencial" | "secundario";
  ok: boolean;
};

/** Pares texto/fundo que bloqueiam a importação abaixo do mínimo. */
const ESSENCIAIS: [PapelCor, PapelCor][] = [
  ["texto", "fundo"],
  ["textoSobrePrimaria", "primaria"],
  ["textoSobreSidebar", "sidebar"],
  ["textoCabecalho", "cabecalho"],
];

/** Pares que só geram aviso. */
const SECUNDARIOS: [PapelCor, PapelCor][] = [
  ["textoApagado", "fundo"],
  ["texto", "cartao"],
  ["textoSobreApoio", "apoio"],
  ["textoSobreDestaque", "destaque"],
  ["erro", "fundo"],
];

const DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Cabeçalho herda do fundo e o texto do cabeçalho herda do texto, como na aplicação. */
function comHeranca(cores: CoresModo): Partial<Record<PapelCor, string>> {
  return {
    ...cores,
    cabecalho: cores.cabecalho ?? cores.fundo,
    textoCabecalho: cores.textoCabecalho ?? (cores.cabecalho ? undefined : cores.texto),
  };
}

/** Contraste de cada par (essenciais primeiro); pares com um dos lados ausente ficam de fora. */
export function paresDeContraste(cores: CoresModo): ParContraste[] {
  const c = comHeranca(cores);
  const avaliar = (pares: [PapelCor, PapelCor][], nivel: ParContraste["nivel"]): ParContraste[] =>
    pares.flatMap(([texto, fundo]) => {
      const corTexto = c[texto];
      const corFundo = c[fundo];
      if (!corTexto || !corFundo) return [];
      const razao = contraste(corTexto, corFundo);
      return [{ texto, fundo, razao, nivel, ok: razao >= CONTRASTE_MINIMO }];
    });
  return [...avaliar(ESSENCIAIS, "essencial"), ...avaliar(SECUNDARIOS, "secundario")];
}

export function mensagemContraste(modo: string, par: ParContraste): string {
  return `cores.${modo}.${par.texto} sobre ${par.fundo}: contraste ${DECIMAL.format(par.razao)}:1 (mínimo ${DECIMAL.format(CONTRASTE_MINIMO)}:1)`;
}

function falhas(modo: string, cores: CoresModo, nivel: ParContraste["nivel"]): string[] {
  return paresDeContraste(cores)
    .filter((par) => par.nivel === nivel && !par.ok)
    .map((par) => mensagemContraste(modo, par));
}

/** Valida um tema `nx-tema` v1: formato (Zod) e contraste (WCAG). */
export function validarTema(entrada: unknown): ResultadoValidacao {
  const resultado = temaSchema.safeParse(entrada, { error: z.locales.pt().localeError });
  if (!resultado.success) {
    return {
      ok: false,
      erros: resultado.error.issues.map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`),
    };
  }
  const tema = resultado.data;
  const modos = Object.entries(tema.cores).filter((par): par is [string, CoresModo] => par[1] !== undefined);
  const erros = modos.flatMap(([modo, cores]) => falhas(modo, cores, "essencial"));
  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, tema, avisos: modos.flatMap(([modo, cores]) => falhas(modo, cores, "secundario")) };
}

/** JSON colado ou enviado → validação; texto que não é JSON vira erro, não exceção. */
export function analisarTexto(texto: string): ResultadoValidacao {
  try {
    return validarTema(JSON.parse(texto));
  } catch (erro) {
    return { ok: false, erros: [`JSON inválido: ${erro instanceof Error ? erro.message : String(erro)}`] };
  }
}
