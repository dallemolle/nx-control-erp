import { describe, expect, test } from "vitest";
import { dataValida } from "./data-valida";

describe("dataValida", () => {
  test("string no formato YYYY-MM-DD válida vira Date UTC-meia-noite", () => {
    const resultado = dataValida("2026-09-15");
    expect(resultado.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  test("string malformada cai no fallback de hoje, sem lançar erro", () => {
    expect(() => dataValida("abc")).not.toThrow();
  });

  test("undefined cai no fallback de hoje", () => {
    expect(() => dataValida(undefined)).not.toThrow();
  });

  test("data sintaticamente válida mas com valores impossíveis não lança erro", () => {
    expect(() => dataValida("2026-99-99")).not.toThrow();
  });
});
