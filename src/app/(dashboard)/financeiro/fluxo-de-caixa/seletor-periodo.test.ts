import { describe, expect, test } from "vitest";
import { deslocarData } from "./seletor-periodo";

describe("deslocarData", () => {
  test("DIA/SEMANA: avança um mês a partir do dia 31 sem pular fevereiro", () => {
    const resultado = deslocarData(new Date(Date.UTC(2026, 0, 31)), "DIA", 1);
    expect(resultado.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  test("DIA/SEMANA: volta um mês a partir do dia 31 sem \"não sair do lugar\"", () => {
    const resultado = deslocarData(new Date(Date.UTC(2026, 9, 31)), "DIA", -1);
    expect(resultado.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  test("MES: avança um ano a partir de qualquer dia do ano", () => {
    const resultado = deslocarData(new Date(Date.UTC(2026, 11, 31)), "MES", 1);
    expect(resultado.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  test("ANO: desloca 5 anos", () => {
    const resultado = deslocarData(new Date(Date.UTC(2026, 5, 15)), "ANO", 1);
    expect(resultado.toISOString()).toBe("2031-01-01T00:00:00.000Z");
  });

  test("DIA/SEMANA: dezembro + 1 mês vira janeiro do ano seguinte", () => {
    const resultado = deslocarData(new Date(Date.UTC(2026, 11, 15)), "DIA", 1);
    expect(resultado.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
