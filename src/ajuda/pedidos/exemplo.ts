import type { CondicaoCartao } from "@/lib/producao/cartao";

/**
 * O exemplo de Pedidos: a filial em 22/11/2026, com os pedidos de novembro da história (os mesmos do Painel e dos
 * relatórios da Produção). O 120 (Batedor do Ver-o-Peso, Pix) é do dia 12; o 127 da Açaí da Vila saiu com o preço
 * sugerido de R$ 18,00/kg em vez dos R$ 20,00 combinados e foi cancelado e relançado como 128; o 131 (Sorveteria
 * Polar) é a prazo. A venda na maquininha é só simulada: não é salva e não entra na lista. Fictício e fixo. A cena
 * calcula valores, margens, parcelas e repasses com as funções do sistema; o teste confere os números citados.
 */

export const HOJE = "22/11/2026";
export const PERIODO = { inicio: "01/11/2026", fim: "30/11/2026" } as const;

export const CONTA_RECEBIMENTO = "Banco do Brasil - Ag 1234/CC 12345-6";
export const VENDEDORA = "Rita";
export const MOTORISTA = "João";

export type ClienteExemplo = {
  nome: string;
  canal: string;
  retira: boolean;
  endereco: string | null;
};

export const CLIENTES = {
  verOPeso: { nome: "Batedor do Ver-o-Peso", canal: "Batedor / ponto de açaí", retira: true, endereco: null },
  acaiDaVila: {
    nome: "Açaí da Vila",
    canal: "Batedor / ponto de açaí",
    retira: false,
    endereco: "Rua das Palmeiras, 45 · Belém",
  },
  polar: { nome: "Sorveteria Polar", canal: "Varejo / mercado", retira: false, endereco: "Av. Nazaré, 900 · Belém" },
  diversos: { nome: "Clientes diversos", canal: "Consumidor final", retira: true, endereco: null },
} as const satisfies Record<string, ClienteExemplo>;

export type LoteParaVenda = {
  codigo: string;
  produto: string;
  saldoKg: number;
  custoKg: number;
  /** DD/MM/AAAA. */
  validade: string;
  /** Vencido na data do pedido do roteiro (21/11). */
  vencido: boolean;
  liberadoAte?: string;
};

/**
 * Lotes com saldo em 21/11, na ordem do formulário (vence primeiro, sai primeiro). O AGC já tem 1 kg a menos (a
 * amostra dos Ajustes) e 200 kg do AMC-261120-01 foram para a Câmara da loja (o /1).
 */
export const LOTES: readonly LoteParaVenda[] = [
  {
    codigo: "FC-261117-01",
    produto: "Fruto de acerola",
    saldoKg: 40,
    custoKg: 3.5,
    validade: "19/11/2026",
    vencido: true,
    liberadoAte: "21/11/2026",
  },
  {
    codigo: "AMR-261118-01",
    produto: "Açaí médio/regular – resfriado",
    saldoKg: 80,
    custoKg: 6,
    validade: "20/11/2026",
    vencido: true,
  },
  {
    codigo: "AMC-261118-01",
    produto: "Polpa de açaí médio/regular – congelada",
    saldoKg: 422,
    custoKg: 6.1,
    validade: "18/11/2027",
    vencido: false,
  },
  {
    codigo: "ACC-261119-01",
    produto: "Polpa de acerola – congelada",
    saldoKg: 190,
    custoKg: 5.2,
    validade: "19/11/2027",
    vencido: false,
  },
  {
    codigo: "AGC-261120-01",
    produto: "Polpa de açaí grosso/especial – congelada",
    saldoKg: 299,
    custoKg: 7.5157,
    validade: "20/11/2027",
    vencido: false,
  },
  {
    codigo: "AMC-261120-01",
    produto: "Polpa de açaí médio/regular – congelada",
    saldoKg: 500,
    custoKg: 5.0104,
    validade: "20/11/2027",
    vencido: false,
  },
  {
    codigo: "AMC-261120-01/1",
    produto: "Polpa de açaí médio/regular – congelada",
    saldoKg: 200,
    custoKg: 5.0104,
    validade: "20/11/2027",
    vencido: false,
  },
];

/** Preço de referência por kg (Cadastros → Produtos), sugerido ao escolher o lote. */
export const PRECO_REFERENCIA: Readonly<Record<string, number>> = {
  "Polpa de açaí grosso/especial – congelada": 18,
  "Polpa de açaí médio/regular – congelada": 12,
};

/** Lote do pedido 120, já zerado (não aparece mais no formulário). */
const LOTE_120 = { codigo: "AMC-261110-01", produto: "Polpa de açaí médio/regular – congelada", custoKg: 6 };

export type PedidoExemplo = {
  numero: number;
  data: string;
  cliente: ClienteExemplo;
  forma: "Pix" | "Transferência" | "A prazo";
  /** Só a prazo, como o pedido grava. */
  condicao: string | null;
  item: { lote: string; produto: string; quantidadeKg: number; precoKg: number; custoKg: number };
  cancelado: boolean;
  motivoCancelamento: string | null;
  /** Status da entrega; `null` = o cliente retira. */
  entrega: "Entregue" | "Em rota" | "Cancelada" | null;
  entregaPrevista: string | null;
  entregueEm: string | null;
  recebidoPor: string | null;
};

const AGC = LOTES.find((l) => l.codigo === "AGC-261120-01")!;
const AMC_LOJA = LOTES.find((l) => l.codigo === "AMC-261120-01/1")!;

export const MOTIVO_127 = "Preço errado: ficou o sugerido de R$ 18,00/kg, o combinado era R$ 20,00/kg";

const PEDIDO_127: PedidoExemplo = {
  numero: 127,
  data: "21/11/2026",
  cliente: CLIENTES.acaiDaVila,
  forma: "Transferência",
  condicao: null,
  item: { lote: AGC.codigo, produto: AGC.produto, quantidadeKg: 120, precoKg: 18, custoKg: AGC.custoKg },
  cancelado: true,
  motivoCancelamento: MOTIVO_127,
  entrega: "Cancelada",
  entregaPrevista: "21/11/2026",
  entregueEm: null,
  recebidoPor: null,
};

/** Pedidos de novembro, como a lista mostra (data e número, do mais recente). */
export const PEDIDOS: readonly PedidoExemplo[] = [
  {
    numero: 131,
    data: "22/11/2026",
    cliente: CLIENTES.polar,
    forma: "A prazo",
    condicao: "14/28",
    item: { lote: AMC_LOJA.codigo, produto: AMC_LOJA.produto, quantidadeKg: 50, precoKg: 14, custoKg: AMC_LOJA.custoKg },
    cancelado: false,
    motivoCancelamento: null,
    entrega: "Em rota",
    entregaPrevista: "22/11/2026",
    entregueEm: null,
    recebidoPor: null,
  },
  {
    ...PEDIDO_127,
    numero: 128,
    item: { ...PEDIDO_127.item, precoKg: 20 },
    cancelado: false,
    motivoCancelamento: null,
    entrega: "Entregue",
    entregueEm: "21/11/2026",
    recebidoPor: "Ana",
  },
  PEDIDO_127,
  {
    numero: 120,
    data: "12/11/2026",
    cliente: CLIENTES.verOPeso,
    forma: "Pix",
    condicao: null,
    item: { lote: LOTE_120.codigo, produto: LOTE_120.produto, quantidadeKg: 200, precoKg: 13, custoKg: LOTE_120.custoKg },
    cancelado: false,
    motivoCancelamento: null,
    entrega: null,
    entregaPrevista: null,
    entregueEm: null,
    recebidoPor: null,
  },
];

export const pedido = (numero: number) => PEDIDOS.find((p) => p.numero === numero)!;

/** Parcelas do pedido 131 (prazos 14/28 a partir de 22/11), em aberto. */
export const PARCELAS_131 = [
  { vencimento: "06/12/2026", valor: 350 },
  { vencimento: "20/12/2026", valor: 350 },
] as const;

/** Condições da Cartões Rurais S.A. (as mesmas taxas da ajuda de Repasses de cartão). */
export const OPERADORA = {
  nome: "Cartões Rurais S.A.",
  condicoes: [
    { modalidade: "DEBITO", parcelasDe: 1, parcelasAte: 1, taxaPercentual: 1.5, prazoDias: 1, antecipado: false },
    { modalidade: "CREDITO_VISTA", parcelasDe: 1, parcelasAte: 1, taxaPercentual: 3, prazoDias: 30, antecipado: false },
    {
      modalidade: "CREDITO_PARCELADO",
      parcelasDe: 2,
      parcelasAte: 6,
      taxaPercentual: 4,
      prazoDias: 30,
      antecipado: false,
    },
  ] satisfies CondicaoCartao[],
} as const;

/** A venda simulada na maquininha: 30 kg do AMC-261120-01 a R$ 15,00/kg, crédito em 2x. Não é salva. */
export const MAQUININHA = {
  data: HOJE,
  cliente: CLIENTES.diversos,
  lote: "AMC-261120-01",
  quantidadeKg: 30,
  precoKg: 15,
  parcelas: 2,
} as const;

/** Números citados nos roteiros, como a tela formata (o teste confere com as funções do sistema). */
export const CITADOS = {
  valor128: 2400,
  custo128: 901.88,
  margem128: 1498.12,
  valor131: 700,
  totalConfirmados: 5700,
  custoConfirmados: 2352.4,
  repasse: { bruto: 225, taxa: 9, liquido: 216, datas: ["22/12/2026", "21/01/2027"] },
  totalMaquininha: 450,
} as const;
