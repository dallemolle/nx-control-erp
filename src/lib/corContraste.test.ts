import { describe, expect, test } from "vitest";
import { corDeTextoContrastante, corHexValida, hexParaHsl, hslParaHex, tomDestaque } from "./corContraste";

describe("corDeTextoContrastante", () => {
  test("preto de fundo -> texto branco", () => {
    expect(corDeTextoContrastante("#000000")).toBe("#ffffff");
  });

  test("branco de fundo -> texto preto", () => {
    expect(corDeTextoContrastante("#ffffff")).toBe("#000000");
  });

  test("navy escuro (cor padrão do sistema hoje) -> texto branco", () => {
    expect(corDeTextoContrastante("#0B2545")).toBe("#ffffff");
  });

  test("amarelo claro -> texto preto", () => {
    expect(corDeTextoContrastante("#F5D76E")).toBe("#000000");
  });
});

describe("corHexValida", () => {
  test("aceita hex de 6 dígitos com #", () => {
    expect(corHexValida("#0B2545")).toBe(true);
    expect(corHexValida("#abc123")).toBe(true);
  });

  test("rejeita sem #", () => {
    expect(corHexValida("0B2545")).toBe(false);
  });

  test("rejeita hex de 3 dígitos", () => {
    expect(corHexValida("#fff")).toBe(false);
  });

  test("rejeita caracteres não-hex", () => {
    expect(corHexValida("#GGGGGG")).toBe(false);
  });
});

describe("hexParaHsl", () => {
  test("vermelho puro", () => {
    expect(hexParaHsl("#ff0000")).toEqual({ h: 0, s: 100, l: 50 });
  });

  test("verde puro", () => {
    expect(hexParaHsl("#00ff00")).toEqual({ h: 120, s: 100, l: 50 });
  });

  test("azul puro", () => {
    expect(hexParaHsl("#0000ff")).toEqual({ h: 240, s: 100, l: 50 });
  });

  test("preto", () => {
    expect(hexParaHsl("#000000")).toEqual({ h: 0, s: 0, l: 0 });
  });

  test("branco", () => {
    expect(hexParaHsl("#ffffff")).toEqual({ h: 0, s: 0, l: 100 });
  });
});

describe("hslParaHex", () => {
  test("vermelho puro", () => {
    expect(hslParaHex(0, 100, 50)).toBe("#ff0000");
  });

  test("verde puro", () => {
    expect(hslParaHex(120, 100, 50)).toBe("#00ff00");
  });

  test("azul puro", () => {
    expect(hslParaHex(240, 100, 50)).toBe("#0000ff");
  });
});

describe("tomDestaque", () => {
  test("fundo escuro fica mais claro — mesmo H/S, L maior", () => {
    const original = hexParaHsl("#0B2545");
    const destacado = hexParaHsl(tomDestaque("#0B2545", 8));
    expect(destacado.h).toBeCloseTo(original.h, 0);
    expect(destacado.s).toBeCloseTo(original.s, 0);
    expect(destacado.l).toBeCloseTo(original.l + 8, 0);
  });

  test("fundo claro fica mais escuro — mesmo H/S, L menor", () => {
    const original = hexParaHsl("#F5D76E");
    const destacado = hexParaHsl(tomDestaque("#F5D76E", 8));
    expect(destacado.h).toBeCloseTo(original.h, 0);
    expect(destacado.s).toBeCloseTo(original.s, 0);
    expect(destacado.l).toBeCloseTo(original.l - 8, 0);
  });

  test("intensidade maior gera deslocamento maior", () => {
    const comIntensidadeMenor = hexParaHsl(tomDestaque("#0B2545", 8));
    const comIntensidadeMaior = hexParaHsl(tomDestaque("#0B2545", 16));
    expect(comIntensidadeMaior.l).toBeGreaterThan(comIntensidadeMenor.l);
  });

  test("clampa em 100 no limite superior (fundo escuro, intensidade exagerada)", () => {
    const resultado = hexParaHsl(tomDestaque("#000000", 200));
    expect(resultado.l).toBe(100);
  });

  test("clampa em 0 no limite inferior (fundo claro, intensidade exagerada)", () => {
    const resultado = hexParaHsl(tomDestaque("#ffffff", 200));
    expect(resultado.l).toBe(0);
  });
});
