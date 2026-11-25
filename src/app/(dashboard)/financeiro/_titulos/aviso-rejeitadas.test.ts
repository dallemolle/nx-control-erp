import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvisoRejeitadas, textoDoAvisoRejeitadas } from "./aviso-rejeitadas";

const html = (quantidade: number, filtroAtivo = false) =>
  renderToStaticMarkup(
    createElement(AvisoRejeitadas, { quantidade, href: "/financeiro/contas-a-pagar?rejeitadas=1", filtroAtivo }),
  );

describe("AvisoRejeitadas", () => {
  it("singular e plural", () => {
    expect(textoDoAvisoRejeitadas(1)).toBe("1 baixa rejeitada aguardando novo registro.");
    expect(textoDoAvisoRejeitadas(3)).toBe("3 baixas rejeitadas aguardando novo registro.");
  });

  it("sem rejeição em aberto, não mostra nada", () => {
    expect(html(0)).toBe("");
  });

  it("mostra o texto e o link Ver", () => {
    const saida = html(2);
    expect(saida).toContain("2 baixas rejeitadas aguardando novo registro.");
    expect(saida).toContain('href="/financeiro/contas-a-pagar?rejeitadas=1"');
    expect(saida).toContain("Ver");
  });

  it("com o filtro já ativo, o link some", () => {
    expect(html(2, true)).not.toContain("href=");
  });
});
