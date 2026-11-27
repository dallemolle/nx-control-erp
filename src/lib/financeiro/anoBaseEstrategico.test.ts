import { describe, expect, test } from "vitest";
import { formatarMoeda } from "@/lib/formatacao";
import { somarAnoBase, textoForaDaBase, type LancamentoDoAnoBase } from "./anoBaseEstrategico";

const RECEITA = { tipo: "RECEITA" as const, naoOperacional: false };
const DESPESA = { tipo: "DESPESA" as const, naoOperacional: false };
const EMPRESTIMO = { tipo: "RECEITA" as const, naoOperacional: true };
const AMORTIZACAO = { tipo: "DESPESA" as const, naoOperacional: true };

describe("somarAnoBase", () => {
  test("exemplo da spec: vendas, insumos com devolução, custeio, amortização e tarifa sem categoria", () => {
    const lancamentos: LancamentoDoAnoBase[] = [
      { tipo: "ENTRADA", valor: 220_000, categoria: RECEITA },
      { tipo: "SAIDA", valor: 90_000, categoria: DESPESA },
      { tipo: "ENTRADA", valor: 200, categoria: DESPESA },
      { tipo: "ENTRADA", valor: 100_000, categoria: EMPRESTIMO },
      { tipo: "SAIDA", valor: 20_000, categoria: AMORTIZACAO },
      { tipo: "SAIDA", valor: 50, categoria: null },
    ];
    expect(somarAnoBase(lancamentos)).toEqual({
      receitaBase: 220_000,
      custoBase: 89_800,
      foraDaBase: {
        naoOperacional: { entradas: 100_000, saidas: 20_000 },
        semCategoria: { entradas: 0, saidas: 50 },
      },
    });
  });

  test("estorno lançado como saída numa categoria de receita reduz a receita", () => {
    const soma = somarAnoBase([
      { tipo: "ENTRADA", valor: 1000, categoria: RECEITA },
      { tipo: "SAIDA", valor: 150, categoria: RECEITA },
    ]);
    expect(soma.receitaBase).toBe(850);
    expect(soma.custoBase).toBe(0);
  });

  test("sem lançamentos, tudo zero", () => {
    expect(somarAnoBase([])).toEqual({
      receitaBase: 0,
      custoBase: 0,
      foraDaBase: { naoOperacional: { entradas: 0, saidas: 0 }, semCategoria: { entradas: 0, saidas: 0 } },
    });
  });

  test("soma centavos sem erro de ponto flutuante", () => {
    const soma = somarAnoBase([
      { tipo: "ENTRADA", valor: 0.1, categoria: RECEITA },
      { tipo: "ENTRADA", valor: 0.2, categoria: RECEITA },
    ]);
    expect(soma.receitaBase).toBe(0.3);
  });
});

describe("textoForaDaBase", () => {
  const zerado = { entradas: 0, saidas: 0 };

  test("nada fora: sem aviso", () => {
    expect(textoForaDaBase({ naoOperacional: zerado, semCategoria: zerado })).toBeNull();
  });

  test("lista só as partes diferentes de zero", () => {
    expect(
      textoForaDaBase({ naoOperacional: { entradas: 100_000, saidas: 20_000 }, semCategoria: { entradas: 1500, saidas: 0 } }),
    ).toBe(
      `Ficaram fora do ano-base: ${formatarMoeda(100_000)} de entradas e ${formatarMoeda(20_000)} de saídas em ` +
        `categorias não operacionais; ${formatarMoeda(1500)} de entradas sem categoria.`,
    );
    expect(textoForaDaBase({ naoOperacional: zerado, semCategoria: { entradas: 0, saidas: 50 } })).toBe(
      `Ficaram fora do ano-base: ${formatarMoeda(50)} de saídas sem categoria.`,
    );
  });
});
