import { describe, expect, test } from "vitest";
import { argumentosDeCursor, montarPagina } from "./paginacao";

const linhas = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${i + 1}` }));

describe("montarPagina", () => {
  test("menos linhas que o limite: tudo, sem próximo cursor", () => {
    expect(montarPagina(linhas(2), 3)).toEqual({ itens: linhas(2), proximoCursor: null });
  });

  test("exatamente o limite: tudo, sem próximo cursor", () => {
    expect(montarPagina(linhas(3), 3)).toEqual({ itens: linhas(3), proximoCursor: null });
  });

  test("linha extra: corta no limite e o cursor é o último item devolvido", () => {
    expect(montarPagina(linhas(4), 3)).toEqual({ itens: linhas(3), proximoCursor: "id-3" });
  });
});

describe("argumentosDeCursor", () => {
  test("sem cursor busca limite + 1", () => {
    expect(argumentosDeCursor({ limite: 10 })).toEqual({ take: 11 });
  });

  test("com cursor pula o próprio cursor", () => {
    expect(argumentosDeCursor({ limite: 10, cursor: "abc" })).toEqual({ take: 11, cursor: { id: "abc" }, skip: 1 });
  });
});
