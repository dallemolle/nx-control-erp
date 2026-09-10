import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import { registrarBaixa, aprovarBaixa } from "./baixa";
import {
  montarLinhaComparativo,
  salvarValorOrcamento,
  buscarRealizadoPorCategoria,
  buscarProjetadoPorCategoria,
  listarComparativoOrcamento,
} from "./orcamento";

describe("montarLinhaComparativo", () => {
  test("variação absoluta é realizado menos orçado, positiva quando realizado excede", () => {
    const linha = montarLinhaComparativo("cat-1", "Aluguel", "DESPESA", 2026, 3, 1000, 1200, 0);
    expect(linha.variacaoAbsolutaRealizado).toBe(200);
  });

  test("variação absoluta é negativa quando realizado fica abaixo do orçado", () => {
    const linha = montarLinhaComparativo("cat-1", "Aluguel", "DESPESA", 2026, 3, 1000, 700, 0);
    expect(linha.variacaoAbsolutaRealizado).toBe(-300);
  });

  test("variação percentual é null quando orçado é zero", () => {
    const linha = montarLinhaComparativo("cat-1", "Aluguel", "DESPESA", 2026, 3, 0, 500, 0);
    expect(linha.variacaoPercentualRealizado).toBeNull();
  });

  test("variação percentual calculada corretamente quando orçado não é zero", () => {
    const linha = montarLinhaComparativo("cat-1", "Aluguel", "DESPESA", 2026, 3, 1000, 1200, 0);
    expect(linha.variacaoPercentualRealizado).toBeCloseTo(0.2, 6);
  });

  test("alerta true para DESPESA quando realizado + projetado excede o orçado", () => {
    const linha = montarLinhaComparativo("cat-1", "Aluguel", "DESPESA", 2026, 3, 1000, 600, 500);
    expect(linha.alerta).toBe(true);
  });

  test("alerta false para DESPESA quando realizado + projetado é exatamente igual ao orçado", () => {
    const linha = montarLinhaComparativo("cat-1", "Aluguel", "DESPESA", 2026, 3, 1000, 600, 400);
    expect(linha.alerta).toBe(false);
  });

  test("alerta sempre false para RECEITA, mesmo excedendo o orçado", () => {
    const linha = montarLinhaComparativo("cat-2", "Vendas", "RECEITA", 2026, 3, 1000, 1500, 500);
    expect(linha.alerta).toBe(false);
  });
});

describe("salvarValorOrcamento / buscarRealizadoPorCategoria / buscarProjetadoPorCategoria / listarComparativoOrcamento (integração)", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("ORC", "FINANCEIRO");
  });

  afterAll(async () => {
    await prisma.orcamento.deleteMany({ where: { filialId: fixture.filialId } });
    await prisma.auditLog.deleteMany({ where: { entidade: "Orcamento", filialId: fixture.filialId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("salvarValorOrcamento cria na primeira chamada e atualiza (sem duplicar) na segunda", async () => {
    await salvarValorOrcamento(fixture.sessao, fixture.categoriaFinanceiraId, 2026, 6, 1000);
    const primeira = await prisma.orcamento.findMany({
      where: { filialId: fixture.filialId, categoriaFinanceiraId: fixture.categoriaFinanceiraId, ano: 2026, mes: 6 },
    });
    expect(primeira).toHaveLength(1);
    expect(Number(primeira[0].valor)).toBe(1000);

    await salvarValorOrcamento(fixture.sessao, fixture.categoriaFinanceiraId, 2026, 6, 1500);
    const segunda = await prisma.orcamento.findMany({
      where: { filialId: fixture.filialId, categoriaFinanceiraId: fixture.categoriaFinanceiraId, ano: 2026, mes: 6 },
    });
    expect(segunda).toHaveLength(1);
    expect(Number(segunda[0].valor)).toBe(1500);
  });

  test("salvarValorOrcamento recusa perfil sem orcamento:escrever", async () => {
    const sessaoTesouraria = { ...fixture.sessao, perfil: "TESOURARIA" as const };
    await expect(
      salvarValorOrcamento(sessaoTesouraria, fixture.categoriaFinanceiraId, 2026, 7, 100),
    ).rejects.toThrow();
  });

  test("salvarValorOrcamento recusa categoria de outra filial", async () => {
    const outraFixture = await criarFixtureFinanceiro("ORC2", "FINANCEIRO");
    try {
      await expect(
        salvarValorOrcamento(fixture.sessao, outraFixture.categoriaFinanceiraId, 2026, 8, 100),
      ).rejects.toThrow();
    } finally {
      await limparFixtureFinanceiro(outraFixture);
    }
  });

  test("buscarRealizadoPorCategoria soma lançamento com categoria direta", async () => {
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-04-10T00:00:00Z"),
        tipo: "SAIDA",
        valor: 250,
        descricao: "Despesa direta categorizada",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      },
    });

    const totais = await buscarRealizadoPorCategoria(fixture.filialId, 2026, 4);
    expect(totais.get(fixture.categoriaFinanceiraId)).toBe(250);
  });

  test("buscarRealizadoPorCategoria usa o fallback via baixa quando o lançamento não tem categoria direta (dado histórico)", async () => {
    const parcela = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: `ORC-FALLBACK-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date("2026-05-01T00:00:00Z"), valorOriginal: 400 }],
    }).then((titulo) => titulo.parcelas[0]);

    const baixa = await registrarBaixa(fixture.sessao, parcela.id, {
      data: new Date("2026-05-05T00:00:00Z"),
      valorPago: 400,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });
    await aprovarBaixa(fixture.sessaoAdmin, baixa.id);

    // Simula dado histórico anterior à correção da Task 1: apaga a categoria
    // direta que aprovarBaixa já copiou, deixando só o vínculo via baixaId.
    // `conciliado: true` também precisa ser marcado aqui — aprovarBaixa não
    // concilia o lançamento automaticamente (isso é papel da conciliação
    // bancária), e buscarRealizadoPorCategoria só soma lançamentos
    // conciliados, mesmo que se apoiando no fallback via baixa.
    await prisma.lancamentoBancario.updateMany({
      where: { baixaId: baixa.id },
      data: { categoriaFinanceiraId: null, conciliado: true },
    });

    const totais = await buscarRealizadoPorCategoria(fixture.filialId, 2026, 5);
    expect(totais.get(fixture.categoriaFinanceiraId)).toBe(400);
  });

  test("buscarProjetadoPorCategoria só considera parcelas em aberto dentro do mês", async () => {
    const tituloAberto = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: `ORC-PROJ-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date("2026-08-15T00:00:00Z"), valorOriginal: 600 }],
    });
    void tituloAberto;

    const totais = await buscarProjetadoPorCategoria(fixture.filialId, 2026, 8);
    expect(totais.get(fixture.categoriaFinanceiraId)).toBeGreaterThanOrEqual(600);

    const totaisMesErrado = await buscarProjetadoPorCategoria(fixture.filialId, 2026, 9);
    expect(totaisMesErrado.get(fixture.categoriaFinanceiraId) ?? 0).toBe(0);
  });

  test("listarComparativoOrcamento escopa por filial — orçamento de outra filial não vaza", async () => {
    const outraFixture = await criarFixtureFinanceiro("ORC3", "FINANCEIRO");
    try {
      await salvarValorOrcamento(outraFixture.sessao, outraFixture.categoriaFinanceiraId, 2026, 10, 999999);

      const linhas = await listarComparativoOrcamento(fixture.sessao, 2026);
      expect(linhas.every((l) => l.orcado !== 999999)).toBe(true);
    } finally {
      await prisma.orcamento.deleteMany({ where: { filialId: outraFixture.filialId } });
      await prisma.auditLog.deleteMany({ where: { entidade: "Orcamento", filialId: outraFixture.filialId } });
      await limparFixtureFinanceiro(outraFixture);
    }
  });
});
