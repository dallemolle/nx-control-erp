import { describe, expect, test } from "vitest";
import { corDeTextoContrastante, corHexValida } from "./corContraste";

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
