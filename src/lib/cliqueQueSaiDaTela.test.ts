import { describe, expect, test } from "vitest";
import { cliqueQueSaiDaTela } from "./cliqueQueSaiDaTela";

const ATUAL = "http://localhost:3000/producao/processamento/OP-1?aba=processo";
const clique = (extra: Partial<Parameters<typeof cliqueQueSaiDaTela>[0]> = {}) => ({
  href: "/producao/processamento/OP-1?aba=producao",
  target: null,
  download: false,
  botao: 0,
  modificador: false,
  ...extra,
});

describe("cliqueQueSaiDaTela", () => {
  test("link interno para outra aba ou outra tela sai da tela", () => {
    expect(cliqueQueSaiDaTela(clique(), ATUAL)).toBe(true);
    expect(cliqueQueSaiDaTela(clique({ href: "?aba=consumo" }), ATUAL)).toBe(true);
    expect(cliqueQueSaiDaTela(clique({ href: "/producao/processamento" }), ATUAL)).toBe(true);
  });

  test("a própria aba ou só uma âncora não sai", () => {
    expect(cliqueQueSaiDaTela(clique({ href: "?aba=processo" }), ATUAL)).toBe(false);
    expect(cliqueQueSaiDaTela(clique({ href: "?aba=processo#rendimento" }), ATUAL)).toBe(false);
  });

  test("nova aba, download, botão do meio, Ctrl e outro site não contam", () => {
    expect(cliqueQueSaiDaTela(clique({ target: "_blank" }), ATUAL)).toBe(false);
    expect(cliqueQueSaiDaTela(clique({ download: true }), ATUAL)).toBe(false);
    expect(cliqueQueSaiDaTela(clique({ botao: 1 }), ATUAL)).toBe(false);
    expect(cliqueQueSaiDaTela(clique({ modificador: true }), ATUAL)).toBe(false);
    // Outro site: o aviso do navegador (beforeunload) já cobre.
    expect(cliqueQueSaiDaTela(clique({ href: "https://exemplo.com" }), ATUAL)).toBe(false);
    expect(cliqueQueSaiDaTela(clique({ href: null }), ATUAL)).toBe(false);
  });
});
