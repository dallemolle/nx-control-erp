import { describe, expect, test } from "vitest";
import { calcularValidade, prefixoDoLote, proximoCodigoDeFilho, proximoCodigoDeLote } from "./lote";

const dia = (d: Date) => d.toISOString().slice(0, 10);

describe("validade (RN-07)", () => {
  test("soma os dias de validade em data de calendário UTC", () => {
    expect(dia(calcularValidade(new Date("2026-11-09"), 1))).toBe("2026-11-10");
    expect(dia(calcularValidade(new Date("2026-11-09"), 365))).toBe("2027-11-09");
  });
});

describe("número do lote (RN-01)", () => {
  test("prefixo com código do produto e AAMMDD", () => {
    expect(prefixoDoLote("FA", new Date("2026-11-09"))).toBe("FA-261109");
  });
  test("sequência do dia com 2 dígitos, 3 a partir de 100", () => {
    expect(proximoCodigoDeLote("FA-261109", [])).toBe("FA-261109-01");
    expect(proximoCodigoDeLote("FA-261109", ["FA-261109-01", "FA-261109-09"])).toBe("FA-261109-10");
    expect(proximoCodigoDeLote("FA-261109", ["FA-261109-99"])).toBe("FA-261109-100");
  });
  test("ignora códigos de outro prefixo ou fora do padrão", () => {
    expect(proximoCodigoDeLote("FA-261109", ["FA-261108-05", "FA-261109-X"])).toBe("FA-261109-01");
  });
});

describe("proximoCodigoDeFilho (D-36)", () => {
  test("primeiro filho é /1", () => {
    expect(proximoCodigoDeFilho("AGC-261110-01", [])).toBe("AGC-261110-01/1");
  });
  test("maior sufixo + 1, ignorando outros lotes e sufixos não numéricos", () => {
    expect(
      proximoCodigoDeFilho("AGC-261110-01", [
        "AGC-261110-01/1",
        "AGC-261110-01/3",
        "AGC-261110-01/x",
        "AGC-261110-010/9",
        "AGC-261110-02/7",
      ]),
    ).toBe("AGC-261110-01/4");
  });
});

test("proximoCodigoDeLote não conta os filhos /N", () => {
  expect(proximoCodigoDeLote("FA-261110", ["FA-261110-01", "FA-261110-01/1", "FA-261110-01/2"])).toBe("FA-261110-02");
});