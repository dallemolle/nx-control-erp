import { describe, expect, test } from "vitest";
import { calcularValidade, prefixoDoLote, proximoCodigoDeLote } from "./lote";

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
