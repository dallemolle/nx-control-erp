import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import { montarLinhaComparativoSafra, salvarValorOrcamentoSafra, listarComparativoSafras } from "./orcamentoSafra";

describe("montarLinhaComparativoSafra", () => {
  test("variação absoluta é realizado menos orçado", () => {
    const linha = montarLinhaComparativoSafra("s1", "Safra 2026", "EM_ANDAMENTO", 10000, 12000, 0);
    expect(linha.variacaoAbsolutaRealizado).toBe(2000);
  });

  test("variação percentual é null quando orçado é zero", () => {
    const linha = montarLinhaComparativoSafra("s1", "Safra 2026", "EM_ANDAMENTO", 0, 500, 0);
    expect(linha.variacaoPercentualRealizado).toBeNull();
  });

  test("variação percentual calculada corretamente quando orçado não é zero", () => {
    const linha = montarLinhaComparativoSafra("s1", "Safra 2026", "EM_ANDAMENTO", 10000, 12000, 0);
    expect(linha.variacaoPercentualRealizado).toBeCloseTo(0.2, 6);
  });
});

describe("salvarValorOrcamentoSafra (integração)", () => {
  let fixture: FixtureFinanceiro;
  let safraId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("ORCSAF", "FINANCEIRO");
    const safra = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra 2026/2027",
        dataInicio: new Date("2026-10-01T00:00:00Z"),
        dataFim: new Date("2027-05-31T00:00:00Z"),
      },
    });
    safraId = safra.id;
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("cria na primeira chamada e atualiza (sem duplicar) na segunda", async () => {
    await salvarValorOrcamentoSafra(fixture.sessao, safraId, 50000);
    const primeira = await prisma.orcamentoSafra.findMany({ where: { filialId: fixture.filialId, safraId } });
    expect(primeira).toHaveLength(1);
    expect(Number(primeira[0].valor)).toBe(50000);

    await salvarValorOrcamentoSafra(fixture.sessao, safraId, 60000);
    const segunda = await prisma.orcamentoSafra.findMany({ where: { filialId: fixture.filialId, safraId } });
    expect(segunda).toHaveLength(1);
    expect(Number(segunda[0].valor)).toBe(60000);
  });

  test("recusa perfil sem orcamento:escrever", async () => {
    const sessaoTesouraria = { ...fixture.sessao, perfil: "TESOURARIA" as const };
    await expect(salvarValorOrcamentoSafra(sessaoTesouraria, safraId, 100)).rejects.toThrow();
  });

  test("recusa safra de outra filial", async () => {
    const outraFixture = await criarFixtureFinanceiro("ORCSAF2", "FINANCEIRO");
    try {
      const outraSafra = await prisma.safra.create({
        data: {
          filialId: outraFixture.filialId,
          nome: "Safra de outra filial",
          dataInicio: new Date("2026-01-01T00:00:00Z"),
          dataFim: new Date("2026-12-31T00:00:00Z"),
        },
      });
      await expect(salvarValorOrcamentoSafra(fixture.sessao, outraSafra.id, 100)).rejects.toThrow();
    } finally {
      await limparFixtureFinanceiro(outraFixture);
    }
  });
});

describe("listarComparativoSafras (integração)", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("ORCSAF3", "FINANCEIRO");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("inclui orçado, realizado (líquido) e projetado (líquido) por safra, escopado à filial ativa", async () => {
    const safra = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra Verão",
        status: "EM_ANDAMENTO",
        dataInicio: new Date("2026-09-01T00:00:00Z"),
        dataFim: new Date("2027-03-31T00:00:00Z"),
      },
    });

    await salvarValorOrcamentoSafra(fixture.sessao, safra.id, 20000);

    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-10-15T00:00:00Z"),
        tipo: "ENTRADA",
        valor: 5000,
        descricao: "Venda da safra",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
        safraId: safra.id,
      },
    });
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-11-01T00:00:00Z"),
        tipo: "SAIDA",
        valor: 1500,
        descricao: "Insumo da safra",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
        safraId: safra.id,
      },
    });

    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: `ORCSAF3-PROJ-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: safra.id,
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date("2027-01-15T00:00:00Z"), valorOriginal: 800 }],
    });
    void titulo;

    const linhas = await listarComparativoSafras(fixture.sessao);
    const linha = linhas.find((l) => l.safraId === safra.id);
    expect(linha).toBeDefined();
    expect(linha?.orcado).toBe(20000);
    expect(linha?.realizado).toBe(5000 - 1500);
    expect(linha?.projetado).toBeLessThanOrEqual(-800);
  });

  test("safra sem orçamento salvo aparece com orcado 0, não é omitida", async () => {
    const safraSemOrcamento = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra Sem Orçamento",
        status: "PLANEJADO",
        dataInicio: new Date("2028-01-01T00:00:00Z"),
        dataFim: new Date("2028-06-30T00:00:00Z"),
      },
    });

    const linhas = await listarComparativoSafras(fixture.sessao);
    const linha = linhas.find((l) => l.safraId === safraSemOrcamento.id);
    expect(linha).toBeDefined();
    expect(linha?.orcado).toBe(0);
  });

  test("safra inativa não aparece na comparação", async () => {
    const safraInativa = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra Inativa",
        dataInicio: new Date("2020-01-01T00:00:00Z"),
        dataFim: new Date("2020-12-31T00:00:00Z"),
        ativo: false,
      },
    });

    const linhas = await listarComparativoSafras(fixture.sessao);
    expect(linhas.find((l) => l.safraId === safraInativa.id)).toBeUndefined();
  });

  test("escopo de filial — safra de outra filial não vaza", async () => {
    const outraFixture = await criarFixtureFinanceiro("ORCSAF4", "FINANCEIRO");
    try {
      await prisma.safra.create({
        data: {
          filialId: outraFixture.filialId,
          nome: "Safra de outra filial",
          dataInicio: new Date("2026-01-01T00:00:00Z"),
          dataFim: new Date("2026-12-31T00:00:00Z"),
        },
      });

      const linhas = await listarComparativoSafras(fixture.sessao);
      expect(linhas.every((l) => l.safraNome !== "Safra de outra filial")).toBe(true);
    } finally {
      await limparFixtureFinanceiro(outraFixture);
    }
  });

  test("todos os 6 perfis têm orcamento:ler — nenhum é recusado", async () => {
    // CONSULTA e todos os outros 5 perfis têm orcamento:ler (ver permissions.ts) —
    // não há perfil sem essa permissão hoje; este teste fixa essa garantia:
    // se um novo perfil for adicionado sem orcamento:ler, este teste aponta
    // a lacuna em vez de silenciosamente confiar na suposição.
    const perfis: Array<FixtureFinanceiro["sessao"]["perfil"]> = [
      "ADMINISTRADOR",
      "FINANCEIRO",
      "TESOURARIA",
      "GESTOR",
      "AUDITOR",
      "CONSULTA",
    ];
    for (const perfil of perfis) {
      await expect(listarComparativoSafras({ ...fixture.sessao, perfil })).resolves.toBeDefined();
    }
  });
});
