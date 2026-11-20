import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { ajudaConciliacao } from "./index";

const { roteiros, cenas } = ajudaConciliacao;

describe("roteiros de Conciliação", () => {
  test("são os 6 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual([
      "importar-extrato",
      "entender-status",
      "confirmar-sugestao",
      "conciliar-grupo",
      "criar-lancamento",
      "desconciliar",
    ]);
  });

  test("o grupo só zera a diferença com os lançamentos marcados", () => {
    const antes = renderToStaticMarkup(createElement(cenas.grupo, { valores: {} }));
    expect(antes).toContain("Lançar a diferença");
    const depois = renderToStaticMarkup(createElement(cenas.grupo, { valores: { "grupo.lancamentos": "marcados" } }));
    expect(depois).toContain("Diferença: R$ 0,00");
  });

  test("o filtro de status deixa só as linhas daquele status", () => {
    const html = renderToStaticMarkup(
      createElement(cenas.lista, { valores: { "lista.filtroStatus": "Não conciliado" } }),
    );
    expect(html).toContain("CRED CARTOES RURAIS");
    expect(html).not.toContain("SAQUE TERMINAL");
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
