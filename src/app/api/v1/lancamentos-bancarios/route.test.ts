import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { POST, GET } from "./route";

describe("POST/GET /api/v1/lancamentos-bancarios", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APILAN", "TESOURARIA");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave tesouraria")).chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  function headers() {
    return {
      authorization: `Bearer ${chaveCompleta}`,
      "x-empresa-id": fixture.empresaId,
      "x-filial-id": fixture.filialId,
      "content-type": "application/json",
    };
  }

  test("cria lançamento manual resolvendo conta bancária por agência+conta", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });

    const request = new Request("http://localhost/api/v1/lancamentos-bancarios", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        contaBancariaAgencia: conta.agencia,
        contaBancariaConta: conta.conta,
        data: "2026-09-10",
        tipo: "ENTRADA",
        valor: 1000,
        descricao: "Lançamento via API",
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(201);
    const corpo = await resposta.json();
    expect(corpo.descricao).toBe("Lançamento via API");
    expect(corpo.contaBancariaId).toBe(fixture.contaBancariaId);
  });

  test("conta bancária não encontrada -> 422", async () => {
    const request = new Request("http://localhost/api/v1/lancamentos-bancarios", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        contaBancariaAgencia: "9999",
        contaBancariaConta: "9999-9",
        data: "2026-09-10",
        tipo: "ENTRADA",
        valor: 1000,
        descricao: "Não deve criar",
      }),
    });

    expect((await POST(request)).status).toBe(422);
  });

  test("GET lista os lançamentos da filial", async () => {
    const request = new Request("http://localhost/api/v1/lancamentos-bancarios", { headers: headers() });
    const resposta = await GET(request);

    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.some((l: { descricao: string }) => l.descricao === "Lançamento via API")).toBe(true);
  });

  test("POST com corpo que não é JSON válido -> 422, não 500", async () => {
    const request = new Request("http://localhost/api/v1/lancamentos-bancarios", {
      method: "POST",
      headers: headers(),
      body: "{ isso não é json",
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
  });

  test("centro de custo não encontrado -> 422 com campo 'centroCusto' (nome de requisição, não interno)", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });

    const request = new Request("http://localhost/api/v1/lancamentos-bancarios", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        contaBancariaAgencia: conta.agencia,
        contaBancariaConta: conta.conta,
        data: "2026-09-10",
        tipo: "ENTRADA",
        valor: 1000,
        descricao: "Não deve criar",
        centroCusto: "CC-INEXISTENTE-API-LAN",
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.campos).toContain("centroCusto");
  });
});
