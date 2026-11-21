import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import type { Valores } from "@/ajuda/tipos";
import { LOTES } from "@/ajuda/estoque/exemplo";
import { OPS } from "@/ajuda/relatorio-processamento/exemplo";
import { POLPAS } from "@/ajuda/processamento/exemplo";
import { RASA_KG } from "@/ajuda/recepcao/exemplo";
import { liberadoAteDoLote } from "@/lib/producao/liberacaoVencido";
import { calcularValidade, prefixoDoLote } from "@/lib/producao/lote";
import { ratearCustoOP } from "@/lib/producao/op";
import { produtoSchema } from "@/lib/schemas/produto";
import { produtosDoRoteiro } from "./cenas";
import { AGR, LOTE_VENCIDO, PRIMEIRO_LOTE_AGR, PRODUTOS, VALIDADE_AGR } from "./exemplo";
import { ajudaProdutos } from "./index";

const { roteiros, cenas } = ajudaProdutos;
const roteiroDe = (id: string) => roteiros.find((r) => r.id === id)!;
const html = (cena: string, valores: Valores) => renderToStaticMarkup(createElement(cenas[cena], { valores }));
const fim = (id: string) => valoresAte(roteiroDe(id), roteiroDe(id).passos.length - 1);

/** "DD/MM/AAAA" → data UTC. */
const deData = (texto: string) => {
  const [d, m, a] = texto.split("/");
  return new Date(`${a}-${m}-${d}T00:00:00.000Z`);
};
const produto = (codigo: string) => PRODUTOS.find((p) => p.codigo === codigo)!;

describe("roteiros de Produtos", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["cadastrar-polpa", "fruto-rasa", "liberar-inativar"]);
  });

  test("cada lote do Estoque tem o código e a validade que o produto dá", () => {
    for (const lote of LOTES) {
      const p = PRODUTOS.find((x) => x.descricao === lote.produto);
      expect(p, lote.produto).toBeDefined();
      const data = deData(lote.data);
      expect(lote.codigo.startsWith(prefixoDoLote(p!.codigo, data)), lote.codigo).toBe(true);
      expect(calcularValidade(data, p!.validadeDias).toISOString().slice(0, 10), lote.codigo).toBe(lote.validade);
    }
  });

  test("o primeiro lote da AGR e a validade citados batem com as regras do lote", () => {
    const hoje = deData("21/11/2026");
    expect(`${prefixoDoLote(AGR.codigo, hoje)}-01`).toBe(PRIMEIRO_LOTE_AGR);
    expect(calcularValidade(hoje, AGR.validadeDias).getTime()).toBe(deData(VALIDADE_AGR).getTime());
  });

  test("os preços de referência dão o rateio das OPs do exemplo", () => {
    for (const polpa of POLPAS) expect(produto(polpa.codigo).precoReferenciaKg).toBe(polpa.precoReferenciaKg);
    // OP-261118-01: 420 kg de AMC e 80 kg de AMR, R$ 3.050 de custo → R$ 6,10 e R$ 6,00 por kg, como no Estoque.
    const op = OPS.find((o) => o.numero === "OP-261118-01")!;
    const custoTotal = op.custoFrutoTotal + op.custoInsumosTotal;
    const rateio = ratearCustoOP({ custoTotal, custoKgPolpa: custoTotal / op.polpaKg }, [
      { produtoId: "AMC", descricao: "AMC", quantidadeKg: 420, precoKg: produto("AMC").precoReferenciaKg },
      { produtoId: "AMR", descricao: "AMR", quantidadeKg: 80, precoKg: produto("AMR").precoReferenciaKg },
    ]);
    const custo = (codigo: string) => Number(rateio.custoKgPorProduto.get(codigo)!.toFixed(1));
    expect(custo("AMC")).toBe(LOTES.find((l) => l.codigo === "AMC-261118-01")!.custoKg);
    expect(custo("AMR")).toBe(LOTES.find((l) => l.codigo === "AMR-261118-01")!.custoKg);
  });

  test("a rasa e a liberação citadas batem com o resto da ajuda", () => {
    expect(produto("FA").unidade?.kg).toBe(RASA_KG);
    const liberado = liberadoAteDoLote(deData(LOTE_VENCIDO.validade), produto("FC").diasLiberacao!);
    expect(liberado.getTime()).toBe(deData(LOTE_VENCIDO.liberadoAte).getTime());
  });

  test("a AGR passa na validação do cadastro; unidade sem os kg é recusada", () => {
    const base = {
      codigo: "agr",
      descricao: AGR.descricao,
      categoria: "POLPA",
      frutaId: "acai",
      conservacao: "RESFRIADO",
      validadeDias: String(AGR.validadeDias),
      precoReferenciaKg: String(AGR.precoReferenciaKg),
      armazenamento: AGR.armazenamento,
      textoEtiqueta: AGR.textoEtiqueta,
    };
    const ok = produtoSchema.safeParse(base);
    expect(ok.success && ok.data.codigo).toBe("AGR");
    expect(produtoSchema.safeParse({ ...base, unidadeComercial: "caixa" }).success).toBe(false);
    expect(produtoSchema.safeParse({ ...base, codigo: "AG-R" }).success).toBe(false);
  });

  test("a lista fica em ordem de código e a ACR inativa ganha o Reativar", () => {
    const codigos = produtosDoRoteiro(fim("cadastrar-polpa")).map((p) => p.codigo);
    expect(codigos).toEqual(["ACC", "ACR", "AGC", "AGR", "AMC", "AMR", "FA", "FC"]);
    expect(produtosDoRoteiro(fim("liberar-inativar")).find((p) => p.codigo === "ACR")?.ativo).toBe(false);
    expect(html("lista", fim("liberar-inativar"))).toContain("Reativar");
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
