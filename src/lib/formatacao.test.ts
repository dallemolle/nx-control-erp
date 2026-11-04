import { describe, expect, it } from "vitest";
import { formatarData, formatarMoeda } from "./formatacao";

// Intl usa espaço não separável entre "R$" e o número.
const semNbsp = (texto: string) => texto.replace(/ /g, " ");

describe("formatarMoeda", () => {
  it("formata com R$, separador de milhar e 2 casas", () => {
    expect(semNbsp(formatarMoeda(1234567.8))).toBe("R$ 1.234.567,80");
  });

  it("aceita string e objetos tipo Decimal", () => {
    expect(semNbsp(formatarMoeda("10.5"))).toBe("R$ 10,50");
    expect(semNbsp(formatarMoeda({ toString: () => "99.999" }))).toBe("R$ 100,00");
  });

  it("formata negativos", () => {
    expect(semNbsp(formatarMoeda(-50))).toBe("-R$ 50,00");
  });
});

describe("formatarData", () => {
  it("formata meia-noite UTC como o próprio dia, independente do fuso local", () => {
    expect(formatarData(new Date("2026-11-03T00:00:00.000Z"))).toBe("03/11/2026");
  });

  it("aceita string ISO", () => {
    expect(formatarData("2026-01-01T00:00:00.000Z")).toBe("01/01/2026");
  });
});
