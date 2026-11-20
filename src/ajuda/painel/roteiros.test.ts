import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { valoresAte } from "@/ajuda/roteiro";
import { fmt } from "@/app/(dashboard)/producao/painel/cartoes";
import { calcularPainel } from "./cenas";
import { CITADOS } from "./exemplo";
import { ajudaPainel } from "./index";

const { roteiros, cenas } = ajudaPainel;

describe("roteiros do Painel de produção", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["recepcao-processamento", "vendas-estoque", "alertas-exportar"]);
  });

  test("os números citados batem com as funções do painel", () => {
    const { rec, proc, vendas, estoque } = calcularPainel();
    expect(fmt.kg(rec.total.recebidoKg)).toBe(CITADOS.recebido);
    expect(fmt.pct(rec.total.percentualTerceiros)).toBe(CITADOS.terceiros);
    expect(fmt.pct(rec.total.percentualDescarte)).toBe(CITADOS.descarte);
    expect(fmt.n(proc.total.quantidade)).toBe(CITADOS.ops);
    expect(fmt.kg(proc.total.frutoKg)).toBe(CITADOS.processado);
    expect(fmt.kg(proc.total.polpaKg)).toBe(CITADOS.polpa);
    expect(fmt.pct(proc.total.rendimento)).toBe(CITADOS.rendimento);
    expect(fmt.moedaKg(proc.total.custoMedioPolpa)).toBe(CITADOS.custoMedio);
    expect(vendas.total.faturamento).toBe(CITADOS.faturamento);
    expect(vendas.total.faturamentoInNatura).toBe(0);
    expect(fmt.kg(vendas.total.kgVendidos)).toBe(CITADOS.kgVendidos);
    expect(fmt.moedaKg(vendas.total.precoMedio)).toBe(CITADOS.precoMedio);
    expect(vendas.total.ticketMedio).toBe(CITADOS.ticket);
    expect(vendas.total.margem).toBe(CITADOS.margem);
    expect(fmt.pct(vendas.total.margemPercentual)).toBe(CITADOS.margemPercentual);
    expect(fmt.kg(estoque.polpaKg)).toBe(CITADOS.polpaEstoque);
    expect(estoque.frutoAguardandoKg).toBe(0);
    expect(estoque.valor).toBe(CITADOS.valorEstoque);
    expect(estoque.vencidos.quantidade).toBe(CITADOS.vencidos);
    expect(fmt.kg(estoque.vencidos.kg)).toBe(CITADOS.vencidosKg);
    expect(proc.opsBalanco).toBe(1);
    expect(proc.opsBranqueamento).toBe(0);
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
