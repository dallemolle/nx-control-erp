import { describe, expect, it } from "vitest";
import { baixaSchema } from "./baixa";
import { MSG_BAIXA_SEM_ABATIMENTO } from "@/lib/financeiro/valorAbatido";

const base = { data: "2026-10-15", valorPago: "20", valorJuros: "0", valorMulta: "0", valorDesconto: "0", contaBancariaId: "c1" };

describe("baixaSchema", () => {
  it("recusa juros + multa iguais a pago + desconto", () => {
    const r = baixaSchema.safeParse({ ...base, valorJuros: "15", valorMulta: "5" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(MSG_BAIXA_SEM_ABATIMENTO);
    expect(r.error?.issues[0]?.path).toEqual(["valorJuros"]);
  });
  it("recusa juros maiores que o pago", () => {
    expect(baixaSchema.safeParse({ ...base, valorJuros: "30" }).success).toBe(false);
  });
  it("aceita quando sobra um centavo para abater", () => {
    expect(baixaSchema.safeParse({ ...base, valorJuros: "19.99" }).success).toBe(true);
  });
  it("aceita desconto que compensa os juros", () => {
    expect(baixaSchema.safeParse({ ...base, valorJuros: "25", valorDesconto: "10" }).success).toBe(true);
  });
});
