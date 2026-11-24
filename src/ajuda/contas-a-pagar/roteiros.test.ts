import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { chaveAcessoValida, normalizarChaveAcesso } from "@/lib/classificacaoFiscal";
import { EXEMPLO } from "./exemplo";
import { construtorDeRoteiros } from "@/ajuda/tipos";
import type { ALVOS } from "@/ajuda/_titulos/alvos";
import { ajudaContasAPagar } from "./index";

const { roteiros, cenas } = ajudaContasAPagar;

describe("roteiros de Contas a pagar", () => {
  test("são os 7 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual([
      "cadastrar-titulo",
      "pagar-parcela",
      "estornar-baixa",
      "mudar-vencimento",
      "renegociar",
      "cancelar-parcela",
      "encontrar-exportar",
    ]);
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

// Verificação só de compilação: o construtor recusa um alvo que não pertence à cena do passo.
export const _alvoDeOutraCenaNaoCompila = () =>
  construtorDeRoteiros<typeof ALVOS>()({
    id: "x",
    titulo: "x",
    quandoUsar: "x",
    passos: [
      // @ts-expect-error "novo.salvar" é da cena novoTitulo, não da cena baixa
      { cena: "baixa", alvo: "novo.salvar", instrucao: "x", explicacao: "x" },
    ],
    eDepois: { texto: "x" },
  });
