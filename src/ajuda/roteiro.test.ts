import { describe, expect, test } from "vitest";
import { ehEDepois, limitarIndice, totalDeEtapas, valoresAte } from "./roteiro";
import type { Passo, Roteiro } from "./tipos";

function passo(alvo: string, preenche?: Record<string, string>): Passo {
  return { cena: "cena", alvo, instrucao: `Instrução ${alvo}`, explicacao: "", preenche };
}

const ROTEIRO: Roteiro = {
  id: "teste",
  titulo: "Teste",
  quandoUsar: "",
  passos: [passo("a", { a: "1" }), passo("b"), passo("c", { c: "3", a: "novo" })],
  eDepois: { texto: "Fim" },
};

describe("valoresAte", () => {
  test("o primeiro passo já mostra o próprio valor", () => {
    expect(valoresAte(ROTEIRO, 0)).toEqual({ a: "1" });
  });

  test("passo sem preenche mantém os valores anteriores", () => {
    expect(valoresAte(ROTEIRO, 1)).toEqual({ a: "1" });
  });

  test("passo posterior sobrescreve o valor do mesmo alvo", () => {
    expect(valoresAte(ROTEIRO, 2)).toEqual({ a: "novo", c: "3" });
  });

  test("no E depois mostra todos os valores do roteiro", () => {
    expect(valoresAte(ROTEIRO, 3)).toEqual({ a: "novo", c: "3" });
  });

  test("voltar um passo desfaz o preenchimento", () => {
    expect(valoresAte(ROTEIRO, 2).c).toBe("3");
    expect(valoresAte(ROTEIRO, 1).c).toBeUndefined();
  });
});

describe("navegação", () => {
  test("total de etapas conta o E depois", () => {
    expect(totalDeEtapas(ROTEIRO)).toBe(4);
  });

  test("índice fica entre o primeiro passo e o E depois", () => {
    expect(limitarIndice(ROTEIRO, -1)).toBe(0);
    expect(limitarIndice(ROTEIRO, 2)).toBe(2);
    expect(limitarIndice(ROTEIRO, 99)).toBe(3);
  });

  test("E depois é o índice logo após o último passo", () => {
    expect(ehEDepois(ROTEIRO, 2)).toBe(false);
    expect(ehEDepois(ROTEIRO, 3)).toBe(true);
  });
});
