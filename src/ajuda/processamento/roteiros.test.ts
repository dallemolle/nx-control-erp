import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { formatarMoeda } from "@/lib/formatacao";
import { calcularValidade, prefixoDoLote, proximoCodigoDeLote } from "@/lib/producao/lote";
import { prefixoDaOP, ratearCustoOP, resumirOP } from "@/lib/producao/op";
import { CONFIGURACAO, CONSUMOS, INSUMOS, OP, POLPAS, PROCESSO, RESUMO, VALIDADE_POLPA } from "./exemplo";
import { ajudaProcessamento } from "./index";

const { roteiros, cenas } = ajudaProcessamento;

const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const DIA = new Date("2026-11-20T00:00:00.000Z");

const resumoCompleto = () =>
  resumirOP(
    {
      exigeBranqueamento: true,
      branqueamentoTemperaturaC: PROCESSO.temperaturaC,
      branqueamentoTempoS: PROCESSO.tempoS,
      aguaLitros: PROCESSO.aguaLitros,
      carocoResiduoKg: PROCESSO.carocoResiduoKg,
      perdaKg: PROCESSO.perdaKg,
      consumos: CONSUMOS.map((c) => ({ quantidadeKg: c.kg, custoKg: c.custoKg })),
      producoes: POLPAS.map((p) => ({ quantidadeKg: p.kg })),
      insumos: INSUMOS.map((i) => ({ quantidade: i.quantidade, custoUnitario: i.custoUnitario })),
    },
    CONFIGURACAO,
  );

describe("roteiros do Processamento", () => {
  test("são os 6 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual([
      "abrir-op",
      "lancar-fruto-polpa",
      "insumos-processo",
      "encerrar-op",
      "corrigir-op",
      "consultar-ops",
    ]);
  });

  test("o resumo citado nos roteiros bate com resumirOP", () => {
    const r = resumoCompleto();
    expect(`${KG.format(r.frutoKg)} kg`).toBe(RESUMO.frutoKg);
    expect(`${KG.format(r.polpaKg)} kg`).toBe(RESUMO.polpaKg);
    expect(PERCENTUAL.format(r.rendimento ?? 0)).toBe(RESUMO.rendimento);
    expect(`${KG.format(r.balanco.diferencaKg)} kg`).toBe(RESUMO.balancoKg);
    expect(PERCENTUAL.format(r.balanco.percentual ?? 0)).toBe(RESUMO.balancoPercentual);
    expect(r.balanco.status).toBe("OK");
    expect(r.branqueamento).toBe("OK");
    expect(r.aVerificar).toEqual([]);
    expect(r.custo.custoFrutoTotal).toBe(RESUMO.custoFruto);
    expect(r.custo.custoInsumosTotal).toBe(RESUMO.custoInsumos);
    expect(r.custo.custoTotal).toBe(RESUMO.custoTotal);
    expect(r.custo.custoKgPolpa).toBe(RESUMO.custoKgPolpa);
  });

  test("o custo de cada polpa bate com ratearCustoOP", () => {
    const rateio = ratearCustoOP(
      resumoCompleto().custo,
      POLPAS.map((p) => ({
        produtoId: p.produtoId,
        descricao: p.descricao,
        quantidadeKg: p.kg,
        precoKg: p.precoReferenciaKg,
      })),
    );
    expect(rateio.semPreco).toEqual([]);
    for (const p of POLPAS) expect(rateio.custoKgPorProduto.get(p.produtoId)).toBe(p.custoKg);
  });

  test("os números da OP e dos lotes de polpa e a validade seguem as regras do sistema", () => {
    expect(proximoCodigoDeLote(prefixoDaOP(DIA), [])).toBe(OP.numero);
    for (const p of POLPAS) expect(proximoCodigoDeLote(prefixoDoLote(p.codigo, DIA), [])).toBe(p.lote);
    const validade = calcularValidade(DIA, 365).toISOString().slice(0, 10).split("-").reverse().join("/");
    expect(validade).toBe(VALIDADE_POLPA);
  });

  test("antes do processo salvo, o balanço fica Verificar", () => {
    const markup = renderToStaticMarkup(
      createElement(cenas.op, { valores: { "op.consumos": "lancado", "op.producoes": "lancado" } }),
    );
    expect(markup).toContain("Verificar");
    const completa = renderToStaticMarkup(
      createElement(cenas.op, {
        valores: { "op.consumos": "lancado", "op.producoes": "lancado", "op.insumos": "lancado", "op.processo": "salvo" },
      }),
    );
    expect(completa).not.toContain("Verificar");
    expect(completa).toContain(formatarMoeda(RESUMO.custoKgPolpa));
  });

  test("a OP encerrada dos roteiros aparece completa, sem itens a verificar", () => {
    for (const id of ["encerrar-op", "corrigir-op"]) {
      const roteiro = roteiros.find((r) => r.id === id)!;
      roteiro.passos.forEach((passo, indice) => {
        const valores = valoresAte(roteiro, indice);
        if (passo.cena !== "op" || valores["op.status"] !== "Encerrada") return;
        const markup = renderToStaticMarkup(createElement(cenas.op, { valores }));
        expect(markup, `${id}, passo ${indice + 1}`).not.toContain("Verificar");
      });
    }
  });

  test("o filtro “A verificar → Balanço” deixa só a OP de acerola", () => {
    const markup = renderToStaticMarkup(createElement(cenas.lista, { valores: { "lista.verificar": "Balanço" } }));
    expect(markup).toContain("OP-261119-01");
    expect(markup).not.toContain(OP.numero);
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
