import { describe, expect, test } from "vitest";
import { montarColunasMensais } from "@/lib/producao/relatorios";
import type { RelatorioMensal } from "@/server/services/relatorioProducao/mensal";
import { COLUNAS_MENSAL, linhasDoMensal, secoesDoMensal } from "./relatorioMensal";

const colunas = montarColunasMensais(
  [
    {
      frutaId: "a",
      origem: "TERCEIRO",
      brutoKg: 50,
      descarteKg: 0,
      valorTotal: 100,
      data: new Date("2026-11-10T00:00:00Z"),
    },
  ],
  [],
  [],
);
const r: RelatorioMensal = {
  ano: 2026,
  frutas: [{ id: "a", nome: "Açaí" }],
  colunas,
  polpaPorProduto: [
    { produtoId: "agc", produto: "AGC · Polpa", meses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0, 0], total: 20 },
  ],
};

describe("exportação do mensal", () => {
  const linhas = linhasDoMensal(r);

  test("uma linha por indicador × mês (12 + total), mais a polpa por produto", () => {
    const terceiros = linhas.filter((l) => l.indicador === "Terceiros" && l.fruta === "Açaí");
    expect(terceiros).toHaveLength(13);
    expect(terceiros[10]).toEqual({
      bloco: "Recepção",
      indicador: "Terceiros",
      fruta: "Açaí",
      mes: "11",
      valor: 50,
      unidade: "kg",
    });
    expect(terceiros[12].mes).toBe("Total");
    const polpa = linhas.filter((l) => l.bloco === "Polpa por produto");
    expect(polpa).toHaveLength(13);
    expect(polpa[9]).toMatchObject({ indicador: "AGC · Polpa", mes: "10", valor: 20, unidade: "kg" });
  });

  test("percentual sai multiplicado por 100 e nulo sai vazio", () => {
    const valor = COLUNAS_MENSAL.find((c) => c.rotulo === "Valor")!;
    expect(valor.valor({ bloco: "", indicador: "", fruta: "", mes: "1", valor: 0.25, unidade: "%" })).toBe(25);
    expect(valor.valor({ bloco: "", indicador: "", fruta: "", mes: "1", valor: null, unidade: "%" })).toBe("");
  });

  test("PDF: uma seção por bloco e a polpa por produto", () => {
    expect(secoesDoMensal(r).map((s) => s.titulo)).toEqual([
      "Recepção",
      "Processamento",
      "Vendas",
      "Custos",
      "Polpa produzida por produto (kg)",
    ]);
  });
});
