import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { gerarChave, revogarChave, listarChaves, hashChaveApi } from "./apiKey";

describe("gestão de chaves de API", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APIKEY");
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: { in: [fixture.usuarioId, fixture.usuarioAdminId] } } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("gerarChave cria a chave e devolve o valor completo só na criação", async () => {
    const resultado = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Agente IA - teste");

    expect(resultado.chaveCompleta).toMatch(/^sk_/);
    expect(resultado.prefixo).toBe(resultado.chaveCompleta.slice(0, 11));

    const persistida = await prisma.apiKey.findUniqueOrThrow({ where: { id: resultado.id } });
    expect(persistida.chaveHash).toBe(hashChaveApi(resultado.chaveCompleta));
    expect(persistida.chaveHash).not.toBe(resultado.chaveCompleta);
    expect(persistida.nome).toBe("Agente IA - teste");
    expect(persistida.revogadaEm).toBeNull();
  });

  test("listarChaves não expõe chaveHash nem a chave completa", async () => {
    await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave para listagem");

    const chaves = await listarChaves(fixture.sessaoAdmin, fixture.usuarioId);

    expect(chaves.length).toBeGreaterThan(0);
    for (const chave of chaves) {
      expect(chave).not.toHaveProperty("chaveHash");
      expect(Object.keys(chave).sort()).toEqual(
        ["criadoEm", "id", "nome", "prefixo", "revogadaEm", "ultimoUsoEm"].sort(),
      );
    }
  });

  test("revogarChave marca revogadaEm", async () => {
    const criada = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave para revogar");

    await revogarChave(fixture.sessaoAdmin, criada.id);

    const persistida = await prisma.apiKey.findUniqueOrThrow({ where: { id: criada.id } });
    expect(persistida.revogadaEm).not.toBeNull();
  });

  test("perfil sem usuario:gerenciar não consegue gerar, listar ou revogar", async () => {
    await expect(gerarChave(fixture.sessao, fixture.usuarioId, "Não permitido")).rejects.toThrow(PermissionError);
    await expect(listarChaves(fixture.sessao, fixture.usuarioId)).rejects.toThrow(PermissionError);

    const criadaComoAdmin = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Para testar revogação negada");
    await expect(revogarChave(fixture.sessao, criadaComoAdmin.id)).rejects.toThrow(PermissionError);
  });
});
