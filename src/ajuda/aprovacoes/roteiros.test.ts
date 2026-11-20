import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { ajudaAprovacoes } from "./index";

const { roteiros, cenas } = ajudaAprovacoes;

describe("roteiros de Aprovações pendentes", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["aprovar-baixa", "rejeitar-baixa", "aprovar-bloqueado"]);
  });

  test("a réplica tem as colunas da tela real e só a baixa do próprio usuário bloqueada", () => {
    const html = renderToStaticMarkup(createElement(cenas.lista, { valores: {} }));
    for (const coluna of ["Documento", "Contraparte", "Valor pago", "Registrado por", "Ações"]) {
      expect(html).toContain(coluna);
    }
    expect(html.match(/Registrada por você: outra pessoa precisa aprovar/g)).toHaveLength(1);
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
