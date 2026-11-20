import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { ajudaTesouraria } from "./index";

const { roteiros, cenas } = ajudaTesouraria;

describe("roteiros de Tesouraria", () => {
  test("são os 4 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["lancar-avulso", "transferir", "conferir-saldo", "ver-lancamentos"]);
  });

  test("a diferença só aparece depois de informar o saldo do banco", () => {
    const antes = renderToStaticMarkup(createElement(cenas.painel, { valores: {} }));
    expect(antes).toContain("Nenhum saldo bancário informado ainda.");
    const depois = renderToStaticMarkup(createElement(cenas.painel, { valores: { "painel.cardBanco": "informado" } }));
    expect(depois).toContain("Diferença: R$ 45,90");
  });

  test("o filtro Fiscal esconde transferências e lançamentos gerenciais", () => {
    const html = renderToStaticMarkup(createElement(cenas.painel, { valores: { "painel.classificacao": "Fiscal" } }));
    expect(html).toContain("Baixa aprovada — parcela nº 1");
    expect(html).not.toContain("Diárias da colheita");
    expect(html).not.toContain("Saque para o caixa");
  });

  test.each(roteiros.map((r) => [r.id, r] as const))("%s tem conteúdo completo", (_id, roteiro) => {
    expect(roteiro.passos.length).toBeGreaterThan(0);
    expect(roteiro.quandoUsar.trim()).not.toBe("");
    expect(roteiro.eDepois.texto.trim()).not.toBe("");
    if (roteiro.eDepois.proximoRoteiro) {
      expect(roteiros.some((r) => r.id === roteiro.eDepois.proximoRoteiro)).toBe(true);
    }
    for (const passo of roteiro.passos) {
      expect(passo.instrucao.trim()).not.toBe("");
      expect(cenas[passo.cena]).toBeDefined();
    }
  });

  test.each(roteiros.map((r) => [r.id, r] as const))("%s: o alvo de cada passo aparece na cena", (_id, roteiro) => {
    roteiro.passos.forEach((passo, indice) => {
      const html = renderToStaticMarkup(createElement(cenas[passo.cena], { valores: valoresAte(roteiro, indice) }));
      expect(html, `passo ${indice + 1} (${passo.alvo})`).toContain(`data-alvo="${passo.alvo}"`);
    });
  });
});
