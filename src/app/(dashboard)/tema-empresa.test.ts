import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { temaSchema } from "@/lib/tema/schema";
import { TemaEmpresaHead } from "./tema-empresa";

const hortitex = () => temaSchema.parse(JSON.parse(readFileSync("public/temas/hortitex.json", "utf8")));

describe("TemaEmpresaHead", () => {
  test("style e folha de fontes ficam no lugar (sem precedence): saem do documento ao trocar de empresa ou restaurar", () => {
    const html = renderToStaticMarkup(createElement(TemaEmpresaHead, { tema: hortitex(), chave: "x" }));
    expect(html).toContain("<style");
    expect(html).toContain("html[class]{");
    expect(html).toContain('rel="stylesheet"');
    expect(html).not.toContain("data-precedence");
  });
});
