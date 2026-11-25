import { describe, expect, it } from "vitest";
import { totalAbatido, valorAbatidoDaBaixa } from "./valorAbatido";

const b = (valorPago: number, valorJuros = 0, valorMulta = 0, valorDesconto = 0) => ({
  valorPago, valorJuros, valorMulta, valorDesconto,
});

describe("valorAbatidoDaBaixa", () => {
  it("desconto soma ao que foi pago", () => expect(valorAbatidoDaBaixa(b(950, 0, 0, 50))).toBe(1000));
  it("juros e multa saem do que foi pago", () => expect(valorAbatidoDaBaixa(b(1022, 12, 10))).toBe(1000));
  it("juros sem aumentar o pago: abate menos", () => expect(valorAbatidoDaBaixa(b(1000, 30))).toBe(970));
  it("conta em centavos", () => expect(valorAbatidoDaBaixa(b(100.1, 0.2, 0, 0.3))).toBe(100.2));
});

describe("totalAbatido", () => {
  it("soma várias baixas", () => expect(totalAbatido([b(500), b(450, 0, 0, 50)])).toBe(1000));
  it("lista vazia é zero", () => expect(totalAbatido([])).toBe(0));
});
