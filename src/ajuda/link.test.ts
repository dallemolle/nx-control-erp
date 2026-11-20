import { describe, expect, test } from "vitest";
import { lerLinkAjuda } from "./link";

describe("lerLinkAjuda", () => {
  test("tela e roteiro", () => {
    expect(lerLinkAjuda("#ajuda/contas-a-pagar/cadastrar-titulo")).toEqual({
      tela: "contas-a-pagar",
      roteiro: "cadastrar-titulo",
    });
  });

  test("só a tela abre o índice", () => {
    expect(lerLinkAjuda("#ajuda/contas-a-pagar")).toEqual({ tela: "contas-a-pagar" });
  });

  test("links comuns não são da ajuda", () => {
    expect(lerLinkAjuda("https://exemplo.com")).toBeNull();
    expect(lerLinkAjuda("#secao-3")).toBeNull();
    expect(lerLinkAjuda(undefined)).toBeNull();
  });

  test("formatos inválidos são ignorados", () => {
    expect(lerLinkAjuda("#ajuda/")).toBeNull();
    expect(lerLinkAjuda("#ajuda/contas-a-pagar/")).toBeNull();
    expect(lerLinkAjuda("#ajuda/contas-a-pagar/a/b")).toBeNull();
    expect(lerLinkAjuda("#ajuda/Contas a pagar")).toBeNull();
  });
});
