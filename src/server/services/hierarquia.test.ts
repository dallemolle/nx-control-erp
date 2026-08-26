import { describe, expect, test } from "vitest";
import { assertSemCiclo, CicloHierarquiaError } from "./hierarquia";

const ITENS = [
  { id: "raiz", parentId: null },
  { id: "filho", parentId: "raiz" },
  { id: "neto", parentId: "filho" },
];

describe("assertSemCiclo", () => {
  test("permite remover o pai (parentId nulo)", () => {
    expect(() => assertSemCiclo(ITENS, "filho", null)).not.toThrow();
  });

  test("permite reatribuir para um pai válido não relacionado", () => {
    const itens = [...ITENS, { id: "outro", parentId: null }];
    expect(() => assertSemCiclo(itens, "filho", "outro")).not.toThrow();
  });

  test("bloqueia um item virar pai de si mesmo", () => {
    expect(() => assertSemCiclo(ITENS, "filho", "filho")).toThrow(CicloHierarquiaError);
  });

  test("bloqueia um item virar filho de seu próprio descendente", () => {
    expect(() => assertSemCiclo(ITENS, "raiz", "neto")).toThrow(CicloHierarquiaError);
  });
});
