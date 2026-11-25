import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { ajudaFluxoDeCaixaProjetado } from "./index";

const { roteiros, cenas } = ajudaFluxoDeCaixaProjetado;

describe("roteiros de Fluxo de caixa projetado", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["ler-projecao", "navegar", "filtrar-classificacao"]);
  });

  test("só fevereiro de 2027 fica negativo, como diz o roteiro", () => {
    const html = renderToStaticMarkup(createElement(cenas.painel, { valores: {} }));
    expect(html.match(/Saldo negativo/g)).toHaveLength(1);
    expect(html).toContain("-R$ 5.450,00");
  });

  test("as três visões terminam dezembro de 2026 com o mesmo saldo", () => {
    const fimDeDezembro = "R$ 50.850,00";
    for (const valores of [{}, { "painel.proximo": "clicado" }, { "painel.modo": "Ano civil" }]) {
      expect(renderToStaticMarkup(createElement(cenas.painel, { valores }))).toContain(fimDeDezembro);
    }
  });

  test("a visão futura tem a linha A vencer até e a filtrada não tem alerta", () => {
    expect(renderToStaticMarkup(createElement(cenas.painel, { valores: { "painel.proximo": "clicado" } }))).toContain(
      "A vencer até 30/11/2026",
    );
    const fiscal = renderToStaticMarkup(createElement(cenas.painel, { valores: { "painel.classificacao": "Fiscal" } }));
    expect(fiscal).toContain("Acumulado inicial");
    expect(fiscal).not.toContain("Saldo negativo");
  });

  test("a linha Aguardando conciliação liga o saldo conciliado ao saldo de hoje, e a visão filtrada não tem", () => {
    const html = renderToStaticMarkup(createElement(cenas.painel, { valores: {} }));
    expect(html).toContain("Aguardando conciliação");
    expect(html).toContain("R$ 48.862,00");
    expect(html).toContain("R$ 47.850,00");
    const fiscal = renderToStaticMarkup(createElement(cenas.painel, { valores: { "painel.classificacao": "Fiscal" } }));
    expect(html).toContain('data-alvo="linha.aguardando"');
    expect(fiscal).not.toContain('data-alvo="linha.aguardando"');
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
