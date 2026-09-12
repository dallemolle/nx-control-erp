import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import { buscarIndicadoresExecutivos } from "./dashboardExecutivo";

describe("buscarIndicadoresExecutivos (integração)", () => {
  let fixture: FixtureFinanceiro;
  let sessaoGestor: FixtureFinanceiro["sessao"];
  let hoje: Date;
  let em3Dias: Date;
  let em15Dias: Date;
  let em45Dias: Date;
  let outraFilialId: string | undefined;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("DASH", "GESTOR");
    sessaoGestor = fixture.sessao;
    hoje = new Date();
    em3Dias = new Date(hoje.getTime() + 3 * 24 * 60 * 60 * 1000);
    em15Dias = new Date(hoje.getTime() + 15 * 24 * 60 * 60 * 1000);
    em45Dias = new Date(hoje.getTime() + 45 * 24 * 60 * 60 * 1000);
  });

  afterAll(async () => {
    // A filial extra criada no teste de `caixaDisponivel` reaproveita `fixture.bancoId`;
    // apagar a filial primeiro faz cascatear (Filial -> ContaBancaria/LancamentoBancario,
    // ambos onDelete: Cascade) antes que `limparFixtureFinanceiro` tente apagar o Banco.
    if (outraFilialId) {
      await prisma.filial.delete({ where: { id: outraFilialId } });
    }
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("recusa perfil sem dashboardExecutivo:ler", async () => {
    const sessaoFinanceiro = { ...fixture.sessao, perfil: "FINANCEIRO" as const };
    await expect(buscarIndicadoresExecutivos(sessaoFinanceiro)).rejects.toThrow(PermissionError);
  });

  test("caixaDisponivel soma o saldo conciliado de todas as filiais da empresa", async () => {
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date(hoje.getTime() - 24 * 60 * 60 * 1000),
        tipo: "ENTRADA",
        valor: 1000,
        descricao: "Entrada conciliada",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });

    const outraFilial = await prisma.filial.create({
      data: { empresaId: fixture.empresaId, nome: "Filial DASH 2", cnpj: "44.444.DASH/0002-55" },
    });
    outraFilialId = outraFilial.id;
    const outraConta = await prisma.contaBancaria.create({
      data: { filialId: outraFilial.id, bancoId: fixture.bancoId, agencia: "0003", conta: "dash-2", saldoInicial: 500 },
    });
    await prisma.lancamentoBancario.create({
      data: {
        filialId: outraFilial.id,
        contaBancariaId: outraConta.id,
        data: new Date(hoje.getTime() - 24 * 60 * 60 * 1000),
        tipo: "SAIDA",
        valor: 200,
        descricao: "Saída conciliada em outra filial",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });

    const indicadores = await buscarIndicadoresExecutivos(sessaoGestor);
    // 1000 (filial 1) + (500 saldoInicial - 200 saída) (filial 2) = 1300
    expect(indicadores.caixaDisponivel).toBe(1300);
  });

  test("contasAPagarEmAberto, obrigacoes7Dias e obrigacoes30Dias separam por janela de vencimento", async () => {
    await criarTitulo(fixture.sessaoAdmin, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: `DASH-PAG-7D-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: em3Dias, valorOriginal: 100 }],
    });
    await criarTitulo(fixture.sessaoAdmin, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: `DASH-PAG-30D-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: em15Dias, valorOriginal: 200 }],
    });
    await criarTitulo(fixture.sessaoAdmin, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: `DASH-PAG-45D-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: em45Dias, valorOriginal: 400 }],
    });

    const indicadores = await buscarIndicadoresExecutivos(sessaoGestor);
    expect(indicadores.contasAPagarEmAberto).toBeGreaterThanOrEqual(700);
    expect(indicadores.obrigacoes7Dias).toBeGreaterThanOrEqual(100);
    expect(indicadores.obrigacoes7Dias).toBeLessThan(300);
    expect(indicadores.obrigacoes30Dias).toBeGreaterThanOrEqual(300);
    expect(indicadores.obrigacoes30Dias).toBeLessThan(700);
  });

  test("inadimplencia só soma parcelas RECEBER com status VENCIDO", async () => {
    const ontem = new Date(hoje.getTime() - 24 * 60 * 60 * 1000);
    const titulo = await criarTitulo(fixture.sessaoAdmin, "RECEBER", {
      contraparteId: fixture.clienteId,
      documento: `DASH-VENC-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: ontem, valorOriginal: 300 }],
    });
    await prisma.parcela.update({ where: { id: titulo.parcelas[0].id }, data: { status: "VENCIDO" } });

    const indicadores = await buscarIndicadoresExecutivos(sessaoGestor);
    expect(indicadores.inadimplencia).toBeGreaterThanOrEqual(300);
  });

  test("recebimentosEsperados30Dias só considera parcelas RECEBER dentro da janela", async () => {
    await criarTitulo(fixture.sessaoAdmin, "RECEBER", {
      contraparteId: fixture.clienteId,
      documento: `DASH-REC-30D-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: em15Dias, valorOriginal: 500 }],
    });

    const indicadores = await buscarIndicadoresExecutivos(sessaoGestor);
    expect(indicadores.recebimentosEsperados30Dias).toBeGreaterThanOrEqual(500);
    expect(indicadores.contasAReceberEmAberto).toBeGreaterThanOrEqual(500);
  });

  test("geracaoDeCaixaMesAtual soma entradas menos saídas conciliadas do mês corrente", async () => {
    const dentroDoMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1, 12));
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: dentroDoMes,
        tipo: "ENTRADA",
        valor: 900,
        descricao: "Entrada do mês",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: dentroDoMes,
        tipo: "SAIDA",
        valor: 300,
        descricao: "Saída do mês",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });

    const indicadores = await buscarIndicadoresExecutivos(sessaoGestor);
    expect(indicadores.geracaoDeCaixaMesAtual).toBeGreaterThanOrEqual(600);
  });

  test("saldoProjetado30Dias é caixaDisponivel + recebimentosEsperados30Dias - obrigacoes30Dias", async () => {
    const indicadores = await buscarIndicadoresExecutivos(sessaoGestor);
    expect(indicadores.saldoProjetado30Dias).toBeCloseTo(
      indicadores.caixaDisponivel + indicadores.recebimentosEsperados30Dias - indicadores.obrigacoes30Dias,
      6,
    );
  });

  test("escopo de empresa — indicadores de outra empresa não vazam", async () => {
    const outraFixture = await criarFixtureFinanceiro("DASH2", "GESTOR");
    try {
      await criarTitulo(outraFixture.sessaoAdmin, "PAGAR", {
        contraparteId: outraFixture.fornecedorId,
        documento: `DASH2-PAG-${Date.now()}`,
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: outraFixture.categoriaFinanceiraId,
        centroCustoId: "",
        centroLucroId: "",
        safraId: "",
        projetoId: "",
        contaBancariaId: outraFixture.contaBancariaId,
        formaPagamento: "",
        parcelas: [{ numero: 1, dataVencimento: em3Dias, valorOriginal: 999999 }],
      });

      const indicadores = await buscarIndicadoresExecutivos(sessaoGestor);
      expect(indicadores.contasAPagarEmAberto).toBeLessThan(999999);
    } finally {
      await limparFixtureFinanceiro(outraFixture);
    }
  });
});
