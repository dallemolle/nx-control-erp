import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { ajudaFluxoDeCaixa } from "./index";

const { roteiros, cenas } = ajudaFluxoDeCaixa;

describe("roteiros de Fluxo de caixa", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["ler-fluxo", "mudar-periodo", "filtrar-classificacao"]);
  });

  test("o saldo de novembro fecha com a geração líquida citada no roteiro", () => {
    const html = renderToStaticMarkup(createElement(cenas.painel, { valores: {} }));
    expect(html).toContain("novembro de 2026");
    expect(html).toContain("-R$ 1.238,00");
    expect(html).toContain("Transferências");
  });

  test("as semanas de novembro terminam no mesmo saldo que o mês", () => {
    const mes = renderToStaticMarkup(createElement(cenas.painel, { valores: {} }));
    const semanas = renderToStaticMarkup(createElement(cenas.painel, { valores: { "painel.granularidade": "Semana" } }));
    expect(mes).toContain("R$ 48.862,00");
    expect(semanas).toContain("R$ 48.862,00");
  });

  test("o filtro fiscal troca Saldo por Acumulado", () => {
    const html = renderToStaticMarkup(createElement(cenas.painel, { valores: { "painel.classificacao": "Fiscal" } }));
    expect(html).toContain("Acumulado inicial");
    expect(html).not.toContain("Saldo inicial");
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
