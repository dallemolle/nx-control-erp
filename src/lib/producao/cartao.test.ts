import { describe, expect, test } from "vitest";
import {
  calcularRepasses,
  condicaoParaVenda,
  descricaoPagamentoCartao,
  validarCondicoesCartao,
  type CondicaoCartao,
} from "./cartao";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const cond = (c: Partial<CondicaoCartao>): CondicaoCartao => ({
  modalidade: "DEBITO",
  parcelasDe: 1,
  parcelasAte: 1,
  taxaPercentual: 1.5,
  prazoDias: 1,
  antecipado: false,
  ...c,
});

describe("calcularRepasses", () => {
  test("débito: um repasse em D+1 com a taxa descontada", () => {
    expect(calcularRepasses(d("2026-11-10"), 100, cond({}), 1)).toEqual([
      { numero: 1, data: d("2026-11-11"), bruto: 100, taxa: 1.5, liquido: 98.5 },
    ]);
  });

  test("parcelado sem antecipação: um repasse por parcela, de 30 em 30 dias, centavos na última", () => {
    const c = cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 2, parcelasAte: 6, taxaPercentual: 3, prazoDias: 30 });
    expect(calcularRepasses(d("2026-11-10"), 100, c, 3)).toEqual([
      { numero: 1, data: d("2026-12-10"), bruto: 33.33, taxa: 0.99, liquido: 32.34 },
      { numero: 2, data: d("2027-01-09"), bruto: 33.33, taxa: 0.99, liquido: 32.34 },
      { numero: 3, data: d("2027-02-08"), bruto: 33.34, taxa: 1.02, liquido: 32.32 },
    ]);
  });

  test("parcelado antecipado: um repasse único no prazo", () => {
    const c = cond({
      modalidade: "CREDITO_PARCELADO",
      parcelasDe: 2,
      parcelasAte: 12,
      taxaPercentual: 5,
      prazoDias: 2,
      antecipado: true,
    });
    expect(calcularRepasses(d("2026-11-10"), 250, c, 10)).toEqual([
      { numero: 1, data: d("2026-11-12"), bruto: 250, taxa: 12.5, liquido: 237.5 },
    ]);
  });

  test("taxa zero: repasse sem taxa", () => {
    expect(calcularRepasses(d("2026-11-10"), 10, cond({ taxaPercentual: 0, prazoDias: 0 }), 1)).toEqual([
      { numero: 1, data: d("2026-11-10"), bruto: 10, taxa: 0, liquido: 10 },
    ]);
  });

  test("soma dos repasses fecha com o total e com a taxa arredondada", () => {
    const c = cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 2, parcelasAte: 12, taxaPercentual: 2.99, prazoDias: 30 });
    const repasses = calcularRepasses(d("2026-11-10"), 1234.57, c, 7);
    const soma = (f: (r: (typeof repasses)[number]) => number) =>
      repasses.reduce((t, r) => t + Math.round(f(r) * 100), 0);
    expect(soma((r) => r.bruto)).toBe(123457);
    expect(soma((r) => r.taxa)).toBe(Math.round(123457 * 0.0299));
  });
});

describe("condicaoParaVenda", () => {
  const condicoes = [
    cond({ modalidade: "DEBITO" }),
    cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 2, parcelasAte: 6, taxaPercentual: 3 }),
    cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 7, parcelasAte: 12, taxaPercentual: 4 }),
  ];
  test("acha a faixa das parcelas", () => {
    expect(condicaoParaVenda(condicoes, "CREDITO_PARCELADO", 8)?.taxaPercentual).toBe(4);
    expect(condicaoParaVenda(condicoes, "DEBITO", 1)?.modalidade).toBe("DEBITO");
  });
  test("sem condição devolve null", () => {
    expect(condicaoParaVenda(condicoes, "CREDITO_VISTA", 1)).toBeNull();
    expect(condicaoParaVenda(condicoes, "CREDITO_PARCELADO", 13)).toBeNull();
  });
});

describe("validarCondicoesCartao", () => {
  test("aceita condições válidas", () => {
    expect(
      validarCondicoesCartao([
        cond({}),
        cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 2, parcelasAte: 6 }),
        cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 7, parcelasAte: 12, antecipado: true }),
      ]),
    ).toBeNull();
  });
  test("recusas", () => {
    expect(validarCondicoesCartao([])).toBe("Inclua ao menos uma condição");
    expect(validarCondicoesCartao([cond({}), cond({})])).toBe("Débito aparece mais de uma vez");
    expect(validarCondicoesCartao([cond({ parcelasAte: 2 })])).toBe("Só o crédito parcelado tem faixa de parcelas");
    expect(validarCondicoesCartao([cond({ antecipado: true })])).toBe("Só o crédito parcelado pode ser antecipado");
    expect(validarCondicoesCartao([cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 1, parcelasAte: 6 })])).toBe(
      "A faixa do parcelado vai de 2 a 12 parcelas",
    );
    expect(
      validarCondicoesCartao([
        cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 2, parcelasAte: 6 }),
        cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 6, parcelasAte: 12 }),
      ]),
    ).toBe("As faixas do parcelado se sobrepõem");
    expect(validarCondicoesCartao([cond({ taxaPercentual: 100 })])).toBe("A taxa deve ficar entre 0 e 100%");
    expect(validarCondicoesCartao([cond({ prazoDias: 400 })])).toBe("O prazo deve ficar entre 0 e 365 dias");
  });
});

describe("descricaoPagamentoCartao", () => {
  test("com e sem operadora", () => {
    expect(descricaoPagamentoCartao("CREDITO_PARCELADO", 3, "Stone")).toBe("Crédito 3x — Stone");
    expect(descricaoPagamentoCartao("DEBITO", 1)).toBe("Débito");
    expect(descricaoPagamentoCartao("PIX_MAQUININHA", null, "Cielo")).toBe("Pix na maquininha — Cielo");
  });
});
