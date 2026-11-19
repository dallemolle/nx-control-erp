import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import type { TipoTitulo } from "@prisma/client";
import { buscarSaldoEmCaixaAte, calcularJanela } from "./fluxoDeCaixa";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import { registrarBaixa, aprovarBaixa } from "./baixa";
import {
  buscarParcelasEmAbertoNoPeriodo,
  calcularJanelaProjetada,
  calcularPeriodosFluxoDeCaixaProjetado,
  listarFluxoDeCaixaProjetado,
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

    const resultado = calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, 500).periodos;

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
    const resultado = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500).periodos;
    expect(resultado[0]).toMatchObject({ entradasProjetadas: 0, saidasProjetadas: 0, geracaoLiquida: 0, saldoFinal: 500, alerta: false });
    expect(resultado[1]).toMatchObject({ saldoInicial: 500, saldoFinal: 500 });
  });

  test("saldoFinal negativo marca alerta true; exatamente zero não marca", () => {
    const resultadoNegativo = calcularPeriodosFluxoDeCaixaProjetado(
      periodos,
      [{ dataVencimento: new Date(Date.UTC(2026, 8, 10)), saldo: 600, tipo: "PAGAR" }],
      500,
    ).periodos;
    expect(resultadoNegativo[0].saldoFinal).toBe(-100);
    expect(resultadoNegativo[0].alerta).toBe(true);

    const resultadoZero = calcularPeriodosFluxoDeCaixaProjetado(
      periodos,
      [{ dataVencimento: new Date(Date.UTC(2026, 8, 10)), saldo: 500, tipo: "PAGAR" }],
      500,
    ).periodos;
    expect(resultadoZero[0].saldoFinal).toBe(0);
    expect(resultadoZero[0].alerta).toBe(false);
  });

  test("parcela fora do intervalo dos sub-períodos é ignorada", () => {
    const parcelas: ParcelaParaProjecao[] = [
      { dataVencimento: new Date(Date.UTC(2026, 7, 15)), saldo: 999, tipo: "RECEBER" },
    ];
    const resultado = calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, 500).periodos;
    expect(resultado[0].entradasProjetadas).toBe(0);
  });

  const venceuAte = new Date("2026-08-31T23:59:59.999Z");

  test("com atrasadas: linha de atraso soma por tipo e o primeiro mês parte do saldo final dela", () => {
    const atrasadas: ParcelaParaProjecao[] = [
      { dataVencimento: new Date(Date.UTC(2026, 6, 10)), saldo: 400, tipo: "RECEBER" },
      { dataVencimento: new Date(Date.UTC(2026, 7, 20)), saldo: 150, tipo: "PAGAR" },
    ];
    const r = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500, { atrasadas: { parcelas: atrasadas, venceuAte } });
    expect(r.emAtraso).toMatchObject({
      saldoInicial: 500,
      entradasProjetadas: 400,
      saidasProjetadas: 150,
      geracaoLiquida: 250,
      saldoFinal: 750,
      alerta: false,
    });
    expect(r.emAtraso?.venceuAte).toBe(venceuAte);
    expect(r.aVencerAntes).toBeNull();
    expect(r.periodos[0].saldoInicial).toBe(750);
  });

  test("atrasadas vazias geram linha zerada; sem anteriores, as duas linhas são null", () => {
    const vazia = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500, { atrasadas: { parcelas: [], venceuAte } });
    expect(vazia.emAtraso).toMatchObject({ entradasProjetadas: 0, saidasProjetadas: 0, saldoFinal: 500 });
    const sem = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500);
    expect(sem.emAtraso).toBeNull();
    expect(sem.aVencerAntes).toBeNull();
  });

  test("linha de atraso com saldo final negativo marca alerta", () => {
    const r = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 100, {
      atrasadas: { parcelas: [{ dataVencimento: new Date(Date.UTC(2026, 7, 1)), saldo: 300, tipo: "PAGAR" }], venceuAte },
    });
    expect(r.emAtraso).toMatchObject({ saldoFinal: -200, alerta: true });
  });

  test("encadeia atraso → a vencer antes → meses", () => {
    const r = calcularPeriodosFluxoDeCaixaProjetado(
      periodos,
      [{ dataVencimento: new Date(Date.UTC(2026, 8, 5)), saldo: 50, tipo: "RECEBER" }],
      500,
      {
        atrasadas: { parcelas: [{ dataVencimento: new Date(Date.UTC(2026, 5, 1)), saldo: 100, tipo: "PAGAR" }], venceuAte },
        aVencerAntes: [
          { dataVencimento: new Date(Date.UTC(2026, 7, 10)), saldo: 300, tipo: "RECEBER" },
          { dataVencimento: new Date(Date.UTC(2026, 7, 20)), saldo: 20, tipo: "PAGAR" },
        ],
      },
    );
    expect(r.emAtraso).toMatchObject({ saldoInicial: 500, saldoFinal: 400 });
    expect(r.aVencerAntes).toMatchObject({
      saldoInicial: 400,
      entradasProjetadas: 300,
      saidasProjetadas: 20,
      geracaoLiquida: 280,
      saldoFinal: 680,
      alerta: false,
    });
    expect(r.aVencerAntes?.venceAte.toISOString()).toBe("2026-08-31T23:59:59.999Z");
    expect(r.periodos[0]).toMatchObject({ saldoInicial: 680, entradasProjetadas: 50, saldoFinal: 730 });
  });

  test("sem atrasadas, a linha A vencer parte do saldo inicial; vazia gera linha zerada", () => {
    const r = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500, { aVencerAntes: [] });
    expect(r.emAtraso).toBeNull();
    expect(r.aVencerAntes).toMatchObject({ saldoInicial: 500, entradasProjetadas: 0, saidasProjetadas: 0, saldoFinal: 500 });
    expect(r.periodos[0].saldoInicial).toBe(500);
  });

  test("linha A vencer com saldo final negativo marca alerta", () => {
    const r = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 100, {
      aVencerAntes: [{ dataVencimento: new Date(Date.UTC(2026, 7, 1)), saldo: 300, tipo: "PAGAR" }],
    });
    expect(r.aVencerAntes).toMatchObject({ saldoFinal: -200, alerta: true });
  });
});

function criarTituloNaFixture(fixture: FixtureFinanceiro, tipo: TipoTitulo, valor: number, dataVencimento: Date) {
  return criarTitulo(fixture.sessaoAdmin, tipo, {
    contraparteId: tipo === "PAGAR" ? fixture.fornecedorId : fixture.clienteId,
    documento: `PROJ-${Date.now()}-${Math.random()}`,
    dataEmissao: new Date(),
    dataCompetencia: new Date(),
    categoriaFinanceiraId: fixture.categoriaFinanceiraId,
    centroCustoId: "",
    centroLucroId: "",
    safraId: "",
    projetoId: "",
    contaBancariaId: fixture.contaBancariaId,
    formaPagamento: "",
    parcelas: [{ numero: 1, dataVencimento, valorOriginal: valor }],
  });
}

/** Dia 10 do mês que fica `n` meses antes de hoje (UTC). */
function mesesAtras(n: number): Date {
  const hoje = new Date();
  return new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - n, 10));
}

describe("linha Em atraso (integração)", () => {
  let fixture: FixtureFinanceiro;
  const hoje = new Date();

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("FCPA", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
  });

  test("parcela em aberto vencida antes da janela entra no atraso e em nenhum mês", async () => {
    await criarTituloNaFixture(fixture, "PAGAR", 4321, mesesAtras(2));

    const { emAtraso, periodos } = await listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", hoje);
    expect(emAtraso?.saidasProjetadas).toBe(4321);
    expect(periodos.reduce((soma, p) => soma + p.saidasProjetadas, 0)).toBe(0);
    expect(periodos[0].saldoInicial).toBeCloseTo(emAtraso!.saldoFinal, 2);
  });

  test("parcela vencida antes e paga integralmente não entra", async () => {
    const titulo = await criarTituloNaFixture(fixture, "RECEBER", 777, mesesAtras(3));
    const baixa = await registrarBaixa(fixture.sessao, titulo.parcelas[0].id, {
      data: new Date(),
      valorPago: 777,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });
    await aprovarBaixa(fixture.sessao, baixa.id);

    const { emAtraso } = await listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", hoje);
    expect(emAtraso?.entradasProjetadas).toBe(0);
  });

  test("ano civil corrente: vencida em mês do ano fica na linha do mês, não no atraso", async () => {
    if (hoje.getUTCMonth() < 1) return; // em janeiro não há mês anterior no mesmo ano
    const vencimento = mesesAtras(1);
    await criarTituloNaFixture(fixture, "PAGAR", 55, vencimento);

    const { emAtraso, periodos } = await listarFluxoDeCaixaProjetado(fixture.sessao, "ANO_CIVIL", hoje);
    const mes = periodos.find((p) => p.inicio <= vencimento && vencimento <= p.fim)!;
    expect(mes.saidasProjetadas).toBe(55);
    // Antes de janeiro só pode estar o PAGAR de 4321 do primeiro teste (se ele caiu no ano anterior).
    const antesDeJaneiro = mesesAtras(2).getUTCFullYear() < hoje.getUTCFullYear() ? 4321 : 0;
    expect(emAtraso?.saidasProjetadas).toBe(antesDeJaneiro);
  });

  test("janela que não contém hoje não tem linha de atraso", async () => {
    const anoQueVem = new Date(Date.UTC(hoje.getUTCFullYear() + 1, 0, 1));
    const { emAtraso } = await listarFluxoDeCaixaProjetado(fixture.sessao, "ANO_CIVIL", anoQueVem);
    expect(emAtraso).toBeNull();
  });

  test("filtro de classificação: atraso só da classificação e sem alerta", async () => {
    const valor = 10_000_000;
    await prisma.titulo.create({
      data: {
        filialId: fixture.filialId,
        tipo: "PAGAR",
        fornecedorId: fixture.fornecedorId,
        documento: `ATRASO-GER-${Date.now()}`,
        dataEmissao: mesesAtras(2),
        dataCompetencia: mesesAtras(2),
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        classificacaoFiscal: "GERENCIAL",
        parcelas: {
          create: [
            { numero: 1, dataVencimento: mesesAtras(2), valorOriginal: valor, valorAtualizado: valor, status: "VENCIDO" },
          ],
        },
      },
    });

    const gerencial = await listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", hoje, { classificacao: "GERENCIAL" });
    expect(gerencial.emAtraso).toMatchObject({ saldoInicial: 0, alerta: false });
    expect(gerencial.emAtraso!.saidasProjetadas).toBeGreaterThanOrEqual(valor);
    expect(gerencial.periodos.every((p) => p.alerta === false)).toBe(true);

    const fiscal = await listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", hoje, { classificacao: "FISCAL" });
    expect(fiscal.emAtraso!.saidasProjetadas).toBeLessThan(valor);
  });
});

describe("buscarParcelasEmAbertoNoPeriodo / listarFluxoDeCaixaProjetado (integração)", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("FCP", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  function criarTituloDeTeste(tipo: TipoTitulo, valor: number, dataVencimento: Date) {
    return criarTituloNaFixture(fixture, tipo, valor, dataVencimento);
  }

  test("só parcelas com status em aberto entram — uma PAGO fica de fora", async () => {
    const dataVencimento = new Date("2026-11-15T00:00:00Z");
    await criarTituloDeTeste("RECEBER", 1000, dataVencimento);
    const tituloPago = await criarTituloDeTeste("RECEBER", 2000, dataVencimento);

    const baixa = await registrarBaixa(fixture.sessao, tituloPago.parcelas[0].id, {
      data: new Date(),
      valorPago: 2000,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });
    await aprovarBaixa(fixture.sessao, baixa.id);

    const { periodos } = await listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", new Date("2026-11-01T00:00:00Z"));
    const totalEntradas = periodos.reduce((soma, p) => soma + p.entradasProjetadas, 0);
    expect(totalEntradas).toBe(1000);
  });

  test("baixa aprovada parcial abate do saldo; baixa pendente não abate nada", async () => {
    const dataVencimento = new Date("2026-11-20T00:00:00Z");
    const titulo = await criarTituloDeTeste("PAGAR", 1000, dataVencimento);
    const parcelaId = titulo.parcelas[0].id;

    const baixaAprovada = await registrarBaixa(fixture.sessao, parcelaId, {
      data: new Date(),
      valorPago: 300,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });
    await aprovarBaixa(fixture.sessao, baixaAprovada.id);

    // Baixa pendente sobre o saldo restante — não deve abater nada ainda.
    await registrarBaixa(fixture.sessao, parcelaId, {
      data: new Date(),
      valorPago: 200,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });

    const parcelas = await buscarParcelasEmAbertoNoPeriodo(
      fixture.filialId,
      new Date("2026-11-01T00:00:00Z"),
      new Date("2026-11-30T23:59:59.999Z"),
    );
    const parcelaEncontrada = parcelas.find((p) => p.dataVencimento.getTime() === dataVencimento.getTime());
    expect(parcelaEncontrada?.saldo).toBe(700);
  });

  test("separa RECEBER (entradas) de PAGAR (saídas) no mesmo mês", async () => {
    const dataVencimento = new Date("2026-12-10T00:00:00Z");
    await criarTituloDeTeste("RECEBER", 500, dataVencimento);
    await criarTituloDeTeste("PAGAR", 300, dataVencimento);

    const { periodos } = await listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", new Date("2026-12-01T00:00:00Z"));
    const mesDezembro = periodos.find((p) => p.inicio.toISOString() === "2026-12-01T00:00:00.000Z");
    expect(mesDezembro?.entradasProjetadas).toBe(500);
    expect(mesDezembro?.saidasProjetadas).toBe(300);
  });

  test("escopo de filial — parcela de outra filial não vaza", async () => {
    const outraFixture = await criarFixtureFinanceiro("FCP2", "TESOURARIA");
    try {
      await criarTitulo(outraFixture.sessaoAdmin, "RECEBER", {
        contraparteId: outraFixture.clienteId,
        documento: `OUTRA-${Date.now()}`,
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: outraFixture.categoriaFinanceiraId,
        centroCustoId: "",
        centroLucroId: "",
        safraId: "",
        projetoId: "",
        contaBancariaId: outraFixture.contaBancariaId,
        formaPagamento: "",
        parcelas: [{ numero: 1, dataVencimento: new Date("2027-01-15T00:00:00Z"), valorOriginal: 999999 }],
      });

      const parcelasFilialPrincipal = await buscarParcelasEmAbertoNoPeriodo(
        fixture.filialId,
        new Date("2027-01-01T00:00:00Z"),
        new Date("2027-01-31T23:59:59.999Z"),
      );
      expect(parcelasFilialPrincipal.every((p) => p.saldo !== 999999)).toBe(true);

      // Controle positivo: a parcela existe e aparece na filial correta —
      // garante que a asserção acima não passaria mesmo com a query quebrada
      // (ex.: devolvendo sempre um array vazio).
      const parcelasOutraFilial = await buscarParcelasEmAbertoNoPeriodo(
        outraFixture.filialId,
        new Date("2027-01-01T00:00:00Z"),
        new Date("2027-01-31T23:59:59.999Z"),
      );
      expect(parcelasOutraFilial.some((p) => p.saldo === 999999)).toBe(true);
    } finally {
      await limparFixtureFinanceiro(outraFixture);
    }
  });

  test("saldoInicial do primeiro mês reflete o saldo em caixa conciliado de hoje, e encadeia para o mês seguinte", async () => {
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date(Date.now() - 24 * 60 * 60 * 1000),
        tipo: "ENTRADA",
        valor: 5000,
        descricao: "Saldo conciliado de teste — ancora do fluxo projetado",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });

    const agora = new Date();
    const [{ emAtraso, periodos }, saldoDireto] = await Promise.all([
      listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", agora),
      buscarSaldoEmCaixaAte(fixture.filialId, agora),
    ]);

    expect(saldoDireto).toBeGreaterThanOrEqual(5000);
    expect(emAtraso!.saldoInicial).toBeCloseTo(saldoDireto, 2);
    expect(periodos[0].saldoInicial).toBeCloseTo(emAtraso!.saldoFinal, 2);
    expect(periodos[1].saldoInicial).toBeCloseTo(periodos[0].saldoFinal, 2);
  });

  test("MOVEL e ANO_CIVIL com a mesma dataReferencia produzem janelas diferentes fora de janeiro", async () => {
    const dataReferencia = new Date("2026-06-01T00:00:00Z");
    const [{ periodos: periodosMovel }, { periodos: periodosAnoCivil }] = await Promise.all([
      listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", dataReferencia),
      listarFluxoDeCaixaProjetado(fixture.sessao, "ANO_CIVIL", dataReferencia),
    ]);
    expect(periodosMovel[0].inicio.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(periodosAnoCivil[0].inicio.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
