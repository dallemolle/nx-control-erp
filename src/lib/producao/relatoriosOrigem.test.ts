import { describe, expect, test } from "vitest";
import {
  agregarPorOrigem,
  precoTerceirosPorMes,
  produtividadeTalhoes,
  type CompraDeTerceiro,
  type GrupoOrigem,
} from "./relatoriosOrigem";

const g = (x: Partial<GrupoOrigem>): GrupoOrigem => ({
  tipo: "TERCEIRO",
  origemId: "f1",
  nome: "Produtor",
  frutaId: "a",
  brutoKg: 0,
  descarteKg: 0,
  valorTotal: 0,
  cargas: 1,
  ...x,
});

describe("agregarPorOrigem", () => {
  const r = agregarPorOrigem([
    g({ frutaId: "a", brutoKg: 200, descarteKg: 20, valorTotal: 360 }),
    g({ frutaId: "c", brutoKg: 40, valorTotal: 120 }),
    g({ tipo: "PROPRIA", origemId: "t1", nome: "Talhão 1", brutoKg: 100, descarteKg: 10, valorTotal: 135 }),
  ]);

  test("uma linha por origem, ordenada por kg líquido", () => {
    expect(r.linhas.map((l) => [l.nome, l.tipo, l.kg, l.valor, l.cargas])).toEqual([
      ["Produtor", "TERCEIRO", 220, 480, 2],
      ["Talhão 1", "PROPRIA", 90, null, 1],
    ]);
  });

  test("kg por fruta, preço médio e descarte", () => {
    expect(r.linhas[0].porFruta.a).toMatchObject({ kg: 180, valor: 360, precoMedio: 2, cargas: 1 });
    expect(r.linhas[0].porFruta.c).toMatchObject({ kg: 40, valor: 120, precoMedio: 3 });
    expect(r.linhas[0].precoMedio).toBeCloseTo(480 / 220);
    expect(r.linhas[0].percentualDescarte).toBeCloseTo(20 / 240);
    expect(r.linhas[1]).toMatchObject({ precoMedio: null, percentualDescarte: 0.1 });
  });

  test("total: valor e preço só de terceiros (D-32)", () => {
    expect(r.total).toMatchObject({ kg: 310, valor: 480, cargas: 3 });
    expect(r.total.porFruta.a.kg).toBe(270);
    expect(r.total.precoMedio).toBeCloseTo(480 / 220);
  });

  test("talhão e fornecedor com o mesmo id não se misturam; só talhões = sem valor", () => {
    const s = agregarPorOrigem([
      g({ tipo: "PROPRIA", origemId: "x", nome: "X", brutoKg: 10 }),
      g({ tipo: "TERCEIRO", origemId: "x", nome: "X", brutoKg: 5 }),
    ]);
    expect(s.linhas).toHaveLength(2);
    expect(agregarPorOrigem([g({ tipo: "PROPRIA", brutoKg: 10 })]).total.valor).toBeNull();
    expect(agregarPorOrigem([]).total).toMatchObject({ kg: 0, valor: null, percentualDescarte: null, cargas: 0 });
  });
});

describe("produtividadeTalhoes", () => {
  const r = produtividadeTalhoes(
    [
      { id: "t2", nome: "Talhão 2", fruta: "Cupuaçu", areaHa: 0.5, ativo: false },
      { id: "t1", nome: "Talhão 1", fruta: "Açaí", areaHa: 2, ativo: true },
      { id: "t3", nome: "Talhão 3", fruta: "Açaí", areaHa: 1, ativo: false },
      { id: "t4", nome: "Talhão 4", fruta: "Açaí", areaHa: 0, ativo: true },
    ],
    new Map([
      ["t1", 90],
      ["t2", 50],
    ]),
    [
      { talhaoId: "t1", brutoKg: 1100, descarteKg: 10, colheitas: 2 },
      { talhaoId: "t2", brutoKg: 50, descarteKg: 0, colheitas: 1 },
    ],
  );

  test("ativos e inativos com colheita, por nome; inativo sem colheita fora", () => {
    expect(r.linhas.map((l) => [l.talhao, l.kgPeriodo, l.kgAno, l.colheitas])).toEqual([
      ["Talhão 1", 90, 1090, 2],
      ["Talhão 2", 50, 50, 1],
      ["Talhão 4", 0, 0, 0],
    ]);
  });

  test("t/ha no ano (RN-30); área zero = null", () => {
    expect(r.linhas[0].toneladasHa).toBeCloseTo(0.545);
    expect(r.linhas[1].toneladasHa).toBeCloseTo(0.1);
    expect(r.linhas[2].toneladasHa).toBeNull();
  });

  test("total soma área, kg e colheitas", () => {
    expect(r.total).toEqual({ areaHa: 2.5, kgPeriodo: 140, kgAno: 1140, colheitas: 3 });
  });
});

describe("precoTerceirosPorMes", () => {
  const c = (frutaId: string, iso: string, bruto: number, descarte: number, valor: number): CompraDeTerceiro => ({
    frutaId,
    data: new Date(`${iso}T00:00:00.000Z`),
    brutoKg: bruto,
    descarteKg: descarte,
    valorTotal: valor,
  });
  const r = precoTerceirosPorMes([
    c("a", "2026-03-10", 100, 0, 180),
    c("a", "2026-11-07", 200, 20, 360),
    c("a", "2026-11-09", 60, 0, 150),
    c("c", "2026-11-08", 40, 0, 120),
  ]);

  test("Σ valor ÷ Σ kg líquido por mês e no ano; mês sem compra = null", () => {
    expect(r.a).toHaveLength(13);
    expect(r.a[2]).toBeCloseTo(1.8);
    expect(r.a[10]).toBeCloseTo(510 / 240);
    expect(r.a[12]).toBeCloseTo(690 / 340);
    expect(r.a[0]).toBeNull();
    expect(r.c[10]).toBe(3);
    expect(r.c[2]).toBeNull();
  });
});
