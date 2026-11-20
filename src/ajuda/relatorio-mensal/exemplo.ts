import type { CategoriaProduto, OrigemRecepcao, StatusOrdemProducao } from "@prisma/client";

/**
 * O exemplo do Relatório mensal: 2026, com a safra de açaí de setembro a novembro. Novembro usa os mesmos dados do
 * Painel de produção (recepções do José da Silva, do Talhão 3 e da Cooperativa Vale Verde, as três OPs e os pedidos
 * 120, 128 e 131); setembro e outubro são fictícios e coerentes. A cena monta as tabelas com as funções do sistema
 * (`montarColunasMensais`, `blocosMensais`, `polpaPorProdutoMes`); o teste confere os números citados.
 */

export const ANO = 2026;

const dia = (mes: number, d: number) => new Date(Date.UTC(ANO, mes - 1, d));

export const FRUTAS = [
  { id: "acai", nome: "Açaí" },
  { id: "acerola", nome: "Acerola" },
] as const;

export const PRODUTOS: Readonly<Record<string, { rotulo: string; categoria: CategoriaProduto; frutaId: string }>> = {
  fa: { rotulo: "FA · Fruto de açaí", categoria: "FRUTO", frutaId: "acai" },
  agc: { rotulo: "AGC · Polpa de açaí grosso/especial – congelada", categoria: "POLPA", frutaId: "acai" },
  amc: { rotulo: "AMC · Polpa de açaí médio/regular – congelada", categoria: "POLPA", frutaId: "acai" },
  amr: { rotulo: "AMR · Açaí médio/regular – resfriado", categoria: "POLPA", frutaId: "acai" },
  acc: { rotulo: "ACC · Polpa de acerola – congelada", categoria: "POLPA", frutaId: "acerola" },
};

/** Recepções ativas do ano (peso bruto, descarte e valor pago, este só nas compras). */
export const RECEPCOES: readonly {
  frutaId: string;
  origem: OrigemRecepcao;
  brutoKg: number;
  descarteKg: number;
  valorTotal: number;
  data: Date;
}[] = [
  // Setembro
  { frutaId: "acai", origem: "TERCEIRO", brutoKg: 1800, descarteKg: 60, valorTotal: 8352, data: dia(9, 12) },
  { frutaId: "acai", origem: "PROPRIA", brutoKg: 900, descarteKg: 30, valorTotal: 3480, data: dia(9, 15) },
  // Outubro
  { frutaId: "acai", origem: "TERCEIRO", brutoKg: 2400, descarteKg: 72, valorTotal: 11640, data: dia(10, 8) },
  { frutaId: "acai", origem: "PROPRIA", brutoKg: 1100, descarteKg: 33, valorTotal: 4268, data: dia(10, 10) },
  { frutaId: "acerola", origem: "TERCEIRO", brutoKg: 500, descarteKg: 20, valorTotal: 1680, data: dia(10, 20) },
  // Novembro (os mesmos do Painel)
  { frutaId: "acai", origem: "PROPRIA", brutoKg: 35, descarteKg: 0, valorTotal: 140, data: dia(11, 17) },
  { frutaId: "acai", origem: "TERCEIRO", brutoKg: 560, descarteKg: 14, valorTotal: 2730, data: dia(11, 18) },
  { frutaId: "acai", origem: "TERCEIRO", brutoKg: 700, descarteKg: 28, valorTotal: 3360, data: dia(11, 20) },
  { frutaId: "acai", origem: "PROPRIA", brutoKg: 420, descarteKg: 14, valorTotal: 1624, data: dia(11, 20) },
  { frutaId: "acerola", origem: "TERCEIRO", brutoKg: 300, descarteKg: 10, valorTotal: 1015, data: dia(11, 17) },
];

/** OPs do ano (todas encerradas, com o custo gravado). */
export const OPS: readonly {
  frutaId: string;
  status: StatusOrdemProducao;
  frutoKg: number;
  polpaKg: number;
  custoTotal: number;
  balancoVerificar: boolean;
  branqueamentoVerificar: boolean;
  data: Date;
}[] = [
  { frutaId: "acai", status: "ENCERRADA", frutoKg: 2500, polpaKg: 2300, custoTotal: 12650, balancoVerificar: false, branqueamentoVerificar: false, data: dia(9, 16) },
  { frutaId: "acai", status: "ENCERRADA", frutoKg: 3300, polpaKg: 3050, custoTotal: 17000, balancoVerificar: false, branqueamentoVerificar: false, data: dia(10, 11) },
  { frutaId: "acerola", status: "ENCERRADA", frutoKg: 470, polpaKg: 360, custoTotal: 1900, balancoVerificar: false, branqueamentoVerificar: false, data: dia(10, 21) },
  { frutaId: "acai", status: "ENCERRADA", frutoKg: 546, polpaKg: 500, custoTotal: 3050, balancoVerificar: false, branqueamentoVerificar: false, data: dia(11, 18) },
  { frutaId: "acerola", status: "ENCERRADA", frutoKg: 250, polpaKg: 190, custoTotal: 988, balancoVerificar: true, branqueamentoVerificar: false, data: dia(11, 19) },
  { frutaId: "acai", status: "ENCERRADA", frutoKg: 1078, polpaKg: 1000, custoTotal: 5762, balancoVerificar: false, branqueamentoVerificar: false, data: dia(11, 20) },
];

/** Polpa produzida por produto (as linhas de produção das OPs acima). */
export const PRODUCOES: readonly { produtoId: string; data: Date; kg: number }[] = [
  { produtoId: "amc", data: dia(9, 16), kg: 1600 },
  { produtoId: "agc", data: dia(9, 16), kg: 700 },
  { produtoId: "amc", data: dia(10, 11), kg: 2100 },
  { produtoId: "agc", data: dia(10, 11), kg: 950 },
  { produtoId: "acc", data: dia(10, 21), kg: 360 },
  { produtoId: "amc", data: dia(11, 18), kg: 420 },
  { produtoId: "amr", data: dia(11, 18), kg: 80 },
  { produtoId: "acc", data: dia(11, 19), kg: 190 },
  { produtoId: "agc", data: dia(11, 20), kg: 300 },
  { produtoId: "amc", data: dia(11, 20), kg: 700 },
];

/** Itens de pedidos confirmados do ano. */
export const ITENS: readonly {
  pedido: number;
  produtoId: string;
  quantidadeKg: number;
  precoKg: number;
  custoKg: number;
  data: Date;
}[] = [
  { pedido: 101, produtoId: "amc", quantidadeKg: 900, precoKg: 13, custoKg: 5.5, data: dia(9, 22) },
  { pedido: 104, produtoId: "agc", quantidadeKg: 600, precoKg: 13, custoKg: 5.5, data: dia(9, 29) },
  { pedido: 109, produtoId: "amc", quantidadeKg: 1200, precoKg: 13.5, custoKg: 5.6, data: dia(10, 14) },
  { pedido: 111, produtoId: "agc", quantidadeKg: 800, precoKg: 13.5, custoKg: 5.6, data: dia(10, 20) },
  { pedido: 113, produtoId: "amc", quantidadeKg: 600, precoKg: 13.5, custoKg: 5.6, data: dia(10, 27) },
  { pedido: 114, produtoId: "acc", quantidadeKg: 300, precoKg: 11, custoKg: 5.3, data: dia(10, 28) },
  { pedido: 115, produtoId: "fa", quantidadeKg: 200, precoKg: 6, custoKg: 4.5, data: dia(10, 30) },
  { pedido: 120, produtoId: "amc", quantidadeKg: 200, precoKg: 13, custoKg: 6, data: dia(11, 12) },
  { pedido: 128, produtoId: "agc", quantidadeKg: 120, precoKg: 20, custoKg: 7.5157, data: dia(11, 21) },
  { pedido: 131, produtoId: "amc", quantidadeKg: 50, precoKg: 14, custoKg: 5.0104, data: dia(11, 22) },
];

/** Números citados nos roteiros, como a tela formata (o teste confere com as funções do sistema). */
export const CITADOS = {
  novembroRecebido: "1.949",
  novembroFaturamento: 5700,
  totalRecebido: "8.434",
  totalFaturamento: 64800,
  rendimentoAcai: "92,3%",
  pagoTerceiros: 28777,
} as const;
