import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { corDeTextoContrastante, tomDestaque } from "@/lib/corContraste";
import { temaSchema, type Tema } from "./schema";
import { cssDoTema, NOMES_PERMITIDOS, PADRAO_CLARO, temModoEscuro, urlGoogleFonts, variaveisDoTema } from "./css";

const hortitex = (): Tema => temaSchema.parse(JSON.parse(readFileSync("public/temas/hortitex.json", "utf8")));

/** Tema só com os papéis obrigatórios no modo claro. */
const minimo = (extra: Record<string, string> = {}): Tema =>
  temaSchema.parse({
    formato: "nx-tema",
    versao: 1,
    nome: "Mínimo",
    cores: {
      claro: {
        fundo: "#ffffff",
        texto: "#111111",
        primaria: "#123456",
        textoSobrePrimaria: "#ffffff",
        sidebar: "#123456",
        textoSobreSidebar: "#ffffff",
        ...extra,
      },
    },
  });

describe("variaveisDoTema", () => {
  test("Hortitex claro: papéis informados e derivados da sidebar", () => {
    const { claro } = variaveisDoTema(hortitex());
    expect(claro).toMatchObject({
      "--background": "#f7f1e3",
      "--primary": "#1f4d2e",
      "--card": "#fbf7ee",
      "--accent": "#ebe0c8",
      "--chart-3": "#b83a24",
      "--sidebar-border": "#f7f1e31a",
      "--sidebar-accent": tomDestaque("#1f4d2e", 8),
    });
  });

  test("papéis opcionais ausentes herdam", () => {
    const { claro, escuro } = variaveisDoTema(minimo());
    expect(claro["--card"]).toBe("#ffffff");
    expect(claro["--ring"]).toBe("#123456");
    expect(claro["--app-header-background"]).toBe("#ffffff");
    expect(claro["--app-header-foreground"]).toBe("#111111");
    expect(claro["--muted-foreground"]).toBe(PADRAO_CLARO["--muted-foreground"]);
    expect(claro["--secondary"]).toBe(tomDestaque("#ffffff", 4));
    expect(escuro).toBeNull();
  });

  test("cabeçalho sem texto próprio recebe a cor contrastante", () => {
    const { claro } = variaveisDoTema(minimo({ cabecalho: "#0b2545" }));
    expect(claro["--app-header-foreground"]).toBe(corDeTextoContrastante("#0b2545"));
  });
});

describe("cssDoTema", () => {
  test("Hortitex: blocos claro e escuro, fontes e raio", () => {
    const css = cssDoTema(hortitex());
    expect(css).toContain("html[class]{");
    expect(css).toContain('html[class*="-dark"]{');
    expect(css).toContain('font-family:"Calibri", Carlito, system-ui, sans-serif');
    expect(css).toContain("--radius:12px");
    const declaradas = [...css.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]);
    expect(declaradas.length).toBeGreaterThan(0);
    for (const nome of declaradas) expect(NOMES_PERMITIDOS).toContain(nome);
  });

  test("tema só claro não gera bloco escuro", () => {
    expect(cssDoTema(minimo())).not.toContain("-dark");
    expect(temModoEscuro(minimo())).toBe(false);
    expect(temModoEscuro(hortitex())).toBe(true);
  });
});

describe("urlGoogleFonts", () => {
  test("monta a URL com os nomes, pesos 400/700 e display=swap", () => {
    expect(urlGoogleFonts(hortitex())).toBe(
      "https://fonts.googleapis.com/css2?family=Carlito:wght@400;700&family=Caladea:wght@400;700&display=swap",
    );
  });

  test("sem fontes do Google, null", () => {
    expect(urlGoogleFonts(minimo())).toBeNull();
  });
});
