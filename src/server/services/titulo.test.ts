import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { FilialSomenteLeituraError } from "@/server/auth/permissions";
import { SEM_VALOR } from "@/lib/schemas/enums";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo, atualizarTitulo, listarTitulos, alterarVencimentoParcela, cancelarParcela } from "./titulo";
import { renegociarParcela } from "./renegociacao";

describe("titulo (filial-scoped)", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("TIT");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("cria um titulo PAGAR com uma parcela", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-100",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 1000 }],
    });

    expect(titulo.fornecedorId).toBe(fixture.fornecedorId);
    expect(titulo.clienteId).toBeNull();
    expect(titulo.parcelas).toHaveLength(1);
  });

  test("cria um titulo RECEBER vinculado a cliente, não a fornecedor", async () => {
    const titulo = await criarTitulo(fixture.sessao, "RECEBER", {
      contraparteId: fixture.clienteId,
      documento: "NF-200",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 800 }],
    });

    expect(titulo.clienteId).toBe(fixture.clienteId);
    expect(titulo.fornecedorId).toBeNull();
  });

  test("bloqueia criação quando a filial está em modo somente leitura", async () => {
    await expect(
      criarTitulo(fixture.sessaoSomenteLeitura, "PAGAR", {
        contraparteId: fixture.fornecedorId,
        documento: "NF-BLOQUEADO",
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        centroCustoId: "",
        centroLucroId: "",
        safraId: "",
        projetoId: "",
        contaBancariaId: "",
        formaPagamento: "",
        parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
      }),
    ).rejects.toThrow(FilialSomenteLeituraError);
  });

  test("atualiza os dados de cabeçalho sem alterar as parcelas", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-EDITAR",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const atualizado = await atualizarTitulo(fixture.sessao, titulo.id, {
      contraparteId: fixture.fornecedorId,
      documento: "NF-EDITADA",
      dataEmissao: titulo.dataEmissao,
      dataCompetencia: titulo.dataCompetencia,
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
    });

    expect(atualizado.documento).toBe("NF-EDITADA");
  });

  test("altera vencimento de parcela e recalcula status", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-VENC",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date("2020-01-01"), valorOriginal: 100 }],
    });

    await alterarVencimentoParcela(fixture.sessao, titulo.parcelas[0].id, new Date("2099-01-01"));

    const parcela = await prisma.parcela.findUniqueOrThrow({ where: { id: titulo.parcelas[0].id } });
    // getUTCFullYear (não getFullYear): "2099-01-01" é parseado como meia-noite UTC;
    // em fusos horários negativos (ex.: America/Sao_Paulo) getFullYear() local retornaria 2098.
    expect(parcela.dataVencimento.getUTCFullYear()).toBe(2099);
    expect(parcela.status).not.toBe("VENCIDO");
  });

  test("cancela uma parcela", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-CANCELAR",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const cancelada = await cancelarParcela(fixture.sessao, titulo.parcelas[0].id);
    expect(cancelada.status).toBe("CANCELADO");
  });

  test("listarTitulos filtra por tipo", async () => {
    const titulos = await listarTitulos(fixture.filialId, "PAGAR");
    expect(titulos.every((titulo) => titulo.tipo === "PAGAR")).toBe(true);
  });

  test("listarTitulos isola por filial — título de uma filial irmã não aparece", async () => {
    const filialIrma = await prisma.filial.create({
      data: { empresaId: fixture.empresaId, nome: "Filial Irma TIT", cnpj: "11.111.TIT/0001-99" },
    });
    // A categoria precisa ser da PRÓPRIA filial irmã: referências são validadas por filial.
    const categoriaDaIrma = await prisma.categoriaFinanceira.create({
      data: { filialId: filialIrma.id, nome: "Categoria Irma TIT", tipo: "DESPESA" },
    });
    const sessaoFilialIrma: typeof fixture.sessao = { ...fixture.sessaoAdmin, filialId: filialIrma.id };

    const tituloNaIrma = await criarTitulo(sessaoFilialIrma, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-FILIAL-IRMA",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: categoriaDaIrma.id,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const titulosDaFixture = await listarTitulos(fixture.filialId, "PAGAR");
    expect(titulosDaFixture.find((titulo) => titulo.id === tituloNaIrma.id)).toBeUndefined();

    await prisma.parcela.deleteMany({ where: { tituloId: tituloNaIrma.id } });
    await prisma.titulo.delete({ where: { id: tituloNaIrma.id } });
    await prisma.auditLog.deleteMany({ where: { filialId: filialIrma.id } });
    await prisma.categoriaFinanceira.delete({ where: { id: categoriaDaIrma.id } });
    await prisma.filial.delete({ where: { id: filialIrma.id } });
  });

  test('normaliza o sentinela "__nenhum__" dos Selects opcionais para null', async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-SENTINELA",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: SEM_VALOR,
      centroLucroId: SEM_VALOR,
      safraId: SEM_VALOR,
      projetoId: SEM_VALOR,
      contaBancariaId: SEM_VALOR,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 500 }],
    });

    expect(titulo.centroCustoId).toBeNull();
    expect(titulo.centroLucroId).toBeNull();
    expect(titulo.safraId).toBeNull();
    expect(titulo.projetoId).toBeNull();
    expect(titulo.contaBancariaId).toBeNull();
  });

  test("atualizarTitulo com os mesmos valores não gera diff de auditoria", async () => {
    const dados = {
      contraparteId: fixture.fornecedorId,
      documento: "NF-SEM-DIFF",
      dataEmissao: new Date("2026-01-10T00:00:00.000Z"),
      dataCompetencia: new Date("2026-01-10T00:00:00.000Z"),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: SEM_VALOR,
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
    };

    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      ...dados,
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    await atualizarTitulo(fixture.sessao, titulo.id, dados);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entidade: "Titulo", entidadeId: titulo.id, acao: "ATUALIZAR" },
      orderBy: { criadoEm: "desc" },
    });

    expect(log.valorAnterior).toEqual({});
    expect(log.valorNovo).toEqual({});
  });

  test("rejeita criação quando a categoria pertence a outra filial", async () => {
    const filialIrma = await prisma.filial.create({
      data: { empresaId: fixture.empresaId, nome: "Filial Irma REF", cnpj: "11.111.REF/0001-99" },
    });
    const categoriaDaIrma = await prisma.categoriaFinanceira.create({
      data: { filialId: filialIrma.id, nome: "Categoria Irma REF", tipo: "DESPESA" },
    });

    await expect(
      criarTitulo(fixture.sessao, "PAGAR", {
        contraparteId: fixture.fornecedorId,
        documento: "NF-CATEGORIA-ALHEIA",
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: categoriaDaIrma.id,
        centroCustoId: "",
        centroLucroId: "",
        safraId: "",
        projetoId: "",
        contaBancariaId: "",
        formaPagamento: "",
        parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
      }),
    ).rejects.toThrow(/não pertence à filial ativa/);

    await prisma.categoriaFinanceira.delete({ where: { id: categoriaDaIrma.id } });
    await prisma.filial.delete({ where: { id: filialIrma.id } });
  });

  test("rejeita criação quando a contraparte pertence a outra empresa", async () => {
    const outraEmpresa = await prisma.empresa.create({
      data: {
        razaoSocial: "Outra Empresa TIT Ltda",
        nomeFantasia: "Outra TIT",
        cnpj: "44.444.TIT/0001-11",
      },
    });
    const fornecedorAlheio = await prisma.fornecedor.create({
      data: { empresaId: outraEmpresa.id, nome: "Fornecedor Alheio", cnpjCpf: "55.555.TIT/0001-22" },
    });

    await expect(
      criarTitulo(fixture.sessao, "PAGAR", {
        contraparteId: fornecedorAlheio.id,
        documento: "NF-FORNECEDOR-ALHEIO",
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        centroCustoId: "",
        centroLucroId: "",
        safraId: "",
        projetoId: "",
        contaBancariaId: "",
        formaPagamento: "",
        parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
      }),
    ).rejects.toThrow(/não pertence à empresa ativa/);

    await prisma.fornecedor.delete({ where: { id: fornecedorAlheio.id } });
    await prisma.empresa.delete({ where: { id: outraEmpresa.id } });
  });

  test("não permite cancelar uma parcela já renegociada", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-RENEG-CANCEL",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date("2020-01-01"), valorOriginal: 900 }],
    });

    await renegociarParcela(fixture.sessao, titulo.parcelas[0].id, [
      { dataVencimento: new Date("2099-01-01"), valorOriginal: 450 },
      { dataVencimento: new Date("2099-02-01"), valorOriginal: 450 },
    ]);

    await expect(cancelarParcela(fixture.sessao, titulo.parcelas[0].id)).rejects.toThrow(
      /já renegociada ou cancelada/,
    );
  });

  test("não permite cancelar duas vezes a mesma parcela", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-CANCEL-DUPLO",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    await cancelarParcela(fixture.sessao, titulo.parcelas[0].id);
    await expect(cancelarParcela(fixture.sessao, titulo.parcelas[0].id)).rejects.toThrow(
      /já renegociada ou cancelada/,
    );
  });
});
