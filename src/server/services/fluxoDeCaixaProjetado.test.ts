import { describe, expect, test } from "vitest";
import { calcularJanela } from "./fluxoDeCaixa";
import {
  calcularJanelaProjetada,
  calcularPeriodosFluxoDeCaixaProjetado,
  saldoRemanescenteParcela,
  type ParcelaParaProjecao,
} from "./fluxoDeCaixaProjetado";

describe("calcularJanelaProjetada", () => {
  test("MOVEL: 12 meses a partir do mês de referência, incluindo virada de ano", () => {
    const periodos = calcularJanelaProjetada("MOVEL", new Date(Date.UTC(2026, 5, 15))); // junho/2026
    expect(periodos).toHaveLength(12);
    expect(periodos[0].inicio.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(periodos[0].fim.toISOString()).toBe("2026-06-30T23:59:59.999Z");
    expect(periodos[11].inicio.toISOString()).toBe("2027-05-01T00:00:00.000Z");
    expect(periodos[11].fim.toISOString()).toBe("2027-05-31T23:59:59.999Z");
  });

  test("ANO_CIVIL: jan-dez do ano de referência, igual a calcularJanela(\"MES\", ...)", () => {
    const dataReferencia = new Date(Date.UTC(2026, 5, 15));
    const periodos = calcularJanelaProjetada("ANO_CIVIL", dataReferencia);
    const esperado = calcularJanela("MES", dataReferencia);
    expect(periodos).toEqual(esperado);
  });
});

describe("saldoRemanescenteParcela", () => {
  test("sem baixas, devolve o valor atualizado inteiro", () => {
    expect(saldoRemanescenteParcela(1000, [])).toBe(1000);
  });

  test("com baixa parcial, subtrai o valor pago", () => {
    expect(saldoRemanescenteParcela(1000, [{ valorPago: 400 }])).toBe(600);
  });

  test("com baixas somando mais que o valor, devolve negativo sem lançar erro", () => {
    expect(saldoRemanescenteParcela(1000, [{ valorPago: 600 }, { valorPago: 500 }])).toBe(-100);
  });
});

describe("calcularPeriodosFluxoDeCaixaProjetado", () => {
  const periodos = [
    { inicio: new Date(Date.UTC(2026, 8, 1)), fim: new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999)) },
    { inicio: new Date(Date.UTC(2026, 9, 1)), fim: new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999)) },
  ];

  test("separa RECEBER (entradas) de PAGAR (saídas) no mesmo mês e encadeia o saldo", () => {
    const parcelas: ParcelaParaProjecao[] = [
      { dataVencimento: new Date(Date.UTC(2026, 8, 10)), saldo: 1000, tipo: "RECEBER" },
      { dataVencimento: new Date(Date.UTC(2026, 8, 20)), saldo: 300, tipo: "PAGAR" },
      { dataVencimento: new Date(Date.UTC(2026, 9, 5)), saldo: 200, tipo: "RECEBER" },
    ];

    const resultado = calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, 500);

    expect(resultado[0]).toMatchObject({
      saldoInicial: 500,
      entradasProjetadas: 1000,
      saidasProjetadas: 300,
      geracaoLiquida: 700,
      saldoFinal: 1200,
      alerta: false,
    });
    expect(resultado[1]).toMatchObject({
      saldoInicial: 1200,
      entradasProjetadas: 200,
      saidasProjetadas: 0,
      geracaoLiquida: 200,
      saldoFinal: 1400,
      alerta: false,
    });
  });

  test("mês sem nenhuma parcela mantém o saldo inicial como saldo final", () => {
    const resultado = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500);
    expect(resultado[0]).toMatchObject({ entradasProjetadas: 0, saidasProjetadas: 0, geracaoLiquida: 0, saldoFinal: 500, alerta: false });
    expect(resultado[1]).toMatchObject({ saldoInicial: 500, saldoFinal: 500 });
  });

  test("saldoFinal negativo marca alerta true; exatamente zero não marca", () => {
    const resultadoNegativo = calcularPeriodosFluxoDeCaixaProjetado(
      periodos,
      [{ dataVencimento: new Date(Date.UTC(2026, 8, 10)), saldo: 600, tipo: "PAGAR" }],
      500,
    );
    expect(resultadoNegativo[0].saldoFinal).toBe(-100);
    expect(resultadoNegativo[0].alerta).toBe(true);

    const resultadoZero = calcularPeriodosFluxoDeCaixaProjetado(
      periodos,
      [{ dataVencimento: new Date(Date.UTC(2026, 8, 10)), saldo: 500, tipo: "PAGAR" }],
      500,
    );
    expect(resultadoZero[0].saldoFinal).toBe(0);
    expect(resultadoZero[0].alerta).toBe(false);
  });

  test("parcela fora do intervalo dos sub-períodos é ignorada", () => {
    const parcelas: ParcelaParaProjecao[] = [
      { dataVencimento: new Date(Date.UTC(2026, 7, 15)), saldo: 999, tipo: "RECEBER" },
    ];
    const resultado = calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, 500);
    expect(resultado[0].entradasProjetadas).toBe(0);
  });
});
