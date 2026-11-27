import { describe, expect, test } from "vitest";
import { resultadoDoMes, totalDoFluxo } from "./fluxoPorDimensao";

const linha = (entradasRealizadas: number, saidasRealizadas: number, entradasProjetadas: number, saidasProjetadas: number) => ({
  entradasRealizadas,
  saidasRealizadas,
  entradasProjetadas,
  saidasProjetadas,
});

describe("fluxo por dimensão", () => {
  test("resultado do mês é entradas menos saídas, realizado e projetado", () => {
    expect(resultadoDoMes(linha(1000, 300, 500, 200))).toBe(1000);
  });

  test("total soma as colunas em centavos e traz o resultado", () => {
    const total = totalDoFluxo([linha(0.1, 0, 0, 0), linha(0.2, 45.9, 0, 0), linha(0, 0, 1000, 580)]);
    expect(total).toEqual({
      entradasRealizadas: 0.3,
      saidasRealizadas: 45.9,
      entradasProjetadas: 1000,
      saidasProjetadas: 580,
      resultado: 374.4,
    });
  });

  test("sem linhas, tudo zero", () => {
    expect(totalDoFluxo([])).toEqual({
      entradasRealizadas: 0,
      saidasRealizadas: 0,
      entradasProjetadas: 0,
      saidasProjetadas: 0,
      resultado: 0,
    });
  });
});
