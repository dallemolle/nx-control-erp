import { describe, expect, test } from "vitest";
import { agregarVendasDetalhadas, type ItemVenda } from "@/lib/producao/relatorios";
import type { RelatorioVendas } from "@/server/services/relatorioProducao/vendas";
import { COLUNAS_VENDAS, linhasDeVendas, secoesDeVendas } from "./relatorioVendas";

const item: ItemVenda = {
  pedidoId: "p",
  produtoId: "agc",
  categoria: "POLPA",
  frutaId: "a",
  quantidadeKg: 10,
  precoKg: 30,
  custoKg: 4,
  clienteId: "c1",
  cliente: "Cliente exemplo",
  canal: null,
  formaPagamento: "A_PRAZO",
};
const agregado = agregarVendasDetalhadas(
  [item],
  [{ clienteId: "c1", cliente: "Cliente exemplo", formaPagamento: "A_PRAZO", saldo: 300 }],
);
const r: RelatorioVendas = {
  periodo: { inicio: new Date("2026-11-01T00:00:00Z"), fim: new Date("2026-11-30T00:00:00Z") },
  hoje: new Date("2026-11-20T00:00:00Z"),
  ...agregado,
  porProduto: agregado.porProduto.map((p) => ({ ...p, produto: "AGC · Polpa" })),
};

describe("exportação de vendas", () => {
  const linhas = linhasDeVendas(r);

  test("uma linha por item de cada seção, sem totais", () => {
    expect(linhas.map((l) => [l.secao, l.item])).toEqual([
      ["Cliente", "Cliente exemplo"],
      ["Produto", "AGC · Polpa"],
      ["Canal", "Sem canal"],
      ["Forma de pagamento", "A prazo"],
    ]);
    expect(linhas[0]).toMatchObject({ kg: 10, faturamento: 300, margem: 260, canal: "Sem canal", aReceber: 300 });
    expect(linhas[1]).toMatchObject({ canal: null, aReceber: null, custoMedio: 4 });
  });

  test("percentuais × 100; vazio quando não se aplica", () => {
    const col = (rotulo: string) => COLUNAS_VENDAS.find((c) => c.rotulo === rotulo)!;
    expect(col("% do total").valor(linhas[0])).toBe(100);
    expect(col("A receber").valor(linhas[1])).toBe("");
  });

  test("cliente só com saldo não tem canal principal", () => {
    const soSaldo = agregarVendasDetalhadas(
      [],
      [{ clienteId: "c9", cliente: "Cliente antigo", formaPagamento: "A_PRAZO", saldo: 300 }],
    );
    const linha = linhasDeVendas({ ...r, ...soSaldo, porProduto: [] })[0];
    expect(linha).toMatchObject({ item: "Cliente antigo", canal: "", aReceber: 300 });
  });

  test("PDF: quatro seções", () => {
    expect(secoesDeVendas(r).map((s) => s.titulo)).toEqual([
      "Vendas por cliente",
      "Por produto",
      "Por canal",
      "Por forma de pagamento",
    ]);
  });
});
