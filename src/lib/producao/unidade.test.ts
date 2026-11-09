import { describe, expect, test } from "vitest";
import { paraKg, precoPorKg } from "./unidade";

describe("conversão de unidade comercial (RN-03)", () => {
  test("rasas viram kg, inclusive fração", () => {
    expect(paraKg(4, 14)).toBe(56);
    expect(paraKg(2.5, 14)).toBe(35);
  });
  test("sem fator, a quantidade já está em kg", () => {
    expect(paraKg(10.5, null)).toBe(10.5);
  });
  test("preço por rasa vira R$/kg com 4 casas", () => {
    expect(precoPorKg(60, 14)).toBe(4.2857);
    expect(precoPorKg(4, null)).toBe(4);
  });
});
