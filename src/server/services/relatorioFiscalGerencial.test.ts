import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import {
  agregarComparativoMensal,
  listarPendenciasFiscais,
  obterComparativoMensal,
  obterEmAbertoPorClassificacao,
  obterTopContrapartesGerenciais,
  percentualGerencial,
} from "./relatorioFiscalGerencial";
import { buscarResumoFiscalGerencial } from "./dashboardExecutivo";
import type { ClassificacaoFiscal, TipoLancamento } from "@prisma/client";

describe("percentualGerencial / agregarComparativoMensal (puras)", () => {
  test("percentual é null sem movimento e 0–100 com movimento", () => {
    expect(percentualGerencial(0, 0)).toBeNull();
    expect(percentualGerencial(75, 25)).toBe(25);
    expect(percentualGerencial(0, 10)).toBe(100);
  });

  test("agrega por mês e classificação, ignorando transferências", () => {
    const linhas = agregarComparativoMensal([
      { data: new Date(Date.UTC(2026, 0, 10)), tipo: "ENTRADA", valor: 100, classificacaoFiscal: "FISCAL" },
      { data: new Date(Date.UTC(2026, 0, 20)), tipo: "ENTRADA", valor: 100, classificacaoFiscal: "GERENCIAL" },
      { data: new Date(Date.UTC(2026, 0, 21)), tipo: "SAIDA", valor: 40, classificacaoFiscal: "GERENCIAL" },
      { data: new Date(Date.UTC(2026, 2, 5)), tipo: "SAIDA", valor: 999, classificacaoFiscal: null },
    ]);

    expect(linhas).toHaveLength(12);
    expect(linhas[0]).toMatchObject({
      mes: 1,
      entradasFiscal: 100,
      entradasGerencial: 100,
      saidasGerencial: 40,
      percentualGerencialEntradas: 50,
      percentualGerencialSaidas: 100,
    });
    expect(linhas[2].saidasFiscal + linhas[2].saidasGerencial).toBe(0);
  });
});

describe("relatório Fiscal × Gerencial (integração)", () => {
  let fixture: FixtureFinanceiro;
  let fornecedorGerencialId: string;
  const hoje = new Date();
  const ano = hoje.getUTCFullYear();

  async function lancar(tipo: TipoLancamento, valor: number, classificacaoFiscal: ClassificacaoFiscal | null) {
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: hoje,
        tipo,
        valor,
        descricao: "teste",
        origem: classificacaoFiscal ? "MANUAL" : "TRANSFERENCIA",
        conciliado: true,
        classificacaoFiscal,
        usuarioId: fixture.usuarioId,
      },
    });
  }

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("RFG");
    const fornecedor = await prisma.fornecedor.create({
      data: { empresaId: fixture.empresaId, nome: "Produtor Gerencial", cnpjCpf: "987.654.321-00" },
    });
    fornecedorGerencialId = fornecedor.id;

    await lancar("ENTRADA", 300, "FISCAL");
    await lancar("ENTRADA", 100, "GERENCIAL");
    await lancar("SAIDA", 80, "GERENCIAL");
    await lancar("SAIDA", 500, null);

    const base = {
      filialId: fixture.filialId,
      dataEmissao: hoje,
      dataCompetencia: hoje,
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
    };
    const parcela = (valor: number) => ({
      create: [{ numero: 1, dataVencimento: hoje, valorOriginal: valor, valorAtualizado: valor, status: "A_VENCER" as const }],
    });

    // Fiscal legado: sem tipo e sem anexo → 2 pendências.
    await prisma.titulo.create({
      data: { ...base, tipo: "PAGAR", fornecedorId: fixture.fornecedorId, documento: "FISC-LEGADO", parcelas: parcela(1000) },
    });
    // Fiscal completo com anexo → sem pendência.
    const completo = await prisma.titulo.create({
      data: {
        ...base,
        tipo: "RECEBER",
        clienteId: fixture.clienteId,
        documento: "FISC-OK",
        tipoComprovante: "GUIA_TRIBUTO",
        parcelas: parcela(400),
      },
    });
    await prisma.anexo.create({
      data: { tituloId: completo.id, url: "https://x", nomeArquivo: "guia.pdf", tamanhoBytes: 1, usuarioId: fixture.usuarioId },
    });
    // Gerenciais: nunca têm pendência; entram no ranking de contrapartes.
    await prisma.titulo.create({
      data: {
        ...base,
        tipo: "PAGAR",
        fornecedorId: fornecedorGerencialId,
        documento: "GER-1",
        classificacaoFiscal: "GERENCIAL",
        parcelas: parcela(250),
      },
    });
    await prisma.titulo.create({
      data: {
        ...base,
        tipo: "PAGAR",
        fornecedorId: fornecedorGerencialId,
        documento: "GER-2",
        classificacaoFiscal: "GERENCIAL",
        parcelas: parcela(50),
      },
    });
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("comparativo mensal do realizado separa as classificações e ignora transferências", async () => {
    const linhas = await obterComparativoMensal(fixture.sessao, ano);
    const doMes = linhas[hoje.getUTCMonth()];
    expect(doMes.entradasFiscal).toBe(300);
    expect(doMes.entradasGerencial).toBe(100);
    expect(doMes.saidasGerencial).toBe(80);
    expect(doMes.saidasFiscal).toBe(0);
    expect(doMes.percentualGerencialEntradas).toBe(25);
  });

  test("em aberto por classificação", async () => {
    expect(await obterEmAbertoPorClassificacao(fixture.sessao)).toEqual({
      receberFiscal: 400,
      receberGerencial: 0,
      pagarFiscal: 1000,
      pagarGerencial: 300,
    });
  });

  test("top contrapartes gerenciais soma os títulos do parceiro", async () => {
    const inicioDoAno = new Date(Date.UTC(ano, 0, 1));
    const top = await obterTopContrapartesGerenciais(fixture.sessao, inicioDoAno, new Date(Date.UTC(ano, 11, 31)));
    expect(top).toEqual([
      { contraparteId: fornecedorGerencialId, nome: "Produtor Gerencial", tipo: "FORNECEDOR", quantidadeTitulos: 2, valorTotal: 300 },
    ]);
  });

  test("pendências fiscais listam só fiscais incompletos e aceitam filtro por pendência", async () => {
    const pendencias = await listarPendenciasFiscais(fixture.sessao);
    expect(pendencias.map((p) => p.documento)).toEqual(["FISC-LEGADO"]);
    expect(pendencias[0].pendencias).toEqual(["SEM_TIPO_DOCUMENTO", "SEM_ANEXO"]);
    expect(pendencias[0].valor).toBe(1000);

    expect(await listarPendenciasFiscais(fixture.sessao, { pendencia: "SEM_CHAVE_ACESSO" })).toEqual([]);
    expect(await listarPendenciasFiscais(fixture.sessao, { tipo: "RECEBER" })).toEqual([]);
  });

  test("resumo do dashboard consolida o mês e conta as pendências", async () => {
    const resumo = await buscarResumoFiscalGerencial(fixture.sessaoAdmin);
    expect(resumo).toEqual({
      entradasFiscal: 300,
      entradasGerencial: 100,
      saidasFiscal: 0,
      saidasGerencial: 80,
      percentualGerencialEntradas: 25,
      pendenciasFiscais: 1,
    });
  });

  test("resumo do dashboard exige dashboardExecutivo:ler", async () => {
    // FINANCEIRO não tem dashboardExecutivo:ler.
    await expect(buscarResumoFiscalGerencial(fixture.sessao)).rejects.toThrow(PermissionError);
  });
});
