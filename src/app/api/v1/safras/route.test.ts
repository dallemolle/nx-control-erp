import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { GET } from "./route";

describe("GET /api/v1/safras", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;
  let safraId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APISAF");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave teste")).chaveCompleta;
    const safra = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra GET",
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2026-12-31"),
      },
    });
    safraId = safra.id;
  });

  afterAll(async () => {
    await prisma.safra.delete({ where: { id: safraId } });
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("lista as safras da filial", async () => {
    const request = new Request("http://localhost/api/v1/safras", {
      headers: {
        authorization: `Bearer ${chaveCompleta}`,
        "x-filial-cnpjcpf": fixture.filialCnpjCpf,
      },
    });

    const resposta = await GET(request);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.some((s: { id: string }) => s.id === safraId)).toBe(true);
  });

  test("sem chave -> 401", async () => {
    const request = new Request("http://localhost/api/v1/safras", {
      headers: { "x-filial-cnpjcpf": fixture.filialCnpjCpf },
    });
    expect((await GET(request)).status).toBe(401);
  });
});
