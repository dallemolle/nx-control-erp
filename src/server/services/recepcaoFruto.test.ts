import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { FilialSomenteLeituraError, PermissionError } from "@/server/auth/permissions";
import { recepcaoSchema } from "@/lib/schemas/recepcao";
import {
  criarCatalogoDeTeste,
  criarFixtureProducao,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "./producaoTestFixtures";
import {
  atualizarDadosRecepcao,
  cancelarRecepcao,
  criarRecepcao,
  listarRecepcoes,
  situacaoParaCancelar,
  situacoesParaCancelar,
} from "./recepcaoFruto";
import { registrarMovimento } from "./estoque";

const MSG_SEM_CATEGORIA =
  "Configure a categoria de compra de fruto em Administração → Configuração de produção";

describe("recepção de fruto", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;

  const propria = (extra: Record<string, unknown> = {}) =>
    recepcaoSchema.parse({
      data: "2026-11-09",
      produtoId: cat.produtoFrutoId,
      origem: "PROPRIA",
      talhaoId: cat.talhaoId,
      localId: cat.localRecepcaoId,
      unidade: "KG",
      pesoBruto: "56",
      descarte: "3",
      ...extra,
    });

  const terceiro = (extra: Record<string, unknown> = {}) =>
    recepcaoSchema.parse({
      data: "2026-11-09",
      produtoId: cat.produtoFrutoId,
      origem: "TERCEIRO",
      fornecedorId: cat.fornecedorId,
      localId: cat.localRecepcaoId,
      unidade: "COMERCIAL",
      pesoBruto: "4",
      descarte: "0",
      preco: "60",
      ...extra,
    });

  const contar = async () => ({
    lotes: await prisma.lote.count({ where: { filialId: fx.filialAId } }),
    movimentos: await prisma.movimentoEstoque.count({ where: { filialId: fx.filialAId } }),
    recepcoes: await prisma.recepcaoFruto.count({ where: { filialId: fx.filialAId } }),
  });

  beforeAll(async () => {
    fx = await criarFixtureProducao("recepcao");
    cat = await criarCatalogoDeTeste(fx);
  });
  afterAll(async () => {
    await fx.limpar();
  });

  beforeEach(async () => {
    await prisma.configuracaoProducao.upsert({
      where: { filialId: fx.filialAId },
      create: { filialId: fx.filialAId, categoriaCompraFrutoId: cat.categoriaCompraId, prazoPagamentoProdutorDias: 7 },
      update: { categoriaCompraFrutoId: cat.categoriaCompraId, prazoPagamentoProdutorDias: 7 },
    });
  });

  test("própria: lote com custo-padrão da fruta, entrada no estoque e sem título", async () => {
    const r = await criarRecepcao(fx.sessao("PRODUCAO"), propria());
    const lote = await prisma.lote.findUniqueOrThrow({ where: { id: r.loteId } });
    expect(Number(lote.custoKg)).toBe(1.5);
    expect(Number(lote.saldoKg)).toBe(53);
    expect(Number(lote.quantidadeInicialKg)).toBe(53);
    expect(lote.localId).toBe(cat.localRecepcaoId);
    expect(r.tituloId).toBeNull();
    const movimentos = await prisma.movimentoEstoque.findMany({ where: { loteId: r.loteId } });
    expect(movimentos.map((m) => [m.tipo, Number(m.quantidadeKg)])).toEqual([["ENTRADA", 53]]);
  });

  test("data 2026-11-09 com validade de 1 dia: número FA-261109-NN e validade 2026-11-10", async () => {
    const primeira = await criarRecepcao(fx.sessao("PRODUCAO"), propria({ data: "2026-11-10" }));
    const segunda = await criarRecepcao(fx.sessao("PRODUCAO"), propria({ data: "2026-11-10" }));
    expect(primeira.codigoLote).toBe("FA-261110-01");
    expect(segunda.codigoLote).toBe("FA-261110-02");
    const lote = await prisma.lote.findUniqueOrThrow({ where: { id: primeira.loteId } });
    expect(lote.data.toISOString().slice(0, 10)).toBe("2026-11-10");
    expect(lote.validade.toISOString().slice(0, 10)).toBe("2026-11-11");
  });

  test("recepções simultâneas do mesmo produto e dia recebem números diferentes", async () => {
    const resultados = await Promise.all(
      [1, 2, 3].map(() => criarRecepcao(fx.sessao("PRODUCAO"), propria({ data: "2026-11-12" }))),
    );
    expect(resultados.map((r) => r.codigoLote).sort()).toEqual(["FA-261112-01", "FA-261112-02", "FA-261112-03"]);
  });

  test("terceiro em rasas: 4 rasas a R$ 60 = 56 kg, R$ 240,00 e conta a pagar", async () => {
    const r = await criarRecepcao(fx.sessao("PRODUCAO"), terceiro());
    const recepcao = await prisma.recepcaoFruto.findUniqueOrThrow({ where: { id: r.recepcaoId } });
    expect(Number(recepcao.pesoBrutoKg)).toBe(56);
    expect(Number(recepcao.valorTotal)).toBe(240);
    expect(Number(recepcao.precoKg)).toBe(4.2857);
    const titulo = await prisma.titulo.findUniqueOrThrow({ where: { id: r.tituloId! }, include: { parcelas: true } });
    expect(titulo).toMatchObject({
      tipo: "PAGAR",
      fornecedorId: cat.fornecedorId,
      categoriaFinanceiraId: cat.categoriaCompraId,
      documento: `RF-${r.codigoLote}`,
      classificacaoFiscal: "GERENCIAL",
      tipoComprovante: "RECIBO",
    });
    expect(titulo.parcelas).toHaveLength(1);
    expect(Number(titulo.parcelas[0].valorOriginal)).toBe(240);
    expect(titulo.parcelas[0].dataVencimento.toISOString().slice(0, 10)).toBe("2026-11-16");
  });

  test("terceiro fiscal grava NF_PRODUTOR com o número e o documento informado", async () => {
    const r = await criarRecepcao(
      fx.sessao("PRODUCAO"),
      terceiro({ classificacaoFiscal: "FISCAL", numeroNotaProdutor: "1234", documento: "Romaneio 77" }),
    );
    const titulo = await prisma.titulo.findUniqueOrThrow({ where: { id: r.tituloId! } });
    expect(titulo).toMatchObject({
      classificacaoFiscal: "FISCAL",
      tipoComprovante: "NF_PRODUTOR",
      numeroDocumentoFiscal: "1234",
      documento: "Romaneio 77",
    });
  });

  test("vencimento informado sobrescreve o prazo padrão", async () => {
    const r = await criarRecepcao(fx.sessao("PRODUCAO"), terceiro({ dataVencimento: "2026-11-30" }));
    const parcela = await prisma.parcela.findFirstOrThrow({ where: { tituloId: r.tituloId! } });
    expect(parcela.dataVencimento.toISOString().slice(0, 10)).toBe("2026-11-30");
  });

  test("terceiro com preço 0 não cria título nem exige categoria", async () => {
    await prisma.configuracaoProducao.update({
      where: { filialId: fx.filialAId },
      data: { categoriaCompraFrutoId: null },
    });
    const r = await criarRecepcao(fx.sessao("PRODUCAO"), terceiro({ preco: "0" }));
    expect(r.tituloId).toBeNull();
  });

  test("terceiro com valor e sem categoria configurada é recusado", async () => {
    await prisma.configuracaoProducao.update({
      where: { filialId: fx.filialAId },
      data: { categoriaCompraFrutoId: null },
    });
    await expect(criarRecepcao(fx.sessao("PRODUCAO"), terceiro())).rejects.toThrow(MSG_SEM_CATEGORIA);
  });

  test("descarte igual ao bruto é recusado e nada é gravado", async () => {
    const antes = await contar();
    await expect(criarRecepcao(fx.sessao("PRODUCAO"), propria({ pesoBruto: "10", descarte: "10" }))).rejects.toThrow(
      "O peso líquido precisa ser maior que zero",
    );
    expect(await contar()).toEqual(antes);
  });

  test("unidade comercial em produto sem fator é recusada", async () => {
    const semFator = await prisma.produto.create({
      data: {
        empresaId: fx.empresaId,
        codigo: "FX",
        descricao: "Fruto sem rasa",
        categoria: "FRUTO",
        frutaId: cat.frutaId,
        conservacao: "IN_NATURA",
        validadeDias: 2,
      },
    });
    await expect(
      criarRecepcao(fx.sessao("PRODUCAO"), propria({ produtoId: semFator.id, unidade: "COMERCIAL" })),
    ).rejects.toThrow("Este produto não tem unidade comercial; lance em kg");
  });

  test("falha no título não deixa lote, movimento nem recepção", async () => {
    await criarRecepcao(fx.sessao("PRODUCAO"), terceiro({ classificacaoFiscal: "FISCAL", numeroNotaProdutor: "9999" }));
    const antes = await contar();
    await expect(
      criarRecepcao(fx.sessao("PRODUCAO"), terceiro({ classificacaoFiscal: "FISCAL", numeroNotaProdutor: "9999" })),
    ).rejects.toThrow();
    expect(await contar()).toEqual(antes);
  });

  test("recusa produto de polpa, talhão de outra fruta e fornecedor de outra empresa", async () => {
    await expect(criarRecepcao(fx.sessao("PRODUCAO"), propria({ produtoId: cat.produtoPolpaId }))).rejects.toThrow(
      "Produto de fruto não encontrado ou inativo",
    );
    const acerola = await prisma.fruta.create({ data: { empresaId: fx.empresaId, nome: "Acerola" } });
    const talhaoAcerola = await prisma.talhao.create({
      data: { filialId: fx.filialAId, nome: "Talhão acerola", frutaId: acerola.id, areaHa: 1 },
    });
    await expect(criarRecepcao(fx.sessao("PRODUCAO"), propria({ talhaoId: talhaoAcerola.id }))).rejects.toThrow(
      "Talhão não encontrado, inativo ou de outra fruta",
    );
    const alheio = await prisma.fornecedor.create({
      data: { empresaId: fx.outraEmpresaId, nome: "Alheio", cnpjCpf: "999.888.777-66" },
    });
    await expect(criarRecepcao(fx.sessao("PRODUCAO"), terceiro({ fornecedorId: alheio.id }))).rejects.toThrow(
      "Fornecedor não encontrado ou inativo",
    );
  });

  test("VENDAS e CONSULTA não lançam; filial somente leitura é recusada", async () => {
    await expect(criarRecepcao(fx.sessao("VENDAS"), propria())).rejects.toThrow(PermissionError);
    await expect(criarRecepcao(fx.sessao("CONSULTA"), propria())).rejects.toThrow(PermissionError);
    await expect(criarRecepcao(fx.sessao("PRODUCAO", { somenteLeitura: true }), propria())).rejects.toThrow(
      FilialSomenteLeituraError,
    );
  });

  test("cancelar zera o lote, cancela as parcelas e marca a recepção", async () => {
    const r = await criarRecepcao(fx.sessao("PRODUCAO"), terceiro());
    expect(await situacaoParaCancelar(r.recepcaoId)).toEqual({ podeCancelar: true });
    await cancelarRecepcao(fx.sessao("PRODUCAO"), r.recepcaoId, "Peso lançado errado");

    const lote = await prisma.lote.findUniqueOrThrow({ where: { id: r.loteId } });
    expect(Number(lote.saldoKg)).toBe(0);
    const movimentos = await prisma.movimentoEstoque.findMany({ where: { loteId: r.loteId }, orderBy: { criadoEm: "asc" } });
    expect(movimentos.map((m) => [m.tipo, Number(m.quantidadeKg)])).toEqual([
      ["ENTRADA", 56],
      ["ESTORNO_RECEPCAO", -56],
    ]);
    const parcelas = await prisma.parcela.findMany({ where: { tituloId: r.tituloId! } });
    expect(parcelas.every((p) => p.status === "CANCELADO")).toBe(true);
    const recepcao = await prisma.recepcaoFruto.findUniqueOrThrow({ where: { id: r.recepcaoId } });
    expect(recepcao).toMatchObject({ status: "CANCELADA", motivoCancelamento: "Peso lançado errado" });
    expect((await situacaoParaCancelar(r.recepcaoId)).podeCancelar).toBe(false);
  });

  test("cancelar é recusado depois de um ajuste no lote", async () => {
    const r = await criarRecepcao(fx.sessao("PRODUCAO"), propria());
    await prisma.$transaction((tx) =>
      registrarMovimento(tx, {
        filialId: fx.filialAId,
        loteId: r.loteId,
        data: new Date("2026-11-09"),
        tipo: "AJUSTE",
        quantidadeKg: -1,
        usuarioId: fx.usuarioId,
      }),
    );
    await expect(cancelarRecepcao(fx.sessao("PRODUCAO"), r.recepcaoId, "Erro")).rejects.toThrow(
      "O lote já teve movimentação; não é possível excluir a recepção",
    );
  });

  test("cancelar é recusado com pagamento registrado", async () => {
    const r = await criarRecepcao(fx.sessao("PRODUCAO"), terceiro());
    const parcela = await prisma.parcela.findFirstOrThrow({ where: { tituloId: r.tituloId! } });
    const banco = await prisma.banco.findFirstOrThrow();
    const conta = await prisma.contaBancaria.create({
      data: { filialId: fx.filialAId, bancoId: banco.id, agencia: "1", conta: `C-${Date.now()}`, tipo: "CORRENTE" },
    });
    await prisma.baixa.create({
      data: {
        parcelaId: parcela.id,
        data: new Date("2026-11-10"),
        valorPago: 240,
        contaBancariaId: conta.id,
        usuarioId: fx.usuarioId,
      },
    });
    await expect(cancelarRecepcao(fx.sessao("PRODUCAO"), r.recepcaoId, "Erro")).rejects.toThrow(
      "A conta a pagar já tem pagamento registrado; não é possível excluir a recepção",
    );
  });

  test("atualizarDadosRecepcao muda só qualidade, documento e observação, com auditoria", async () => {
    const r = await criarRecepcao(fx.sessao("PRODUCAO"), propria());
    await atualizarDadosRecepcao(fx.sessao("PRODUCAO"), r.recepcaoId, {
      qualidade: "A",
      documento: "Romaneio 5",
      observacao: "Chegou úmido",
    });
    const recepcao = await prisma.recepcaoFruto.findUniqueOrThrow({ where: { id: r.recepcaoId } });
    expect(recepcao).toMatchObject({ qualidade: "A", documento: "Romaneio 5", observacao: "Chegou úmido" });
    expect(await prisma.auditLog.count({ where: { entidadeId: r.recepcaoId, acao: "ATUALIZAR" } })).toBe(1);
  });

  test("listarRecepcoes filtra por período, fruta e origem, só da filial", async () => {
    const lista = await listarRecepcoes(fx.filialAId, {
      inicio: new Date("2026-11-09"),
      fim: new Date("2026-11-09"),
      origem: "TERCEIRO",
    });
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every((r) => r.origem === "TERCEIRO")).toBe(true);
    expect(lista.every((r) => r.data.toISOString().slice(0, 10) === "2026-11-09")).toBe(true);
    expect(lista[0].lote.codigo).toMatch(/^FA-261109-/);
    expect(lista[0].fornecedor?.nome).toBe("Produtor exemplo");
    const outraFruta = await prisma.fruta.findFirstOrThrow({ where: { empresaId: fx.empresaId, nome: "Acerola" } });
    expect(
      await listarRecepcoes(fx.filialAId, {
        inicio: new Date("2026-11-01"),
        fim: new Date("2026-11-30"),
        frutaId: outraFruta.id,
      }),
    ).toEqual([]);
    expect(
      await listarRecepcoes(fx.filialBId, { inicio: new Date("2026-11-01"), fim: new Date("2026-11-30") }),
    ).toEqual([]);
  });
});

describe("situacoesParaCancelar (lista)", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  beforeAll(async () => {
    fx = await criarFixtureProducao("recepcaosituacao");
    cat = await criarCatalogoDeTeste(fx);
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("marca a que teve saída e libera a que não teve, igual à checagem unitária", async () => {
    const dados = recepcaoSchema.parse({
      data: "2026-11-09",
      produtoId: cat.produtoFrutoId,
      origem: "PROPRIA",
      talhaoId: cat.talhaoId,
      localId: cat.localRecepcaoId,
      pesoBruto: "20",
    });
    const livre = await criarRecepcao(fx.sessao("PRODUCAO"), dados);
    const usada = await criarRecepcao(fx.sessao("PRODUCAO"), dados);
    await prisma.$transaction((tx) =>
      registrarMovimento(tx, {
        filialId: fx.filialAId,
        loteId: usada.loteId,
        data: new Date("2026-11-09"),
        tipo: "AJUSTE",
        quantidadeKg: -1,
        usuarioId: fx.usuarioId,
      }),
    );
    const recepcoes = await prisma.recepcaoFruto.findMany({ where: { id: { in: [livre.recepcaoId, usada.recepcaoId] } } });
    const situacoes = await situacoesParaCancelar(recepcoes);
    expect(situacoes.get(livre.recepcaoId)).toEqual(await situacaoParaCancelar(livre.recepcaoId));
    expect(situacoes.get(usada.recepcaoId)).toEqual(await situacaoParaCancelar(usada.recepcaoId));
    expect(situacoes.get(usada.recepcaoId)?.podeCancelar).toBe(false);
  });
});
