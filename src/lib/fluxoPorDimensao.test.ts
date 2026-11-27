import { describe, expect, test } from "vitest";
import { fluxoEmArvore, resultadoDoMes, totalDoFluxo, type ValoresDoFluxo } from "./fluxoPorDimensao";

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

describe("fluxoEmArvore", () => {
  const dim = (dimensaoId: string | null, dimensaoNome: string, parentId: string | null, v: ValoresDoFluxo) => ({
    dimensaoId,
    dimensaoNome,
    parentId,
    ...v,
  });

  test("o pai soma o filho e ganha a linha Direto em quando tem valor próprio", () => {
    const itens = fluxoEmArvore([
      dim("adm", "Administração", null, linha(0, 45.9, 0, 0)),
      dim("esc", "Escritório", "adm", linha(0, 0, 0, 580)),
      dim(null, "Não classificado", null, linha(100, 0, 0, 0)),
    ]);
    expect(itens.map((i) => [i.chave, i.nome, i.nivel, i.paiChave])).toEqual([
      ["adm", "Administração", 1, null],
      ["adm:direto", "Direto em Administração", 2, "adm"],
      ["esc", "Escritório", 2, "adm"],
      ["nao-classificado", "Não classificado", 1, null],
    ]);
    expect(itens[0].valores).toEqual(linha(0, 45.9, 0, 580));
    expect(itens[1].valores).toEqual(linha(0, 45.9, 0, 0));
    expect(itens[3].temFilhos).toBe(false);
  });
});
