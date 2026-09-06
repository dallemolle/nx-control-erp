import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import {
  buscarSaldoEmCaixaAte,
  calcularJanela,
  calcularPeriodosFluxoDeCaixa,
  listarFluxoDeCaixaRealizado,
  type LancamentoParaFluxo,
} from "./fluxoDeCaixa";

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

describe("buscarSaldoEmCaixaAte / listarFluxoDeCaixaRealizado", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("FCX", "TESOURARIA");
  });

  afterAll(async () => {
    await prisma.lancamentoBancario.deleteMany({ where: { filialId: fixture.filialId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("só soma lançamentos conciliados até a data informada", async () => {
    await prisma.lancamentoBancario.createMany({
      data: [
        {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-09-10T00:00:00Z"),
          tipo: "ENTRADA",
          valor: 1000,
          descricao: "Conciliado antes",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: true,
        },
        {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-09-05T00:00:00Z"),
          tipo: "SAIDA",
          valor: 200,
          descricao: "Não conciliado — não deve contar",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: false,
        },
        {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-09-20T00:00:00Z"),
          tipo: "ENTRADA",
          valor: 5000,
          descricao: "Depois da data de corte — não deve contar",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: true,
        },
      ],
    });

    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });

    const saldo = await buscarSaldoEmCaixaAte(fixture.filialId, new Date("2026-09-15T00:00:00Z"));
    expect(saldo).toBe(Number(conta.saldoInicial) + 1000);
  });

  test("listarFluxoDeCaixaRealizado escopa por filial — lançamento de outra filial não vaza", async () => {
    const outraFixture = await criarFixtureFinanceiro("FCX2", "TESOURARIA");
    try {
      await prisma.lancamentoBancario.create({
        data: {
          filialId: outraFixture.filialId,
          contaBancariaId: outraFixture.contaBancariaId,
          data: new Date("2026-09-10T00:00:00Z"),
          tipo: "ENTRADA",
          valor: 999999,
          descricao: "De outra filial",
          origem: "MANUAL",
          usuarioId: outraFixture.usuarioId,
          conciliado: true,
        },
      });

      const periodos = await listarFluxoDeCaixaRealizado(fixture.sessao, "MES", new Date("2026-09-01T00:00:00Z"));
      const totalEntradas = periodos.reduce((soma, p) => soma + p.entradas, 0);
      // Só os lançamentos conciliados da fixture (teste anterior): 1000 (Sep10) + 5000 (Sep20).
      // Se o filtro de filial vazasse, o valor da outra filial (999999) apareceria aqui.
      expect(totalEntradas).toBe(6000);
    } finally {
      await prisma.lancamentoBancario.deleteMany({ where: { filialId: outraFixture.filialId } });
      await limparFixtureFinanceiro(outraFixture);
    }
  });

  test("saldoFinal do último sub-período bate com buscarSaldoEmCaixaAte calculado direto pra mesma data", async () => {
    const periodos = await listarFluxoDeCaixaRealizado(fixture.sessao, "MES", new Date("2026-09-01T00:00:00Z"));
    const ultimoPeriodo = periodos[periodos.length - 1];
    const saldoDireto = await buscarSaldoEmCaixaAte(fixture.filialId, ultimoPeriodo.fim);
    expect(ultimoPeriodo.saldoFinal).toBeCloseTo(saldoDireto, 2);
  });

  test("lançamentos de uma conta bancária inativa não entram no saldo", async () => {
    const bancoOutraConta = await prisma.banco.create({ data: { codigo: `FCXI${Date.now()}`, nome: "Banco Inativo Teste" } });
    const contaInativa = await prisma.contaBancaria.create({
      data: {
        filialId: fixture.filialId,
        bancoId: bancoOutraConta.id,
        agencia: "0002",
        conta: "inativa-1",
        saldoInicial: 0,
        ativo: false,
      },
    });

    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: contaInativa.id,
        data: new Date("2026-09-12T00:00:00Z"),
        tipo: "ENTRADA",
        valor: 777777,
        descricao: "Lançamento em conta inativa — não deve contar",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });

    const saldo = await buscarSaldoEmCaixaAte(fixture.filialId, new Date("2026-09-15T00:00:00Z"));
    expect(saldo).toBeLessThan(777777);

    const periodos = await listarFluxoDeCaixaRealizado(fixture.sessao, "MES", new Date("2026-09-01T00:00:00Z"));
    const totalEntradasComContaInativa = periodos.reduce((soma, p) => soma + p.entradas, 0);
    expect(totalEntradasComContaInativa).toBeLessThan(777777);
  });
});
