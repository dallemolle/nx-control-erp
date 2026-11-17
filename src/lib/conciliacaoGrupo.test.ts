import { describe, expect, test } from "vitest";
import { diferencaDoGrupo, somaEmCentavos } from "./conciliacaoGrupo";

describe("somaEmCentavos", () => {
  test("entrada soma e saída subtrai", () => {
    expect(
      somaEmCentavos([
        { valor: 100, tipo: "ENTRADA" },
        { valor: 30.5, tipo: "SAIDA" },
      ]),
    ).toBe(6950);
  });

  test("não acumula erro de ponto flutuante", () => {
    expect(
      somaEmCentavos([
        { valor: 0.1, tipo: "ENTRADA" },
        { valor: 0.2, tipo: "ENTRADA" },
      ]),
    ).toBe(30);
  });

  test("lista vazia é zero", () => {
    expect(somaEmCentavos([])).toBe(0);
  });
});

describe("diferencaDoGrupo", () => {
  test("PIX de 1.000 quitando duas parcelas de 500 fecha", () => {
    expect(
      diferencaDoGrupo(
        [{ valor: 1000, tipo: "ENTRADA" }],
        [
          { valor: 500, tipo: "ENTRADA" },
          { valor: 500, tipo: "ENTRADA" },
        ],
      ),
    ).toBe(0);
  });

  test("PIX de 995 contra 1.000 lançados: falta uma saída de 5,00", () => {
    expect(
      diferencaDoGrupo(
        [{ valor: 995, tipo: "ENTRADA" }],
        [{ valor: 1000, tipo: "ENTRADA" }],
      ),
    ).toBe(-500);
  });

  test("entrada e tarifa misturadas fecham com sinal", () => {
    expect(
      diferencaDoGrupo(
        [{ valor: 995, tipo: "ENTRADA" }],
        [
          { valor: 1000, tipo: "ENTRADA" },
          { valor: 5, tipo: "SAIDA" },
        ],
      ),
    ).toBe(0);
  });

  test("sem lançamentos, a diferença é o total das linhas", () => {
    expect(diferencaDoGrupo([{ valor: 12.34, tipo: "SAIDA" }], [])).toBe(-1234);
  });
});
