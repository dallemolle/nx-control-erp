import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { formatarCelula } from "@/app/(dashboard)/producao/relatorios/_shared/tabela";
import { calcularPainel } from "@/ajuda/painel/cenas";
import { A_RECEBER } from "@/ajuda/painel/exemplo";
import { montarRelatorio } from "./cenas";
import { CITADOS } from "./exemplo";
import { ajudaRelatorioVendas } from "./index";

const { roteiros, cenas } = ajudaRelatorioVendas;

describe("roteiros do Relatório de vendas", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["periodo-graficos", "ler-tabelas", "exportar-vendas"]);
  });

  test("os números citados batem com agregarVendasDetalhadas", () => {
    const r = montarRelatorio();
    expect(r.total.faturamento).toBe(CITADOS.faturamento);
    expect(r.total.aReceber).toBe(CITADOS.aReceber);
    expect(r.porCliente[0].cliente).toBe(CITADOS.primeiro);
    expect(formatarCelula(r.porCliente[0].percentual, "%")).toBe(CITADOS.percentualPrimeiro);
    expect(formatarCelula(r.porCanal[0].percentual, "%")).toBe(CITADOS.batedor);
    expect(r.porCanal[0].canal).toBe("BATEDOR");
  });

  test("o cliente sem compra e com saldo vem no fim da lista", () => {
    const ultimo = montarRelatorio().porCliente.at(-1)!;
    expect(ultimo).toMatchObject({ cliente: "Mercadinho São João", faturamento: 0, aReceber: 450 });
  });

  test("o total bate com as vendas do Painel de novembro, e o a receber é o mesmo", () => {
    const r = montarRelatorio();
    const painel = calcularPainel().vendas.total;
    expect(r.total.faturamento).toBe(painel.faturamento);
    expect(r.total.kg).toBe(painel.kgVendidos);
    expect(r.total.margem).toBe(painel.margem);
    expect(r.total.aReceber).toBe(A_RECEBER);
  });

  test("o cliente sem compra no período aparece marcado na cena", () => {
    const markup = renderToStaticMarkup(createElement(cenas.vendas, { valores: {} }));
    expect(markup).toContain('data-alvo="tab.semCompra"');
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
