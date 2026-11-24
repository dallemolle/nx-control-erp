import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { chaveAcessoValida, normalizarChaveAcesso } from "@/lib/classificacaoFiscal";
import { EXEMPLO } from "./exemplo";
import { ajudaContasAReceber } from "./index";

const { roteiros, cenas } = ajudaContasAReceber;

describe("roteiros de Contas a receber", () => {
  test("são os 7 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual([
      "cadastrar-titulo",
      "receber-parcela",
      "estornar-baixa",
      "mudar-vencimento",
      "renegociar",
      "cancelar-parcela",
      "encontrar-exportar",
    ]);
  });

  test("a réplica mostra a tela de receber com o exemplo dela", () => {
    const html = renderToStaticMarkup(
      createElement(cenas.lista, { valores: { "lista.linhaExemplo": "expandida" } }),
    );
    expect(html).toContain("Novo título a receber");
    expect(html).toContain(EXEMPLO.contraparte);
    expect(html).toContain("Parcela 1 — venc. 10/10/2026 — valor R$ 15.000,00");
    expect(html).not.toContain("Agro Insumos");
  });

  test("a chave de acesso do exemplo passa na validação da tela real", () => {
    expect(chaveAcessoValida(normalizarChaveAcesso(EXEMPLO.chave))).toBe(true);
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
      const html = renderToStaticMarkup(
        createElement(cenas[passo.cena], { valores: valoresAte(roteiro, indice) }),
      );
      expect(html, `passo ${indice + 1} (${passo.alvo})`).toContain(`data-alvo="${passo.alvo}"`);
    });
  });

  test("nenhum passo repete a instrução do anterior", () => {
    for (const roteiro of roteiros) {
      roteiro.passos.slice(1).forEach((passo, i) => {
        expect(passo.instrucao).not.toBe(roteiro.passos[i].instrucao);
      });
    }
  });
});
