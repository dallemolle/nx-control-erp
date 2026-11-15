import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { temaSchema } from "./schema";
import { logoDaSidebar } from "./logo";

const hortitex = () => temaSchema.parse(JSON.parse(readFileSync("public/temas/hortitex.json", "utf8")));
const logos = { logoUrl: "claro.png", logoEscuroUrl: "escuro.png" };

describe("logoDaSidebar", () => {
  test("sidebar escura usa o logo para fundo escuro", () => {
    expect(logoDaSidebar({ tema: hortitex(), corPrimaria: null, ...logos })).toBe("escuro.png");
  });

  test("sem logo escuro, cai no logo claro", () => {
    expect(logoDaSidebar({ tema: hortitex(), corPrimaria: null, logoUrl: "claro.png", logoEscuroUrl: null })).toBe(
      "claro.png",
    );
  });

  test("sidebar clara usa o logo claro", () => {
    const tema = hortitex();
    tema.cores.claro.sidebar = "#f7f1e3";
    expect(logoDaSidebar({ tema, corPrimaria: null, ...logos })).toBe("claro.png");
  });

  test("sem tema: corPrimaria escura usa o escuro; sem cor, o claro", () => {
    expect(logoDaSidebar({ tema: null, corPrimaria: "#0b2545", ...logos })).toBe("escuro.png");
    expect(logoDaSidebar({ tema: null, corPrimaria: null, ...logos })).toBe("claro.png");
  });
});
