import { z } from "zod";
import { contraste, CONTRASTE_MINIMO } from "./contraste";
import { temaSchema, type CoresModo, type Tema } from "./schema";

export type ResultadoValidacao = { ok: true; tema: Tema; avisos: string[] } | { ok: false; erros: string[] };

type Papel = keyof Omit<CoresModo, "graficos">;

/** Pares texto/fundo que bloqueiam a importação abaixo do mínimo. */
const ESSENCIAIS: [Papel, Papel][] = [
  ["texto", "fundo"],
  ["textoSobrePrimaria", "primaria"],
  ["textoSobreSidebar", "sidebar"],
  ["textoCabecalho", "cabecalho"],
];

/** Pares que só geram aviso. */
const SECUNDARIOS: [Papel, Papel][] = [
  ["textoApagado", "fundo"],
  ["texto", "cartao"],
  ["textoSobreApoio", "apoio"],
  ["textoSobreDestaque", "destaque"],
  ["erro", "fundo"],
];

const DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Cabeçalho herda do fundo e o texto do cabeçalho herda do texto, como na aplicação. */
function comHeranca(cores: CoresModo): Partial<Record<Papel, string>> {
  return {
    ...cores,
    cabecalho: cores.cabecalho ?? cores.fundo,
    textoCabecalho: cores.textoCabecalho ?? (cores.cabecalho ? undefined : cores.texto),
  };
}

function falhas(modo: string, cores: CoresModo, pares: [Papel, Papel][]): string[] {
  const c = comHeranca(cores);
  return pares.flatMap(([papelTexto, papelFundo]) => {
    const texto = c[papelTexto];
    const fundo = c[papelFundo];
    if (!texto || !fundo) return [];
    const razao = contraste(texto, fundo);
    if (razao >= CONTRASTE_MINIMO) return [];
    return [
      `cores.${modo}.${papelTexto} sobre ${papelFundo}: contraste ${DECIMAL.format(razao)}:1 (mínimo ${DECIMAL.format(CONTRASTE_MINIMO)}:1)`,
    ];
  });
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
  const erros = modos.flatMap(([modo, cores]) => falhas(modo, cores, ESSENCIAIS));
  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, tema, avisos: modos.flatMap(([modo, cores]) => falhas(modo, cores, SECUNDARIOS)) };
}
