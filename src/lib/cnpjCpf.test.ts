import { describe, expect, test } from "vitest";
import { cnpjCpfSchema, formatarCnpjCpf } from "./cnpjCpf";

describe("formatarCnpjCpf", () => {
  test("formata 11 dígitos como CPF (XXX.XXX.XXX-XX)", () => {
    expect(formatarCnpjCpf("12345678901")).toBe("123.456.789-01");
  });

  test("formata 14 dígitos como CNPJ (XX.XXX.XXX/XXXX-XX)", () => {
    expect(formatarCnpjCpf("12345678000190")).toBe("12.345.678/0001-90");
  });

  test("ignora pontuação já existente e reformata do zero", () => {
    expect(formatarCnpjCpf("123.456.789-01")).toBe("123.456.789-01");
    expect(formatarCnpjCpf("12.345.678/0001-90")).toBe("12.345.678/0001-90");
  });

  test("aceita CPF colado com máscara errada/parcial, extrai só os dígitos", () => {
    expect(formatarCnpjCpf("123-456.789 01")).toBe("123.456.789-01");
  });

  test("tamanho que não é 11 nem 14 devolve só os dígitos, sem máscara", () => {
    expect(formatarCnpjCpf("123456789")).toBe("123456789");
    expect(formatarCnpjCpf("1234567890123")).toBe("1234567890123");
  });
});

describe("cnpjCpfSchema", () => {
  test("aceita CPF sem máscara e devolve formatado", () => {
    expect(cnpjCpfSchema.parse("12345678901")).toBe("123.456.789-01");
  });

  test("aceita CPF com máscara e devolve formatado (idempotente)", () => {
    expect(cnpjCpfSchema.parse("123.456.789-01")).toBe("123.456.789-01");
  });

  test("aceita CNPJ sem máscara e devolve formatado", () => {
    expect(cnpjCpfSchema.parse("12345678000190")).toBe("12.345.678/0001-90");
  });

  test("aceita CNPJ com máscara e devolve formatado (idempotente)", () => {
    expect(cnpjCpfSchema.parse("12.345.678/0001-90")).toBe("12.345.678/0001-90");
  });

  test("rejeita valor com quantidade de dígitos que não é 11 nem 14", () => {
    const resultado = cnpjCpfSchema.safeParse("123456789012");
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.message).toContain("11 (CPF) ou 14 (CNPJ)");
    }
  });
});
