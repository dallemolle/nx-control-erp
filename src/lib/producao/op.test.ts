import { describe, expect, test } from "vitest";
import { balancoMassa, custoOP, prefixoDaOP, ratearCustoOP, rendimento, resumirOP, statusBranqueamento } from "./op";
import { proximoCodigoDeLote } from "./lote";

const MIN = { temperaturaMinC: 80, tempoMinS: 10 };

describe("rendimento (RN-10)", () => {
  test("polpa ÷ fruto", () => expect(rendimento(200, 120)).toBe(0.6));
  test("sem fruto é null", () => expect(rendimento(0, 10)).toBeNull());
});

describe("balancoMassa (RN-11)", () => {
  test("exemplo do doc 3: 5 kg, 2,1%, OK", () => {
    const r = balancoMassa({ frutoKg: 200, aguaLitros: 40, polpaKg: 120, carocoResiduoKg: 105, perdaKg: 10 }, 0.03);
    expect(r.diferencaKg).toBe(5);
    expect(r.percentual).toBeCloseTo(0.0208, 4);
    expect(r.status).toBe("OK");
  });
  test("acima da tolerância: VERIFICAR (inclusive diferença negativa)", () => {
    expect(
      balancoMassa({ frutoKg: 200, aguaLitros: 0, polpaKg: 120, carocoResiduoKg: 50, perdaKg: 0 }, 0.03).status,
    ).toBe("VERIFICAR");
    expect(
      balancoMassa({ frutoKg: 100, aguaLitros: 0, polpaKg: 110, carocoResiduoKg: 0, perdaKg: 0 }, 0.03).status,
    ).toBe("VERIFICAR");
  });
  test("no limite da tolerância é OK", () => {
    expect(
      balancoMassa({ frutoKg: 100, aguaLitros: 0, polpaKg: 97, carocoResiduoKg: 0, perdaKg: 0 }, 0.03).status,
    ).toBe("OK");
  });
  test("sem entrada: percentual null e VERIFICAR", () => {
    expect(balancoMassa({ frutoKg: 0, aguaLitros: 0, polpaKg: 0, carocoResiduoKg: 0, perdaKg: 0 }, 0.03)).toEqual({
      diferencaKg: 0,
      percentual: null,
      status: "VERIFICAR",
    });
  });
});

describe("statusBranqueamento (RN-12)", () => {
  test("fruta que não exige", () =>
    expect(statusBranqueamento({ exige: false, temperaturaC: null, tempoS: null }, MIN)).toBe("NAO_SE_APLICA"));
  test("OK no mínimo exato", () =>
    expect(statusBranqueamento({ exige: true, temperaturaC: 80, tempoS: 10 }, MIN)).toBe("OK"));
  test("abaixo da temperatura, abaixo do tempo, valor faltando", () => {
    expect(statusBranqueamento({ exige: true, temperaturaC: 79.9, tempoS: 10 }, MIN)).toBe("VERIFICAR");
    expect(statusBranqueamento({ exige: true, temperaturaC: 85, tempoS: 9 }, MIN)).toBe("VERIFICAR");
    expect(statusBranqueamento({ exige: true, temperaturaC: null, tempoS: 10 }, MIN)).toBe("VERIFICAR");
  });
});

describe("custoOP (RN-13)", () => {
  test("fruto + insumos, custo/kg com 4 casas", () => {
    expect(
      custoOP({
        consumos: [
          { quantidadeKg: 150, custoKg: 1.5 },
          { quantidadeKg: 50, custoKg: 4.2 },
        ],
        insumos: [{ quantidade: 120, custoUnitario: 0.5 }],
        polpaKg: 120,
      }),
    ).toEqual({ custoFrutoTotal: 435, custoInsumosTotal: 60, custoTotal: 495, custoKgPolpa: 4.125 });
  });
  test("custo/kg usa o total sem arredondar", () => {
    expect(custoOP({ consumos: [{ quantidadeKg: 3, custoKg: 1 }], insumos: [], polpaKg: 7 }).custoKgPolpa).toBe(0.4286);
  });
  test("sem polpa: custo/kg 0", () => {
    expect(custoOP({ consumos: [{ quantidadeKg: 10, custoKg: 1 }], insumos: [], polpaKg: 0 }).custoKgPolpa).toBe(0);
  });
});

describe("ratearCustoOP (RN-13, D-06)", () => {
  const p = (produtoId: string, quantidadeKg: number, precoKg: number | null, descricao = `Polpa ${produtoId}`) => ({
    produtoId,
    descricao,
    quantidadeKg,
    precoKg,
  });

  test("exemplo da spec: custo/kg proporcional ao preço e soma ≈ total", () => {
    const r = ratearCustoOP({ custoTotal: 1200, custoKgPolpa: 4 }, [p("g", 100, 30), p("m", 150, 20), p("f", 50, 10)]);
    expect(r.semPreco).toEqual([]);
    expect(Object.fromEntries(r.custoKgPorProduto)).toEqual({ g: 5.5385, m: 3.6923, f: 1.8462 });
    expect(100 * 5.5385 + 150 * 3.6923 + 50 * 1.8462).toBeCloseTo(1200, 1);
  });

  test("duas linhas do mesmo produto somam no peso", () => {
    const r = ratearCustoOP({ custoTotal: 180, custoKgPolpa: 3 }, [p("g", 20, 30), p("f", 20, 10), p("g", 20, 30)]);
    // valor = 40×30 + 20×10 = 1400 → g = 180×30/1400, f = 180×10/1400
    expect(Object.fromEntries(r.custoKgPorProduto)).toEqual({ g: 3.8571, f: 1.2857 });
  });

  test("produto único: médio, mesmo sem preço", () => {
    const r = ratearCustoOP({ custoTotal: 180, custoKgPolpa: 3 }, [p("g", 40, null), p("g", 20, null)]);
    expect(r.semPreco).toEqual([]);
    expect(Object.fromEntries(r.custoKgPorProduto)).toEqual({ g: 3 });
  });

  test("mesmo preço em todos: igual ao médio", () => {
    const r = ratearCustoOP({ custoTotal: 180, custoKgPolpa: 3 }, [p("g", 40, 10), p("f", 20, 10)]);
    expect(Object.fromEntries(r.custoKgPorProduto)).toEqual({ g: 3, f: 3 });
  });

  test("preço faltando ou zero: semPreco sem repetir, na ordem, e médio em todos", () => {
    const r = ratearCustoOP({ custoTotal: 180, custoKgPolpa: 3 }, [
      p("g", 20, 30),
      p("x", 20, null, "Polpa X"),
      p("y", 10, 0, "Polpa Y"),
      p("x", 10, null, "Polpa X"),
    ]);
    expect(r.semPreco).toEqual(["Polpa X", "Polpa Y"]);
    expect(Object.fromEntries(r.custoKgPorProduto)).toEqual({ g: 3, x: 3, y: 3 });
  });

  test("sem produção: mapa vazio", () => {
    const r = ratearCustoOP({ custoTotal: 180, custoKgPolpa: 0 }, []);
    expect(r).toEqual({ custoKgPorProduto: new Map(), semPreco: [] });
  });
});

describe("resumirOP", () => {
  test("lista o que está a verificar", () => {
    const r = resumirOP(
      {
        exigeBranqueamento: true,
        branqueamentoTemperaturaC: null,
        branqueamentoTempoS: null,
        aguaLitros: 0,
        carocoResiduoKg: 0,
        perdaKg: 0,
        consumos: [{ quantidadeKg: 100, custoKg: 1 }],
        producoes: [{ quantidadeKg: 60 }, { quantidadeKg: 10 }],
        insumos: [],
      },
      { toleranciaBalancoMassa: 0.03, branqueamentoTemperaturaMinC: 80, branqueamentoTempoMinS: 10 },
    );
    expect(r.frutoKg).toBe(100);
    expect(r.polpaKg).toBe(70);
    expect(r.rendimento).toBe(0.7);
    expect(r.aVerificar).toEqual(["Balanço de massa", "Branqueamento"]);
  });
});

test("número da OP: OP-AAMMDD-NN pela sequência do dia", () => {
  const prefixo = prefixoDaOP(new Date("2026-11-10"));
  expect(prefixo).toBe("OP-261110");
  expect(proximoCodigoDeLote(prefixo, ["OP-261110-01", "OP-261109-07"])).toBe("OP-261110-02");
});
