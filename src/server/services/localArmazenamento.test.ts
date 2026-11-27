import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import {
  criarCatalogoDeTeste,
  criarFixtureProducao,
  criarLoteDeTeste,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "./producaoTestFixtures";
import {
  atualizarLocalArmazenamento,
  criarLocalArmazenamento,
  definirAtivoLocalArmazenamento,
  listarLocaisArmazenamento,
  listarLocaisDoEstoque,
} from "./localArmazenamento";
import { resumoProdutoLocal } from "./estoque";
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

describe("39. local com lotes", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  beforeAll(async () => {
    fx = await criarFixtureProducao("local-lotes");
    cat = await criarCatalogoDeTeste(fx);
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("não inativa com lote com saldo; lote zerado não conta; reativar sempre pode", async () => {
    const local = await criarLocalArmazenamento(fx.sessao("PRODUCAO"), {
      nome: "Câmara da loja",
      tipo: "CAMARA_FRIA",
      temperatura: null,
    });
    await criarLoteDeTeste(fx, { produtoId: cat.produtoPolpaId, localId: local.id, kg: 150 });
    await criarLoteDeTeste(fx, { produtoId: cat.produtoPolpaId, localId: local.id, kg: 50 });
    await criarLoteDeTeste(fx, { produtoId: cat.produtoPolpaId, localId: local.id, kg: 0 });

    await expect(definirAtivoLocalArmazenamento(fx.sessao("PRODUCAO"), local.id, false)).rejects.toThrow(
      "O local tem 2 lotes com saldo (200 kg): transfira os lotes antes de inativar",
    );
    expect((await prisma.localArmazenamento.findUniqueOrThrow({ where: { id: local.id } })).ativo).toBe(true);

    await prisma.lote.updateMany({ where: { localId: local.id }, data: { saldoKg: 0 } });
    await definirAtivoLocalArmazenamento(fx.sessao("PRODUCAO"), local.id, false);
    await definirAtivoLocalArmazenamento(fx.sessao("PRODUCAO"), local.id, true);
  });

  test("local já inativo com lote aparece no quadro de ocupação e no filtro, marcado inativo", async () => {
    const local = await criarLocalArmazenamento(fx.sessao("PRODUCAO"), {
      nome: "Freezer antigo",
      tipo: "FREEZER",
      temperatura: null,
    });
    const vazio = await criarLocalArmazenamento(fx.sessao("PRODUCAO"), {
      nome: "Freezer vazio",
      tipo: "FREEZER",
      temperatura: null,
    });
    await criarLoteDeTeste(fx, { produtoId: cat.produtoPolpaId, localId: local.id, kg: 30 });
    // Inativado antes da regra: o lote ficou lá dentro.
    await prisma.localArmazenamento.updateMany({ where: { id: { in: [local.id, vazio.id] } }, data: { ativo: false } });

    const { locais } = await resumoProdutoLocal(fx.filialAId);
    expect(locais.find((l) => l.localId === local.id)).toMatchObject({ saldoKg: 30, ativo: false });
    expect(locais.find((l) => l.localId === vazio.id)).toBeUndefined();

    const filtro = await listarLocaisDoEstoque(fx.filialAId);
    expect(filtro.find((l) => l.id === local.id)).toMatchObject({ nome: "Freezer antigo", ativo: false });
    expect(filtro.find((l) => l.id === vazio.id)).toBeUndefined();
    expect(filtro.find((l) => l.id === cat.localCamaraId)).toMatchObject({ ativo: true });
  });
});
