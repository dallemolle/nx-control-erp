import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import type { Valores } from "@/ajuda/tipos";
import { contaBancariaSchema } from "@/lib/schemas/contaBancaria";
import { ROTULOS_TIPO_CONTA_BANCARIA } from "@/lib/schemas/enums";
import { SALDO_INICIAL_DO_ANO } from "@/ajuda/fluxo-de-caixa/exemplo";
import { contasDoRoteiro } from "./cenas";
import { CONTAS, ESCRITORIO, SICREDI, TIPO_CAIXA, TIPO_CORRENTE } from "./exemplo";
import { ajudaContasBancarias } from "./index";

const { roteiros, cenas } = ajudaContasBancarias;
const roteiroDe = (id: string) => roteiros.find((r) => r.id === id)!;
const html = (cena: string, valores: Valores) => renderToStaticMarkup(createElement(cenas[cena], { valores }));
const fim = (id: string) => valoresAte(roteiroDe(id), roteiroDe(id).passos.length - 1);
const semNbsp = (texto: string) => texto.replace(/ /g, " ");

describe("roteiros de Contas bancárias", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["cadastrar-conta", "cadastrar-caixa", "corrigir-inativar"]);
  });

  test("os saldos iniciais das contas do início do ano somam o saldo inicial do Fluxo de caixa", () => {
    expect(CONTAS.reduce((soma, c) => soma + c.saldoInicial, 0)).toBe(SALDO_INICIAL_DO_ANO);
    expect(SICREDI.saldoInicial + ESCRITORIO.saldoInicial).toBe(0);
  });

  test("os rótulos de tipo são os do sistema", () => {
    expect(TIPO_CORRENTE).toBe(ROTULOS_TIPO_CONTA_BANCARIA.CORRENTE);
    expect(TIPO_CAIXA).toBe(ROTULOS_TIPO_CONTA_BANCARIA.CAIXA);
  });

  test("a conta e o caixa dos roteiros passam na validação; caixa não pede banco nem agência", () => {
    const base = { moeda: "BRL", saldoInicial: "0" };
    expect(
      contaBancariaSchema.safeParse({ ...base, tipo: "CORRENTE", bancoId: "748", agencia: SICREDI.agencia, conta: SICREDI.conta })
        .success,
    ).toBe(true);
    expect(contaBancariaSchema.safeParse({ ...base, tipo: "CAIXA", conta: ESCRITORIO.conta }).success).toBe(true);
    expect(contaBancariaSchema.safeParse({ ...base, tipo: "CORRENTE", conta: "1" }).success).toBe(false);
  });

  test("a lista segue a ordem de cadastro e mostra o saldo inicial em reais", () => {
    const lista = contasDoRoteiro(fim("cadastrar-caixa"));
    expect(lista.map((c) => c.chave)).toEqual(["bb", "fazenda", "santander", "sicredi", "escritorio"]);
    const markup = semNbsp(html("lista", fim("cadastrar-caixa")));
    expect(markup).toContain("R$ 38.000,00");
    expect(markup).toContain("R$ 0,00");
  });

  test("no tipo Caixa o formulário não tem banco nem agência", () => {
    expect(html("nova", {})).toContain('data-alvo="form.banco"');
    const caixa = html("nova", { "form.tipo": TIPO_CAIXA });
    expect(caixa).not.toContain('data-alvo="form.banco"');
    expect(caixa).not.toContain('data-alvo="form.agencia"');
    expect(caixa).toContain("Identificação do caixa");
  });

  test("inativar muda o status do Santander e o botão vira Reativar", () => {
    const roteiro = roteiroDe("corrigir-inativar");
    expect(contasDoRoteiro(valoresAte(roteiro, 0)).find((c) => c.chave === "santander")?.ativo).toBe(true);
    expect(contasDoRoteiro(fim("corrigir-inativar")).find((c) => c.chave === "santander")?.ativo).toBe(false);
    expect(html("lista", fim("corrigir-inativar"))).toContain("Reativar");
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
