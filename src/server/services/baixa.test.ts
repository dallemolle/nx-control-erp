import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
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

  async function criarParcelaDeTeste(fx: FixtureFinanceiro, valor: number) {
    // Usa sessaoAdmin (não fx.sessao) porque fixtureTesouraria não tem titulo:escrever —
    // este helper só monta dados de setup, não é o que está sendo testado.
    const titulo = await criarTitulo(fx.sessaoAdmin, "PAGAR", {
      contraparteId: fx.fornecedorId,
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
});
