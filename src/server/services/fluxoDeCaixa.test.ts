import { describe, expect, test } from "vitest";
import { calcularJanela, calcularPeriodosFluxoDeCaixa, type LancamentoParaFluxo } from "./fluxoDeCaixa";

describe("calcularJanela", () => {
  test("DIA: devolve todos os dias do mês de referência", () => {
    const periodos = calcularJanela("DIA", new Date(Date.UTC(2026, 1, 15))); // fevereiro/2026 (28 dias)
    expect(periodos).toHaveLength(28);
    expect(periodos[0].inicio.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(periodos[27].inicio.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(periodos[27].fim.toISOString()).toBe("2026-02-28T23:59:59.999Z");
  });

  test("SEMANA: primeira semana começa na segunda-feira que contém o dia 1 do mês", () => {
    // setembro/2026 começa numa terça-feira (2026-09-01)
    const periodos = calcularJanela("SEMANA", new Date(Date.UTC(2026, 8, 15)));
    expect(periodos[0].inicio.toISOString()).toBe("2026-08-31T00:00:00.000Z"); // segunda anterior
    expect(periodos[0].fim.toISOString()).toBe("2026-09-06T23:59:59.999Z");
  });

  test("MES: devolve os 12 meses do ano de referência", () => {
    const periodos = calcularJanela("MES", new Date(Date.UTC(2026, 5, 1)));
    expect(periodos).toHaveLength(12);
    expect(periodos[0].inicio.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(periodos[11].fim.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });

  test("ANO: devolve os últimos 5 anos civis até o ano de referência", () => {
    const periodos = calcularJanela("ANO", new Date(Date.UTC(2026, 0, 1)));
    expect(periodos).toHaveLength(5);
    expect(periodos[0].inicio.getUTCFullYear()).toBe(2022);
    expect(periodos[4].inicio.getUTCFullYear()).toBe(2026);
  });
});

describe("calcularPeriodosFluxoDeCaixa", () => {
  const periodos = [
    { inicio: new Date(Date.UTC(2026, 8, 1)), fim: new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999)) },
    { inicio: new Date(Date.UTC(2026, 9, 1)), fim: new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999)) },
  ];

  test("soma entradas e saídas de cada sub-período e encadeia o saldo", () => {
    const lancamentos: LancamentoParaFluxo[] = [
      { data: new Date(Date.UTC(2026, 8, 10)), valor: 1000, tipo: "ENTRADA" },
      { data: new Date(Date.UTC(2026, 8, 20)), valor: 300, tipo: "SAIDA" },
      { data: new Date(Date.UTC(2026, 9, 5)), valor: 200, tipo: "ENTRADA" },
    ];

    const resultado = calcularPeriodosFluxoDeCaixa(periodos, lancamentos, 500);

    expect(resultado[0]).toMatchObject({ saldoInicial: 500, entradas: 1000, saidas: 300, geracaoLiquida: 700, saldoFinal: 1200 });
    expect(resultado[1]).toMatchObject({ saldoInicial: 1200, entradas: 200, saidas: 0, geracaoLiquida: 200, saldoFinal: 1400 });
  });

  test("sub-período sem lançamento nenhum mantém o saldo inicial como saldo final", () => {
    const resultado = calcularPeriodosFluxoDeCaixa(periodos, [], 500);
    expect(resultado[0]).toMatchObject({ entradas: 0, saidas: 0, geracaoLiquida: 0, saldoFinal: 500 });
    expect(resultado[1]).toMatchObject({ saldoInicial: 500, saldoFinal: 500 });
  });

  test("lançamento fora do intervalo dos sub-períodos é ignorado", () => {
    const lancamentos: LancamentoParaFluxo[] = [
      { data: new Date(Date.UTC(2026, 7, 15)), valor: 999, tipo: "ENTRADA" },
    ];
    const resultado = calcularPeriodosFluxoDeCaixa(periodos, lancamentos, 500);
    expect(resultado[0].entradas).toBe(0);
  });
});
