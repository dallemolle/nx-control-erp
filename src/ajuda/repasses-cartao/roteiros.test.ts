import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { ajudaRepassesCartao } from "./index";

const { roteiros, cenas } = ajudaRepassesCartao;

describe("roteiros de Repasses de cartão", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["confirmar-repasse", "desfazer-repasse", "acompanhar-repasses"]);
  });

  test("a lista padrão esconde os recebidos, como a tela real", () => {
    const padrao = renderToStaticMarkup(createElement(cenas.lista, { valores: {} }));
    expect(padrao).toContain("PV-41");
    expect(padrao).not.toContain("PV-39");
    const recebidos = renderToStaticMarkup(createElement(cenas.lista, { valores: { "filtro.situacao": "Recebidos" } }));
    expect(recebidos).toContain("PV-39");
    expect(recebidos).not.toContain("PV-41");
  });

  test("a barra soma o líquido dos marcados e bate com o depósito do exemplo", () => {
    const html = renderToStaticMarkup(
      createElement(cenas.lista, { valores: { "l1.marcar": "marcado", "l2.marcar": "marcado" } }),
    );
    expect(html).toContain("2 repasse(s) marcado(s)");
    expect(html).toContain("Líquido R$ 1.462,50");
    // Padrão da tela: data prevista do primeiro marcado, que já passou.
    expect(html).toContain("18/11/2026");
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
