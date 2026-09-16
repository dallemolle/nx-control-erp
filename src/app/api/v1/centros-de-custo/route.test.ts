import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { GET } from "./route";

describe("GET /api/v1/centros-de-custo", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;
  let centroCustoId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APICC");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave teste")).chaveCompleta;
    const centro = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Centro GET", codigo: "CC-GET" },
    });
    centroCustoId = centro.id;
  });

  afterAll(async () => {
    await prisma.centroCusto.delete({ where: { id: centroCustoId } });
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("lista os centros de custo da filial", async () => {
    const request = new Request("http://localhost/api/v1/centros-de-custo", {
      headers: {
        authorization: `Bearer ${chaveCompleta}`,
        "x-empresa-id": fixture.empresaId,
        "x-filial-id": fixture.filialId,
      },
    });

    const resposta = await GET(request);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.some((c: { id: string }) => c.id === centroCustoId)).toBe(true);
  });

  test("sem chave -> 401", async () => {
    const request = new Request("http://localhost/api/v1/centros-de-custo", {
      headers: { "x-empresa-id": fixture.empresaId, "x-filial-id": fixture.filialId },
    });
    expect((await GET(request)).status).toBe(401);
  });
});
