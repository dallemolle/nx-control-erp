import { describe, expect, test } from "vitest";
import { lerValorEmReais, valorParaCampo } from "./valorEmReais";

describe("lerValorEmReais", () => {
  test.each([
    ["1.500", 1500],
    ["1.500,50", 1500.5],
    ["1500,5", 1500.5],
    ["1500", 1500],
    ["1.5", 1.5],
    ["1500.75", 1500.75],
    ["R$ 2.000,00", 2000],
    ["  45,90 ", 45.9],
    ["1.234.567,89", 1234567.89],
    ["", 0],
    ["-300", -300],
  ])("%s → %d", (texto, esperado) => {
    expect(lerValorEmReais(texto)).toBe(esperado);
  });

  test.each(["abc", "1,2,3", "1.50.0", "1,5.0", "12,345,6", "R$"])("%s é inválido", (texto) => {
    expect(lerValorEmReais(texto)).toBeNull();
  });
});

test("valorParaCampo abre o campo no formato brasileiro", () => {
  expect(valorParaCampo(1500)).toBe("1.500,00");
  expect(valorParaCampo(0)).toBe("0,00");
  expect(valorParaCampo(45.9)).toBe("45,90");
});
