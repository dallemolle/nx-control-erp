import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import {
  carregarCadastrosParaResolucao,
  resolverContraparte,
  resolverCategoriaFinanceira,
  resolverCodigoOpcional,
  resolverContaBancariaOpcional,
  normalizarDocumento,
  normalizarChave,
} from "./resolucaoCadastros";

describe("resolução de cadastros por identificador natural", () => {
  let fixture: FixtureFinanceiro;
  let centroCustoId: string;
  const CENTRO_CUSTO_CODIGO = "CC-RES";

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("RES");
    const centro = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Centro Resolução", codigo: CENTRO_CUSTO_CODIGO },
    });
    centroCustoId = centro.id;
  });

  afterAll(async () => {
    await prisma.centroCusto.delete({ where: { id: centroCustoId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("normalizarDocumento remove pontuação", () => {
    expect(normalizarDocumento("11.222.333/0001-44")).toBe("11222333000144");
  });

  test("normalizarChave ignora maiúsculas/minúsculas e espaços nas pontas", () => {
    expect(normalizarChave("  Insumos Agrícolas  ")).toBe("insumos agrícolas");
  });

  test("resolverContraparte resolve por CNPJ ignorando pontuação", async () => {
    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: fixture.fornecedorId } });
    const cadastros = await carregarCadastrosParaResolucao(fixture.sessao, "PAGAR");

    const erros: string[] = [];
    const campos = new Set<string>();
    const id = resolverContraparte(cadastros, fornecedor.cnpjCpf.replace(/\D/g, ""), erros, campos);

    expect(id).toBe(fixture.fornecedorId);
    expect(erros).toEqual([]);
  });

  test("resolverContraparte não encontrado gera erro e marca o campo", async () => {
    const cadastros = await carregarCadastrosParaResolucao(fixture.sessao, "PAGAR");
    const erros: string[] = [];
    const campos = new Set<string>();

    const id = resolverContraparte(cadastros, "00000000000000", erros, campos);

    expect(id).toBe("");
    expect(erros).toEqual([expect.stringContaining("não encontrado")]);
    expect(campos.has("cnpjCpf")).toBe(true);
  });

  test("resolverContraparte com entrada vazia não gera erro", async () => {
    const cadastros = await carregarCadastrosParaResolucao(fixture.sessao, "PAGAR");
    const erros: string[] = [];
    const campos = new Set<string>();

    const id = resolverContraparte(cadastros, "", erros, campos);

    expect(id).toBe("");
    expect(erros).toEqual([]);
    expect(campos.size).toBe(0);
  });

  test("resolverCategoriaFinanceira resolve por nome", async () => {
    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });
    const cadastros = await carregarCadastrosParaResolucao(fixture.sessao, "PAGAR");
    const erros: string[] = [];
    const campos = new Set<string>();

    const id = resolverCategoriaFinanceira(cadastros, categoria.nome.toUpperCase(), erros, campos);

    expect(id).toBe(fixture.categoriaFinanceiraId);
    expect(erros).toEqual([]);
  });

  test("resolverCodigoOpcional resolve centro de custo por código, e vazio não gera erro", async () => {
    const cadastros = await carregarCadastrosParaResolucao(fixture.sessao, "PAGAR");
    const erros: string[] = [];
    const campos = new Set<string>();

    const id = resolverCodigoOpcional(
      cadastros.mapaCentroCusto,
      CENTRO_CUSTO_CODIGO,
      "Centro de custo",
      "centroCusto",
      erros,
      campos,
    );
    expect(id).toBe(centroCustoId);
    expect(erros).toEqual([]);
    expect(campos.size).toBe(0);

    const vazio = resolverCodigoOpcional(
      cadastros.mapaCentroCusto,
      undefined,
      "Centro de custo",
      "centroCusto",
      erros,
      campos,
    );
    expect(vazio).toBe("");
    expect(erros).toEqual([]);
  });

  test("resolverCodigoOpcional não encontrado gera erro e marca o campo informado", async () => {
    const cadastros = await carregarCadastrosParaResolucao(fixture.sessao, "PAGAR");
    const erros: string[] = [];
    const campos = new Set<string>();

    const id = resolverCodigoOpcional(
      cadastros.mapaCentroCusto,
      "CC-INEXISTENTE",
      "Centro de custo",
      "centroCusto",
      erros,
      campos,
    );
    expect(id).toBe("");
    expect(erros).toEqual([expect.stringContaining("não encontrado")]);
    expect(campos.has("centroCusto")).toBe(true);
  });

  test("resolverContaBancariaOpcional exige agência e conta juntas", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });
    const cadastros = await carregarCadastrosParaResolucao(fixture.sessao, "PAGAR");

    const erros1: string[] = [];
    const campos1 = new Set<string>();
    const id = resolverContaBancariaOpcional(cadastros, conta.agencia, conta.conta, erros1, campos1);
    expect(id).toBe(fixture.contaBancariaId);
    expect(erros1).toEqual([]);
    expect(campos1.size).toBe(0);

    const erros2: string[] = [];
    const campos2 = new Set<string>();
    resolverContaBancariaOpcional(cadastros, conta.agencia, undefined, erros2, campos2);
    expect(erros2).toEqual([expect.stringContaining("Informe agência e conta bancária juntas")]);
    expect(campos2.has("contaBancariaAgencia")).toBe(true);
    expect(campos2.has("contaBancariaConta")).toBe(true);
  });
});
