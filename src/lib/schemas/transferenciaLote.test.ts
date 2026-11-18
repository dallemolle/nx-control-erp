import { describe, expect, test } from "vitest";
import { transferenciaLoteSchema } from "./transferenciaLote";

describe("transferenciaLoteSchema", () => {
  test("aceita kg decimal", () => {
    expect(transferenciaLoteSchema.parse({ loteId: "l", localId: "x", quantidadeKg: "12.5" }).quantidadeKg).toBe(12.5);
  });
  test("exige local e quantidade positiva", () => {
    const r = transferenciaLoteSchema.safeParse({ loteId: "l", localId: "", quantidadeKg: "0" });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.message)).toEqual([
      "Selecione o local de destino",
      "Informe uma quantidade maior que zero",
    ]);
  });
});
