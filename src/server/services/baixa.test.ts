import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import type { TipoTitulo } from "@prisma/client";
import { registrarBaixa, aprovarBaixa, rejeitarBaixa, listarBaixasPendentes } from "./baixa";

describe("baixa (fluxo de aprovação)", () => {
  let fixture: FixtureFinanceiro; // perfil FINANCEIRO: pode registrar baixa, não aprovar
  let fixtureTesouraria: FixtureFinanceiro; // perfil TESOURARIA: pode aprovar

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("BXF");
    fixtureTesouraria = await criarFixtureFinanceiro("BXT", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await limparFixtureFinanceiro(fixtureTesouraria);
    await prisma.$disconnect();
  });

  async function criarParcelaDeTeste(fx: FixtureFinanceiro, valor: number, tipo: TipoTitulo = "PAGAR") {
    // Usa sessaoAdmin (não fx.sessao) porque fixtureTesouraria não tem titulo:escrever —
    // este helper só monta dados de setup, não é o que está sendo testado.
    const titulo = await criarTitulo(fx.sessaoAdmin, tipo, {
      contraparteId: tipo === "PAGAR" ? fx.fornecedorId : fx.clienteId,
      documento: `NF-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fx.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fx.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: valor }],
    });
    return titulo.parcelas[0];
  }

  test("baixa pendente não altera o status da parcela", async () => {
    const parcela = await criarParcelaDeTeste(fixture, 100);
    await registrarBaixa(fixture.sessao, parcela.id, {
      data: new Date(),
      valorPago: 100,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });

    const parcelaAposBaixa = await prisma.parcela.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(parcelaAposBaixa.status).not.toBe("PAGO");
  });

  test("aprovar a baixa recalcula o status da parcela para PAGO", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 200);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 200,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    await aprovarBaixa(fixtureTesouraria.sessao, baixa.id);

    const parcelaAprovada = await prisma.parcela.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(parcelaAprovada.status).toBe("PAGO");
  });

  test("aprovar a baixa de um título PAGAR cria um lançamento bancário de saída", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 250);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 250,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    await aprovarBaixa(fixtureTesouraria.sessao, baixa.id);

    const lancamento = await prisma.lancamentoBancario.findFirst({ where: { baixaId: baixa.id } });
    expect(lancamento).not.toBeNull();
    expect(lancamento?.tipo).toBe("SAIDA");
    expect(lancamento?.origem).toBe("BAIXA");
    expect(Number(lancamento?.valor)).toBe(250);
    expect(lancamento?.contaBancariaId).toBe(fixtureTesouraria.contaBancariaId);
  });

  test("aprovar a baixa de um título RECEBER cria um lançamento bancário de entrada", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 270, "RECEBER");
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 270,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    await aprovarBaixa(fixtureTesouraria.sessao, baixa.id);

    const lancamento = await prisma.lancamentoBancario.findFirst({ where: { baixaId: baixa.id } });
    expect(lancamento?.tipo).toBe("ENTRADA");
    expect(lancamento?.origem).toBe("BAIXA");
  });

  test("rejeitar a baixa não cria lançamento bancário nenhum", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 260);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 260,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    await rejeitarBaixa(fixtureTesouraria.sessao, baixa.id, "Valor incorreto");

    const lancamento = await prisma.lancamentoBancario.findFirst({ where: { baixaId: baixa.id } });
    expect(lancamento).toBeNull();
  });

  test("rejeitar a baixa não altera o status nem o saldo, e grava o motivo", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 300);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 300,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    const rejeitada = await rejeitarBaixa(fixtureTesouraria.sessao, baixa.id, "Comprovante ilegível");
    expect(rejeitada.motivoRejeicao).toBe("Comprovante ilegível");

    const parcelaAposRejeicao = await prisma.parcela.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(parcelaAposRejeicao.status).not.toBe("PAGO");
  });

  test("perfil sem titulo:aprovar não consegue aprovar", async () => {
    const parcela = await criarParcelaDeTeste(fixture, 50);
    const baixa = await registrarBaixa(fixture.sessao, parcela.id, {
      data: new Date(),
      valorPago: 50,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });

    await expect(aprovarBaixa(fixture.sessao, baixa.id)).rejects.toThrow(PermissionError);
  });

  test("listarBaixasPendentes só retorna baixas PENDENTE da filial", async () => {
    const pendentes = await listarBaixasPendentes(fixtureTesouraria.filialId);
    expect(pendentes.every((baixa) => baixa.statusAprovacao === "PENDENTE")).toBe(true);
  });

  test("não é possível aprovar uma baixa já rejeitada", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 400);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 400,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    await rejeitarBaixa(fixtureTesouraria.sessao, baixa.id, "Valor divergente");

    await expect(aprovarBaixa(fixtureTesouraria.sessao, baixa.id)).rejects.toThrow(/já foi avaliada/);

    const parcelaFinal = await prisma.parcela.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(parcelaFinal.status).not.toBe("PAGO");
  });

  test("não é possível rejeitar uma baixa já aprovada", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 500);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 500,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    await aprovarBaixa(fixtureTesouraria.sessao, baixa.id);

    await expect(
      rejeitarBaixa(fixtureTesouraria.sessao, baixa.id, "Arrependimento"),
    ).rejects.toThrow(/já foi avaliada/);
  });

  test("rejeita baixa contra conta bancária de outra filial", async () => {
    const parcela = await criarParcelaDeTeste(fixture, 600);

    await expect(
      registrarBaixa(fixture.sessao, parcela.id, {
        data: new Date(),
        valorPago: 600,
        valorJuros: 0,
        valorMulta: 0,
        valorDesconto: 0,
        // Conta bancária da OUTRA fixture (outra empresa/filial).
        contaBancariaId: fixtureTesouraria.contaBancariaId,
      }),
    ).rejects.toThrow(/não pertence à filial ativa/);
  });
});
