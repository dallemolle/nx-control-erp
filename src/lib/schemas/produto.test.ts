import { describe, expect, test } from "vitest";
import { produtoSchema } from "./produto";

const base = {
  codigo: "agc",
  descricao: "Polpa de açaí grosso – congelada",
  categoria: "POLPA",
  frutaId: "f1",
  conservacao: "CONGELADO",
  validadeDias: "365",
};

describe("produtoSchema", () => {
  test("código vira maiúsculo e aceita até 6 letras/dígitos", () => {
    expect(produtoSchema.parse(base).codigo).toBe("AGC");
    expect(produtoSchema.safeParse({ ...base, codigo: "AG-C" }).success).toBe(false);
    expect(produtoSchema.safeParse({ ...base, codigo: "ABCDEFG" }).success).toBe(false);
    expect(produtoSchema.safeParse({ ...base, codigo: "" }).success).toBe(false);
  });

  test("validade mínima de 1 dia, em dias inteiros", () => {
    expect(produtoSchema.safeParse({ ...base, validadeDias: "0" }).success).toBe(false);
    expect(produtoSchema.safeParse({ ...base, validadeDias: "1.5" }).success).toBe(false);
  });

  test("unidade comercial e fator vão juntos", () => {
    expect(produtoSchema.safeParse({ ...base, unidadeComercial: "rasa", fatorUnidadeKg: "" }).success).toBe(false);
    expect(produtoSchema.safeParse({ ...base, unidadeComercial: "", fatorUnidadeKg: "14" }).success).toBe(false);
    const ok = produtoSchema.parse({ ...base, unidadeComercial: "rasa", fatorUnidadeKg: "14" });
    expect(ok).toMatchObject({ unidadeComercial: "rasa", fatorUnidadeKg: 14 });
    const sem = produtoSchema.parse({ ...base, unidadeComercial: "", fatorUnidadeKg: "" });
    expect(sem.unidadeComercial).toBeNull();
    expect(sem.fatorUnidadeKg).toBeUndefined();
  });

  test("preço de referência opcional e não negativo", () => {
    expect(produtoSchema.parse({ ...base, precoReferenciaKg: "" }).precoReferenciaKg).toBeUndefined();
    expect(produtoSchema.safeParse({ ...base, precoReferenciaKg: "-1" }).success).toBe(false);
  });
});
