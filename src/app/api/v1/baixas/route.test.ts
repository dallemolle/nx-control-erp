import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { criarTitulo } from "@/server/services/titulo";
import { POST } from "./route";

describe("POST /api/v1/baixas", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;
  let parcelaId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APIBAIXA", "TESOURARIA");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave tesouraria")).chaveCompleta;

    const titulo = await criarTitulo(fixture.sessaoAdmin, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-BAIXA-API",
      dataEmissao: new Date("2026-09-01"),
      dataCompetencia: new Date("2026-09-01"),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date("2026-10-01"), valorOriginal: 300 }],
    });
    parcelaId = titulo.parcelas[0].id;
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

  test("registra a baixa resolvendo conta bancária por agência+conta", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });

    const request = new Request("http://localhost/api/v1/baixas", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        parcelaId,
        data: "2026-09-30",
        valorPago: 300,
        contaBancariaAgencia: conta.agencia,
        contaBancariaConta: conta.conta,
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(201);
    const corpo = await resposta.json();
    expect(corpo.parcelaId).toBe(parcelaId);
    expect(corpo.statusAprovacao).toBe("PENDENTE");
  });

  test("parcelaId inexistente -> 404", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });

    const request = new Request("http://localhost/api/v1/baixas", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        parcelaId: "00000000-0000-0000-0000-000000000000",
        data: "2026-09-30",
        valorPago: 300,
        contaBancariaAgencia: conta.agencia,
        contaBancariaConta: conta.conta,
      }),
    });

    expect((await POST(request)).status).toBe(404);
  });

  test("conta bancária não encontrada -> 422 com campos de requisição", async () => {
    const request = new Request("http://localhost/api/v1/baixas", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        parcelaId,
        data: "2026-09-30",
        valorPago: 300,
        contaBancariaAgencia: "0000",
        contaBancariaConta: "0000-0",
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.campos).toContain("contaBancariaAgencia");
    expect(corpo.campos).toContain("contaBancariaConta");
  });

  test("POST com corpo que não é JSON válido -> 422, não 500", async () => {
    const request = new Request("http://localhost/api/v1/baixas", {
      method: "POST",
      headers: headers(),
      body: "{ isso não é json",
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
  });

  test("parcelaId ausente/não-string -> 422 com campo 'parcelaId'", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });

    const request = new Request("http://localhost/api/v1/baixas", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        data: "2026-09-30",
        valorPago: 300,
        contaBancariaAgencia: conta.agencia,
        contaBancariaConta: conta.conta,
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.campos).toContain("parcelaId");
  });
});
