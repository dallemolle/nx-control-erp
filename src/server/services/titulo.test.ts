import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { FilialSomenteLeituraError } from "@/server/auth/permissions";
import { SEM_VALOR } from "@/lib/schemas/enums";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo, atualizarTitulo, listarTitulos, alterarVencimentoParcela, cancelarParcela, parcelaBateFiltroDeParcela } from "./titulo";
import { renegociarParcela } from "./renegociacao";

describe("parcelaBateFiltroDeParcela (pura)", () => {
  test("sem filtro nenhum, sempre bate", () => {
    expect(
      parcelaBateFiltroDeParcela({ status: "VENCIDO", dataVencimento: new Date("2026-01-01") }, {}),
    ).toBe(true);
  });

  test("filtra só por status", () => {
    const parcela = { status: "VENCIDO" as const, dataVencimento: new Date("2026-01-01") };
    expect(parcelaBateFiltroDeParcela(parcela, { status: "PAGO" })).toBe(false);
    expect(parcelaBateFiltroDeParcela(parcela, { status: "VENCIDO" })).toBe(true);
  });

  test("filtra só por período (inclusivo nas duas pontas)", () => {
    const parcela = { status: "VENCIDO" as const, dataVencimento: new Date("2026-06-15") };
    expect(parcelaBateFiltroDeParcela(parcela, { vencimentoDe: new Date("2026-06-15") })).toBe(true);
    expect(parcelaBateFiltroDeParcela(parcela, { vencimentoDe: new Date("2026-06-16") })).toBe(false);
    expect(parcelaBateFiltroDeParcela(parcela, { vencimentoAte: new Date("2026-06-15") })).toBe(true);
    expect(parcelaBateFiltroDeParcela(parcela, { vencimentoAte: new Date("2026-06-14") })).toBe(false);
  });

  test("status e período juntos exigem que a mesma parcela bata os dois", () => {
    const parcela = { status: "VENCIDO" as const, dataVencimento: new Date("2026-06-15") };
    expect(
      parcelaBateFiltroDeParcela(parcela, {
        status: "VENCIDO",
        vencimentoDe: new Date("2026-06-01"),
        vencimentoAte: new Date("2026-06-30"),
      }),
    ).toBe(true);
    expect(
      parcelaBateFiltroDeParcela(parcela, {
        status: "PAGO",
        vencimentoDe: new Date("2026-06-01"),
        vencimentoAte: new Date("2026-06-30"),
      }),
    ).toBe(false);
  });
});

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

  test("listarTitulos filtra por categoria", async () => {
    const categoria = await prisma.categoriaFinanceira.create({
      data: { filialId: fixture.filialId, nome: "Categoria Filtro Dimensao TIT", tipo: "DESPESA" },
    });

    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-CATEGORIA-DIM-TIT",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: categoria.id,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const filtrados = await listarTitulos(fixture.filialId, "PAGAR", { categoriaId: categoria.id });
    expect(filtrados.every((t) => t.categoriaFinanceiraId === categoria.id)).toBe(true);
    expect(filtrados.some((t) => t.id === titulo.id)).toBe(true);
  });

  test("listarTitulos filtra por contraparte (fornecedor)", async () => {
    const outroFornecedor = await prisma.fornecedor.create({
      data: { empresaId: fixture.empresaId, nome: "Fornecedor Filtro TIT", cnpjCpf: "77.777.TIT/0001-88" },
    });

    const tituloOutroFornecedor = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: outroFornecedor.id,
      documento: "NF-OUTRO-FORNECEDOR-TIT",
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

    const filtrados = await listarTitulos(fixture.filialId, "PAGAR", { contraparteId: fixture.fornecedorId });
    expect(filtrados.every((t) => t.fornecedorId === fixture.fornecedorId)).toBe(true);
    expect(filtrados.some((t) => t.id === tituloOutroFornecedor.id)).toBe(false);
  });

  test("listarTitulos filtra por centro de custo", async () => {
    const centroCusto = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Centro Custo Filtro TIT", codigo: "CC-FILTRO-TIT" },
    });

    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-CENTRO-CUSTO-TIT",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: centroCusto.id,
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const filtrados = await listarTitulos(fixture.filialId, "PAGAR", { centroCustoId: centroCusto.id });
    expect(filtrados.every((t) => t.centroCustoId === centroCusto.id)).toBe(true);
    expect(filtrados.some((t) => t.id === titulo.id)).toBe(true);
  });

  test("listarTitulos filtra por centro de lucro", async () => {
    const centroLucro = await prisma.centroLucro.create({
      data: { filialId: fixture.filialId, nome: "Centro Lucro Filtro TIT", codigo: "CL-FILTRO-TIT" },
    });

    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-CENTRO-LUCRO-TIT",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: centroLucro.id,
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const filtrados = await listarTitulos(fixture.filialId, "PAGAR", { centroLucroId: centroLucro.id });
    expect(filtrados.every((t) => t.centroLucroId === centroLucro.id)).toBe(true);
    expect(filtrados.some((t) => t.id === titulo.id)).toBe(true);
  });

  test("listarTitulos filtra por safra", async () => {
    const safra = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra Filtro TIT",
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2026-12-31"),
      },
    });

    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-SAFRA-TIT",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: safra.id,
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const filtrados = await listarTitulos(fixture.filialId, "PAGAR", { safraId: safra.id });
    expect(filtrados.every((t) => t.safraId === safra.id)).toBe(true);
    expect(filtrados.some((t) => t.id === titulo.id)).toBe(true);
  });

  test("listarTitulos filtra por projeto", async () => {
    const projeto = await prisma.projeto.create({
      data: { filialId: fixture.filialId, nome: "Projeto Filtro TIT", codigo: "PRJ-FILTRO-TIT" },
    });

    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-PROJETO-TIT",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: projeto.id,
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const filtrados = await listarTitulos(fixture.filialId, "PAGAR", { projetoId: projeto.id });
    expect(filtrados.every((t) => t.projetoId === projeto.id)).toBe(true);
    expect(filtrados.some((t) => t.id === titulo.id)).toBe(true);
  });

  test("listarTitulos filtra por status", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-STATUS-TIT",
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

    const cancelados = await listarTitulos(fixture.filialId, "PAGAR", { status: "CANCELADO" });
    expect(cancelados.some((t) => t.id === titulo.id)).toBe(true);

    const pagos = await listarTitulos(fixture.filialId, "PAGAR", { status: "PAGO" });
    expect(pagos.some((t) => t.id === titulo.id)).toBe(false);
  });

  test("listarTitulos filtra por período de vencimento (inclusivo)", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-PERIODO-TIT",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date("2027-03-10T00:00:00.000Z"), valorOriginal: 100 }],
    });

    const dentro = await listarTitulos(fixture.filialId, "PAGAR", {
      vencimentoDe: new Date("2027-03-01T00:00:00.000Z"),
      vencimentoAte: new Date("2027-03-31T00:00:00.000Z"),
    });
    expect(dentro.some((t) => t.id === titulo.id)).toBe(true);

    const fora = await listarTitulos(fixture.filialId, "PAGAR", {
      vencimentoDe: new Date("2027-04-01T00:00:00.000Z"),
    });
    expect(fora.some((t) => t.id === titulo.id)).toBe(false);
  });

  test("listarTitulos combina categoria e status: interseção, não união", async () => {
    const categoriaCombo = await prisma.categoriaFinanceira.create({
      data: { filialId: fixture.filialId, nome: "Categoria Combo TIT", tipo: "DESPESA" },
    });

    const tituloBateOsDois = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-COMBO-BATE-TIT",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: categoriaCombo.id,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });
    await cancelarParcela(fixture.sessao, tituloBateOsDois.parcelas[0].id);

    const tituloSoCategoria = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-COMBO-SO-CATEGORIA-TIT",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: categoriaCombo.id,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const filtrados = await listarTitulos(fixture.filialId, "PAGAR", {
      categoriaId: categoriaCombo.id,
      status: "CANCELADO",
    });

    expect(filtrados.some((t) => t.id === tituloBateOsDois.id)).toBe(true);
    expect(filtrados.some((t) => t.id === tituloSoCategoria.id)).toBe(false);
  });

  test("listarTitulos com filtro que não bate nada devolve lista vazia", async () => {
    const filtrados = await listarTitulos(fixture.filialId, "PAGAR", { vencimentoDe: new Date("2200-01-01") });
    expect(filtrados).toEqual([]);
  });
});
