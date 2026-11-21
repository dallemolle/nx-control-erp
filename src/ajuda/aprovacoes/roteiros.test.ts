import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { ajudaAprovacoes } from "./index";
import { BAIXAS, avisosDoExemplo } from "./exemplo";

const { roteiros, cenas } = ajudaAprovacoes;

describe("roteiros de Aprovações pendentes", () => {
  test("são os 4 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["aprovar-baixa", "entender-avisos", "rejeitar-baixa", "aprovar-bloqueado"]);
  });

  test("a réplica tem as colunas da tela real e só a baixa do próprio usuário bloqueada", () => {
    const html = renderToStaticMarkup(createElement(cenas.lista, { valores: {} }));
    for (const coluna of ["Título", "Baixa", "Valor", "Registrado por", "Ações"]) {
      expect(html).toContain(coluna);
    }
    expect(html.match(/Registrada por você: outra pessoa precisa aprovar/g)).toHaveLength(1);
  });

  test("a réplica mostra os avisos da regra real: só o Recibo 88 e a Fatura 556 têm aviso", () => {
    const html = renderToStaticMarkup(createElement(cenas.lista, { valores: {} }));
    expect(html.match(/A parcela já está paga/g)).toHaveLength(1);
    expect(html.match(/Data da baixa 273 dias antes do registro/g)).toHaveLength(1);
    expect(BAIXAS.map((b) => avisosDoExemplo(b).length)).toEqual([0, 1, 0, 1]);
  });

  test("a réplica mostra data, conta, parcela, ajustes e o registro", () => {
    const html = renderToStaticMarkup(createElement(cenas.lista, { valores: {} }));
    for (const trecho of [
      "Pagamento · parcela 1/3",
      "Recebimento · parcela 1/3",
      "15/10/2026",
      "16/01/2026",
      "Banco do Brasil - Ag 1234/CC 12345-6",
      "+ juros",
      "15/10/2026 10:20",
    ]) {
      expect(html).toContain(trecho);
    }
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
