import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { GET } from "./route";

describe("GET /api/v1/categorias-financeiras", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APICAT");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave teste")).chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("lista as categorias financeiras da filial", async () => {
    const request = new Request("http://localhost/api/v1/categorias-financeiras", {
      headers: {
        authorization: `Bearer ${chaveCompleta}`,
        "x-filial-cnpjcpf": fixture.filialCnpjCpf,
      },
    });

    const resposta = await GET(request);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.some((c: { id: string }) => c.id === fixture.categoriaFinanceiraId)).toBe(true);
  });

  test("sem chave -> 401", async () => {
    const request = new Request("http://localhost/api/v1/categorias-financeiras", {
      headers: { "x-filial-cnpjcpf": fixture.filialCnpjCpf },
    });
    expect((await GET(request)).status).toBe(401);
  });
});
