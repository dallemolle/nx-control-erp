import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { analisarTexto, paresDeContraste, validarTema } from "./validar";

const hortitex = () => JSON.parse(readFileSync("public/temas/hortitex.json", "utf8"));

/** Hortitex com uma alteração aplicada por `mudar`. */
function com(mudar: (tema: ReturnType<typeof hortitex>) => void) {
  const tema = hortitex();
  mudar(tema);
  return tema;
}

function erros(entrada: unknown): string[] {
  const r = validarTema(entrada);
  if (r.ok) throw new Error("esperava recusa");
  return r.erros;
}

describe("validarTema", () => {
  test("aceita o tema Hortitex sem avisos", () => {
    const r = validarTema(hortitex());
    expect(r).toMatchObject({ ok: true, avisos: [] });
  });

  test("recusa cores fora de #RRGGBB, apontando o caminho", () => {
    for (const cor of ["#fff", "red", "#gggggg"]) {
      const e = erros(com((t) => (t.cores.claro.fundo = cor)));
      expect(e.join("\n")).toContain("cores.claro.fundo");
    }
  });

  test("recusa campo desconhecido, formato e versão errados e modo claro ausente", () => {
    expect(erros(com((t) => (t.cores.claro.corNova = "#000000"))).join("\n")).toContain("cores.claro");
    expect(erros(com((t) => (t.formato = "outro"))).join("\n")).toContain("formato");
    expect(erros(com((t) => (t.versao = 2))).join("\n")).toContain("versao");
    expect(erros(com((t) => delete t.cores.claro)).join("\n")).toContain("cores.claro");
  });

  test("recusa raio fora da faixa ou em outra unidade", () => {
    for (const raio of ["40px", "3rem", "1em"]) {
      expect(erros(com((t) => (t.raio = raio))).join("\n")).toContain("raio");
    }
  });

  test("recusa nome de fonte e pilha com caracteres perigosos", () => {
    expect(erros(com((t) => (t.fontes.texto.google = ["Carlito;x"]))).join("\n")).toContain("fontes.texto.google");
    for (const pilha of ["url(x), serif", "Arial; color: red", "Arial</style>", '"Calibri, Carlito']) {
      expect(erros(com((t) => (t.fontes.texto.pilha = pilha))).join("\n")).toContain("fontes.texto.pilha");
    }
  });

  test("contraste ruim num par essencial bloqueia", () => {
    const e = erros(
      com((t) => {
        t.cores.claro.texto = "#777777";
        t.cores.claro.fundo = "#888888";
      }),
    );
    expect(e.join("\n")).toContain("cores.claro.texto sobre fundo");
    expect(e.join("\n")).toContain("mínimo 4,5:1");
  });

  test("contraste ruim num par secundário só avisa", () => {
    const r = validarTema(com((t) => (t.cores.claro.textoApagado = "#d8d0c0")));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.avisos.join("\n")).toContain("textoApagado");
  });

  test("normaliza cores para minúsculas", () => {
    const r = validarTema(com((t) => (t.cores.claro.fundo = "#F7F1E3")));
    expect(r.ok && r.tema.cores.claro.fundo).toBe("#f7f1e3");
  });
});

describe("paresDeContraste", () => {
  test("lista essenciais e secundários com razão e situação", () => {
    const pares = paresDeContraste({ ...hortitex().cores.claro, texto: "#777777", fundo: "#888888" });
    const textoFundo = pares.find((p) => p.texto === "texto" && p.fundo === "fundo");
    expect(textoFundo).toMatchObject({ nivel: "essencial", ok: false });
    expect(textoFundo!.razao).toBeLessThan(4.5);
    expect(pares.find((p) => p.texto === "textoApagado")).toMatchObject({ nivel: "secundario" });
  });

  test("cabeçalho ausente herda fundo e texto", () => {
    const cores = hortitex().cores.claro;
    delete cores.cabecalho;
    delete cores.textoCabecalho;
    const par = paresDeContraste(cores).find((p) => p.texto === "textoCabecalho");
    expect(par).toMatchObject({ fundo: "cabecalho", ok: true });
  });

  test("concorda com validarTema: essencial ruim vira erro, secundário ruim vira aviso", () => {
    const ruim = com((t) => (t.cores.claro.textoSobrePrimaria = t.cores.claro.primaria));
    const r = validarTema(ruim);
    expect(r.ok).toBe(false);
    const falhas = paresDeContraste(ruim.cores.claro).filter((p) => p.nivel === "essencial" && !p.ok);
    expect(falhas.map((p) => p.texto)).toEqual(["textoSobrePrimaria"]);
  });
});

describe("analisarTexto", () => {
  test("texto que não é JSON vira erro, não exceção", () => {
    const r = analisarTexto("{ não é json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros[0]).toContain("JSON inválido");
  });
});
