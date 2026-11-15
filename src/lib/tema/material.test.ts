import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { schemaJsonDoTema } from "./schemaJson";

describe("material de apoio do tema (public/temas)", () => {
  test("o JSON Schema publicado é o gerado do temaSchema (rode npm run tema:schema)", () => {
    expect(readFileSync("public/temas/nx-tema.schema.json", "utf8").replaceAll("\r\n", "\n")).toBe(schemaJsonDoTema());
  });

  test("o modelo de pedido para a IA traz o formato e a regra de contraste", () => {
    const modelo = readFileSync("public/temas/modelo-pedido-ia.md", "utf8");
    expect(modelo).toContain('"nx-tema"');
    expect(modelo).toContain("4,5:1");
  });
});
