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
