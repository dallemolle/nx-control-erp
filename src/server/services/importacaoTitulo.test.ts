import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { validarCsv, confirmarImportacao } from "./importacaoTitulo";

describe("importação de títulos via CSV", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("IMP");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  function csvValido() {
    return [
      "contraparteId,documento,dataEmissao,dataCompetencia,categoriaFinanceiraId,centroCustoId,centroLucroId,safraId,projetoId,contaBancariaId,formaPagamento,numeroParcela,dataVencimento,valorOriginal",
      `${fixture.fornecedorId},NF-CSV-1,2026-08-01,2026-08-01,${fixture.categoriaFinanceiraId},,,,,,,1,2026-09-01,150.00`,
    ].join("\n");
  }

  test("validarCsv aceita uma linha bem formada sem erros", () => {
    const linhas = validarCsv(csvValido());
    expect(linhas).toHaveLength(1);
    expect(linhas[0].erros).toEqual([]);
  });

  test("validarCsv reporta erro em linha com valor inválido", () => {
    const csv = [
      "contraparteId,documento,dataEmissao,dataCompetencia,categoriaFinanceiraId,centroCustoId,centroLucroId,safraId,projetoId,contaBancariaId,formaPagamento,numeroParcela,dataVencimento,valorOriginal",
      `${fixture.fornecedorId},NF-CSV-2,2026-08-01,2026-08-01,${fixture.categoriaFinanceiraId},,,,,,,1,2026-09-01,-10`,
    ].join("\n");

    const linhas = validarCsv(csv);
    expect(linhas[0].erros.length).toBeGreaterThan(0);
  });

  test("confirmarImportacao cria os títulos quando todas as linhas são válidas", async () => {
    const linhas = validarCsv(csvValido());
    const criados = await confirmarImportacao(fixture.sessao, "PAGAR", linhas);

    expect(criados).toHaveLength(1);
    expect(criados[0].documento).toBe("NF-CSV-1");
  });

  test("confirmarImportacao rejeita tudo (nenhum título é criado) se qualquer linha tiver erro", async () => {
    const linhaValida = validarCsv(csvValido())[0];
    const linhaInvalida = { linha: 3, bruta: { ...linhaValida.bruta, valorOriginal: "-5" }, erros: ["inválido"] };

    const totalAntes = await prisma.titulo.count({ where: { filialId: fixture.filialId } });

    await expect(confirmarImportacao(fixture.sessao, "PAGAR", [linhaValida, linhaInvalida])).rejects.toThrow(
      "Existem linhas inválidas",
    );

    const totalDepois = await prisma.titulo.count({ where: { filialId: fixture.filialId } });
    expect(totalDepois).toBe(totalAntes);
  });
});
