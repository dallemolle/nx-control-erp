import { describe, expect, test } from "vitest";
import { z } from "zod";
import { checkboxSchema, numeroOpcional, textoOpcional } from "./campos";

describe("checkboxSchema", () => {
  test("on/true viram true; ausente vira false", () => {
    expect(checkboxSchema.parse("on")).toBe(true);
    expect(checkboxSchema.parse("true")).toBe(true);
    expect(checkboxSchema.parse(undefined)).toBe(false);
    expect(checkboxSchema.parse("false")).toBe(false);
  });
});

describe("numeroOpcional", () => {
  const schema = numeroOpcional(z.number().positive("Deve ser maior que zero"));
  test("vazio vira undefined", () => {
    expect(schema.parse("")).toBeUndefined();
    expect(schema.parse(undefined)).toBeUndefined();
  });
  test("texto numérico vira número validado", () => {
    expect(schema.parse("14.5")).toBe(14.5);
    expect(schema.safeParse("0").success).toBe(false);
    expect(schema.safeParse("abc").success).toBe(false);
  });
});

describe("textoOpcional", () => {
  test("vazio vira null; texto é aparado", () => {
    expect(textoOpcional.parse("")).toBeNull();
    expect(textoOpcional.parse("  -18 °C ")).toBe("-18 °C");
    expect(textoOpcional.parse(undefined)).toBeNull();
  });
});
