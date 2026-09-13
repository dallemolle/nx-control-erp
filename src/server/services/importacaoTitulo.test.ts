import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { validarCsv, confirmarImportacao } from "./importacaoTitulo";

describe("importação de títulos via CSV", () => {
  let fixture: FixtureFinanceiro;
  let fornecedorCnpj: string;
  let categoriaNome: string;
  let centroCustoCodigo: string;
  let centroCustoId: string;
  let contaAgencia: string;
  let contaConta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("IMP");

    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: fixture.fornecedorId } });
    fornecedorCnpj = fornecedor.cnpjCpf;

    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({
      where: { id: fixture.categoriaFinanceiraId },
    });
    categoriaNome = categoria.nome;

    const contaBancaria = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });
    contaAgencia = contaBancaria.agencia;
    contaConta = contaBancaria.conta;

    centroCustoCodigo = "CC-IMP";
    const centroCusto = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Centro CSV", codigo: centroCustoCodigo },
    });
    centroCustoId = centroCusto.id;
  });

  afterAll(async () => {
    await prisma.centroCusto.delete({ where: { id: centroCustoId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  function cabecalho() {
    return "cnpjCpf,documento,dataEmissao,dataCompetencia,categoriaFinanceira,centroCusto,centroLucro,safra,projeto,contaBancariaAgencia,contaBancariaConta,formaPagamento,numeroParcela,dataVencimento,valorOriginal";
  }

  function csvValido() {
    return [
      cabecalho(),
      `${fornecedorCnpj},NF-CSV-1,2026-08-01,2026-08-01,${categoriaNome},,,,,,,,1,2026-09-01,150.00`,
    ].join("\n");
  }

  test("validarCsv aceita uma linha bem formada sem erros, resolvendo CNPJ e nome da categoria", async () => {
    const linhas = await validarCsv(fixture.sessao, "PAGAR", csvValido());
    expect(linhas).toHaveLength(1);
    expect(linhas[0].erros).toEqual([]);
  });

  test("validarCsv resolve centro de custo pelo código e conta bancária por agência+conta", async () => {
    const csv = [
      cabecalho(),
      `${fornecedorCnpj},NF-CSV-2,2026-08-01,2026-08-01,${categoriaNome},${centroCustoCodigo},,,,${contaAgencia},${contaConta},PIX,1,2026-09-01,200.00`,
    ].join("\n");

    const linhas = await validarCsv(fixture.sessao, "PAGAR", csv);
    expect(linhas[0].erros).toEqual([]);
  });

  test("validarCsv reporta erro claro quando CNPJ/CPF não é encontrado", async () => {
    const csv = [cabecalho(), `00.000.000/0000-00,NF-CSV-3,2026-08-01,2026-08-01,${categoriaNome},,,,,,,,1,2026-09-01,150.00`].join(
      "\n",
    );

    const linhas = await validarCsv(fixture.sessao, "PAGAR", csv);
    expect(linhas[0].erros).toEqual([expect.stringContaining("não encontrado")]);
  });

  test("validarCsv reporta erro claro quando categoria financeira não é encontrada", async () => {
    const csv = [cabecalho(), `${fornecedorCnpj},NF-CSV-4,2026-08-01,2026-08-01,Categoria Inexistente,,,,,,,,1,2026-09-01,150.00`].join(
      "\n",
    );

    const linhas = await validarCsv(fixture.sessao, "PAGAR", csv);
    expect(linhas[0].erros).toEqual([expect.stringContaining('Categoria financeira "Categoria Inexistente" não encontrada')]);
  });

  test("validarCsv reporta erro em linha com valor inválido", async () => {
    const csv = [
      cabecalho(),
      `${fornecedorCnpj},NF-CSV-5,2026-08-01,2026-08-01,${categoriaNome},,,,,,,,1,2026-09-01,-10`,
    ].join("\n");

    const linhas = await validarCsv(fixture.sessao, "PAGAR", csv);
    expect(linhas[0].erros.length).toBeGreaterThan(0);
  });

  test("confirmarImportacao cria os títulos quando todas as linhas são válidas", async () => {
    const linhas = await validarCsv(fixture.sessao, "PAGAR", csvValido());
    const criados = await confirmarImportacao(fixture.sessao, "PAGAR", linhas);

    expect(criados).toHaveLength(1);
    expect(criados[0].documento).toBe("NF-CSV-1");
  });

  test("confirmarImportacao rejeita tudo (nenhum título é criado) se qualquer linha tiver erro", async () => {
    const linhaValida = (await validarCsv(fixture.sessao, "PAGAR", csvValido()))[0];
    const linhaInvalida = { linha: 3, bruta: { ...linhaValida.bruta, valorOriginal: "-5" }, erros: ["inválido"] };

    const totalAntes = await prisma.titulo.count({ where: { filialId: fixture.filialId } });

    await expect(confirmarImportacao(fixture.sessao, "PAGAR", [linhaValida, linhaInvalida])).rejects.toThrow(
      "Existem linhas inválidas",
    );

    const totalDepois = await prisma.titulo.count({ where: { filialId: fixture.filialId } });
    expect(totalDepois).toBe(totalAntes);
  });
});
