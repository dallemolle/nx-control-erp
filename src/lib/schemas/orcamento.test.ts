import { describe, expect, test } from "vitest";
import { valorOrcamentoSchema } from "./orcamento";

describe("valorOrcamentoSchema", () => {
  test("lê o valor digitado do jeito brasileiro", () => {
    expect(valorOrcamentoSchema.parse("1.500")).toBe(1500);
    expect(valorOrcamentoSchema.parse("1.500,50")).toBe(1500.5);
    expect(valorOrcamentoSchema.parse("")).toBe(0);
    expect(valorOrcamentoSchema.parse(null)).toBe(0);
  });

  test("texto que não é um valor claro dá erro explicando o formato", () => {
    const resultado = valorOrcamentoSchema.safeParse("1,2,3");
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe("Valor inválido: use o formato 1.500,00");
  });

  test("continua recusando negativo", () => {
    expect(valorOrcamentoSchema.safeParse("-300").error?.issues[0]?.message).toBe("Não pode ser negativo");
  });
});
