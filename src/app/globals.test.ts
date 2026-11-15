import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const css = () => readFileSync("src/app/globals.css", "utf8");

describe("globals.css — fontes", () => {
  test("texto e títulos usam a Geist carregada pelo layout (variável --font-geist-sans)", () => {
    expect(css()).toMatch(/--font-sans:\s*var\(--font-geist-sans\)/);
    expect(css()).toMatch(/--font-heading:\s*var\(--font-geist-sans\)/);
  });

  test("nenhuma variável de fonte aponta para ela mesma (cai na fonte serifada do navegador)", () => {
    expect(css()).not.toMatch(/--font-sans:\s*var\(--font-sans\)/);
    expect(css()).not.toMatch(/--font-heading:\s*var\(--font-sans\)/);
  });
});
