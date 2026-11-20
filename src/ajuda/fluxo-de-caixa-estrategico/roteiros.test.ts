import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { calcularProjecaoEstrategica } from "@/server/services/fluxoDeCaixaEstrategico";
import { ANO_BASE, PREMISSAS, projetar } from "./exemplo";
import { ajudaFluxoDeCaixaEstrategico } from "./index";

const { roteiros, cenas } = ajudaFluxoDeCaixaEstrategico;

describe("roteiros de Fluxo de caixa estratégico", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["ler-projecao", "ajustar-premissas", "comparar-cenarios"]);
  });

  test.each(["BASE", "OTIMISTA", "PESSIMISTA"] as const)("a réplica calcula o cenário %s como o sistema", (cenario) => {
    const real = calcularProjecaoEstrategica(PREMISSAS[cenario], ANO_BASE.receita, ANO_BASE.custo, ANO_BASE.saldoCaixa);
    expect(projetar(PREMISSAS[cenario], ANO_BASE.receita, ANO_BASE.custo, ANO_BASE.saldoCaixa)).toEqual(real);
  });

  test("os números citados nos roteiros batem com a réplica", () => {
    const html = renderToStaticMarkup(createElement(cenas.painel, { valores: {} }));
    expect(html).toContain("R$ 231.000,00");
    expect(html).toContain("R$ 6.930,00");
    const pessimista = projetar(PREMISSAS.PESSIMISTA, ANO_BASE.receita, ANO_BASE.custo, ANO_BASE.saldoCaixa);
    expect(pessimista.findIndex((ano) => ano.saldoCaixa < 0)).toBe(2);
    expect(pessimista[1].saldoCaixa).toBeGreaterThan(0);
  });

  test("mudar a premissa no roteiro recalcula a tabela", () => {
    const html = renderToStaticMarkup(createElement(cenas.painel, { valores: { "BASE.receita": "8.00" } }));
    expect(html).toContain("R$ 237.600,00");
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
