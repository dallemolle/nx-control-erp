import { describe, expect, test } from "vitest";
import { lerValidadeChave, OPCOES_VALIDADE_CHAVE } from "./validadeChaveApi";

describe("lerValidadeChave", () => {
  test("vazio = sem validade", () => {
    expect(lerValidadeChave("")).toBeNull();
  });

  test("aceita só os prazos da lista", () => {
    expect(lerValidadeChave("30")).toBe(30);
    expect(lerValidadeChave("90")).toBe(90);
    expect(lerValidadeChave("365")).toBe(365);
    expect(lerValidadeChave("31")).toBeUndefined();
    expect(lerValidadeChave("abc")).toBeUndefined();
  });

  test("a lista tem os rótulos da tela", () => {
    expect(OPCOES_VALIDADE_CHAVE.map((o) => o.rotulo)).toEqual(["30 dias", "90 dias", "1 ano"]);
  });
});
