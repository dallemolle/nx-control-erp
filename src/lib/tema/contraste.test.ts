import { describe, expect, test } from "vitest";
import { contraste } from "./contraste";

describe("contraste (WCAG)", () => {
  test("preto sobre branco é 21:1 e cor igual é 1:1", () => {
    expect(contraste("#000000", "#ffffff")).toBe(21);
    expect(contraste("#ffffff", "#ffffff")).toBe(1);
  });

  test("é simétrico", () => {
    expect(contraste("#1f4d2e", "#f7f1e3")).toBe(contraste("#f7f1e3", "#1f4d2e"));
  });
});
