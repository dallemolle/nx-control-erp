import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { recepcaoSchema } from "@/lib/schemas/recepcao";
import {
  criarCatalogoDeTeste,
  criarFixtureProducao,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "../producaoTestFixtures";
import { cancelarRecepcao, criarRecepcao } from "../recepcaoFruto";
import { buscarPainelProducao } from "./painel";
import { buscarRelatorioOrigem, type RelatorioOrigem } from "./origem";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("relatório de origem", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let r: RelatorioOrigem;
  const adm = () => fx.sessao("ADMINISTRADOR");
  const periodo = { inicio: d("2026-11-01"), fim: d("2026-11-30") };

  const receber = (data: string, extra: Record<string, unknown>) =>
    criarRecepcao(
      adm(),
      recepcaoSchema.parse({ data, localId: cat.localRecepcaoId, unidade: "KG", descarte: "0", ...extra }),
    );

  beforeAll(async () => {
    fx = await criarFixtureProducao("origem");
    cat = await criarCatalogoDeTeste(fx);
    await prisma.configuracaoProducao.upsert({
      where: { filialId: fx.filialAId },
      create: { filialId: fx.filialAId, categoriaCompraFrutoId: cat.categoriaCompraId },
      update: { categoriaCompraFrutoId: cat.categoriaCompraId },
    });
    const t2 = await prisma.talhao.create({
      data: { filialId: fx.filialAId, nome: "Talhão 2", frutaId: cat.outraFrutaId, areaHa: 0.5 },
    });
    await prisma.talhao.create({
      data: { filialId: fx.filialAId, nome: "Talhão 3", frutaId: cat.frutaId, areaHa: 1, ativo: false },
    });
    await prisma.talhao.create({ data: { filialId: fx.filialAId, nome: "Talhão 4", frutaId: cat.frutaId, areaHa: 1 } });
    const fornB = await prisma.fornecedor.create({
      data: { empresaId: fx.empresaId, nome: "Fornecedor B", cnpjCpf: `fb-${Date.now()}` },
    });
    const talhao = (talhaoId: string) => ({ origem: "PROPRIA", talhaoId });
    const terceiro = (fornecedorId: string) => ({ origem: "TERCEIRO", fornecedorId });
    const FA = cat.produtoFrutoId;
    const FC = cat.produtoFrutoOutraId;

    await receber("2025-12-15", { produtoId: FA, ...talhao(cat.talhaoId), pesoBruto: "500" }); // ano anterior
    await receber("2026-03-10", { produtoId: FA, ...talhao(cat.talhaoId), pesoBruto: "1000" });
    await receber("2026-03-10", { produtoId: FA, ...terceiro(cat.fornecedorId), pesoBruto: "100", preco: "1.8" });
    await receber("2026-11-05", { produtoId: FA, ...talhao(cat.talhaoId), pesoBruto: "100", descarte: "10" });
    await receber("2026-11-06", { produtoId: FC, ...talhao(t2.id), pesoBruto: "50" });
    await receber("2026-11-07", {
      produtoId: FA,
      ...terceiro(cat.fornecedorId),
      pesoBruto: "200",
      descarte: "20",
      preco: "2",
    });
    await receber("2026-11-08", { produtoId: FC, ...terceiro(cat.fornecedorId), pesoBruto: "40", preco: "3" });
    await receber("2026-11-09", { produtoId: FA, ...terceiro(fornB.id), pesoBruto: "60", preco: "2.5" });
    const cancelada = await receber("2026-11-10", { produtoId: FA, ...terceiro(fornB.id), pesoBruto: "30", preco: "2" });
    await cancelarRecepcao(adm(), cancelada.recepcaoId, "Lançada em dobro");
    await prisma.talhao.update({ where: { id: t2.id }, data: { ativo: false } });

    r = await buscarRelatorioOrigem(adm(), periodo);
  }, 60_000);

  afterAll(async () => {
    await fx.limpar();
  });

  test("ano da data Até e frutas do período", () => {
    expect(r.ano).toBe(2026);
    expect(r.frutas.map((f) => f.nome)).toEqual(["Açaí", "Cupuaçu"]);
  });

  test("por origem: kg líquido, valor só de terceiros, cancelada fora", () => {
    expect(r.porOrigem.map((o) => [o.nome, o.tipo, o.kg, o.valor, o.cargas])).toEqual([
      ["Produtor exemplo", "TERCEIRO", 220, 480, 2],
      ["Talhão 1", "PROPRIA", 90, null, 1],
      ["Fornecedor B", "TERCEIRO", 60, 150, 1],
      ["Talhão 2", "PROPRIA", 50, null, 1],
    ]);
    expect(r.porOrigem[0].porFruta[cat.frutaId].kg).toBe(180);
    expect(r.porOrigem[0].porFruta[cat.outraFrutaId].kg).toBe(40);
    expect(r.total).toMatchObject({ kg: 420, valor: 630, precoMedio: 2.25, cargas: 5 });
    expect(r.total.percentualDescarte).toBeCloseTo(30 / 450);
  });

  test("produtividade no ano: inativo com colheita entra, sem colheita não", () => {
    expect(r.produtividade.map((p) => [p.talhao, p.kgPeriodo, p.kgAno, p.colheitas])).toEqual([
      ["Talhão 1", 90, 1090, 2],
      ["Talhão 2", 50, 50, 1],
      ["Talhão 4", 0, 0, 0],
    ]);
    expect(r.produtividade[0].toneladasHa).toBeCloseTo(0.545);
    expect(r.produtividade[1].toneladasHa).toBeCloseTo(0.1);
    expect(r.totalProdutividade).toEqual({ areaHa: 3.5, kgPeriodo: 140, kgAno: 1140, colheitas: 3 });
  });

  test("preço médio pago a terceiros por mês no ano", () => {
    expect(r.frutasTerceiros.map((f) => f.nome)).toEqual(["Açaí", "Cupuaçu"]);
    const acai = r.precoPorMes[cat.frutaId];
    expect(acai[2]).toBeCloseTo(1.8);
    expect(acai[10]).toBeCloseTo(510 / 240);
    expect(acai[12]).toBeCloseTo(690 / 340);
    expect(acai[0]).toBeNull();
    expect(r.precoPorMes[cat.outraFrutaId][10]).toBe(3);
  });

  test("kg total bate com o fruto recebido do painel (D-29)", async () => {
    const p = await buscarPainelProducao(adm(), periodo, d("2026-11-20"));
    expect(r.total.kg).toBe(p.recepcao.recebidoKg);
  });

  test("outra filial não vê nada", async () => {
    const b = await buscarRelatorioOrigem(fx.sessao("ADMINISTRADOR", { filial: "B" }), periodo);
    expect(b.porOrigem).toEqual([]);
    expect(b.produtividade).toEqual([]);
    expect(b.precoPorMes).toEqual({});
  });
});
