import { describe, expect, test } from "vitest";
import { deveLimparFormulario } from "./formularioDaAcao";

describe("deveLimparFormulario", () => {
  test("com erro, mantém o que foi digitado", () => {
    expect(deveLimparFormulario({ erro: "A entrega não pode ser antes da data do pedido" })).toBe(false);
  });

  test("sem erro (sucesso ou estado vazio), limpa como antes", () => {
    expect(deveLimparFormulario({ sucesso: true })).toBe(true);
    expect(deveLimparFormulario({})).toBe(true);
    expect(deveLimparFormulario({ erro: undefined })).toBe(true);
    expect(deveLimparFormulario({ erro: "" })).toBe(true);
    expect(deveLimparFormulario(null)).toBe(true);
  });
});
