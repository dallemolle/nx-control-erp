import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { formatarMoeda } from "@/lib/formatacao";
import { POR_CENTRO_DE_CUSTO, POR_CENTRO_DE_CUSTO_FISCAL, POR_SAFRA, resultadoDoMes } from "./exemplo";
import { ajudaFluxoPorDimensao } from "./index";

const { roteiros, cenas } = ajudaFluxoPorDimensao;

const html = (valores = {}) => renderToStaticMarkup(createElement(cenas.painel, { valores }));

/** Texto da linha da tabela (do nome até o fim da linha). */
function linhaDaTabela(markup: string, nome: string): string {
  const inicio = markup.lastIndexOf(nome);
  return markup.slice(inicio, markup.indexOf("</tr>", inicio));
}

const total = (linhas: typeof POR_SAFRA) => linhas.reduce((soma, l) => soma + resultadoDoMes(l), 0);

describe("roteiros de Fluxo de caixa por dimensão", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["ler-por-dimensao", "nao-classificado", "filtrar-exportar"]);
  });

  test("o mesmo dinheiro fecha igual por centro de custo e por safra", () => {
    expect(total(POR_SAFRA)).toBeCloseTo(total(POR_CENTRO_DE_CUSTO), 2);
  });

  test("os números citados nos roteiros batem com a réplica", () => {
    expect(linhaDaTabela(html(), "Lavoura")).toContain(formatarMoeda(-2100));
    const safra = linhaDaTabela(html({ "painel.dimensao": "Safra" }), "2025/26");
    expect(safra).toContain(formatarMoeda(23500));
    expect(safra).toContain(formatarMoeda(25700));
    const fiscal = html({ "painel.classificacao": "Fiscal" });
    expect(linhaDaTabela(fiscal, "Lavoura")).toContain(formatarMoeda(800));
    expect(POR_CENTRO_DE_CUSTO_FISCAL.at(-1)?.saidasRealizadas).toBe(0);
  });

  test("a tabela tem a linha Total com o número citado, e o aviso só aparece com filtro", () => {
    const todos = html();
    expect(linhaDaTabela(todos, "Total")).toContain(formatarMoeda(24774.1));
    expect(todos).toContain("Resultado do mês");
    expect(todos).not.toContain("Visão filtrada");
    expect(html({ "painel.classificacao": "Fiscal" })).toContain("Visão filtrada");
    const textos = JSON.stringify(roteiros);
    expect(textos).toContain("R$ 24.774,10");
    expect(textos).not.toMatch(/some as linhas|não aparece aviso|Saldo:/);
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
      const markup = renderToStaticMarkup(createElement(cenas[passo.cena], { valores: valoresAte(roteiro, indice) }));
      expect(markup, `passo ${indice + 1} (${passo.alvo})`).toContain(`data-alvo="${passo.alvo}"`);
    });
  });
});
