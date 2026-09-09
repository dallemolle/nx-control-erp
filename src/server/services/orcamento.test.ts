import { describe, expect, test } from "vitest";
import { montarLinhaComparativo } from "./orcamento";

describe("montarLinhaComparativo", () => {
  test("variação absoluta é realizado menos orçado, positiva quando realizado excede", () => {
    const linha = montarLinhaComparativo("cat-1", "Aluguel", "DESPESA", 2026, 3, 1000, 1200, 0);
    expect(linha.variacaoAbsolutaRealizado).toBe(200);
  });

  test("variação absoluta é negativa quando realizado fica abaixo do orçado", () => {
    const linha = montarLinhaComparativo("cat-1", "Aluguel", "DESPESA", 2026, 3, 1000, 700, 0);
    expect(linha.variacaoAbsolutaRealizado).toBe(-300);
  });

  test("variação percentual é null quando orçado é zero", () => {
    const linha = montarLinhaComparativo("cat-1", "Aluguel", "DESPESA", 2026, 3, 0, 500, 0);
    expect(linha.variacaoPercentualRealizado).toBeNull();
  });

  test("variação percentual calculada corretamente quando orçado não é zero", () => {
    const linha = montarLinhaComparativo("cat-1", "Aluguel", "DESPESA", 2026, 3, 1000, 1200, 0);
    expect(linha.variacaoPercentualRealizado).toBeCloseTo(0.2, 6);
  });

  test("alerta true para DESPESA quando realizado + projetado excede o orçado", () => {
    const linha = montarLinhaComparativo("cat-1", "Aluguel", "DESPESA", 2026, 3, 1000, 600, 500);
    expect(linha.alerta).toBe(true);
  });

  test("alerta false para DESPESA quando realizado + projetado é exatamente igual ao orçado", () => {
    const linha = montarLinhaComparativo("cat-1", "Aluguel", "DESPESA", 2026, 3, 1000, 600, 400);
    expect(linha.alerta).toBe(false);
  });

  test("alerta sempre false para RECEITA, mesmo excedendo o orçado", () => {
    const linha = montarLinhaComparativo("cat-2", "Vendas", "RECEITA", 2026, 3, 1000, 1500, 500);
    expect(linha.alerta).toBe(false);
  });
});
