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
import { criarAjuste, estornarAjuste, listarAjustes } from "./ajusteEstoque";

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

  test("lote de recepção excluída não recebe ajuste", async () => {
    const lote = await criarLoteDeTeste(fx, { produtoId: cat.produtoFrutoId, localId: cat.localRecepcaoId, kg: 0 });
    await prisma.recepcaoFruto.create({
      data: {
        filialId: fx.filialAId,
        loteId: lote.id,
        data: new Date("2026-11-09"),
        produtoId: cat.produtoFrutoId,
        origem: "PROPRIA",
        talhaoId: cat.talhaoId,
        pesoBrutoKg: 5,
        precoKg: 0,
        valorTotal: 0,
        status: "CANCELADA",
        motivoCancelamento: "Lançada errada",
        usuarioId: fx.usuarioId,
      },
    });
    await expect(
      criarAjuste(fx.sessao("PRODUCAO"), ajuste(lote.id, { sentido: "ENTRADA", motivo: "INVENTARIO" })),
    ).rejects.toThrow("O lote é de uma recepção excluída e não recebe ajustes");
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

  describe("estornar ajuste", () => {
    const loteDe = (kg: number) =>
      criarLoteDeTeste(fx, { produtoId: cat.produtoFrutoId, localId: cat.localRecepcaoId, kg });
    const saldo = async (loteId: string) =>
      Number((await prisma.lote.findUniqueOrThrow({ where: { id: loteId } })).saldoKg);

    test("estorno de saída devolve o saldo, com movimento contrário na data do ajuste e auditoria", async () => {
      const lote = await loteDe(10);
      const criado = await criarAjuste(fx.sessao("PRODUCAO"), ajuste(lote.id));
      await estornarAjuste(fx.sessao("PRODUCAO"), criado.id, "Lote errado");

      expect(await saldo(lote.id)).toBe(10);
      const estornado = await prisma.ajusteEstoque.findUniqueOrThrow({ where: { id: criado.id } });
      expect(estornado).toMatchObject({ motivoEstorno: "Lote errado", estornadoPorId: fx.usuarioId });
      expect(estornado.estornadoEm).toBeInstanceOf(Date);
      const movimento = await prisma.movimentoEstoque.findUniqueOrThrow({ where: { ajusteEstornadoId: criado.id } });
      expect(movimento).toMatchObject({ tipo: "ESTORNO_AJUSTE", loteId: lote.id, data: criado.data });
      expect(Number(movimento.quantidadeKg)).toBe(3);
      expect(await prisma.auditLog.count({ where: { entidadeId: criado.id, acao: "ESTORNAR" } })).toBe(1);
    });

    test("recusa estornar duas vezes, sem motivo, sem permissão ou de outra filial", async () => {
      const lote = await loteDe(10);
      const criado = await criarAjuste(fx.sessao("PRODUCAO"), ajuste(lote.id));
      await expect(estornarAjuste(fx.sessao("PRODUCAO"), criado.id, " ")).rejects.toThrow("Informe o motivo");
      await expect(estornarAjuste(fx.sessao("VENDAS"), criado.id, "Erro")).rejects.toThrow(PermissionError);
      await expect(estornarAjuste(fx.sessao("PRODUCAO", { filial: "B" }), criado.id, "Erro")).rejects.toThrow(
        "Ajuste não encontrado",
      );
      await estornarAjuste(fx.sessao("PRODUCAO"), criado.id, "Erro");
      await expect(estornarAjuste(fx.sessao("PRODUCAO"), criado.id, "Erro")).rejects.toThrow("já foi estornado");
      expect(await saldo(lote.id)).toBe(10);
    });

    test("estorno de entrada não deixa o lote negativo", async () => {
      const lote = await loteDe(0);
      const entrada = await criarAjuste(
        fx.sessao("PRODUCAO"),
        ajuste(lote.id, { sentido: "ENTRADA", quantidadeKg: "5", motivo: "INVENTARIO" }),
      );
      await criarAjuste(fx.sessao("PRODUCAO"), ajuste(lote.id, { quantidadeKg: "4" }));
      await expect(estornarAjuste(fx.sessao("PRODUCAO"), entrada.id, "Contagem errada")).rejects.toThrow(
        /tem 1 kg/,
      );
      expect(await saldo(lote.id)).toBe(1);
      expect((await prisma.ajusteEstoque.findUniqueOrThrow({ where: { id: entrada.id } })).estornadoEm).toBeNull();
    });

    test("listarAjustes traz quem estornou e o motivo", async () => {
      const lote = await loteDe(10);
      const criado = await criarAjuste(fx.sessao("PRODUCAO"), ajuste(lote.id, { data: "2026-11-15" }));
      await estornarAjuste(fx.sessao("PRODUCAO"), criado.id, "Lote errado");
      const [listado] = await listarAjustes(fx.filialAId, {
        inicio: new Date("2026-11-15"),
        fim: new Date("2026-11-15"),
      });
      expect(listado).toMatchObject({ motivoEstorno: "Lote errado", estornadoPor: { nome: expect.any(String) } });
    });
  });
});
