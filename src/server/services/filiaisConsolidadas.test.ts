import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { filiaisDesativadasComPendencia, idsDasFiliaisAtivas } from "./filiaisConsolidadas";
import { buscarIndicadoresExecutivos } from "./dashboardExecutivo";
import { buscarAnoBaseConsolidado } from "./fluxoDeCaixaEstrategico";

/**
 * Cenário: filial principal (ativa) + filial "Desativada com pendência"
 * (inativa, com 1 parcela em aberto e saldo em caixa) + filial "Desativada
 * zerada" (inativa, sem nada). Os consolidados só somam a ativa.
 */
describe("filiais desativadas nos consolidados (integração)", () => {
  let fixture: FixtureFinanceiro;
  let desativadaComPendenciaId: string;
  let desativadaZeradaId: string;
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("FCONS", "GESTOR");

    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: ontem,
        tipo: "ENTRADA",
        valor: 1000,
        descricao: "Entrada na filial ativa",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });

    const comPendencia = await prisma.filial.create({
      data: { empresaId: fixture.empresaId, nome: "Desativada com pendência", cnpjCpf: "55.555.FCONS/0002-11", ativo: false },
    });
    desativadaComPendenciaId = comPendencia.id;
    const conta = await prisma.contaBancaria.create({
      data: { filialId: comPendencia.id, bancoId: fixture.bancoId, agencia: "0005", conta: "fcons-2", saldoInicial: 700 },
    });
    await prisma.lancamentoBancario.create({
      data: {
        filialId: comPendencia.id,
        contaBancariaId: conta.id,
        data: ontem,
        tipo: "ENTRADA",
        valor: 300,
        descricao: "Entrada na filial desativada",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });
    await prisma.titulo.create({
      data: {
        filialId: comPendencia.id,
        tipo: "PAGAR",
        fornecedorId: fixture.fornecedorId,
        documento: "FCONS-PAG-1",
        dataEmissao: ontem,
        dataCompetencia: ontem,
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        parcelas: {
          create: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 250, valorAtualizado: 250 }],
        },
      },
    });

    const zerada = await prisma.filial.create({
      data: { empresaId: fixture.empresaId, nome: "Desativada zerada", cnpjCpf: "55.555.FCONS/0003-22", ativo: false },
    });
    desativadaZeradaId = zerada.id;
  });

  afterAll(async () => {
    for (const filialId of [desativadaComPendenciaId, desativadaZeradaId]) {
      await prisma.parcela.deleteMany({ where: { titulo: { filialId } } });
      await prisma.titulo.deleteMany({ where: { filialId } });
      await prisma.lancamentoBancario.deleteMany({ where: { filialId } });
      await prisma.contaBancaria.deleteMany({ where: { filialId } });
      await prisma.filial.delete({ where: { id: filialId } });
    }
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("idsDasFiliaisAtivas traz só a filial ativa", async () => {
    expect(await idsDasFiliaisAtivas(fixture.empresaId)).toEqual([fixture.filialId]);
  });

  test("dashboard: caixa disponível e contas a pagar ignoram a filial desativada", async () => {
    const indicadores = await buscarIndicadoresExecutivos(fixture.sessao);
    expect(indicadores.caixaDisponivel).toBe(1000); // sem os 700 + 300 da desativada
    expect(indicadores.contasAPagarEmAberto).toBe(0); // sem os 250 da desativada
  });

  test("estratégico: ano-base ignora movimento e saldo da filial desativada", async () => {
    const anoBase = await buscarAnoBaseConsolidado(fixture.empresaId);
    expect(anoBase.receitaBase).toBe(1000);
    expect(anoBase.saldoCaixaBase).toBe(1000);
  });

  test("filiaisDesativadasComPendencia lista só a desativada com parcela ou saldo, com os valores", async () => {
    expect(await filiaisDesativadasComPendencia(fixture.empresaId)).toEqual([
      {
        id: desativadaComPendenciaId,
        nome: "Desativada com pendência",
        parcelasEmAberto: 1,
        valorEmAberto: 250,
        saldoEmCaixa: 1000,
      },
    ]);
  });
});
