import { describe, expect, test } from "vitest";
import { calcularRecepcao } from "./recepcao";

describe("calcularRecepcao (RN-04, RN-05)", () => {
  test("4 rasas a R$ 60 = 56 kg e R$ 240,00", () => {
    expect(calcularRecepcao({ bruto: 4, descarte: 0, preco: 60, fatorUnidadeKg: 14 })).toMatchObject({
      brutoKg: 56,
      descarteKg: 0,
      liquidoKg: 56,
      precoKg: 4.2857,
      valorTotal: 240,
    });
  });

  test("56 kg com 3 kg de descarte a R$ 4/kg", () => {
    const r = calcularRecepcao({ bruto: 56, descarte: 3, preco: 4, fatorUnidadeKg: null });
    expect(r).toMatchObject({ liquidoKg: 53, valorTotal: 212 });
    expect(r.percentualDescarte).toBeCloseTo(0.0536, 4);
  });

  test("rasa fracionada: 2,5 rasas a R$ 60 = 35 kg e R$ 150,00", () => {
    expect(calcularRecepcao({ bruto: 2.5, descarte: 0, preco: 60, fatorUnidadeKg: 14 })).toMatchObject({
      liquidoKg: 35,
      valorTotal: 150,
    });
  });

  test("descarte em rasas é convertido junto", () => {
    expect(calcularRecepcao({ bruto: 4, descarte: 0.5, preco: 60, fatorUnidadeKg: 14 })).toMatchObject({
      descarteKg: 7,
      liquidoKg: 49,
      valorTotal: 210,
    });
  });

  test("recusa descarte negativo, maior que o bruto e igual ao bruto", () => {
    expect(() => calcularRecepcao({ bruto: 10, descarte: -1, preco: 1, fatorUnidadeKg: null })).toThrow(
      "O descarte não pode ser negativo",
    );
    expect(() => calcularRecepcao({ bruto: 10, descarte: 11, preco: 1, fatorUnidadeKg: null })).toThrow(
      "O descarte não pode ser maior que o peso bruto",
    );
    expect(() => calcularRecepcao({ bruto: 10, descarte: 10, preco: 1, fatorUnidadeKg: null })).toThrow(
      "O peso líquido precisa ser maior que zero",
    );
  });
});
