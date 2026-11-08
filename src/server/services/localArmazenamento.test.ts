import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureProducao, type FixtureProducao } from "./producaoTestFixtures";
import {
  atualizarLocalArmazenamento,
  criarLocalArmazenamento,
  definirAtivoLocalArmazenamento,
  listarLocaisArmazenamento,
} from "./localArmazenamento";
import { localArmazenamentoSchema } from "@/lib/schemas/localArmazenamento";

describe("local de armazenamento (por filial)", () => {
  let fx: FixtureProducao;
  beforeAll(async () => {
    fx = await criarFixtureProducao("local");
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("cria na filial, com capacidade opcional", async () => {
    const l = await criarLocalArmazenamento(fx.sessao("PRODUCAO"), {
      nome: "Câmara fria 01",
      tipo: "CAMARA_FRIA",
      temperatura: "-18 °C",
      capacidadeKg: 5000,
    });
    expect(l.filialId).toBe(fx.filialAId);
    expect(Number(l.capacidadeKg)).toBe(5000);
    const semCapacidade = await criarLocalArmazenamento(fx.sessao("PRODUCAO"), {
      nome: "Recepção",
      tipo: "RECEPCAO",
      temperatura: null,
    });
    expect(semCapacidade.capacidadeKg).toBeNull();
    expect(await listarLocaisArmazenamento(fx.filialBId)).toHaveLength(0);
  });

  test("atualiza e remove a capacidade, com auditoria", async () => {
    const [local] = (await listarLocaisArmazenamento(fx.filialAId)).filter((x) => x.nome === "Câmara fria 01");
    await atualizarLocalArmazenamento(fx.sessao("PRODUCAO"), local.id, {
      nome: "Câmara fria 01",
      tipo: "FREEZER",
      temperatura: "-20 °C",
    });
    const gravado = await prisma.localArmazenamento.findUniqueOrThrow({ where: { id: local.id } });
    expect(gravado).toMatchObject({ tipo: "FREEZER", temperatura: "-20 °C", capacidadeKg: null });
    expect(await prisma.auditLog.count({ where: { entidadeId: local.id } })).toBe(2);
  });

  test("nome repetido na filial recusado; inativar não alcança outra filial; VENDAS não escreve", async () => {
    await expect(
      criarLocalArmazenamento(fx.sessao("PRODUCAO"), { nome: "Recepção", tipo: "OUTRO", temperatura: null }),
    ).rejects.toThrow("Já existe um local com este nome nesta filial");
    const [local] = await listarLocaisArmazenamento(fx.filialAId);
    await expect(
      definirAtivoLocalArmazenamento(fx.sessao("PRODUCAO", { filial: "B" }), local.id, false),
    ).rejects.toThrow();
    await expect(
      criarLocalArmazenamento(fx.sessao("VENDAS"), { nome: "Freezer 2", tipo: "FREEZER", temperatura: null }),
    ).rejects.toThrow(PermissionError);
  });

  test("schema: capacidade > 0 quando informada", () => {
    expect(localArmazenamentoSchema.safeParse({ nome: "Ab", tipo: "FREEZER", capacidadeKg: "0" }).success).toBe(false);
    expect(
      localArmazenamentoSchema.parse({ nome: "Ab", tipo: "FREEZER", capacidadeKg: "" }).capacidadeKg,
    ).toBeUndefined();
  });
});
