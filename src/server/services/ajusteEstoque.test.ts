import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { ajusteSchema } from "@/lib/schemas/ajusteEstoque";
import {
  criarCatalogoDeTeste,
  criarFixtureProducao,
  criarLoteDeTeste,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "./producaoTestFixtures";
import { criarAjuste, listarAjustes } from "./ajusteEstoque";

describe("ajuste de estoque", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  beforeAll(async () => {
    fx = await criarFixtureProducao("ajuste");
    cat = await criarCatalogoDeTeste(fx);
  });
  afterAll(async () => {
    await fx.limpar();
  });

  const ajuste = (loteId: string, extra: Record<string, unknown> = {}) =>
    ajusteSchema.parse({
      loteId,
      data: "2026-11-09",
      sentido: "SAIDA",
      quantidadeKg: "3",
      motivo: "AVARIA",
      observacao: "Caixa caiu",
      ...extra,
    });

  test("saída de 3 kg em lote de 10: saldo 7, ajuste −3 e movimento ligado", async () => {
    const lote = await criarLoteDeTeste(fx, { produtoId: cat.produtoFrutoId, localId: cat.localRecepcaoId, kg: 10 });
    const criado = await criarAjuste(fx.sessao("PRODUCAO"), ajuste(lote.id));
    expect(Number(criado.quantidadeKg)).toBe(-3);
    expect(Number((await prisma.lote.findUniqueOrThrow({ where: { id: lote.id } })).saldoKg)).toBe(7);
    const movimento = await prisma.movimentoEstoque.findUniqueOrThrow({ where: { ajusteId: criado.id } });
    expect(movimento).toMatchObject({ tipo: "AJUSTE", loteId: lote.id });
    expect(Number(movimento.quantidadeKg)).toBe(-3);
    const auditoria = await prisma.auditLog.findFirstOrThrow({ where: { entidadeId: criado.id } });
    expect(JSON.stringify(auditoria.valorNovo)).toContain("AVARIA");
  });

  test("saída maior que o saldo é recusada e não grava o ajuste", async () => {
    const lote = await criarLoteDeTeste(fx, { produtoId: cat.produtoFrutoId, localId: cat.localRecepcaoId, kg: 10 });
    await expect(criarAjuste(fx.sessao("PRODUCAO"), ajuste(lote.id, { quantidadeKg: "11" }))).rejects.toThrow(
      "Saldo insuficiente",
    );
    expect(await prisma.ajusteEstoque.count({ where: { loteId: lote.id } })).toBe(0);
  });

  test("entrada (inventário) em lote zerado aumenta o saldo", async () => {
    const lote = await criarLoteDeTeste(fx, { produtoId: cat.produtoFrutoId, localId: cat.localRecepcaoId, kg: 0 });
    await criarAjuste(
      fx.sessao("PRODUCAO"),
      ajuste(lote.id, { sentido: "ENTRADA", quantidadeKg: "2.5", motivo: "INVENTARIO" }),
    );
    expect(Number((await prisma.lote.findUniqueOrThrow({ where: { id: lote.id } })).saldoKg)).toBe(2.5);
  });

  test("só quem tem estoque:ajustar; lote de outra filial é recusado", async () => {
    const lote = await criarLoteDeTeste(fx, { produtoId: cat.produtoFrutoId, localId: cat.localRecepcaoId, kg: 10 });
    await expect(criarAjuste(fx.sessao("VENDAS"), ajuste(lote.id))).rejects.toThrow(PermissionError);
    await expect(criarAjuste(fx.sessao("FINANCEIRO"), ajuste(lote.id))).rejects.toThrow(PermissionError);
    await expect(criarAjuste(fx.sessao("PRODUCAO", { filial: "B" }), ajuste(lote.id))).rejects.toThrow(
      "Lote não encontrado",
    );
  });

  test("schema exige quantidade maior que zero", () => {
    expect(ajusteSchema.safeParse({ loteId: "x", data: "2026-11-09", sentido: "SAIDA", quantidadeKg: "0", motivo: "OUTRO" }).success).toBe(false);
  });

  test("listarAjustes filtra por período e motivo, com lote, produto e usuário", async () => {
    const lista = await listarAjustes(fx.filialAId, {
      inicio: new Date("2026-11-09"),
      fim: new Date("2026-11-09"),
      motivo: "AVARIA",
    });
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every((a) => a.motivo === "AVARIA")).toBe(true);
    expect(lista[0].produto.descricao).toBe("Fruto de açaí");
    expect(lista[0].usuario.nome).toContain("Usuario");
    expect(
      await listarAjustes(fx.filialAId, { inicio: new Date("2026-12-01"), fim: new Date("2026-12-31") }),
    ).toEqual([]);
  });
});
