import { describe, expect, test } from "vitest";
import { avisoChaveAcesso } from "./secao-documento-fiscal";

const CHAVE_VALIDA = "35240312345678000195550010000012341123456782";

describe("avisoChaveAcesso", () => {
  test("campo vazio não mostra aviso", () => {
    expect(avisoChaveAcesso("")).toBeNull();
  });

  test("enquanto digita, mostra a contagem de dígitos (ignorando espaços)", () => {
    expect(avisoChaveAcesso("3524 0312")).toBe("8/44 dígitos");
  });

  test("44 dígitos válidos (mesmo colados com espaços do DANFE) não mostram aviso", () => {
    expect(avisoChaveAcesso("3524 0312 3456 7800 0195 5500 1000 0012 3411 2345 6782")).toBeNull();
    expect(avisoChaveAcesso(CHAVE_VALIDA)).toBeNull();
  });

  test("44 dígitos com DV errado avisam para conferir a chave", () => {
    expect(avisoChaveAcesso(`${CHAVE_VALIDA.slice(0, 43)}3`)).toMatch(/Dígito verificador/);
  });
});
