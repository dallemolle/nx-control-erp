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
import { listarLotes, moverLote, registrarMovimento, resumoProdutoLocal } from "./estoque";

const HOJE = new Date("2026-11-09");
const dia = (dias: number) => new Date(HOJE.getTime() + dias * 86_400_000);

async function somaDosMovimentos(loteId: string): Promise<number> {
  const { _sum } = await prisma.movimentoEstoque.aggregate({ where: { loteId }, _sum: { quantidadeKg: true } });
  return Number(_sum.quantidadeKg ?? 0);
}

describe("estoque: saldo por movimentos", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  beforeAll(async () => {
    fx = await criarFixtureProducao("estoque");
    cat = await criarCatalogoDeTeste(fx);
  });
  afterAll(async () => {
    await fx.limpar();
  });

  const saida = (loteId: string, kg: number) =>
    prisma.$transaction((tx) =>
      registrarMovimento(tx, {
        filialId: fx.filialAId,
        loteId,
        data: HOJE,
        tipo: "AJUSTE",
        quantidadeKg: -kg,
        usuarioId: fx.usuarioId,
      }),
    );

  test("saída maior que o saldo é recusada e nada muda", async () => {
    const lote = await criarLoteDeTeste(fx, { produtoId: cat.produtoFrutoId, localId: cat.localRecepcaoId, kg: 10 });
    await expect(saida(lote.id, 11)).rejects.toThrow(`Saldo insuficiente no lote ${lote.codigo}`);
    const depois = await prisma.lote.findUniqueOrThrow({ where: { id: lote.id } });
    expect(Number(depois.saldoKg)).toBe(10);
    expect(await prisma.movimentoEstoque.count({ where: { loteId: lote.id } })).toBe(1);
  });

  test("duas saídas simultâneas que juntas passam do saldo: só uma passa", async () => {
    const lote = await criarLoteDeTeste(fx, { produtoId: cat.produtoFrutoId, localId: cat.localRecepcaoId, kg: 10 });
    const resultados = await Promise.allSettled([saida(lote.id, 7), saida(lote.id, 7)]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const depois = await prisma.lote.findUniqueOrThrow({ where: { id: lote.id } });
    expect(Number(depois.saldoKg)).toBe(3);
  });

  test("saldoKg é sempre a soma dos movimentos", async () => {
    const lote = await criarLoteDeTeste(fx, { produtoId: cat.produtoFrutoId, localId: cat.localRecepcaoId, kg: 20 });
    await saida(lote.id, 4.5);
    await saida(lote.id, 0.25);
    await prisma.$transaction((tx) =>
      registrarMovimento(tx, {
        filialId: fx.filialAId,
        loteId: lote.id,
        data: HOJE,
        tipo: "AJUSTE",
        quantidadeKg: 2,
        usuarioId: fx.usuarioId,
      }),
    );
    const depois = await prisma.lote.findUniqueOrThrow({ where: { id: lote.id } });
    expect(Number(depois.saldoKg)).toBe(17.25);
    expect(await somaDosMovimentos(lote.id)).toBe(17.25);
  });
});

describe("estoque: consultas e mudança de local", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  beforeAll(async () => {
    fx = await criarFixtureProducao("estoqueconsulta");
    cat = await criarCatalogoDeTeste(fx);
    await criarLoteDeTeste(fx, {
      produtoId: cat.produtoPolpaId,
      localId: cat.localCamaraId,
      kg: 100,
      custoKg: 12.5,
      validade: dia(200),
      codigo: "AGC-OK",
    });
    await criarLoteDeTeste(fx, {
      produtoId: cat.produtoFrutoId,
      localId: cat.localRecepcaoId,
      kg: 30,
      custoKg: 2,
      validade: dia(-1),
      codigo: "FA-VENCIDO",
    });
    await criarLoteDeTeste(fx, {
      produtoId: cat.produtoPolpaId,
      localId: cat.localCamaraId,
      kg: 0,
      validade: dia(10),
      codigo: "AGC-ZERADO",
    });
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("ordena por validade, oculta zerados por padrão e calcula valor", async () => {
    const lotes = await listarLotes(fx.filialAId, {}, HOJE);
    expect(lotes.map((l) => l.codigo)).toEqual(["FA-VENCIDO", "AGC-OK"]);
    const ok = lotes.find((l) => l.codigo === "AGC-OK")!;
    expect(ok).toMatchObject({ status: "OK", dias: 200, valor: 1250 });
    expect(ok.produto.codigo).toBe("AGC");
    expect(ok.local.nome).toBe("Câmara fria 01");
  });

  test("mostra zerados quando pedido e filtra por status", async () => {
    const todos = await listarLotes(fx.filialAId, { incluirZerados: true }, HOJE);
    expect(todos.map((l) => l.codigo)).toContain("AGC-ZERADO");
    const vencidos = await listarLotes(fx.filialAId, { status: "VENCIDO" }, HOJE);
    expect(vencidos.map((l) => l.codigo)).toEqual(["FA-VENCIDO"]);
    const zerados = await listarLotes(fx.filialAId, { status: "ZERADO" }, HOJE);
    expect(zerados.map((l) => l.codigo)).toEqual(["AGC-ZERADO"]);
  });

  test("filtra por produto e local e não traz lote de outra filial", async () => {
    expect((await listarLotes(fx.filialAId, { produtoId: cat.produtoFrutoId }, HOJE)).map((l) => l.codigo)).toEqual([
      "FA-VENCIDO",
    ]);
    expect((await listarLotes(fx.filialAId, { localId: cat.localCamaraId }, HOJE)).map((l) => l.codigo)).toEqual([
      "AGC-OK",
    ]);
    expect(await listarLotes(fx.filialBId, { incluirZerados: true }, HOJE)).toEqual([]);
  });

  test("resumo soma por produto × local, com ocupação do local", async () => {
    const resumo = await resumoProdutoLocal(fx.filialAId);
    const polpa = resumo.linhas.find((l) => l.produtoId === cat.produtoPolpaId)!;
    expect(polpa).toMatchObject({ saldoKg: 100, valor: 1250, local: "Câmara fria 01" });
    const camara = resumo.locais.find((l) => l.localId === cat.localCamaraId)!;
    expect(camara).toMatchObject({ capacidadeKg: 1000, saldoKg: 100, ocupacao: 0.1 });
    const recepcao = resumo.locais.find((l) => l.localId === cat.localRecepcaoId)!;
    expect(recepcao.ocupacao).toBeNull();
  });

  test("moverLote muda o local e audita; recusa local de outra filial e perfil sem permissão", async () => {
    const [lote] = await listarLotes(fx.filialAId, { produtoId: cat.produtoFrutoId }, HOJE);
    await moverLote(fx.sessao("PRODUCAO"), lote.id, cat.localCamaraId);
    expect((await prisma.lote.findUniqueOrThrow({ where: { id: lote.id } })).localId).toBe(cat.localCamaraId);
    expect(await prisma.auditLog.count({ where: { entidadeId: lote.id, acao: "MOVER" } })).toBe(1);

    const localB = await prisma.localArmazenamento.create({
      data: { filialId: fx.filialBId, nome: "Câmara B", tipo: "CAMARA_FRIA" },
    });
    await expect(moverLote(fx.sessao("PRODUCAO"), lote.id, localB.id)).rejects.toThrow(
      "Local de armazenamento não encontrado ou inativo",
    );
    await expect(moverLote(fx.sessao("VENDAS"), lote.id, cat.localRecepcaoId)).rejects.toThrow(PermissionError);
  });
});
