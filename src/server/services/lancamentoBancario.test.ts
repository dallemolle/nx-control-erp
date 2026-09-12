import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import {
  criarLancamentoManual,
  criarTransferencia,
  calcularSaldoContabil,
  informarSaldoBancario,
  buscarUltimoSaldoInformado,
} from "./lancamentoBancario";

describe("lancamentoBancario", () => {
  let fixture: FixtureFinanceiro; // perfil FINANCEIRO: só lancamento:ler
  let fixtureTesouraria: FixtureFinanceiro; // perfil TESOURARIA: lancamento:ler + lancamento:escrever
  let contaDestinoId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("LBF");
    fixtureTesouraria = await criarFixtureFinanceiro("LBT", "TESOURARIA");

    const contaDestino = await prisma.contaBancaria.create({
      data: {
        filialId: fixtureTesouraria.filialId,
        bancoId: fixtureTesouraria.bancoId,
        agencia: "0002",
        conta: "destino-1",
        saldoInicial: 0,
      },
    });
    contaDestinoId = contaDestino.id;
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await limparFixtureFinanceiro(fixtureTesouraria);
    await prisma.$disconnect();
  });

  test("lançamento manual de entrada aumenta o saldo contábil", async () => {
    const saldoAntes = await calcularSaldoContabil(fixtureTesouraria.contaBancariaId);

    await criarLancamentoManual(fixtureTesouraria.sessao, {
      contaBancariaId: fixtureTesouraria.contaBancariaId,
      data: new Date(),
      tipo: "ENTRADA",
      valor: 150,
      descricao: "Rendimento de aplicação",
      categoriaFinanceiraId: "__nenhum__",
    });

    const saldoDepois = await calcularSaldoContabil(fixtureTesouraria.contaBancariaId);
    expect(saldoDepois).toBe(saldoAntes + 150);
  });

  test("lançamento manual de saída diminui o saldo contábil", async () => {
    const saldoAntes = await calcularSaldoContabil(fixtureTesouraria.contaBancariaId);

    await criarLancamentoManual(fixtureTesouraria.sessao, {
      contaBancariaId: fixtureTesouraria.contaBancariaId,
      data: new Date(),
      tipo: "SAIDA",
      valor: 40,
      descricao: "Tarifa bancária",
      categoriaFinanceiraId: "__nenhum__",
    });

    const saldoDepois = await calcularSaldoContabil(fixtureTesouraria.contaBancariaId);
    expect(saldoDepois).toBe(saldoAntes - 40);
  });

  test("transferência entre contas move o valor de uma conta para a outra", async () => {
    const saldoOrigemAntes = await calcularSaldoContabil(fixtureTesouraria.contaBancariaId);
    const saldoDestinoAntes = await calcularSaldoContabil(contaDestinoId);

    const { saida, entrada } = await criarTransferencia(fixtureTesouraria.sessao, {
      contaOrigemId: fixtureTesouraria.contaBancariaId,
      contaDestinoId,
      data: new Date(),
      valor: 500,
      descricao: "Aplicação de excedente de caixa",
    });

    expect(saida.transferenciaId).toBe(entrada.transferenciaId);

    const saldoOrigemDepois = await calcularSaldoContabil(fixtureTesouraria.contaBancariaId);
    const saldoDestinoDepois = await calcularSaldoContabil(contaDestinoId);
    expect(saldoOrigemDepois).toBe(saldoOrigemAntes - 500);
    expect(saldoDestinoDepois).toBe(saldoDestinoAntes + 500);
  });

  test("conta bancária de outra filial é rejeitada", async () => {
    await expect(
      criarLancamentoManual(fixtureTesouraria.sessao, {
        contaBancariaId: fixture.contaBancariaId,
        data: new Date(),
        tipo: "ENTRADA",
        valor: 10,
        descricao: "Teste cross-tenant",
        categoriaFinanceiraId: "__nenhum__",
      }),
    ).rejects.toThrow(/não pertence à filial ativa/);
  });

  test("perfil sem lancamento:escrever não consegue criar lançamento manual", async () => {
    await expect(
      criarLancamentoManual(fixture.sessao, {
        contaBancariaId: fixture.contaBancariaId,
        data: new Date(),
        tipo: "ENTRADA",
        valor: 10,
        descricao: "Teste permissão",
        categoriaFinanceiraId: "__nenhum__",
      }),
    ).rejects.toThrow(PermissionError);
  });

  test("informar saldo bancário retorna o mais recente por data", async () => {
    await informarSaldoBancario(fixtureTesouraria.sessao, {
      contaBancariaId: fixtureTesouraria.contaBancariaId,
      data: new Date("2026-08-01"),
      saldo: 1000,
    });
    await informarSaldoBancario(fixtureTesouraria.sessao, {
      contaBancariaId: fixtureTesouraria.contaBancariaId,
      data: new Date("2026-09-01"),
      saldo: 1200,
    });

    const ultimo = await buscarUltimoSaldoInformado(fixtureTesouraria.contaBancariaId);
    expect(Number(ultimo?.saldo)).toBe(1200);
  });
});

describe("dimensões analíticas em criarLancamentoManual", () => {
  let fixture: FixtureFinanceiro;
  let centroCustoId: string;
  let centroLucroId: string;
  let safraId: string;
  let projetoId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("LBD", "TESOURARIA");

    const centroCusto = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Administrativo", codigo: "ADM" },
    });
    centroCustoId = centroCusto.id;

    const centroLucro = await prisma.centroLucro.create({
      data: { filialId: fixture.filialId, nome: "Unidade 1", codigo: "U1" },
    });
    centroLucroId = centroLucro.id;

    const safra = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra 2026",
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2026-12-31"),
      },
    });
    safraId = safra.id;

    const projeto = await prisma.projeto.create({
      data: { filialId: fixture.filialId, nome: "Expansão", codigo: "EXP" },
    });
    projetoId = projeto.id;
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("grava as 4 dimensões quando informadas", async () => {
    const lancamento = await criarLancamentoManual(fixture.sessao, {
      contaBancariaId: fixture.contaBancariaId,
      data: new Date(),
      tipo: "SAIDA",
      valor: 80,
      descricao: "Compra de insumo",
      categoriaFinanceiraId: "__nenhum__",
      centroCustoId,
      centroLucroId,
      safraId,
      projetoId,
    });

    expect(lancamento.centroCustoId).toBe(centroCustoId);
    expect(lancamento.centroLucroId).toBe(centroLucroId);
    expect(lancamento.safraId).toBe(safraId);
    expect(lancamento.projetoId).toBe(projetoId);
  });

  test("aceita omitir as 4 dimensões (todas opcionais)", async () => {
    const lancamento = await criarLancamentoManual(fixture.sessao, {
      contaBancariaId: fixture.contaBancariaId,
      data: new Date(),
      tipo: "SAIDA",
      valor: 20,
      descricao: "Sem dimensão",
      categoriaFinanceiraId: "__nenhum__",
    });

    expect(lancamento.centroCustoId).toBeNull();
    expect(lancamento.centroLucroId).toBeNull();
    expect(lancamento.safraId).toBeNull();
    expect(lancamento.projetoId).toBeNull();
  });

  test("recusa centro de custo que não pertence à filial ativa", async () => {
    const outraFixture = await criarFixtureFinanceiro("LBD2", "TESOURARIA");
    try {
      const centroCustoDeOutraFilial = await prisma.centroCusto.create({
        data: { filialId: outraFixture.filialId, nome: "De outra filial", codigo: "OUT" },
      });

      await expect(
        criarLancamentoManual(fixture.sessao, {
          contaBancariaId: fixture.contaBancariaId,
          data: new Date(),
          tipo: "SAIDA",
          valor: 10,
          descricao: "Cross-tenant",
          categoriaFinanceiraId: "__nenhum__",
          centroCustoId: centroCustoDeOutraFilial.id,
        }),
      ).rejects.toThrow(/não pertence à filial ativa/);
    } finally {
      await limparFixtureFinanceiro(outraFixture);
    }
  });
});
