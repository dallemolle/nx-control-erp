import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { formatarMoeda } from "@/lib/formatacao";
import { montarLinhaComparativo } from "@/server/services/orcamento";
import { CATEGORIAS, MES, compararLinha } from "./exemplo";
import { ajudaOrcamento } from "./index";

const { roteiros, cenas } = ajudaOrcamento;

const html = (valores = {}) => renderToStaticMarkup(createElement(cenas.painel, { valores }));

/** Texto da linha do comparativo de uma categoria (do nome até o fim da linha). */
function linhaDoComparativo(markup: string, nome: string): string {
  const inicio = markup.lastIndexOf(nome);
  return markup.slice(inicio, markup.indexOf("</tr>", inicio));
}

describe("roteiros de Orçamento", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["orcar-ano", "ler-comparativo", "filtrar-exportar"]);
  });

  test.each(CATEGORIAS.map((c) => [c.nome, c] as const))("a réplica calcula %s como o sistema", (_nome, c) => {
    for (const { realizado, projetado } of [c.novembro, c.novembroFiscal]) {
      const orcado = c.orcadoPorMes[MES - 1];
      const real = montarLinhaComparativo(c.chave, c.nome, c.tipo, 2026, MES, orcado, realizado, projetado);
      const { previsto, variacaoAbsoluta, variacaoPercentual, alerta } = real;
      expect(compararLinha(c.tipo, orcado, realizado, projetado)).toEqual({
        previsto,
        variacaoAbsoluta,
        variacaoPercentual,
        alerta,
      });
    }
  });

  test("os números citados nos roteiros batem com a réplica", () => {
    const todos = html();
    const insumos = linhaDoComparativo(todos, "Insumos Agrícolas");
    expect(insumos).toContain(formatarMoeda(1800));
    expect(insumos).toContain(formatarMoeda(300));
    expect(insumos).toContain("20.0%");
    expect(insumos).not.toContain(formatarMoeda(-700));
    expect(insumos).toContain("Estouro");
    const maoDeObra = linhaDoComparativo(todos, "Mão de obra temporária");
    expect(maoDeObra).toContain("Estouro");
    expect(maoDeObra).toContain("—");
    const venda = linhaDoComparativo(todos, "Venda de produtos");
    expect(venda).toContain(formatarMoeda(27500));
    expect(venda).toContain(formatarMoeda(7500));
    expect(venda).toContain("37.5%");
    expect(venda).not.toContain("Estouro");

    const fiscal = html({ "painel.classificacao": "Fiscal" });
    expect(linhaDoComparativo(fiscal, "Venda de produtos")).toContain(formatarMoeda(18000));
    expect(linhaDoComparativo(fiscal, "Mão de obra temporária")).not.toContain("Estouro");
  });

  test("orçar novembro de Insumos em 2000 tira o estouro", () => {
    const insumos = linhaDoComparativo(html({ "grade.insumos.mes-11": "2000" }), "Insumos Agrícolas");
    expect(insumos).toContain(formatarMoeda(2000));
    expect(insumos).not.toContain("Estouro");
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
