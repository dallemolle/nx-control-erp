import { describe, expect, test } from "vitest";
import { atalhosDePeriodo } from "./atalhos";

describe("atalhosDePeriodo", () => {
  test("mês atual, mês anterior e ano", () => {
    expect(atalhosDePeriodo(new Date("2026-01-15T00:00:00.000Z"))).toEqual([
      { rotulo: "Mês atual", inicio: "2026-01-01", fim: "2026-01-31" },
      { rotulo: "Mês anterior", inicio: "2025-12-01", fim: "2025-12-31" },
      { rotulo: "Ano", inicio: "2026-01-01", fim: "2026-12-31" },
    ]);
  });
});
