import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { GET } from "./route";

describe("GET /api/v1/centros-de-lucro", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;
  let centroLucroId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APICL");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave teste")).chaveCompleta;
    const centro = await prisma.centroLucro.create({
      data: { filialId: fixture.filialId, nome: "Centro Lucro GET", codigo: "CL-GET" },
    });
    centroLucroId = centro.id;
  });

  afterAll(async () => {
    await prisma.centroLucro.delete({ where: { id: centroLucroId } });
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("lista os centros de lucro da filial", async () => {
    const request = new Request("http://localhost/api/v1/centros-de-lucro", {
      headers: {
        authorization: `Bearer ${chaveCompleta}`,
        "x-empresa-id": fixture.empresaId,
        "x-filial-id": fixture.filialId,
      },
    });

    const resposta = await GET(request);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.some((c: { id: string }) => c.id === centroLucroId)).toBe(true);
  });

  test("sem chave -> 401", async () => {
    const request = new Request("http://localhost/api/v1/centros-de-lucro", {
      headers: { "x-empresa-id": fixture.empresaId, "x-filial-id": fixture.filialId },
    });
    expect((await GET(request)).status).toBe(401);
  });
});
