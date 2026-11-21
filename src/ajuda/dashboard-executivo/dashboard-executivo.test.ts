import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { calcularAging, calcularIndicadoresExecutivos } from "@/server/services/dashboardExecutivo";
import { percentualGerencial } from "@/server/services/relatorioFiscalGerencial";
import { COMPRA } from "@/ajuda/recepcao/exemplo";
import {
  AGING,
  ajudaDashboardExecutivo,
  CAIXA_DISPONIVEL,
  FISCAL,
  HOJE_ISO,
  INDICADORES,
  MESES,
  PARCELAS,
  PERCENTUAL_GERENCIAL,
  SALDO_ANTES_DE_JUNHO,
} from "./index";

const hoje = new Date(`${HOJE_ISO}T00:00:00.000Z`);
const parcelas = PARCELAS.map((p) => ({
  tipo: p.tipo,
  dataVencimento: new Date(`${p.vencimento}T00:00:00.000Z`),
  saldo: p.saldo,
}));
const novembro = MESES.at(-1)!;

describe("ajuda do Dashboard executivo", () => {
  test("tem os três roteiros, com o alvo de cada passo na cena", () => {
    expect(ajudaDashboardExecutivo.roteiros.map((r) => r.id)).toEqual([
      "ler-indicadores",
      "fiscal-gerencial",
      "ler-graficos",
    ]);
    for (const roteiro of ajudaDashboardExecutivo.roteiros) {
      roteiro.passos.forEach((passo, indice) => {
        const markup = renderToStaticMarkup(
          createElement(ajudaDashboardExecutivo.cenas[passo.cena], { valores: valoresAte(roteiro, indice) }),
        );
        expect(markup, `${roteiro.id}, passo ${indice + 1} (${passo.alvo})`).toContain(`data-alvo="${passo.alvo}"`);
      });
    }
  });

  test("os cards são o que o sistema calcula com as parcelas e o movimento do exemplo", () => {
    expect(
      calcularIndicadoresExecutivos({
        hoje,
        caixaDisponivel: CAIXA_DISPONIVEL,
        parcelas,
        entradasMes: novembro.entradas,
        saidasMes: novembro.saidas,
      }),
    ).toEqual(INDICADORES);
  });

  test("o aging é o que o sistema calcula", () => {
    expect(calcularAging(parcelas, hoje)).toEqual(AGING);
  });

  test("o saldo de novembro fecha com o caixa disponível", () => {
    const saldo = MESES.reduce((s, m) => s + m.entradas - m.saidas, SALDO_ANTES_DE_JUNHO);
    expect(saldo).toBe(CAIXA_DISPONIVEL);
  });

  test("fiscal e gerencial somam as entradas de novembro, e o % é o do sistema", () => {
    expect(FISCAL.entradasFiscal + FISCAL.entradasGerencial).toBe(novembro.entradas);
    expect(PERCENTUAL_GERENCIAL).toBeCloseTo(percentualGerencial(FISCAL.entradasFiscal, FISCAL.entradasGerencial)!);
  });

  test("o açaí do José da Silva é o da Recepção", () => {
    const acai = PARCELAS.find((p) => p.descricao.startsWith("Açaí do José"))!;
    expect(acai.saldo).toBe(COMPRA.valor);
    expect(acai.vencimento.split("-").reverse().join("/")).toBe(COMPRA.vencimento);
  });
});
