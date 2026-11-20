import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { formatarMoeda } from "@/lib/formatacao";
import { montarLinhaComparativoSafra } from "@/server/services/orcamentoSafra";
import { SAFRAS, variacao } from "./exemplo";
import { ajudaComparacaoSafras } from "./index";

const { roteiros, cenas } = ajudaComparacaoSafras;

const html = (valores = {}) => renderToStaticMarkup(createElement(cenas.painel, { valores }));

/** Texto da linha da tabela (do nome até o fim da linha). */
function linhaDaTabela(markup: string, nome: string): string {
  const inicio = markup.lastIndexOf(nome);
  return markup.slice(inicio, markup.indexOf("</tr>", inicio));
}

describe("roteiros de Comparação entre safras", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["orcar-safra", "comparar-safras", "filtrar-exportar"]);
  });

  test.each(SAFRAS.map((s) => [s.nome, s] as const))("a réplica calcula a %s como o sistema", (_nome, s) => {
    for (const realizado of [s.realizado, s.realizadoFiscal]) {
      const real = montarLinhaComparativoSafra(s.chave, s.nome, s.status, s.orcado, realizado, 0);
      expect(variacao(s.orcado, realizado)).toEqual({
        variacaoAbsolutaRealizado: real.variacaoAbsolutaRealizado,
        variacaoPercentualRealizado: real.variacaoPercentualRealizado,
      });
    }
  });

  test("os números citados nos roteiros batem com a réplica", () => {
    const todos = html();
    expect(linhaDaTabela(todos, "2025/26")).toContain(`${formatarMoeda(-7000)} (-17.5%)`);
    expect(linhaDaTabela(todos, "2024/25")).toContain(`${formatarMoeda(3200)} (9.1%)`);
    expect(linhaDaTabela(todos, "2026/27")).toContain(formatarMoeda(-300));
    expect(linhaDaTabela(html({ "painel.classificacao": "Fiscal" }), "2025/26")).toContain(formatarMoeda(26000));
  });

  test("orçar a 2026/27 recalcula a variação", () => {
    const linha = linhaDaTabela(html({ "orcado.safra-2026": "30000" }), "2026/27");
    expect(linha).toContain(`${formatarMoeda(-30300)} (-101.0%)`);
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
