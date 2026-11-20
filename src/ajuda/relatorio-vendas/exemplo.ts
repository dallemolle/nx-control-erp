import type { CanalVenda, CategoriaProduto, FormaPagamentoVenda } from "@prisma/client";

/**
 * O exemplo do Relatório de vendas: novembro de 2026, com os pedidos da história (120, 128 e 131; o 127, cancelado,
 * fica fora) e o saldo em aberto de hoje, que inclui o resto do pedido 115, de outubro, do Mercadinho São João.
 * Fictício e fixo. A cena monta as tabelas com `agregarVendasDetalhadas`; o teste confere os números citados.
 */

export const PERIODO = { inicio: "01/11/2026", fim: "30/11/2026" } as const;

export const PRODUTOS: Readonly<Record<string, { rotulo: string; categoria: CategoriaProduto; frutaId: string }>> = {
  agc: { rotulo: "AGC · Polpa de açaí grosso/especial – congelada", categoria: "POLPA", frutaId: "acai" },
  amc: { rotulo: "AMC · Polpa de açaí médio/regular – congelada", categoria: "POLPA", frutaId: "acai" },
};

type Item = {
  pedido: number;
  clienteId: string;
  cliente: string;
  canal: CanalVenda | null;
  formaPagamento: FormaPagamentoVenda;
  produtoId: string;
  quantidadeKg: number;
  precoKg: number;
  custoKg: number;
};

/** Itens dos pedidos confirmados do período. */
export const ITENS: readonly Item[] = [
  {
    pedido: 120,
    clienteId: "ver-o-peso",
    cliente: "Batedor do Ver-o-Peso",
    canal: "BATEDOR",
    formaPagamento: "PIX",
    produtoId: "amc",
    quantidadeKg: 200,
    precoKg: 13,
    custoKg: 6,
  },
  {
    pedido: 128,
    clienteId: "acai-da-vila",
    cliente: "Açaí da Vila",
    canal: "BATEDOR",
    formaPagamento: "TRANSFERENCIA",
    produtoId: "agc",
    quantidadeKg: 120,
    precoKg: 20,
    custoKg: 7.5157,
  },
  {
    pedido: 131,
    clienteId: "sorveteria-polar",
    cliente: "Sorveteria Polar",
    canal: "VAREJO",
    formaPagamento: "A_PRAZO",
    produtoId: "amc",
    quantidadeKg: 50,
    precoKg: 14,
    custoKg: 5.0104,
  },
];

/** Saldos de hoje das parcelas em aberto, de qualquer data de venda. */
export const SALDOS: readonly {
  clienteId: string;
  cliente: string;
  formaPagamento: FormaPagamentoVenda;
  saldo: number;
}[] = [
  { clienteId: "sorveteria-polar", cliente: "Sorveteria Polar", formaPagamento: "A_PRAZO", saldo: 700 },
  { clienteId: "mercadinho", cliente: "Mercadinho São João", formaPagamento: "A_PRAZO", saldo: 450 },
];

/** Números citados nos roteiros (o teste confere). */
export const CITADOS = {
  faturamento: 5700,
  aReceber: 1150,
  primeiro: "Batedor do Ver-o-Peso",
  percentualPrimeiro: "45,6%",
  batedor: "87,7%",
} as const;
