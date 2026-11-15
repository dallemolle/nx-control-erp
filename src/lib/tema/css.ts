import { corDeTextoContrastante, tomDestaque } from "@/lib/corContraste";
import type { CoresModo, Tema } from "./schema";

/** Valores da variação A (globals.css) para os papéis sem herança dentro do tema. */
export const PADRAO_CLARO: Record<string, string> = {
  "--muted-foreground": "oklch(0.556 0 0)",
  "--border": "oklch(0.922 0 0)",
  "--input": "oklch(0.922 0 0)",
  "--destructive": "oklch(0.577 0.245 27.325)",
  "--chart-1": "#bfd9ef",
  "--chart-2": "#8fbee0",
  "--chart-3": "#6fa8dc",
  "--chart-4": "#3d5a78",
  "--chart-5": "#0b2545",
};

export const PADRAO_ESCURO: Record<string, string> = {
  "--muted-foreground": "#93a3b8",
  "--border": "#ffffff1a",
  "--input": "#ffffff26",
  "--destructive": "oklch(0.704 0.191 22.216)",
  "--chart-1": "#6fa8dc",
  "--chart-2": "#8fbee0",
  "--chart-3": "#bfd9ef",
  "--chart-4": "#3d5a78",
  "--chart-5": "#1b3a5c",
};

/** Variáveis CSS de um modo, com a herança da tabela de papéis do spec. */
export function variaveisDoModo(cores: CoresModo, padrao: Record<string, string>): Record<string, string> {
  const apoio = cores.apoio ?? tomDestaque(cores.fundo, 4);
  const sidebarAccent = tomDestaque(cores.sidebar, 8);
  const sidebarPrimary = tomDestaque(cores.sidebar, 16);
  const cabecalho = cores.cabecalho ?? cores.fundo;
  const textoCabecalho =
    cores.textoCabecalho ?? (cores.cabecalho ? corDeTextoContrastante(cores.cabecalho) : cores.texto);
  const graficos = cores.graficos ?? [1, 2, 3, 4, 5].map((n) => padrao[`--chart-${n}`]);

  return {
    "--background": cores.fundo,
    "--foreground": cores.texto,
    "--card": cores.cartao ?? cores.fundo,
    "--card-foreground": cores.texto,
    "--popover": cores.cartao ?? cores.fundo,
    "--popover-foreground": cores.texto,
    "--primary": cores.primaria,
    "--primary-foreground": cores.textoSobrePrimaria,
    "--secondary": apoio,
    "--secondary-foreground": cores.textoSobreApoio ?? cores.texto,
    "--muted": apoio,
    "--muted-foreground": cores.textoApagado ?? padrao["--muted-foreground"],
    "--accent": cores.destaque ?? apoio,
    "--accent-foreground": cores.textoSobreDestaque ?? cores.texto,
    "--destructive": cores.erro ?? padrao["--destructive"],
    "--border": cores.borda ?? padrao["--border"],
    "--input": cores.borda ?? padrao["--input"],
    "--ring": cores.foco ?? cores.primaria,
    "--chart-1": graficos[0],
    "--chart-2": graficos[1],
    "--chart-3": graficos[2],
    "--chart-4": graficos[3],
    "--chart-5": graficos[4],
    "--sidebar": cores.sidebar,
    "--sidebar-foreground": cores.textoSobreSidebar,
    "--sidebar-primary": sidebarPrimary,
    "--sidebar-primary-foreground": corDeTextoContrastante(sidebarPrimary),
    "--sidebar-accent": sidebarAccent,
    "--sidebar-accent-foreground": corDeTextoContrastante(sidebarAccent),
    "--sidebar-border": `${cores.textoSobreSidebar}1a`,
    "--sidebar-ring": cores.foco ?? cores.primaria,
    "--app-header-background": cabecalho,
    "--app-header-foreground": textoCabecalho,
  };
}

/** Únicas propriedades que o CSS do tema pode declarar. */
export const NOMES_PERMITIDOS: readonly string[] = [
  ...Object.keys(
    variaveisDoModo(
      {
        fundo: "#000000",
        texto: "#000000",
        primaria: "#000000",
        textoSobrePrimaria: "#000000",
        sidebar: "#000000",
        textoSobreSidebar: "#000000",
      },
      PADRAO_CLARO,
    ),
  ),
  "--radius",
];

export function variaveisDoTema(tema: Tema): { claro: Record<string, string>; escuro: Record<string, string> | null } {
  return {
    claro: variaveisDoModo(tema.cores.claro, PADRAO_CLARO),
    escuro: tema.cores.escuro ? variaveisDoModo(tema.cores.escuro, PADRAO_ESCURO) : null,
  };
}

export function temModoEscuro(tema: Tema): boolean {
  return tema.cores.escuro !== undefined;
}

function declaracoes(variaveis: Record<string, string>): string {
  return Object.entries(variaveis)
    .filter(([nome]) => NOMES_PERMITIDOS.includes(nome))
    .map(([nome, valor]) => `${nome}:${valor}`)
    .join(";");
}

/**
 * Bloco CSS do tema. `html[class]` vence as classes `.theme-*` do next-themes
 * e vale para a página toda (inclusive diálogos em portal). Só valores validados.
 */
export function cssDoTema(tema: Tema): string {
  const { claro, escuro } = variaveisDoTema(tema);
  const raio: Record<string, string> = tema.raio ? { "--radius": tema.raio } : {};
  const fonteTexto = tema.fontes?.texto ? `;font-family:${tema.fontes.texto.pilha}` : "";
  let css = `html[class]{${declaracoes({ ...claro, ...raio })}${fonteTexto}}`;
  if (escuro) css += `html[class*="-dark"]{${declaracoes(escuro)}}`;
  if (tema.fontes?.titulos) {
    css += `html[class] :is(h1,h2,h3,.font-heading){font-family:${tema.fontes.titulos.pilha}}`;
  }
  return css;
}

/** Link do Google Fonts para as famílias do tema (texto, depois títulos), ou null. */
export function urlGoogleFonts(tema: Tema): string | null {
  const nomes = [...new Set([...(tema.fontes?.texto?.google ?? []), ...(tema.fontes?.titulos?.google ?? [])])];
  if (nomes.length === 0) return null;
  const familias = nomes.map((nome) => `family=${nome.replaceAll(" ", "+")}:wght@400;700`).join("&");
  return `https://fonts.googleapis.com/css2?${familias}&display=swap`;
}
