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
