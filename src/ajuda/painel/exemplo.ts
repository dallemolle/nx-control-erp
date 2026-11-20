import type { CategoriaProduto, Conservacao, OrigemRecepcao, StatusOrdemProducao } from "@prisma/client";
import { formatarMoeda } from "@/lib/formatacao";

/**
 * O exemplo do Painel de produção: novembro de 2026 ("Mês atual"), visto em 22/11, com os dados da história das
 * outras ajudas (recepções do José da Silva, do Talhão 3 e da Cooperativa Vale Verde, as três OPs do mês, os pedidos
 * 120, 128 e 131 e o estoque depois das vendas e dos ajustes). Fictício e fixo. A cena calcula os indicadores com as
 * funções do sistema (`agregarRecepcoes`, `agregarOPs`, `agregarVendas`, `agregarEstoque`); o teste confere os
 * números citados nos roteiros.
 */

export const HOJE_ISO = "2026-11-22";
export const PERIODO = { inicio: "01/11/2026", fim: "30/11/2026" } as const;

export const FRUTAS = [
  { id: "acai", nome: "Açaí" },
  { id: "acerola", nome: "Acerola" },
] as const;

/** Recepções ativas do mês (a de acerola excluída em 19/11 fica fora). */
export const RECEPCOES: readonly { frutaId: string; origem: OrigemRecepcao; brutoKg: number; descarteKg: number }[] = [
  { frutaId: "acai", origem: "PROPRIA", brutoKg: 35, descarteKg: 0 },
  { frutaId: "acai", origem: "TERCEIRO", brutoKg: 560, descarteKg: 14 },
  { frutaId: "acai", origem: "TERCEIRO", brutoKg: 700, descarteKg: 28 },
  { frutaId: "acai", origem: "PROPRIA", brutoKg: 420, descarteKg: 14 },
  { frutaId: "acerola", origem: "TERCEIRO", brutoKg: 300, descarteKg: 10 },
];

/** OPs do mês, com o custo gravado no encerramento. */
export const OPS: readonly {
  numero: string;
  frutaId: string;
  status: StatusOrdemProducao;
  frutoKg: number;
  polpaKg: number;
  custoTotal: number;
  balancoVerificar: boolean;
  branqueamentoVerificar: boolean;
}[] = [
  {
    numero: "OP-261118-01",
    frutaId: "acai",
    status: "ENCERRADA",
    frutoKg: 546,
    polpaKg: 500,
    custoTotal: 3050,
    balancoVerificar: false,
    branqueamentoVerificar: false,
  },
  {
    numero: "OP-261119-01",
    frutaId: "acerola",
    status: "ENCERRADA",
    frutoKg: 250,
    polpaKg: 190,
    custoTotal: 988,
    balancoVerificar: true,
    branqueamentoVerificar: false,
  },
  {
    numero: "OP-261120-01",
    frutaId: "acai",
    status: "ENCERRADA",
    frutoKg: 1078,
    polpaKg: 1000,
    custoTotal: 5762,
    balancoVerificar: false,
    branqueamentoVerificar: false,
  },
];

export const PRODUTOS: Readonly<Record<string, { rotulo: string; categoria: CategoriaProduto; frutaId: string }>> = {
  agc: { rotulo: "AGC · Polpa de açaí grosso/especial – congelada", categoria: "POLPA", frutaId: "acai" },
  amc: { rotulo: "AMC · Polpa de açaí médio/regular – congelada", categoria: "POLPA", frutaId: "acai" },
  amr: { rotulo: "AMR · Açaí médio/regular – resfriado", categoria: "POLPA", frutaId: "acai" },
  acc: { rotulo: "ACC · Polpa de acerola – congelada", categoria: "POLPA", frutaId: "acerola" },
  fc: { rotulo: "FC · Fruto de acerola", categoria: "FRUTO", frutaId: "acerola" },
};

/** Itens dos pedidos confirmados do mês (o 127, cancelado, fica fora). */
export const ITENS_VENDIDOS: readonly {
  pedido: number;
  produtoId: string;
  quantidadeKg: number;
  precoKg: number;
  custoKg: number;
}[] = [
  { pedido: 120, produtoId: "amc", quantidadeKg: 200, precoKg: 13, custoKg: 6 },
  { pedido: 128, produtoId: "agc", quantidadeKg: 120, precoKg: 20, custoKg: 7.5157 },
  { pedido: 131, produtoId: "amc", quantidadeKg: 50, precoKg: 14, custoKg: 5.0104 },
];

/** Saldo de hoje das parcelas em aberto dos pedidos: o 131, ainda não pago. */
export const A_RECEBER = 700;

/** Lotes com saldo hoje (22/11). */
export const LOTES: readonly {
  codigo: string;
  produtoId: string;
  conservacao: Conservacao;
  validade: string;
  saldoKg: number;
  custoKg: number;
}[] = [
  { codigo: "FC-261117-01", produtoId: "fc", conservacao: "IN_NATURA", validade: "2026-11-19", saldoKg: 40, custoKg: 3.5 },
  { codigo: "AMR-261118-01", produtoId: "amr", conservacao: "RESFRIADO", validade: "2026-11-20", saldoKg: 80, custoKg: 6 },
  { codigo: "AMC-261118-01", produtoId: "amc", conservacao: "CONGELADO", validade: "2027-11-18", saldoKg: 422, custoKg: 6.1 },
  { codigo: "ACC-261119-01", produtoId: "acc", conservacao: "CONGELADO", validade: "2027-11-19", saldoKg: 190, custoKg: 5.2 },
  { codigo: "AGC-261120-01", produtoId: "agc", conservacao: "CONGELADO", validade: "2027-11-20", saldoKg: 179, custoKg: 7.5157 },
  { codigo: "AMC-261120-01", produtoId: "amc", conservacao: "CONGELADO", validade: "2027-11-20", saldoKg: 500, custoKg: 5.0104 },
  { codigo: "AMC-261120-01/1", produtoId: "amc", conservacao: "CONGELADO", validade: "2027-11-20", saldoKg: 150, custoKg: 5.0104 },
];

export const ALERTAS_CONFIG = { alertaVencimentoCongeladoDias: 30, alertaVencimentoResfriadoDias: 1 } as const;

export const ENTREGAS = { abertas: 1, atrasadas: 0 } as const;

/** Números citados nos roteiros, como a tela formata (o teste confere com as funções do sistema). */
export const CITADOS = {
  recebido: "1.949 kg",
  terceiros: "77,4%",
  descarte: "3,3%",
  ops: "3",
  processado: "1.874 kg",
  polpa: "1.690 kg",
  rendimento: "90,2%",
  custoMedio: `${formatarMoeda(5.8)}/kg`,
  faturamento: 5700,
  kgVendidos: "370 kg",
  precoMedio: `${formatarMoeda(15.41)}/kg`,
  ticket: 1900,
  margem: 3347.6,
  margemPercentual: "58,7%",
  polpaEstoque: "1.521 kg",
  valorEstoque: 8784.27,
  vencidos: 2,
  vencidosKg: "120 kg",
} as const;
