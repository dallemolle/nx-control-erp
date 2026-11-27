import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { criarFixtureProducao, type FixtureProducao } from "./producaoTestFixtures";
import { atualizarSafra, criarSafra } from "./safra";

describe("38. nome da safra único na filial", () => {
  let fx: FixtureProducao;
  beforeAll(async () => {
    fx = await criarFixtureProducao("safra-nome");
  });
  afterAll(async () => {
    await fx.limpar();
  });

  const dados = (nome: string) => ({
    nome,
    dataInicio: new Date("2026-08-01"),
    dataFim: new Date("2027-07-31"),
    status: "PLANEJADO" as const,
  });

  test("nome repetido na filial vira mensagem, ao criar e ao renomear; outra filial pode", async () => {
    await criarSafra(fx.sessao("ADMINISTRADOR"), dados("2026/27"));
    await expect(criarSafra(fx.sessao("ADMINISTRADOR"), dados("2026/27"))).rejects.toThrow(
      "Já existe uma safra com este nome nesta filial",
    );
    const outra = await criarSafra(fx.sessao("ADMINISTRADOR"), dados("2027/28"));
    await expect(atualizarSafra(fx.sessao("ADMINISTRADOR"), outra.id, dados("2026/27"))).rejects.toThrow(
      "Já existe uma safra com este nome nesta filial",
    );
    await expect(criarSafra(fx.sessao("ADMINISTRADOR", { filial: "B" }), dados("2026/27"))).resolves.toMatchObject({
      nome: "2026/27",
    });
  });
});
