import { describe, expect, test } from "vitest";
import { formatarRotuloPeriodo } from "./formatar-rotulo-periodo";

describe("formatarRotuloPeriodo", () => {
  test("DIA formata como data curta", () => {
    const rotulo = formatarRotuloPeriodo("DIA", new Date(Date.UTC(2026, 8, 15)), new Date(Date.UTC(2026, 8, 15, 23, 59, 59, 999)));
    expect(rotulo).toBe("15/09/2026");
  });

  test("SEMANA formata como intervalo", () => {
    const rotulo = formatarRotuloPeriodo(
      "SEMANA",
      new Date(Date.UTC(2026, 7, 31)),
      new Date(Date.UTC(2026, 8, 6, 23, 59, 59, 999)),
    );
    expect(rotulo).toBe("Semana de 31/08/2026 a 06/09/2026");
  });

  test("MES formata como mês por extenso + ano", () => {
    const rotulo = formatarRotuloPeriodo("MES", new Date(Date.UTC(2026, 8, 1)), new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999)));
    expect(rotulo.toLowerCase()).toContain("setembro");
    expect(rotulo).toContain("2026");
  });

  test("ANO formata como o ano", () => {
    const rotulo = formatarRotuloPeriodo("ANO", new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999)));
    expect(rotulo).toBe("2026");
  });
});
