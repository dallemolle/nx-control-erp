import { describe, expect, test } from "vitest";
import { agregarProcessamento } from "@/lib/producao/relatoriosProcessamento";
import type { RelatorioProcessamento } from "@/server/services/relatorioProducao/processamento";
import { COLUNAS_PROCESSAMENTO, linhasDeProcessamento, secoesDeProcessamento } from "./relatorioProcessamento";

const agregado = agregarProcessamento([
  {
    frutaId: "a",
    status: "ENCERRADA",
    frutoKg: 100,
    polpaKg: 40,
    custoTotal: 155,
    balancoVerificar: false,
    branqueamentoVerificar: false,
    aguaLitros: 20,
    carocoResiduoKg: 70,
    perdaKg: 9,
    custoFrutoTotal: 150,
    custoInsumosTotal: 5,
  },
]);
const r: RelatorioProcessamento = {
  periodo: { inicio: new Date("2026-11-01T00:00:00Z"), fim: new Date("2026-11-30T00:00:00Z") },
  porFruta: [{ ...agregado.porFruta.get("a")!, frutaId: "a", fruta: "Açaí" }],
  total: agregado.total,
};

describe("exportação de processamento", () => {
  const linhas = linhasDeProcessamento(r);

  test("três linhas por fruta, uma por seção, sem totais", () => {
    expect(linhas.map((l) => [l.secao, l.fruta])).toEqual([
      ["Resumo", "Açaí"],
      ["Balanço de massa", "Açaí"],
      ["Custo", "Açaí"],
    ]);
    expect(linhas[0]).toMatchObject({ quantidade: 1, encerradas: 1, frutoKg: 100, polpaKg: 40, rendimentoMin: 0.4 });
    expect(linhas[1]).toMatchObject({ aguaKg: 20, diferencaKg: 1, opsVerificar: 0 });
    expect(linhas[2]).toMatchObject({ custoFruto: 150, custoInsumos: 5, custoTotal: 155 });
  });

  test("percentual × 100; vazio quando a seção não usa a coluna", () => {
    const col = (rotulo: string) => COLUNAS_PROCESSAMENTO.find((c) => c.rotulo === rotulo)!;
    expect(col("Rendimento médio").valor(linhas[0])).toBeCloseTo(40);
    expect(col("Água (kg)").valor(linhas[0])).toBe("");
    expect(col("Custo total (R$)").valor(linhas[2])).toBe(155);
  });

  test("PDF: três seções", () => {
    expect(secoesDeProcessamento(r).map((s) => s.titulo)).toEqual([
      "Resumo por fruta",
      "Balanço de massa (OPs encerradas)",
      "Custo por fruta (OPs encerradas)",
    ]);
  });
});
