import { describe, expect, test } from "vitest";
import { empresaSchema } from "./empresa";

const BASE = {
  razaoSocial: "Empresa Teste Ltda",
  nomeFantasia: "Empresa Teste",
  cnpjCpf: "12345678000190",
  moedaPadrao: "BRL",
};

describe("empresaSchema — corPrimaria", () => {
  test("string vazia vira null", () => {
    const resultado = empresaSchema.parse({ ...BASE, corPrimaria: "" });
    expect(resultado.corPrimaria).toBeNull();
  });

  test("hex válido é aceito", () => {
    const resultado = empresaSchema.parse({ ...BASE, corPrimaria: "#0B2545" });
    expect(resultado.corPrimaria).toBe("#0B2545");
  });

  test("hex inválido é rejeitado", () => {
    const resultado = empresaSchema.safeParse({ ...BASE, corPrimaria: "azul" });
    expect(resultado.success).toBe(false);
  });
});

describe("empresaSchema — exigirAprovacaoPorOutro", () => {
  test("checkbox marcado é true, ausente é false", () => {
    expect(empresaSchema.parse({ ...BASE, corPrimaria: "", exigirAprovacaoPorOutro: "true" }).exigirAprovacaoPorOutro).toBe(
      true,
    );
    expect(empresaSchema.parse({ ...BASE, corPrimaria: "" }).exigirAprovacaoPorOutro).toBe(false);
  });
});
