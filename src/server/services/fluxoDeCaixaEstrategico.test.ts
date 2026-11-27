import { describe, expect, test } from "vitest";
import { afterAll, beforeAll } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import {
  garantirCenariosEstrategicos,
  buscarAnoBaseConsolidado,
  listarCenariosEstrategicos,
  listarProjecaoEstrategica,
  atualizarPremissasCenario,
  TIPOS_CENARIO,
} from "./fluxoDeCaixaEstrategico";
import { calcularProjecaoEstrategica, type PremissasCenario } from "./fluxoDeCaixaEstrategico";

describe("calcularProjecaoEstrategica", () => {
  const premissasZeradas: PremissasCenario = {
    crescimentoReceita: 0,
    crescimentoCustos: 0,
    capexPercentualReceita: 0,
    novoEndividamentoAnual: 0,
    taxaJurosAnual: 0,
  };

  test("devolve exatamente 5 anos, numerados 1 a 5", () => {
    const resultado = calcularProjecaoEstrategica(premissasZeradas, 1000, 600, 200);
    expect(resultado).toHaveLength(5);
    expect(resultado.map((a) => a.ano)).toEqual([1, 2, 3, 4, 5]);
  });

  test("premissas todas zeradas reproduz o ano base nos 5 anos, sem crescimento", () => {
    const resultado = calcularProjecaoEstrategica(premissasZeradas, 1000, 600, 200);
    for (const ano of resultado) {
      expect(ano.receita).toBe(1000);
      expect(ano.custoOperacional).toBe(600);
      expect(ano.capex).toBe(0);
      expect(ano.jurosSobreDivida).toBe(0);
      expect(ano.geracaoOperacional).toBe(400);
      expect(ano.geracaoLiquida).toBe(400);
    }
    expect(resultado[0].saldoCaixa).toBe(600); // 200 + 400
    expect(resultado[4].saldoCaixa).toBe(200 + 400 * 5);
  });

  test("encadeia receita/custo/saldo de caixa ano a ano com crescimento", () => {
    const premissas: PremissasCenario = { ...premissasZeradas, crescimentoReceita: 0.1, crescimentoCustos: 0.05 };
    const resultado = calcularProjecaoEstrategica(premissas, 1000, 600, 0);
    expect(resultado[0].receita).toBeCloseTo(1100, 6);
    expect(resultado[0].custoOperacional).toBeCloseTo(630, 6);
    expect(resultado[1].receita).toBeCloseTo(1210, 6);
    expect(resultado[1].custoOperacional).toBeCloseTo(661.5, 6);
  });

  test("CAPEX é percentual da receita do próprio ano, não do ano base", () => {
    const premissas: PremissasCenario = { ...premissasZeradas, crescimentoReceita: 1, capexPercentualReceita: 0.1 };
    const resultado = calcularProjecaoEstrategica(premissas, 1000, 0, 0);
    expect(resultado[0].receita).toBe(2000);
    expect(resultado[0].capex).toBeCloseTo(200, 6); // 10% de 2000, não de 1000
  });

  test("saldo devedor acumula novoEndividamentoAnual todo ano, sem amortização", () => {
    const premissas: PremissasCenario = { ...premissasZeradas, novoEndividamentoAnual: 500 };
    const resultado = calcularProjecaoEstrategica(premissas, 1000, 600, 0);
    // geracaoLiquida[N] = geracaoOperacional (400) + novoEndividamentoAnual (500) - juros (0, sem taxa)
    for (const ano of resultado) {
      expect(ano.geracaoLiquida).toBe(900);
    }
  });

  test("juros incidem sobre o saldo devedor do ANO ANTERIOR, não o do próprio ano", () => {
    const premissas: PremissasCenario = { ...premissasZeradas, novoEndividamentoAnual: 1000, taxaJurosAnual: 0.1 };
    const resultado = calcularProjecaoEstrategica(premissas, 1000, 600, 0);
    // Ano 1: saldo devedor anterior = 0 -> juros = 0
    expect(resultado[0].jurosSobreDivida).toBe(0);
    // Ano 2: saldo devedor no fim do ano 1 = 1000 -> juros do ano 2 = 100
    expect(resultado[1].jurosSobreDivida).toBeCloseTo(100, 6);
    // Ano 3: saldo devedor no fim do ano 2 = 2000 -> juros do ano 3 = 200
    expect(resultado[2].jurosSobreDivida).toBeCloseTo(200, 6);
  });

  test("margemOperacional é geracaoOperacional/receita, e não lança erro quando receita é 0", () => {
    const resultado = calcularProjecaoEstrategica(premissasZeradas, 1000, 600, 0);
    expect(resultado[0].margemOperacional).toBeCloseTo(0.4, 6);

    const resultadoZerado = calcularProjecaoEstrategica(premissasZeradas, 0, 0, 0);
    expect(resultadoZerado[0].margemOperacional).toBe(0);
    expect(Number.isFinite(resultadoZerado[0].margemOperacional)).toBe(true);
  });
});

describe("garantirCenariosEstrategicos / listarCenariosEstrategicos / listarProjecaoEstrategica / atualizarPremissasCenario (integração)", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("FCE", "GESTOR");
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entidade: "CenarioEstrategico", empresaId: fixture.empresaId } });
    await prisma.cenarioEstrategico.deleteMany({ where: { empresaId: fixture.empresaId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("garantirCenariosEstrategicos cria os 3 tipos quando nenhum existe, e não duplica ao rodar de novo", async () => {
    await garantirCenariosEstrategicos(fixture.empresaId);
    const primeiraLeitura = await prisma.cenarioEstrategico.findMany({ where: { empresaId: fixture.empresaId } });
    expect(primeiraLeitura).toHaveLength(3);
    expect(new Set(primeiraLeitura.map((c) => c.tipo))).toEqual(new Set(TIPOS_CENARIO));

    await garantirCenariosEstrategicos(fixture.empresaId);
    const segundaLeitura = await prisma.cenarioEstrategico.findMany({ where: { empresaId: fixture.empresaId } });
    expect(segundaLeitura).toHaveLength(3);
  });

  test("buscarAnoBaseConsolidado soma os últimos 12 meses de 2 filiais da mesma empresa", async () => {
    const filial2 = await prisma.filial.create({
      data: { empresaId: fixture.empresaId, nome: "Filial 2 FCE", cnpjCpf: `88.888.FCE2/0001-99` },
    });
    const banco = await prisma.banco.create({ data: { codigo: `FCEB${Date.now()}`, nome: "Banco FCE" } });
    const contaFilial2 = await prisma.contaBancaria.create({
      data: { filialId: filial2.id, bancoId: banco.id, agencia: "0001", conta: "fce2-1", saldoInicial: 0 },
    });

    const receitaFilial1 = await prisma.categoriaFinanceira.create({
      data: { filialId: fixture.filialId, nome: "Vendas FCE", tipo: "RECEITA" },
    });
    const receitaFilial2 = await prisma.categoriaFinanceira.create({
      data: { filialId: filial2.id, nome: "Vendas FCE2", tipo: "RECEITA" },
    });

    const hoje = new Date();
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        categoriaFinanceiraId: receitaFilial1.id,
        data: hoje,
        tipo: "ENTRADA",
        valor: 1000,
        descricao: "Receita filial 1",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });
    await prisma.lancamentoBancario.create({
      data: {
        filialId: filial2.id,
        contaBancariaId: contaFilial2.id,
        categoriaFinanceiraId: receitaFilial2.id,
        data: hoje,
        tipo: "ENTRADA",
        valor: 500,
        descricao: "Receita filial 2",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });

    const anoBase = await buscarAnoBaseConsolidado(fixture.empresaId);
    expect(anoBase.receitaBase).toBeGreaterThanOrEqual(1500);

    await prisma.lancamentoBancario.deleteMany({ where: { filialId: filial2.id } });
    await prisma.categoriaFinanceira.deleteMany({ where: { filialId: filial2.id } });
    await prisma.contaBancaria.deleteMany({ where: { filialId: filial2.id } });
    await prisma.banco.delete({ where: { id: banco.id } });
    await prisma.filial.delete({ where: { id: filial2.id } });
  });

  test("listarCenariosEstrategicos e listarProjecaoEstrategica escopam pela empresa ativa da sessão", async () => {
    const cenarios = await listarCenariosEstrategicos(fixture.sessao);
    expect(Object.keys(cenarios).sort()).toEqual([...TIPOS_CENARIO].sort());

    const { projecoes } = await listarProjecaoEstrategica(fixture.sessao);
    for (const tipo of TIPOS_CENARIO) {
      expect(projecoes[tipo]).toHaveLength(5);
    }
  });

  test("atualizarPremissasCenario recusa perfil sem planejamentoEstrategico:escrever", async () => {
    const sessaoConsulta = { ...fixture.sessao, perfil: "CONSULTA" as const };
    await expect(
      atualizarPremissasCenario(sessaoConsulta, "BASE", {
        crescimentoReceita: 0.1,
        crescimentoCustos: 0.05,
        capexPercentualReceita: 0.02,
        novoEndividamentoAnual: 0,
        taxaJurosAnual: 0,
      }),
    ).rejects.toThrow();
  });

  test("atualizarPremissasCenario persiste e listarCenariosEstrategicos reflete o valor novo", async () => {
    await atualizarPremissasCenario(fixture.sessao, "OTIMISTA", {
      crescimentoReceita: 0.15,
      crescimentoCustos: 0.08,
      capexPercentualReceita: 0.03,
      novoEndividamentoAnual: 10000,
      taxaJurosAnual: 0.12,
    });

    const cenarios = await listarCenariosEstrategicos(fixture.sessao);
    expect(cenarios.OTIMISTA.crescimentoReceita).toBeCloseTo(0.15, 6);
    expect(cenarios.OTIMISTA.novoEndividamentoAnual).toBeCloseTo(10000, 6);
  });

  test("garantirCenariosEstrategicos é seguro sob concorrência numa empresa nova, sem cenários ainda", async () => {
    const fixtureNova = await criarFixtureFinanceiro("FCE3", "ADMINISTRADOR");
    try {
      await Promise.all(Array.from({ length: 8 }, () => garantirCenariosEstrategicos(fixtureNova.empresaId)));
      const cenarios = await prisma.cenarioEstrategico.findMany({ where: { empresaId: fixtureNova.empresaId } });
      expect(cenarios).toHaveLength(3);
    } finally {
      await prisma.cenarioEstrategico.deleteMany({ where: { empresaId: fixtureNova.empresaId } });
      await limparFixtureFinanceiro(fixtureNova);
    }
  });
});

describe("buscarAnoBaseConsolidado / listarProjecaoEstrategica com classificação (FG5)", () => {
  let fixture: FixtureFinanceiro;

  let receitaId: string;
  let despesaId: string;
  const SEM_FORA = {
    naoOperacional: { entradas: 0, saidas: 0 },
    semCategoria: { entradas: 0, saidas: 0 },
  };

  async function lancar(
    tipo: "ENTRADA" | "SAIDA",
    valor: number,
    classificacaoFiscal: "FISCAL" | "GERENCIAL" | null,
    origem: "MANUAL" | "TRANSFERENCIA" = "MANUAL",
    categoriaFinanceiraId: string | null = tipo === "ENTRADA" ? receitaId : despesaId,
  ) {
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        categoriaFinanceiraId,
        data: new Date(),
        tipo,
        valor,
        descricao: "FG5",
        origem,
        usuarioId: fixture.usuarioId,
        conciliado: true,
        classificacaoFiscal,
      },
    });
  }

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("FCEG", "GESTOR");
    receitaId = (
      await prisma.categoriaFinanceira.create({
        data: { filialId: fixture.filialId, nome: "Receita FG5", tipo: "RECEITA" },
      })
    ).id;
    despesaId = (
      await prisma.categoriaFinanceira.create({
        data: { filialId: fixture.filialId, nome: "Despesa FG5", tipo: "DESPESA" },
      })
    ).id;
    await lancar("ENTRADA", 1000, "FISCAL");
    await lancar("ENTRADA", 300, "GERENCIAL");
    await lancar("SAIDA", 100, "GERENCIAL");
    await lancar("ENTRADA", 50, null, "TRANSFERENCIA", null); // sem classificação: só na visão "Todos"
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { empresaId: fixture.empresaId } });
    await prisma.cenarioEstrategico.deleteMany({ where: { empresaId: fixture.empresaId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("sem filtro: movimento sem transferências e o saldo bancário real", async () => {
    expect(await buscarAnoBaseConsolidado(fixture.empresaId)).toEqual({
      receitaBase: 1300,
      custoBase: 100,
      saldoCaixaBase: 1250,
      foraDaBase: SEM_FORA,
    });
  });

  test("filtrado: só o movimento da classificação, partindo de saldo 0 (acumulado)", async () => {
    expect(await buscarAnoBaseConsolidado(fixture.empresaId, { classificacao: "FISCAL" })).toEqual({
      receitaBase: 1000,
      custoBase: 0,
      saldoCaixaBase: 0,
      foraDaBase: SEM_FORA,
    });
    expect(await buscarAnoBaseConsolidado(fixture.empresaId, { classificacao: "GERENCIAL" })).toEqual({
      receitaBase: 300,
      custoBase: 100,
      saldoCaixaBase: 0,
      foraDaBase: SEM_FORA,
    });
  });

  test("a projeção filtrada acumula a partir de zero", async () => {
    // Premissas zeradas (cenários recém-criados): cada ano repete receita/custo do ano-base.
    const { projecoes } = await listarProjecaoEstrategica(fixture.sessao, { classificacao: "GERENCIAL" });
    expect(projecoes.BASE.map((ano) => ano.saldoCaixa)).toEqual([200, 400, 600, 800, 1000]);
  });

  test("o saldo de partida soma o que aguarda conciliação; o ano-base continua só conciliado", async () => {
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        categoriaFinanceiraId: despesaId,
        data: new Date(),
        tipo: "SAIDA",
        valor: 200,
        descricao: "FG5 não conciliado",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: false,
        classificacaoFiscal: "GERENCIAL",
      },
    });
    expect(await buscarAnoBaseConsolidado(fixture.empresaId)).toEqual({
      receitaBase: 1300,
      custoBase: 100,
      saldoCaixaBase: 1050,
      foraDaBase: SEM_FORA,
    });
    expect((await buscarAnoBaseConsolidado(fixture.empresaId, { classificacao: "GERENCIAL" })).saldoCaixaBase).toBe(0);
  });

  test("data futura: transferência do Caixa não muda o saldo de partida e lançamento no Caixa entra", async () => {
    const futura = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const lancamento = (tipo: "ENTRADA" | "SAIDA", valor: number, conciliado: boolean, descricao: string) =>
      prisma.lancamentoBancario.create({
        data: {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          categoriaFinanceiraId: despesaId,
          data: futura,
          tipo,
          valor,
          descricao,
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado,
          classificacaoFiscal: "GERENCIAL",
        },
      });
    const antes = await buscarAnoBaseConsolidado(fixture.empresaId);
    await lancamento("SAIDA", 2000, true, "Transferência futura — lado do Caixa");
    await lancamento("ENTRADA", 2000, false, "Transferência futura — lado do banco");
    expect((await buscarAnoBaseConsolidado(fixture.empresaId)).saldoCaixaBase).toBeCloseTo(antes.saldoCaixaBase, 2);

    await lancamento("SAIDA", 300, true, "Despesa futura no Caixa");
    const depois = await buscarAnoBaseConsolidado(fixture.empresaId);
    expect(depois.saldoCaixaBase - antes.saldoCaixaBase).toBeCloseTo(-300, 2);
    // O ano-base (realizado) continua com o corte em hoje.
    expect(depois.custoBase).toBe(antes.custoBase);
  });

  test("empréstimo e amortização em categoria não operacional ficam fora, e voltam à parte", async () => {
    const emprestimo = await prisma.categoriaFinanceira.create({
      data: { filialId: fixture.filialId, nome: "Empréstimos FG5", tipo: "RECEITA", naoOperacional: true },
    });
    const amortizacao = await prisma.categoriaFinanceira.create({
      data: { filialId: fixture.filialId, nome: "Amortização FG5", tipo: "DESPESA", naoOperacional: true },
    });
    const antes = await buscarAnoBaseConsolidado(fixture.empresaId);
    await lancar("ENTRADA", 100_000, "FISCAL", "MANUAL", emprestimo.id);
    await lancar("SAIDA", 20_000, "FISCAL", "MANUAL", amortizacao.id);
    const depois = await buscarAnoBaseConsolidado(fixture.empresaId);
    expect(depois.receitaBase).toBe(antes.receitaBase);
    expect(depois.custoBase).toBe(antes.custoBase);
    expect(depois.foraDaBase.naoOperacional).toEqual({
      entradas: antes.foraDaBase.naoOperacional.entradas + 100_000,
      saidas: antes.foraDaBase.naoOperacional.saidas + 20_000,
    });
  });

  test("devolução lançada como entrada numa categoria de despesa reduz o custo", async () => {
    const antes = await buscarAnoBaseConsolidado(fixture.empresaId);
    await lancar("ENTRADA", 200, "FISCAL", "MANUAL", despesaId);
    const depois = await buscarAnoBaseConsolidado(fixture.empresaId);
    expect(depois.custoBase).toBe(antes.custoBase - 200);
    expect(depois.receitaBase).toBe(antes.receitaBase);
  });

  test("lançamento sem categoria fica fora e aparece em semCategoria", async () => {
    const antes = await buscarAnoBaseConsolidado(fixture.empresaId);
    await lancar("SAIDA", 50, "FISCAL", "MANUAL", null);
    const depois = await buscarAnoBaseConsolidado(fixture.empresaId);
    expect(depois.custoBase).toBe(antes.custoBase);
    expect(depois.foraDaBase.semCategoria.saidas).toBe(antes.foraDaBase.semCategoria.saidas + 50);
  });

  test("lançamento de baixa sem categoria própria usa a categoria do título", async () => {
    const titulo = await prisma.titulo.create({
      data: {
        filialId: fixture.filialId,
        tipo: "RECEBER",
        clienteId: fixture.clienteId,
        categoriaFinanceiraId: receitaId,
        documento: "FG5-BAIXA",
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        parcelas: {
          create: { numero: 1, dataVencimento: new Date(), valorOriginal: 400, valorAtualizado: 400, status: "PAGO" },
        },
      },
      include: { parcelas: true },
    });
    const baixa = await prisma.baixa.create({
      data: {
        parcelaId: titulo.parcelas[0].id,
        data: new Date(),
        valorPago: 400,
        contaBancariaId: fixture.contaBancariaId,
        usuarioId: fixture.usuarioId,
        statusAprovacao: "APROVADO",
      },
    });
    const antes = await buscarAnoBaseConsolidado(fixture.empresaId);
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date(),
        tipo: "ENTRADA",
        valor: 400,
        descricao: "Baixa FG5 sem categoria no lançamento",
        origem: "BAIXA",
        baixaId: baixa.id,
        usuarioId: fixture.usuarioId,
        conciliado: true,
        classificacaoFiscal: "FISCAL",
      },
    });
    const depois = await buscarAnoBaseConsolidado(fixture.empresaId);
    expect(depois.receitaBase).toBe(antes.receitaBase + 400);
    expect(depois.foraDaBase.semCategoria).toEqual(antes.foraDaBase.semCategoria);
  });

  test("listarProjecaoEstrategica devolve o que ficou fora do ano-base", async () => {
    const { foraDaBase } = await listarProjecaoEstrategica(fixture.sessao);
    expect(foraDaBase).toEqual((await buscarAnoBaseConsolidado(fixture.empresaId)).foraDaBase);
  });
});
