import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { formatarCelula } from "@/app/(dashboard)/producao/relatorios/_shared/tabela";
import { CITADOS as PAINEL } from "@/ajuda/painel/exemplo";
import { RECEPCOES as RECEPCOES_MENSAL } from "@/ajuda/relatorio-mensal/exemplo";
import { montarRelatorio } from "./cenas";
import { CITADOS, RECEPCOES } from "./exemplo";
import { ajudaRelatorioOrigem } from "./index";

const { roteiros, cenas } = ajudaRelatorioOrigem;

describe("roteiros do Relatório de origem", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["por-origem", "produtividade", "preco-exportar"]);
  });

  test("os números citados batem com as funções do sistema", () => {
    const r = montarRelatorio();
    expect(formatarCelula(r.total.kg, "kg")).toBe(CITADOS.totalKg);
    const jose = r.porOrigem.find((o) => o.nome === "José da Silva")!;
    expect(formatarCelula(jose.kg, "kg")).toBe(CITADOS.joseKg);
    expect(jose.cargas).toBe(CITADOS.joseCargas);
    expect(r.porOrigem[0].nome).toBe("José da Silva");
    const t3 = r.produtividade.find((p) => p.talhao === "Talhão 3 – Várzea")!;
    expect(formatarCelula(t3.toneladasHa, "t/ha")).toBe(CITADOS.produtividadeT3);
    expect(formatarCelula(r.precoPorMes.acai[12], "R$/kg")).toContain(CITADOS.precoAcaiAno);
  });

  test("talhão sai sem valor pago; o sem colheita aparece com 0", () => {
    const r = montarRelatorio();
    expect(r.porOrigem.filter((o) => o.tipo === "PROPRIA").every((o) => o.valor === null)).toBe(true);
    expect(r.produtividade.find((p) => p.talhao === "Talhão 2 – Acerolal")).toMatchObject({ kgAno: 0, colheitas: 0 });
  });

  test("o total do mês bate com o Painel, e as recepções são as do Relatório mensal", () => {
    expect(`${CITADOS.totalKg} kg`).toBe(PAINEL.recebido);
    const resumo = (lista: readonly { brutoKg: number; descarteKg: number; valorTotal: number; data: Date }[]) =>
      lista.map((r) => [r.data.toISOString().slice(0, 10), r.brutoKg - r.descarteKg, r.valorTotal]).sort();
    const somaPorMes = (lista: ReturnType<typeof resumo>) => {
      const m = new Map<string, [number, number]>();
      for (const [data, kg, valor] of lista) {
        const chave = String(data).slice(0, 7);
        const [k, v] = m.get(chave) ?? [0, 0];
        m.set(chave, [k + Number(kg), v + Number(valor)]);
      }
      return Object.fromEntries(m);
    };
    expect(somaPorMes(resumo(RECEPCOES))).toEqual(somaPorMes(resumo(RECEPCOES_MENSAL)));
  });

  test("mês sem compra de terceiro fica “—”", () => {
    const r = montarRelatorio();
    expect(r.precoPorMes.acai[0]).toBeNull();
    expect(renderToStaticMarkup(createElement(cenas.origem, { valores: {} }))).toContain("—");
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
