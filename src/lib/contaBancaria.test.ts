import { describe, expect, test } from "vitest";
import { nomeDaContaBancaria } from "./contaBancaria";

describe("nomeDaContaBancaria", () => {
  test("conta comum mostra banco, agência e conta", () => {
    expect(nomeDaContaBancaria({ tipo: "CORRENTE", agencia: "1234", conta: "5678", banco: { nome: "Bradesco" } })).toBe(
      "Bradesco - Ag 1234/CC 5678",
    );
  });

  test("conta Caixa mostra só a identificação", () => {
    expect(
      nomeDaContaBancaria({ tipo: "CAIXA", agencia: "-", conta: "Escritório", banco: { nome: "Caixa interno" } }),
    ).toBe("Caixa · Escritório");
  });
});
