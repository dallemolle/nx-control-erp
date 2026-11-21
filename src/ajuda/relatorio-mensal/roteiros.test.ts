import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { formatarCelula } from "@/app/(dashboard)/producao/relatorios/_shared/tabela";
import { CITADOS as PAINEL } from "@/ajuda/painel/exemplo";
import { calcularPainel } from "@/ajuda/painel/cenas";
import { montarRelatorio } from "./cenas";
import { CITADOS } from "./exemplo";
import { ajudaRelatorioMensal } from "./index";

const { roteiros, cenas } = ajudaRelatorioMensal;

describe("roteiros do Relatório mensal", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["ver-ano", "ler-tabelas", "exportar-mensal"]);
  });

  test("novembro bate com o Painel de produção (mesmos dados, mesma conta)", () => {
    const novembro = montarRelatorio().colunas[10];
    const painel = calcularPainel();
    expect(novembro.recepcao).toEqual(painel.rec.total);
    expect(novembro.processamento).toEqual(painel.proc.total);
    expect(novembro.vendas).toEqual(painel.vendas.total);
    expect(formatarCelula(novembro.recepcao.recebidoKg, "kg")).toBe(CITADOS.novembroRecebido);
    expect(`${CITADOS.novembroRecebido} kg`).toBe(PAINEL.recebido);
    expect(novembro.vendas.faturamento).toBe(CITADOS.novembroFaturamento);
  });

  test("os totais do ano citados batem com montarColunasMensais", () => {
    const { colunas, frutas } = montarRelatorio();
    const total = colunas[12];
    expect(formatarCelula(total.recepcao.recebidoKg, "kg")).toBe(CITADOS.totalRecebido);
    expect(total.vendas.faturamento).toBe(CITADOS.totalFaturamento);
    expect(formatarCelula(total.processamentoPorFruta.acai.rendimento, "%")).toBe(CITADOS.rendimentoAcai);
    expect(total.pagoTerceiros).toBe(CITADOS.pagoTerceiros);
    expect(frutas.map((f) => f.nome)).toEqual(["Açaí", "Acerola"]);
  });

  test("o ano anterior mostra “Nada no ano.”", () => {
    const markup = renderToStaticMarkup(createElement(cenas.mensal, { valores: { "mensal.ano": "2025" } }));
    expect(markup).toContain("Nada no ano.");
    expect(markup).not.toContain("Recepção");
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
