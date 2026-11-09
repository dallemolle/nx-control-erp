import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureProducao, type FixtureProducao } from "./producaoTestFixtures";
import { atualizarInsumo, criarInsumo, definirAtivoInsumo, listarInsumos } from "./insumo";

describe("insumo (por empresa)", () => {
  let fx: FixtureProducao;
  beforeAll(async () => {
    fx = await criarFixtureProducao("insumo");
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("cria com custo de 4 casas, atualiza e inativa", async () => {
    const i = await criarInsumo(fx.sessao("PRODUCAO"), { nome: "Embalagem 1 kg", unidade: "un", custoUnitario: 0.1234 });
    expect(Number(i.custoUnitario)).toBe(0.1234);
    await atualizarInsumo(fx.sessao("PRODUCAO"), i.id, { nome: "Embalagem 1 kg", unidade: "un", custoUnitario: 0.2 });
    await definirAtivoInsumo(fx.sessao("PRODUCAO"), i.id, false);
    const gravado = (await listarInsumos(fx.empresaId)).find((x) => x.id === i.id);
    expect(gravado?.ativo).toBe(false);
    expect(Number(gravado?.custoUnitario)).toBe(0.2);
    expect(await prisma.auditLog.count({ where: { entidadeId: i.id } })).toBe(3);
  });

  test("nome repetido recusado; VENDAS não escreve", async () => {
    await criarInsumo(fx.sessao("PRODUCAO"), { nome: "Energia", unidade: "kWh", custoUnitario: 1 });
    await expect(
      criarInsumo(fx.sessao("PRODUCAO"), { nome: "Energia", unidade: "kWh", custoUnitario: 1 }),
    ).rejects.toThrow("Já existe um insumo com este nome");
    await expect(
      criarInsumo(fx.sessao("VENDAS"), { nome: "Outro", unidade: "un", custoUnitario: 1 }),
    ).rejects.toThrow(PermissionError);
  });

  test("não altera insumo de outra empresa", async () => {
    const alheio = await prisma.insumo.create({
      data: { empresaId: fx.outraEmpresaId, nome: "Alheio", unidade: "un", custoUnitario: 1 },
    });
    await expect(
      atualizarInsumo(fx.sessao("PRODUCAO"), alheio.id, { nome: "X", unidade: "un", custoUnitario: 1 }),
    ).rejects.toThrow();
  });
});
