import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { GET } from "./route";

describe("GET /api/v1/contas-bancarias", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APICB");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave teste")).chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("lista as contas bancárias da filial", async () => {
    const request = new Request("http://localhost/api/v1/contas-bancarias", {
      headers: {
        authorization: `Bearer ${chaveCompleta}`,
        "x-empresa-id": fixture.empresaId,
        "x-filial-id": fixture.filialId,
      },
    });

    const resposta = await GET(request);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.some((c: { id: string }) => c.id === fixture.contaBancariaId)).toBe(true);
  });

  test("sem chave -> 401", async () => {
    const request = new Request("http://localhost/api/v1/contas-bancarias", {
      headers: { "x-empresa-id": fixture.empresaId, "x-filial-id": fixture.filialId },
    });
    expect((await GET(request)).status).toBe(401);
  });
});
