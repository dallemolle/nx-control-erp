import { describe, expect, test } from "vitest";
import { descricaoDoLancamentoDaBaixa } from "./descricaoDaBaixa";

describe("descricaoDoLancamentoDaBaixa", () => {
  test("documento, contraparte e parcela n/total", () => {
    expect(
      descricaoDoLancamentoDaBaixa({ documento: "NF-e 1234", contraparte: "Agro Insumos", parcela: 1, totalParcelas: 3 }),
    ).toBe("NF-e 1234 · Agro Insumos · parcela 1/3");
  });

  test("sem contraparte, o pedaço do meio some", () => {
    expect(descricaoDoLancamentoDaBaixa({ documento: "PV-41", contraparte: null, parcela: 1, totalParcelas: 1 })).toBe(
      "PV-41 · parcela 1/1",
    );
  });

  test("espaços sobrando no cadastro não entram na descrição", () => {
    expect(
      descricaoDoLancamentoDaBaixa({ documento: " PV-41 ", contraparte: "  ", parcela: 2, totalParcelas: 2 }),
    ).toBe("PV-41 · parcela 2/2");
  });
});
