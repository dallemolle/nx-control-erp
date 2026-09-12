import { describe, expect, test } from "vitest";
import { deslocarDataProjetado } from "./seletor-modo";

describe("deslocarDataProjetado", () => {
  test("MOVEL: avança um mês, incluindo virada de ano (dezembro -> janeiro)", () => {
    const resultado = deslocarDataProjetado(new Date(Date.UTC(2026, 11, 15)), "MOVEL", 1);
    expect(resultado.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  test("MOVEL: volta um mês", () => {
    const resultado = deslocarDataProjetado(new Date(Date.UTC(2026, 5, 15)), "MOVEL", -1);
    expect(resultado.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  test("ANO_CIVIL: avança um ano", () => {
    const resultado = deslocarDataProjetado(new Date(Date.UTC(2026, 5, 15)), "ANO_CIVIL", 1);
    expect(resultado.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  test("ANO_CIVIL: volta um ano", () => {
    const resultado = deslocarDataProjetado(new Date(Date.UTC(2026, 5, 15)), "ANO_CIVIL", -1);
    expect(resultado.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });
});
