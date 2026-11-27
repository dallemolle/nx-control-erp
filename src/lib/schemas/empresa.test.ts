import { describe, expect, test } from "vitest";
import { empresaSchema } from "./empresa";

const BASE = {
  razaoSocial: "Empresa Teste Ltda",
  nomeFantasia: "Empresa Teste",
  cnpjCpf: "12345678000190",
  moedaPadrao: "BRL",
};

describe("empresaSchema — cor fica no Tema e marca", () => {
  test("corPrimaria enviada é ignorada", () => {
    const resultado = empresaSchema.parse({ ...BASE, corPrimaria: "#0B2545" });
    expect(resultado).not.toHaveProperty("corPrimaria");
  });
});

describe("empresaSchema — exigirAprovacaoPorOutro", () => {
  test("checkbox marcado é true, ausente é false", () => {
    expect(empresaSchema.parse({ ...BASE, exigirAprovacaoPorOutro: "true" }).exigirAprovacaoPorOutro).toBe(true);
    expect(empresaSchema.parse(BASE).exigirAprovacaoPorOutro).toBe(false);
  });
});
