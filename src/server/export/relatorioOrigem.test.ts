import { describe, expect, test } from "vitest";
import { agregarPorOrigem, precoTerceirosPorMes, produtividadeTalhoes } from "@/lib/producao/relatoriosOrigem";
import type { RelatorioOrigem } from "@/server/services/relatorioProducao/origem";
import { COLUNAS_ORIGEM, linhasDeOrigem, secoesDeOrigem } from "./relatorioOrigem";

const base = { origemId: "f1", nome: "Produtor", descarteKg: 0, cargas: 1 };
const origem = agregarPorOrigem([
  { ...base, tipo: "TERCEIRO", frutaId: "a", brutoKg: 100, valorTotal: 200 },
  { ...base, tipo: "TERCEIRO", frutaId: "c", brutoKg: 40, valorTotal: 120 },
  { ...base, tipo: "PROPRIA", origemId: "t1", nome: "Talhão 1", frutaId: "a", brutoKg: 50, valorTotal: 75 },
]);
const prod = produtividadeTalhoes(
  [{ id: "t1", nome: "Talhão 1", fruta: "Açaí", areaHa: 2, ativo: true }],
  new Map([["t1", 50]]),
  [{ talhaoId: "t1", brutoKg: 1000, descarteKg: 0, colheitas: 3 }],
);
const preco = precoTerceirosPorMes([
  { frutaId: "a", data: new Date("2026-11-05T00:00:00Z"), brutoKg: 100, descarteKg: 0, valorTotal: 200 },
]);
const r: RelatorioOrigem = {
  periodo: { inicio: new Date("2026-11-01T00:00:00Z"), fim: new Date("2026-11-30T00:00:00Z") },
  ano: 2026,
  frutas: [
    { id: "a", nome: "Açaí" },
    { id: "c", nome: "Cupuaçu" },
  ],
  porOrigem: origem.linhas,
  total: origem.total,
  produtividade: prod.linhas,
  totalProdutividade: prod.total,
  frutasTerceiros: [{ id: "a", nome: "Açaí" }],
  precoPorMes: preco,
};

describe("exportação de origem", () => {
  const linhas = linhasDeOrigem(r);

  test("origem em formato longo (origem × fruta), produtividade e preço por mês", () => {
    expect(linhas.map((l) => [l.secao, l.origem, l.fruta, l.mes, l.kg])).toEqual([
      ["Origem", "Produtor", "Açaí", "", 100],
      ["Origem", "Produtor", "Cupuaçu", "", 40],
      ["Origem", "Talhão 1", "Açaí", "", 50],
      ["Produtividade", "Talhão 1", "Açaí", "", 50],
      ["Preço a terceiros", "", "Açaí", "11", null],
      ["Preço a terceiros", "", "Açaí", "Ano", null],
    ]);
    expect(linhas[0]).toMatchObject({ tipo: "Terceiro", valor: 200, precoMedio: 2, cargas: 1 });
    expect(linhas[2]).toMatchObject({ tipo: "Própria", valor: null, precoMedio: null });
    expect(linhas[3]).toMatchObject({ areaHa: 2, kgAno: 1000, toneladasHa: 0.5, colheitas: 3 });
    expect(linhas[4].precoMedio).toBe(2);
  });

  test("vazio quando não se aplica; percentual × 100", () => {
    const col = (rotulo: string) => COLUNAS_ORIGEM.find((c) => c.rotulo === rotulo)!;
    expect(col("Valor").valor(linhas[2])).toBe("");
    expect(col("Descarte %").valor(linhas[0])).toBe(0);
  });

  test("PDF: três seções com o ano no título", () => {
    expect(secoesDeOrigem(r).map((s) => s.titulo)).toEqual([
      "Por origem",
      "Produtividade dos talhões em 2026",
      "Preço médio pago a terceiros por mês em 2026",
    ]);
  });
});
