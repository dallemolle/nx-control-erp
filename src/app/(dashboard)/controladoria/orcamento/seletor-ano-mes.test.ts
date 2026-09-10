import { describe, expect, test } from "vitest";
import { deslocarAno } from "./seletor-ano-mes";

describe("deslocarAno", () => {
  test("avança um ano", () => {
    expect(deslocarAno(2026, 1)).toBe(2027);
  });

  test("volta um ano", () => {
    expect(deslocarAno(2026, -1)).toBe(2025);
  });
});
