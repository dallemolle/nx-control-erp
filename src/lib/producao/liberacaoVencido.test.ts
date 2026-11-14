import { describe, expect, test } from "vitest";
import { liberacaoCobre, liberadoAteDoLote, situacaoLiberacao } from "./liberacaoVencido";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("liberadoAteDoLote", () => {
  test("soma os dias à validade, virando o mês", () => {
    expect(liberadoAteDoLote(d("2026-11-28"), 5)).toEqual(d("2026-12-03"));
  });
});

describe("liberacaoCobre", () => {
  test("sem liberação não cobre", () => {
    expect(liberacaoCobre(null, d("2026-11-10"))).toBe(false);
  });

  test("cobre até o último dia, inclusive", () => {
    expect(liberacaoCobre(d("2026-11-10"), d("2026-11-10"))).toBe(true);
    expect(liberacaoCobre(d("2026-11-10"), d("2026-11-11"))).toBe(false);
  });
});

describe("situacaoLiberacao", () => {
  test("produto sem prazo", () => {
    expect(situacaoLiberacao(d("2026-11-10"), null, d("2026-11-12"))).toEqual({ tipo: "SEM_PRAZO" });
  });

  test("pode liberar até o limite, inclusive", () => {
    expect(situacaoLiberacao(d("2026-11-10"), 3, d("2026-11-13"))).toEqual({
      tipo: "PODE",
      liberadoAte: d("2026-11-13"),
      dias: 3,
    });
  });

  test("prazo encerrado depois do limite", () => {
    expect(situacaoLiberacao(d("2026-11-10"), 3, d("2026-11-14"))).toEqual({
      tipo: "PRAZO_ENCERRADO",
      limite: d("2026-11-13"),
    });
  });
});
