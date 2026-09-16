import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave, revogarChave } from "@/server/services/apiKey";
import { requireSessaoApi, ApiAuthError } from "./sessaoApi";

function requisicao(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/v1/teste", { headers });
}

describe("requireSessaoApi", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("SESAPI");
    const gerada = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave de teste");
    chaveCompleta = gerada.chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("chave válida resolve a sessão do usuário dono da chave", async () => {
    const sessao = await requireSessaoApi(
      requisicao({
        authorization: `Bearer ${chaveCompleta}`,
        "x-empresa-id": fixture.empresaId,
        "x-filial-id": fixture.filialId,
      }),
    );

    expect(sessao.usuarioId).toBe(fixture.usuarioId);
    expect(sessao.empresaId).toBe(fixture.empresaId);
    expect(sessao.filialId).toBe(fixture.filialId);
    expect(sessao.perfil).toBe("FINANCEIRO");
    expect(sessao.podeAlterarFilial).toBe(true);
  });

  test("atualiza ultimoUsoEm a cada chamada bem-sucedida", async () => {
    const antes = await prisma.apiKey.findFirstOrThrow({ where: { usuarioId: fixture.usuarioId } });
    expect(antes.ultimoUsoEm).not.toBeNull();
    const primeiroUso = antes.ultimoUsoEm!.getTime();

    await new Promise((resolve) => setTimeout(resolve, 10));
    await requireSessaoApi(
      requisicao({
        authorization: `Bearer ${chaveCompleta}`,
        "x-empresa-id": fixture.empresaId,
        "x-filial-id": fixture.filialId,
      }),
    );

    const depois = await prisma.apiKey.findFirstOrThrow({ where: { usuarioId: fixture.usuarioId } });
    expect(depois.ultimoUsoEm!.getTime()).toBeGreaterThan(primeiroUso);
  });

  test("sem header Authorization -> 401", async () => {
    await expect(
      requireSessaoApi(requisicao({ "x-empresa-id": fixture.empresaId, "x-filial-id": fixture.filialId })),
    ).rejects.toMatchObject({ status: 401 });
  });

  test("chave inválida -> 401", async () => {
    await expect(
      requireSessaoApi(
        requisicao({
          authorization: "Bearer sk_chave_que_nao_existe",
          "x-empresa-id": fixture.empresaId,
          "x-filial-id": fixture.filialId,
        }),
      ),
    ).rejects.toBeInstanceOf(ApiAuthError);
  });

  test("chave revogada -> 401", async () => {
    const gerada = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave a revogar");
    await revogarChave(fixture.sessaoAdmin, gerada.id);

    await expect(
      requireSessaoApi(
        requisicao({
          authorization: `Bearer ${gerada.chaveCompleta}`,
          "x-empresa-id": fixture.empresaId,
          "x-filial-id": fixture.filialId,
        }),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  test("sem X-Empresa-Id ou X-Filial-Id -> 400", async () => {
    await expect(
      requireSessaoApi(requisicao({ authorization: `Bearer ${chaveCompleta}` })),
    ).rejects.toMatchObject({ status: 400 });
  });

  test("empresa sem vínculo -> 403", async () => {
    await expect(
      requireSessaoApi(
        requisicao({
          authorization: `Bearer ${chaveCompleta}`,
          "x-empresa-id": "00000000-0000-0000-0000-000000000000",
          "x-filial-id": fixture.filialId,
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  test("filial sem vínculo -> 403", async () => {
    await expect(
      requireSessaoApi(
        requisicao({
          authorization: `Bearer ${chaveCompleta}`,
          "x-empresa-id": fixture.empresaId,
          "x-filial-id": "00000000-0000-0000-0000-000000000000",
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
