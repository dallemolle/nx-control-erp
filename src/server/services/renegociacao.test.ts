import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import { renegociarParcela } from "./renegociacao";

describe("renegociarParcela", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("RENEG");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("marca a parcela original como RENEGOCIADO e cria novas parcelas linkadas", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-RENEG",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date("2020-01-01"), valorOriginal: 1000 }],
    });
    const original = titulo.parcelas[0];

    const novas = await renegociarParcela(fixture.sessao, original.id, [
      { dataVencimento: new Date("2099-01-01"), valorOriginal: 500 },
      { dataVencimento: new Date("2099-02-01"), valorOriginal: 500 },
    ]);

    expect(novas).toHaveLength(2);
    expect(novas.every((parcela) => parcela.parcelaOrigemId === original.id)).toBe(true);
    expect(novas.map((parcela) => parcela.numero)).toEqual([2, 3]);

    const originalAtualizada = await prisma.parcela.findUniqueOrThrow({ where: { id: original.id } });
    expect(originalAtualizada.status).toBe("RENEGOCIADO");
  });

  test("rejeita renegociação sem nenhuma parcela nova", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-RENEG-VAZIO",
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

    await expect(renegociarParcela(fixture.sessao, titulo.parcelas[0].id, [])).rejects.toThrow(
      "Informe ao menos uma nova parcela",
    );
  });
});
