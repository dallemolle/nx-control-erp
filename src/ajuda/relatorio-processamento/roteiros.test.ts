import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { formatarCelula } from "@/app/(dashboard)/producao/relatorios/_shared/tabela";
import { calcularPainel } from "@/ajuda/painel/cenas";
import { CONSUMOS, INSUMOS, POLPAS, PROCESSO } from "@/ajuda/processamento/exemplo";
import { montarRelatorio } from "./cenas";
import { CITADOS, OPS } from "./exemplo";
import { ajudaRelatorioProcessamento } from "./index";

const { roteiros, cenas } = ajudaRelatorioProcessamento;

describe("roteiros do Relatório de processamento", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["resumo-fruta", "balanco-custo", "ops-exportar"]);
  });

  test("os números citados batem com agregarProcessamento", () => {
    const r = montarRelatorio();
    const acai = r.porFruta.find((l) => l.fruta === "Açaí")!;
    const acerola = r.porFruta.find((l) => l.fruta === "Acerola")!;
    expect(formatarCelula(r.total.volume.frutoKg, "kg")).toBe(CITADOS.fruto);
    expect(formatarCelula(r.total.volume.polpaKg, "kg")).toBe(CITADOS.polpa);
    expect(formatarCelula(r.total.volume.rendimento, "%")).toBe(CITADOS.rendimento);
    expect(formatarCelula(acai.rendimentoMin, "%")).toBe(CITADOS.acaiMin);
    expect(formatarCelula(acai.rendimentoMax, "%")).toBe(CITADOS.acaiMax);
    expect(formatarCelula(acerola.balanco.percentual, "%")).toBe(CITADOS.aceroladiferenca);
    expect(acerola.balanco.opsVerificar).toBe(1);
    expect(formatarCelula(r.total.balanco.percentual, "%")).toBe(CITADOS.totalDiferenca);
    expect(formatarCelula(r.total.custo.custoKg, "R$/kg")).toContain(CITADOS.custoKg);
  });

  test("o resumo bate com o Painel de novembro", () => {
    const r = montarRelatorio();
    const painel = calcularPainel().proc;
    expect(r.total.volume).toEqual(painel.total);
    expect(r.total.custo.custoKg).toBeCloseTo(painel.total.custoMedioPolpa!, 10);
  });

  test("a OP-261120-01 é a mesma da ajuda do Processamento", () => {
    const op = OPS.find((o) => o.numero === "OP-261120-01")!;
    expect(op.frutoKg).toBe(CONSUMOS.reduce((s, c) => s + c.kg, 0));
    expect(op.polpaKg).toBe(POLPAS.reduce((s, p) => s + p.kg, 0));
    expect([op.aguaLitros, op.carocoResiduoKg, op.perdaKg]).toEqual([
      PROCESSO.aguaLitros,
      PROCESSO.carocoResiduoKg,
      PROCESSO.perdaKg,
    ]);
    expect(op.custoFrutoTotal).toBe(CONSUMOS.reduce((s, c) => s + c.kg * c.custoKg, 0));
    expect(op.custoInsumosTotal).toBeCloseTo(INSUMOS.reduce((s, i) => s + i.quantidade * i.custoUnitario, 0), 2);
  });

  test("a fruta com OP a verificar fica marcada na cena", () => {
    const html = renderToStaticMarkup(createElement(cenas.processamento, { valores: {} }));
    expect(html).toContain('data-alvo="tab.acerola"');
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
