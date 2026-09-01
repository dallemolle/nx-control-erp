import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string) => ({ url: `https://blob.test/${pathname}` })),
  del: vi.fn(async () => undefined),
}));

import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import { adicionarAnexo, removerAnexo, listarAnexos } from "./anexo";

describe("anexo (Vercel Blob mockado — não é o banco de dados)", () => {
  let fixture: FixtureFinanceiro;
  let tituloId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("ANEX");
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-ANEXO",
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
    tituloId = titulo.id;
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("adiciona um anexo e grava o metadado no banco", async () => {
    const arquivo = new File([Buffer.from("conteudo")], "nota.pdf", { type: "application/pdf" });
    const anexo = await adicionarAnexo(fixture.sessao, tituloId, arquivo);

    expect(anexo.nomeArquivo).toBe("nota.pdf");
    expect(anexo.url).toContain("blob.test");

    const anexos = await listarAnexos(tituloId);
    expect(anexos).toHaveLength(1);
  });

  test("remove um anexo", async () => {
    const arquivo = new File([Buffer.from("conteudo 2")], "boleto.pdf", { type: "application/pdf" });
    const anexo = await adicionarAnexo(fixture.sessao, tituloId, arquivo);

    await removerAnexo(fixture.sessao, anexo.id);

    const anexos = await listarAnexos(tituloId);
    expect(anexos.find((item) => item.id === anexo.id)).toBeUndefined();
  });
});
