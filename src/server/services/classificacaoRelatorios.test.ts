import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { listarFluxoDeCaixaRealizado } from "./fluxoDeCaixa";
import { listarFluxoDeCaixaProjetado } from "./fluxoDeCaixaProjetado";
import { listarFluxoDeCaixaPorDimensao } from "./fluxoDeCaixaPorDimensao";
import { listarComparativoOrcamento } from "./orcamento";
import { listarComparativoSafras } from "./orcamentoSafra";
import type { ClassificacaoFiscal, TipoLancamento } from "@prisma/client";

/**
 * Não-regressão do filtro Fiscal × Gerencial nos relatórios: com dados mistos
 * (fiscal, gerencial e transferência), "Todos" = chamada sem `opcoes` e
 * Fiscal + Gerencial reconciliam com Todos (transferências só em Todos).
 */
describe("filtro de classificação nos relatórios", () => {
  let fixture: FixtureFinanceiro;
  let safraId: string;

  const hoje = new Date();
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth() + 1;
  const meioDoMes = new Date(Date.UTC(ano, mes - 1, 15, 12));
  const meioDoProximoMes = new Date(Date.UTC(ano, mes, 15, 12));

  async function lancar(tipo: TipoLancamento, valor: number, classificacaoFiscal: ClassificacaoFiscal | null) {
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: meioDoMes,
        tipo,
        valor,
        descricao: `teste ${classificacaoFiscal ?? "transferência"}`,
        origem: classificacaoFiscal ? "MANUAL" : "TRANSFERENCIA",
        conciliado: true,
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        safraId,
        classificacaoFiscal,
        usuarioId: fixture.usuarioId,
      },
    });
  }

  async function titulo(tipo: "PAGAR" | "RECEBER", valor: number, classificacaoFiscal: ClassificacaoFiscal) {
    await prisma.titulo.create({
      data: {
        filialId: fixture.filialId,
        tipo,
        ...(tipo === "PAGAR" ? { fornecedorId: fixture.fornecedorId } : { clienteId: fixture.clienteId }),
        documento: `T-${classificacaoFiscal}-${tipo}`,
        dataEmissao: hoje,
        dataCompetencia: hoje,
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        safraId,
        classificacaoFiscal,
        parcelas: {
          create: [{ numero: 1, dataVencimento: meioDoProximoMes, valorOriginal: valor, valorAtualizado: valor, status: "A_VENCER" }],
        },
      },
    });
  }

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("REL");
    const safra = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra relatórios",
        dataInicio: new Date(Date.UTC(ano, 0, 1)),
        dataFim: new Date(Date.UTC(ano + 1, 11, 31)),
      },
    });
    safraId = safra.id;

    await lancar("ENTRADA", 1000, "FISCAL");
    await lancar("SAIDA", 300, "FISCAL");
    await lancar("ENTRADA", 200, "GERENCIAL");
    await lancar("SAIDA", 50, "GERENCIAL");
    await lancar("SAIDA", 70, null); // transferência (lado de saída)

    await titulo("RECEBER", 800, "FISCAL");
    await titulo("PAGAR", 400, "FISCAL");
    await titulo("RECEBER", 150, "GERENCIAL");
    await titulo("PAGAR", 60, "GERENCIAL");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.safra.deleteMany({ where: { id: safraId } });
    await prisma.$disconnect();
  });

  test("fluxo realizado: sem opcoes = Todos; filtrado parte de 0 e exclui transferências", async () => {
    const semOpcoes = await listarFluxoDeCaixaRealizado(fixture.sessao, "MES", meioDoMes);
    const todos = await listarFluxoDeCaixaRealizado(fixture.sessao, "MES", meioDoMes, {});
    const fiscal = await listarFluxoDeCaixaRealizado(fixture.sessao, "MES", meioDoMes, { classificacao: "FISCAL" });
    const gerencial = await listarFluxoDeCaixaRealizado(fixture.sessao, "MES", meioDoMes, { classificacao: "GERENCIAL" });

    expect(todos).toEqual(semOpcoes);

    const doMes = (periodos: typeof todos) => periodos[mes - 1];
    expect(doMes(fiscal).entradas).toBe(1000);
    expect(doMes(fiscal).saidas).toBe(300);
    expect(doMes(gerencial).entradas).toBe(200);
    expect(doMes(gerencial).saidas).toBe(50);
    expect(doMes(todos).entradas).toBe(doMes(fiscal).entradas + doMes(gerencial).entradas);
    expect(doMes(todos).saidas).toBe(doMes(fiscal).saidas + doMes(gerencial).saidas + 70);

    expect(fiscal[0].saldoInicial).toBe(0);
    expect(doMes(fiscal).saldoFinal).toBe(700);
  });

  test("fluxo projetado: Fiscal + Gerencial = Todos, filtrado parte de 0 e sem alerta", async () => {
    const semOpcoes = await listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", hoje);
    const fiscal = await listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", hoje, { classificacao: "FISCAL" });
    const gerencial = await listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", hoje, { classificacao: "GERENCIAL" });

    const proximo = 1; // janela MOVEL começa no mês atual
    expect(semOpcoes[proximo].entradasProjetadas).toBe(fiscal[proximo].entradasProjetadas + gerencial[proximo].entradasProjetadas);
    expect(semOpcoes[proximo].saidasProjetadas).toBe(fiscal[proximo].saidasProjetadas + gerencial[proximo].saidasProjetadas);
    expect(gerencial[proximo].entradasProjetadas).toBe(150);
    expect(fiscal[0].saldoInicial).toBe(0);
    expect(gerencial.every((periodo) => periodo.alerta === false)).toBe(true);
  });

  test("fluxo por dimensão (safra): Fiscal + Gerencial = Todos, realizado e projetado", async () => {
    const linhaDaSafra = async (classificacao?: ClassificacaoFiscal) => {
      const linhas = await listarFluxoDeCaixaPorDimensao(fixture.sessao, "SAFRA", ano, mes, { classificacao });
      return linhas.find((linha) => linha.dimensaoId === safraId)!;
    };
    const [todos, fiscal, gerencial] = await Promise.all([linhaDaSafra(), linhaDaSafra("FISCAL"), linhaDaSafra("GERENCIAL")]);

    expect(todos.entradasRealizadas).toBe(fiscal.entradasRealizadas + gerencial.entradasRealizadas);
    expect(todos.saidasRealizadas).toBe(fiscal.saidasRealizadas + gerencial.saidasRealizadas + 70);
    expect(gerencial.entradasRealizadas).toBe(200);
  });

  test("orçamento: realizado filtrado por categoria; orçado não muda com o filtro", async () => {
    const daCategoria = async (classificacao?: ClassificacaoFiscal) => {
      const linhas = await listarComparativoOrcamento(fixture.sessao, ano, { classificacao });
      return linhas.find((linha) => linha.categoriaFinanceiraId === fixture.categoriaFinanceiraId && linha.mes === mes)!;
    };
    const [semOpcoes, todos, fiscal, gerencial] = await Promise.all([
      listarComparativoOrcamento(fixture.sessao, ano),
      daCategoria(),
      daCategoria("FISCAL"),
      daCategoria("GERENCIAL"),
    ]);

    expect(semOpcoes.find((linha) => linha.categoriaFinanceiraId === fixture.categoriaFinanceiraId && linha.mes === mes)).toEqual(todos);
    expect(todos.realizado).toBe(fiscal.realizado + gerencial.realizado + 70);
    expect(gerencial.realizado).toBe(250);
    expect(fiscal.orcado).toBe(todos.orcado);
  });

  test("comparação de safras: realizado e projetado (líquidos) reconciliam", async () => {
    const daSafra = async (classificacao?: ClassificacaoFiscal) =>
      (await listarComparativoSafras(fixture.sessao, { classificacao })).find((linha) => linha.safraId === safraId)!;
    const [todos, fiscal, gerencial] = await Promise.all([daSafra(), daSafra("FISCAL"), daSafra("GERENCIAL")]);

    expect(todos.realizado).toBe(fiscal.realizado + gerencial.realizado - 70);
    expect(todos.projetado).toBe(fiscal.projetado + gerencial.projetado);
    expect(gerencial.realizado).toBe(150);
  });
});
