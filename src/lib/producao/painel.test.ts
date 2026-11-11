import { describe, expect, test } from "vitest";
import { agregarEstoque, agregarOPs, agregarRecepcoes, agregarVendas, razao } from "./painel";

describe("razao", () => {
  test("divide e devolve null sem denominador", () => {
    expect(razao(1, 4)).toBe(0.25);
    expect(razao(5, 0)).toBeNull();
    expect(razao(5, -1)).toBeNull();
  });
});

describe("agregarRecepcoes", () => {
  test("líquido, % de terceiros (RN-33) e descarte por fruta e no total", () => {
    const r = agregarRecepcoes([
      { frutaId: "acai", origem: "PROPRIA", brutoKg: 100, descarteKg: 10 },
      { frutaId: "acai", origem: "TERCEIRO", brutoKg: 50, descarteKg: 0 },
      { frutaId: "cupu", origem: "TERCEIRO", brutoKg: 40, descarteKg: 4 },
    ]);
    expect(r.porFruta.get("acai")).toEqual({
      brutoKg: 150,
      descarteKg: 10,
      recebidoKg: 140,
      terceirosKg: 50,
      percentualTerceiros: 50 / 140,
      percentualDescarte: 10 / 150,
    });
    expect(r.porFruta.get("cupu")?.percentualTerceiros).toBe(1);
    expect(r.total.recebidoKg).toBe(176);
    expect(r.total.terceirosKg).toBe(86);
    expect(r.total.percentualDescarte).toBe(14 / 190);
  });

  test("sem recepção: zeros e indicadores nulos", () => {
    expect(agregarRecepcoes([]).total).toEqual({
      brutoKg: 0,
      descarteKg: 0,
      recebidoKg: 0,
      terceirosKg: 0,
      percentualTerceiros: null,
      percentualDescarte: null,
    });
  });
});

describe("agregarOPs", () => {
  const op = (o: Partial<Parameters<typeof agregarOPs>[0][number]>) => ({
    frutaId: "acai",
    status: "ENCERRADA" as const,
    frutoKg: 0,
    polpaKg: 0,
    custoTotal: 0,
    balancoVerificar: false,
    branqueamentoVerificar: false,
    ...o,
  });

  test("aberta conta no volume, custo médio só com encerradas, cancelada fica fora", () => {
    const r = agregarOPs([
      op({ frutoKg: 110, polpaKg: 60, custoTotal: 195 }),
      op({ status: "ABERTA", frutoKg: 20, polpaKg: 10, custoTotal: 30, balancoVerificar: true, branqueamentoVerificar: true }),
      op({ frutaId: "cupu", frutoKg: 30, polpaKg: 12, custoTotal: 90 }),
      op({ status: "CANCELADA", frutoKg: 5, polpaKg: 2, balancoVerificar: true }),
    ]);
    expect(r.porFruta.get("acai")).toEqual({
      quantidade: 2,
      frutoKg: 130,
      polpaKg: 70,
      rendimento: 70 / 130,
      custoMedioPolpa: 195 / 60,
    });
    expect(r.total).toEqual({
      quantidade: 3,
      frutoKg: 160,
      polpaKg: 82,
      rendimento: 82 / 160,
      custoMedioPolpa: 285 / 72,
    });
    expect(r.opsBalanco).toBe(1);
    expect(r.opsBranqueamento).toBe(1);
  });

  test("só OP aberta: sem custo médio", () => {
    expect(agregarOPs([op({ status: "ABERTA", frutoKg: 10, polpaKg: 5 })]).total.custoMedioPolpa).toBeNull();
  });
});

describe("agregarVendas", () => {
  test("faturamento, in natura × polpa, preço médio, ticket e margem (RN-22, RN-32)", () => {
    const r = agregarVendas([
      { pedidoId: "p1", produtoId: "agc", categoria: "POLPA", frutaId: "acai", quantidadeKg: 10, precoKg: 30, custoKg: 3.25 },
      { pedidoId: "p2", produtoId: "fa", categoria: "FRUTO", frutaId: "acai", quantidadeKg: 5, precoKg: 8, custoKg: 1.5 },
      { pedidoId: "p3", produtoId: "cpc", categoria: "POLPA", frutaId: "cupu", quantidadeKg: 6, precoKg: 20, custoKg: 7.5 },
    ]);
    expect(r.total).toEqual({
      faturamento: 460,
      faturamentoInNatura: 40,
      faturamentoPolpa: 420,
      kgVendidos: 21,
      precoMedio: 460 / 21,
      pedidos: 3,
      ticketMedio: 460 / 3,
      margem: 375,
      margemPercentual: 375 / 460,
    });
    expect(r.polpaPorFruta.get("acai")).toBe(300);
    expect(r.polpaPorFruta.get("cupu")).toBe(120);
    expect(r.porProduto.get("fa")).toEqual({ kg: 5, faturamento: 40 });
  });

  test("dois itens do mesmo pedido contam um pedido", () => {
    const item = { pedidoId: "p1", produtoId: "agc", categoria: "POLPA" as const, frutaId: "acai", quantidadeKg: 1, precoKg: 10, custoKg: 1 };
    expect(agregarVendas([item, item]).total.pedidos).toBe(1);
  });
});

describe("agregarEstoque", () => {
  test("polpa, fruto aguardando (não vencido), valor e alertas de validade", () => {
    const r = agregarEstoque([
      { produtoId: "agc", categoria: "POLPA", status: "OK", saldoKg: 30, valor: 97.5 },
      { produtoId: "agc", categoria: "POLPA", status: "VENCENDO", saldoKg: 8, valor: 32 },
      { produtoId: "fa", categoria: "FRUTO", status: "VENCIDO", saldoKg: 5, valor: 7.5 },
      { produtoId: "fc", categoria: "FRUTO", status: "OK", saldoKg: 25, valor: 50 },
      { produtoId: "fc", categoria: "FRUTO", status: "VENCENDO", saldoKg: 3, valor: 6 },
    ]);
    expect(r.polpaKg).toBe(38);
    expect(r.frutoAguardandoKg).toBe(28);
    expect(r.valor).toBe(193);
    expect(r.vencendo).toEqual({ quantidade: 2, kg: 11 });
    expect(r.vencidos).toEqual({ quantidade: 1, kg: 5 });
    expect(r.porProduto.get("agc")).toEqual({ saldoKg: 38, valor: 129.5 });
  });
});
