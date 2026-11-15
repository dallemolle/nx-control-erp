import { urlGoogleFonts, variaveisDoTema } from "./css";
import { TEMA_PADRAO } from "./padrao";
import { PAPEIS_OBRIGATORIOS, type CoresModo, type Tema } from "./schema";
import { mensagemContraste, paresDeContraste, validarTema, type PapelCor, type ParContraste } from "./validar";

export type Modo = "claro" | "escuro";
export type FonteTema = NonNullable<NonNullable<Tema["fontes"]>["texto"]>;
export type TipoFonte = "sans" | "serif";
export type EstadoEditor = { tema: Tema; salvo: Tema; modo: Modo };

export type AcaoEditor =
  | { tipo: "cor"; papel: PapelCor; valor: string | undefined }
  | { tipo: "grafico"; indice: number; valor: string }
  | { tipo: "graficosAutomaticos"; ligado: boolean }
  | { tipo: "modoEscuro"; ligado: boolean }
  | { tipo: "modo"; modo: Modo }
  | { tipo: "nome"; nome: string }
  | { tipo: "fonte"; grupo: "texto" | "titulos"; fonte: FonteTema | undefined }
  | { tipo: "raio"; px: number | undefined }
  | { tipo: "carregar"; tema: Tema }
  | { tipo: "descartar" }
  | { tipo: "salvo"; tema: Tema }
  | { tipo: "restaurado"; tema: Tema };

export const ROTULOS: Record<PapelCor, string> = {
  fundo: "Fundo",
  texto: "Texto",
  primaria: "Primária",
  textoSobrePrimaria: "Texto sobre a primária",
  sidebar: "Barra lateral",
  textoSobreSidebar: "Texto da barra lateral",
  cartao: "Cartão",
  apoio: "Apoio",
  textoSobreApoio: "Texto sobre o apoio",
  textoApagado: "Texto apagado",
  destaque: "Destaque (hover e seleção)",
  textoSobreDestaque: "Texto sobre o destaque",
  borda: "Borda",
  foco: "Foco",
  erro: "Erro",
  cabecalho: "Cabeçalho",
  textoCabecalho: "Texto do cabeçalho",
};

/** De onde vem a cor de um papel opcional no automático (tabela de papéis da spec da entrega 1). */
export const HERANCA: Partial<Record<PapelCor, string>> = {
  cartao: "Fundo",
  apoio: "Fundo, um tom deslocado",
  textoSobreApoio: "Texto",
  textoApagado: "padrão do sistema",
  destaque: "Apoio",
  textoSobreDestaque: "Texto",
  borda: "padrão do sistema",
  foco: "Primária",
  erro: "padrão do sistema",
  cabecalho: "Fundo",
  textoCabecalho: "Texto",
};

const VARIAVEL: Record<PapelCor, string> = {
  fundo: "--background",
  texto: "--foreground",
  primaria: "--primary",
  textoSobrePrimaria: "--primary-foreground",
  sidebar: "--sidebar",
  textoSobreSidebar: "--sidebar-foreground",
  cartao: "--card",
  apoio: "--secondary",
  textoSobreApoio: "--secondary-foreground",
  textoApagado: "--muted-foreground",
  destaque: "--accent",
  textoSobreDestaque: "--accent-foreground",
  borda: "--border",
  foco: "--ring",
  erro: "--destructive",
  cabecalho: "--app-header-background",
  textoCabecalho: "--app-header-foreground",
};

const HEX = /^#[0-9a-f]{6}$/;
const NOME_GOOGLE = /^[A-Za-z0-9 ]{1,40}$/;
const CINZA = "#808080";
const OBRIGATORIOS: readonly string[] = PAPEIS_OBRIGATORIOS;

export function temaInicial(temaSalvo: unknown, nomeEmpresa: string): { tema: Tema; aviso: string | null } {
  const padrao = { ...TEMA_PADRAO, nome: nomeEmpresa.slice(0, 60) };
  if (temaSalvo === null || temaSalvo === undefined) return { tema: padrao, aviso: null };
  const resultado = validarTema(temaSalvo);
  if (resultado.ok) return { tema: resultado.tema, aviso: null };
  return {
    tema: padrao,
    aviso: "O tema gravado não passa mais na validação; o editor começou do padrão do sistema.",
  };
}

export function estadoInicial(tema: Tema): EstadoEditor {
  return { tema, salvo: tema, modo: "claro" };
}

function coresDoModo(tema: Tema, modo: Modo): CoresModo {
  return modo === "escuro" && tema.cores.escuro ? tema.cores.escuro : tema.cores.claro;
}

function comCores(tema: Tema, modo: Modo, cores: CoresModo): Tema {
  return { ...tema, cores: { ...tema.cores, [modo]: cores } };
}

function semChave<T extends object>(objeto: T, chave: string): T {
  const copia = { ...objeto } as Record<string, unknown>;
  delete copia[chave];
  return copia as T;
}

export function graficosEfetivos(tema: Tema, modo: Modo): string[] {
  const variaveis = variaveisDoTema(tema)[modo] ?? variaveisDoTema(tema).claro;
  return [1, 2, 3, 4, 5].map((n) => {
    const valor = variaveis[`--chart-${n}`];
    return HEX.test(valor) ? valor : CINZA;
  });
}

/** Cor em uso para o papel (com herança); cinza quando o padrão não é #RRGGBB (oklch ou transparência). */
export function valorEfetivo(tema: Tema, modo: Modo, papel: PapelCor): string {
  const variaveis = variaveisDoTema(tema)[modo] ?? variaveisDoTema(tema).claro;
  const valor = variaveis[VARIAVEL[papel]];
  return HEX.test(valor) ? valor : CINZA;
}

function comTema(estado: EstadoEditor, novo: Tema): EstadoEditor {
  return { ...estado, tema: novo };
}

export function reduzirEditor(estado: EstadoEditor, acao: AcaoEditor): EstadoEditor {
  const { modo } = estado;
  const atual = estado.tema;
  const cores = coresDoModo(atual, modo);
  switch (acao.tipo) {
    case "cor": {
      if (acao.valor === undefined) {
        if (OBRIGATORIOS.includes(acao.papel)) return estado;
        return comTema(estado, comCores(atual, modo, semChave(cores, acao.papel)));
      }
      const valor = acao.valor.toLowerCase();
      if (!HEX.test(valor)) return estado;
      return comTema(estado, comCores(atual, modo, { ...cores, [acao.papel]: valor }));
    }
    case "grafico": {
      const valor = acao.valor.toLowerCase();
      if (!HEX.test(valor) || acao.indice < 0 || acao.indice > 4) return estado;
      const lista = [...(cores.graficos ?? graficosEfetivos(atual, modo))];
      lista[acao.indice] = valor;
      return comTema(estado, comCores(atual, modo, { ...cores, graficos: lista as CoresModo["graficos"] }));
    }
    case "graficosAutomaticos": {
      if (acao.ligado) return comTema(estado, comCores(atual, modo, semChave(cores, "graficos")));
      const lista = graficosEfetivos(atual, modo) as CoresModo["graficos"];
      return comTema(estado, comCores(atual, modo, { ...cores, graficos: lista }));
    }
    case "modoEscuro": {
      if (acao.ligado) {
        if (atual.cores.escuro) return estado;
        return comTema(estado, { ...atual, cores: { ...atual.cores, escuro: TEMA_PADRAO.cores.escuro } });
      }
      return { ...estado, modo: "claro", tema: { ...atual, cores: semChave(atual.cores, "escuro") } };
    }
    case "modo":
      if (acao.modo === "escuro" && !atual.cores.escuro) return estado;
      return { ...estado, modo: acao.modo };
    case "nome":
      return comTema(estado, { ...atual, nome: acao.nome });
    case "fonte": {
      const fontes = acao.fonte
        ? { ...atual.fontes, [acao.grupo]: acao.fonte }
        : semChave(atual.fontes ?? {}, acao.grupo);
      if (Object.keys(fontes).length === 0) return comTema(estado, semChave(atual, "fontes"));
      return comTema(estado, { ...atual, fontes });
    }
    case "raio":
      if (acao.px === undefined) return comTema(estado, semChave(atual, "raio"));
      return comTema(estado, { ...atual, raio: `${Math.min(32, Math.max(0, Math.round(acao.px)))}px` });
    case "carregar":
      return { ...estado, tema: acao.tema, modo: "claro" };
    case "descartar":
      return { ...estado, tema: estado.salvo, modo: "claro" };
    case "salvo":
      return { ...estado, salvo: acao.tema };
    case "restaurado":
      return { tema: acao.tema, salvo: acao.tema, modo: "claro" };
  }
}

export function pilhaDaFonte(google: string, tipo: TipoFonte): string {
  return tipo === "serif" ? `"${google}", Georgia, serif` : `"${google}", system-ui, sans-serif`;
}

export function tipoDaPilha(pilha: string): TipoFonte {
  const ultima = pilha.split(",").at(-1)?.trim();
  return ultima === "serif" ? "serif" : "sans";
}

export function paresDoModo(tema: Tema, modo: Modo): ParContraste[] {
  return paresDeContraste(coresDoModo(tema, modo));
}

/** Erros que bloqueiam o Salvar e avisos de contraste, mesmo quando há erros (o validarTema para no 1º). */
export function diagnostico(tema: Tema): { erros: string[]; avisos: string[] } {
  const resultado = validarTema(tema);
  const modos = (["claro", "escuro"] as const).filter((modo) => modo === "claro" || tema.cores.escuro);
  const avisos = modos.flatMap((modo) =>
    paresDoModo(tema, modo)
      .filter((par) => par.nivel === "secundario" && !par.ok)
      .map((par) => mensagemContraste(modo, par)),
  );
  return { erros: resultado.ok ? [] : resultado.erros, avisos };
}

function ordenado(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenado);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.keys(valor)
        .sort()
        .map((chave) => [chave, ordenado((valor as Record<string, unknown>)[chave])]),
    );
  }
  return valor;
}

export function temasIguais(a: Tema, b: Tema): boolean {
  return JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b));
}

/** URL do Google Fonts só com os nomes válidos (o nome pode estar sendo digitado). */
export function urlFontesDaPrevia(tema: Tema): string | null {
  const limpar = (fonte: FonteTema | undefined) =>
    fonte ? { ...fonte, google: fonte.google?.filter((nome) => NOME_GOOGLE.test(nome)) } : undefined;
  return urlGoogleFonts({
    ...tema,
    fontes: { texto: limpar(tema.fontes?.texto), titulos: limpar(tema.fontes?.titulos) },
  });
}

export function nomeArquivoTema(nomeEmpresa: string): string {
  const base = nomeEmpresa
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `tema-${base || "empresa"}.json`;
}
