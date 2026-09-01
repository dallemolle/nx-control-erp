import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string) => ({ url: `https://blob.test/${pathname}` })),
  del: vi.fn(async () => undefined),
}));

import { put } from "@vercel/blob";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import { adicionarAnexo, removerAnexo, listarAnexos, TAMANHO_MAXIMO_ANEXO_BYTES } from "./anexo";

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

    // O blob precisa ser privado (a leitura passa pela rota autenticada) e sobrescrever
    // a versão anterior: o put() do @vercel/blob v2 estoura se o pathname já existir.
    expect(put).toHaveBeenLastCalledWith(`titulos/${tituloId}/nota.pdf`, arquivo, {
      access: "private",
      allowOverwrite: true,
    });

    const anexos = await listarAnexos(fixture.filialId, tituloId);
    expect(anexos).toHaveLength(1);
  });

  test("remove um anexo", async () => {
    const arquivo = new File([Buffer.from("conteudo 2")], "boleto.pdf", { type: "application/pdf" });
    const anexo = await adicionarAnexo(fixture.sessao, tituloId, arquivo);

    await removerAnexo(fixture.sessao, anexo.id);

    const anexos = await listarAnexos(fixture.filialId, tituloId);
    expect(anexos.find((item) => item.id === anexo.id)).toBeUndefined();
  });

  test("rejeita arquivo acima do limite de tamanho", async () => {
    const grande = new File([new Uint8Array(TAMANHO_MAXIMO_ANEXO_BYTES + 1)], "gigante.pdf", {
      type: "application/pdf",
    });

    await expect(adicionarAnexo(fixture.sessao, tituloId, grande)).rejects.toThrow(/limite/i);
  });

  test("listarAnexos não vaza anexos de outra filial", async () => {
    const filialIrma = await prisma.filial.create({
      data: { empresaId: fixture.empresaId, nome: "Filial Irma ANEX", cnpj: "11.111.ANEX/0001-99" },
    });

    const anexos = await listarAnexos(filialIrma.id, tituloId);
    expect(anexos).toHaveLength(0);

    await prisma.filial.delete({ where: { id: filialIrma.id } });
  });
});
