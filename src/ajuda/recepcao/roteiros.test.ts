import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { calcularRecepcao } from "@/lib/producao/recepcao";
import { calcularValidade, prefixoDoLote, proximoCodigoDeLote } from "@/lib/producao/lote";
import { COLHEITA, COMPRA, RASA_KG, RECEPCOES } from "./exemplo";
import { ajudaRecepcao } from "./index";

const { roteiros, cenas } = ajudaRecepcao;

const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const DIA = new Date("2026-11-20T00:00:00.000Z");

describe("roteiros da Recepção de fruto", () => {
  test("são os 4 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual([
      "registrar-compra",
      "registrar-colheita",
      "corrigir-excluir",
      "consultar-exportar",
    ]);
  });

  test("o resumo da compra bate com o cálculo do sistema", () => {
    const r = calcularRecepcao({
      bruto: COMPRA.brutoRasas,
      descarte: COMPRA.descarteRasas,
      preco: COMPRA.precoRasa,
      fatorUnidadeKg: RASA_KG,
    });
    expect(`${KG.format(r.liquidoKg)} kg`).toBe(COMPRA.liquidoKg);
    expect(PERCENTUAL.format(r.percentualDescarte)).toBe(COMPRA.percentualDescarte);
    expect(r.precoKg).toBe(COMPRA.precoKg);
    expect(r.valorTotal).toBe(COMPRA.valor);
  });

  test("o resumo da colheita bate com o cálculo do sistema (custo-padrão × rasa)", () => {
    const r = calcularRecepcao({
      bruto: COLHEITA.brutoRasas,
      descarte: COLHEITA.descarteRasas,
      preco: COLHEITA.custoPadraoKg * RASA_KG,
      fatorUnidadeKg: RASA_KG,
    });
    expect(`${KG.format(r.liquidoKg)} kg`).toBe(COLHEITA.liquidoKg);
    expect(PERCENTUAL.format(r.percentualDescarte)).toBe(COLHEITA.percentualDescarte);
    expect(r.valorTotal).toBe(COLHEITA.valor);
  });

  test("os números de lote e a validade seguem as regras do sistema", () => {
    const prefixo = prefixoDoLote("FA", DIA);
    expect(proximoCodigoDeLote(prefixo, [])).toBe(COMPRA.lote);
    expect(proximoCodigoDeLote(prefixo, [COMPRA.lote])).toBe(COLHEITA.lote);
    expect(proximoCodigoDeLote(prefixo, [COMPRA.lote, COLHEITA.lote])).toBe("FA-261120-03");
    expect(calcularValidade(DIA, 1).toISOString().slice(0, 10)).toBe("2026-11-21");
  });

  test("as linhas da lista estão coerentes (líquido = bruto − descarte; valor = líquido × R$/kg)", () => {
    const numero = (texto: string) => Number(texto.replace(/\./g, "").replace(",", "."));
    for (const linha of RECEPCOES) {
      const bruto = numero(linha.brutoKg);
      const liquido = numero(linha.liquidoKg);
      expect(PERCENTUAL.format((bruto - liquido) / bruto), linha.lote).toBe(linha.descarte);
      expect(Math.round(liquido * linha.precoKg * 100) / 100, linha.lote).toBe(linha.valor);
    }
  });

  test("o filtro de origem “Terceiro” deixa só as compras", () => {
    const filtrado = renderToStaticMarkup(createElement(cenas.lista, { valores: { "lista.origem": "Terceiro" } }));
    expect(filtrado).toContain(COMPRA.lote);
    expect(filtrado).not.toContain(COLHEITA.lote);
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
