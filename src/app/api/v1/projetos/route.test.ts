import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { GET } from "./route";

describe("GET /api/v1/projetos", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;
  let projetoId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APIPROJ");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave teste")).chaveCompleta;
    const projeto = await prisma.projeto.create({
      data: { filialId: fixture.filialId, nome: "Projeto GET", codigo: "PRJ-GET" },
    });
    projetoId = projeto.id;
  });

  afterAll(async () => {
    await prisma.projeto.delete({ where: { id: projetoId } });
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("lista os projetos da filial", async () => {
    const request = new Request("http://localhost/api/v1/projetos", {
      headers: {
        authorization: `Bearer ${chaveCompleta}`,
        "x-filial-cnpjcpf": fixture.filialCnpjCpf,
      },
    });

    const resposta = await GET(request);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.some((p: { id: string }) => p.id === projetoId)).toBe(true);
  });

  test("sem chave -> 401", async () => {
    const request = new Request("http://localhost/api/v1/projetos", {
      headers: { "x-filial-cnpjcpf": fixture.filialCnpjCpf },
    });
    expect((await GET(request)).status).toBe(401);
  });
});
