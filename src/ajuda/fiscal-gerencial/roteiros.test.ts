import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { formatarMoeda } from "@/lib/formatacao";
import { percentualGerencial as percentualDoSistema } from "@/server/services/relatorioFiscalGerencial";
import { COMPARATIVO, TOTAIS, percentualGerencial } from "./exemplo";
import { ajudaFiscalGerencial } from "./index";

const { roteiros, cenas } = ajudaFiscalGerencial;

const html = (valores = {}) => renderToStaticMarkup(createElement(cenas.painel, { valores }));

/** Texto da linha da tabela (do rótulo até o fim da linha). */
function linhaDaTabela(markup: string, rotulo: string): string {
  const inicio = markup.lastIndexOf(rotulo);
  return markup.slice(inicio, markup.indexOf("</tr>", inicio));
}

describe("roteiros de Fiscal × gerencial", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["ler-comparativo", "em-aberto-parceiros", "pendencias"]);
  });

  test("a réplica calcula o percentual gerencial como o sistema", () => {
    for (const l of [...COMPARATIVO, TOTAIS]) {
      expect(percentualGerencial(l.entradasFiscal, l.entradasGerencial)).toEqual(
        percentualDoSistema(l.entradasFiscal, l.entradasGerencial),
      );
      expect(percentualGerencial(l.saidasFiscal, l.saidasGerencial)).toEqual(
        percentualDoSistema(l.saidasFiscal, l.saidasGerencial),
      );
    }
  });

  test("os números citados nos roteiros batem com a réplica", () => {
    const todos = html();
    const novembro = linhaDaTabela(todos, ">Nov<");
    expect(novembro).toContain(formatarMoeda(5500));
    expect(novembro).toContain("23.4%");
    const total = linhaDaTabela(todos, ">Total<");
    expect(total).toContain("22.5%");
    expect(total).toContain("13.8%");
    expect(linhaDaTabela(todos, ">Dez<")).toContain("—");
    expect(todos).toContain("Pendências fiscais (3)");
  });

  test("o filtro “Sem chave de acesso” deixa só a NF-e 2210", () => {
    const filtrado = html({ "pend.filtro-chave": "ativo" });
    expect(filtrado).toContain("Pendências fiscais (1)");
    expect(filtrado).toContain("NF-e 2210");
    expect(filtrado).not.toContain("Fatura 612");
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

test("o passo do documento diz que o link abre o próprio título", () => {
  const passo = ajudaFiscalGerencial.roteiros.flatMap((r) => r.passos).find((p) => p.instrucao === "Clique no documento");
  expect(passo?.explicacao).toContain("já no título");
  expect(passo?.explicacao).not.toMatch(/não abre o título|procure o título/);
  expect(passo?.dica).toContain("Ver todos");
});
