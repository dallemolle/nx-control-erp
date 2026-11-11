import { describe, expect, test } from "vitest";
import type { PainelProducao } from "@/server/services/relatorioProducao/painel";
import { COLUNAS_INDICADORES, linhasDoPainel } from "./painelProducao";

const vazio: PainelProducao = {
  periodo: { inicio: new Date("2026-11-01"), fim: new Date("2026-11-30") },
  hoje: new Date("2026-11-20"),
  porFruta: [
    {
      frutaId: "a",
      fruta: "Açaí",
      recepcao: {
        brutoKg: 150,
        descarteKg: 10,
        recebidoKg: 140,
        terceirosKg: 50,
        percentualTerceiros: 0.25,
        percentualDescarte: null,
      },
      processamento: null,
      faturamentoPolpa: 300,
    },
  ],
  recepcao: {
    brutoKg: 150,
    descarteKg: 10,
    recebidoKg: 140,
    terceirosKg: 50,
    percentualTerceiros: 0.25,
    percentualDescarte: null,
  },
  processamento: { quantidade: 0, frutoKg: 0, polpaKg: 0, rendimento: null, custoMedioPolpa: null },
  vendas: {
    faturamento: 300,
    faturamentoInNatura: 0,
    faturamentoPolpa: 300,
    kgVendidos: 10,
    precoMedio: 30,
    pedidos: 1,
    ticketMedio: 300,
    margem: 267.5,
    margemPercentual: 0.89,
    aReceber: 300,
  },
  estoque: { polpaKg: 30, frutoAguardandoKg: 0, valor: 97.5 },
  alertas: {
    lotesVencendo: { quantidade: 0, kg: 0 },
    lotesVencidos: { quantidade: 1, kg: 5 },
    entregasAbertas: 1,
    entregasAtrasadas: 1,
    opsBalanco: 0,
    opsBranqueamento: 0,
  },
  estoquePorProduto: [],
  vendasPorProduto: [],
};

describe("linhasDoPainel", () => {
  const linhas = linhasDoPainel(vazio);
  const achar = (indicador: string, fruta = "") =>
    linhas.find((l) => l.indicador === indicador && l.fruta === fruta);

  test("total e por fruta, percentual em fração", () => {
    expect(achar("Fruto recebido")).toMatchObject({
      bloco: "Recepção e processamento",
      valor: 140,
      unidade: "kg",
    });
    expect(achar("Fruto recebido", "Açaí")).toMatchObject({ valor: 140 });
    expect(achar("De terceiros")).toMatchObject({ valor: 0.25, unidade: "%" });
    expect(achar("Descarte na triagem")).toMatchObject({ valor: null });
    expect(achar("Faturamento de polpa", "Açaí")).toMatchObject({ valor: 300, unidade: "R$" });
    expect(achar("Lotes vencidos com saldo")).toMatchObject({
      bloco: "Estoque e alertas",
      valor: 1,
      unidade: "nº",
    });
  });

  test("CSV: percentual × 100 e vazio quando null", () => {
    const valor = COLUNAS_INDICADORES.find((c) => c.rotulo === "Valor")!;
    expect(valor.valor(achar("De terceiros")!)).toBe(25);
    expect(valor.valor(achar("Descarte na triagem")!)).toBe("");
  });
});
