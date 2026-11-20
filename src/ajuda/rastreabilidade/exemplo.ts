import type { MotivoAjusteEstoque, TipoMovimentoEstoque } from "@prisma/client";

/**
 * O exemplo da Rastreabilidade: a mesma história, em 22/11/2026. O açaí do José da Silva (FA-261120-01) e o do
 * Talhão 3 (FA-261120-02) viraram polpa na OP-261120-01; a polpa grossa foi vendida à Açaí da Vila (pedido 128, que
 * substituiu o 127, cancelado) e parte da polpa média, transferida para a loja, à Sorveteria Polar (pedido 131).
 * Fictício e fixo. O destino de cada lote sai de `destinoDoLote` sobre os movimentos daqui; o teste confere.
 */

export type Movimento = { tipo: TipoMovimentoEstoque; quantidadeKg: number; motivo: MotivoAjusteEstoque | null };

export type OpResumo = {
  numero: string;
  status: "Aberta" | "Encerrada" | "Cancelada";
  data: string;
  responsavel: string;
  branqueamento: string;
  rendimentoBalanco: string;
};

export const OP: OpResumo = {
  numero: "OP-261120-01",
  status: "Encerrada",
  data: "20/11/2026",
  responsavel: "Maria",
  branqueamento: "85 °C · 10 s",
  rendimentoBalanco: "92,8% · 8 kg",
};

export type Cliente = {
  pedido: number;
  data: string;
  loteVendido: string;
  /** Polpa: a OP de onde veio (aparece embaixo do lote). */
  op: string | null;
  cliente: string;
  documento: string;
  contato: string;
  endereco: string;
  kg: number;
  entrega: string;
  entregaDetalhe: string | null;
  cancelado?: boolean;
};

const ACAI_DA_VILA = {
  cliente: "Açaí da Vila",
  documento: "12.345.678/0001-90",
  contato: "Carla · (91) 98888-1234",
  endereco: "Rua das Palmeiras, 45 · Belém",
} as const;

export const VENDA_AGC: Cliente = {
  pedido: 128,
  data: "21/11/2026",
  loteVendido: "AGC-261120-01",
  op: OP.numero,
  ...ACAI_DA_VILA,
  kg: 120,
  entrega: "Entregue",
  entregaDetalhe: "21/11/2026 · Ana",
};

export const VENDA_CANCELADA: Cliente = {
  ...VENDA_AGC,
  pedido: 127,
  entrega: "Cancelada",
  entregaDetalhe: null,
  cancelado: true,
};

export const VENDA_AMC: Cliente = {
  pedido: 131,
  data: "22/11/2026",
  loteVendido: "AMC-261120-01/1",
  op: OP.numero,
  cliente: "Sorveteria Polar",
  documento: "98.765.432/0001-10",
  contato: "Rui · (91) 97777-4321",
  endereco: "Av. Nazaré, 900 · Belém",
  kg: 50,
  entrega: "Em rota",
  entregaDetalhe: null,
};

export type LoteDaFamilia = { codigo: string; local: string; validade: string; saldoKg: number };

export type Rastreio = {
  codigo: string;
  categoria: "Fruto" | "Polpa";
  produto: string;
  status: "OK" | "Vencendo" | "Vencido" | "Zerado";
  data: string;
  validade: string;
  local: string;
  inicialKg: number;
  saldoKg: number;
  familia: readonly LoteDaFamilia[];
  /** Fruto: a recepção. */
  recepcao: {
    data: string;
    origem: string;
    qualidade: string;
    brutoKg: number;
    descarteKg: number;
    documento: string;
  } | null;
  /** Polpa: a OP e os frutos consumidos. */
  opOrigem: OpResumo | null;
  frutos: readonly { codigo: string; produto: string; kg: number; recepcao: string; origem: string; qualidade: string }[];
  /** Fruto: as OPs que o usaram e as polpas geradas. */
  paraFrente: readonly {
    op: OpResumo;
    kgDesteLote: number;
    polpas: readonly { codigo: string; produto: string; kg: number; saldoKg: number }[];
  }[];
  movimentos: readonly Movimento[];
  /** Com pedidos cancelados; a tela só os mostra com "Mostrar cancelados". */
  clientes: readonly Cliente[];
};

const POLPAS_DA_OP = [
  { codigo: "AGC-261120-01", produto: "Polpa de açaí grosso/especial – congelada", kg: 300, saldoKg: 179 },
  { codigo: "AMC-261120-01", produto: "Polpa de açaí médio/regular – congelada", kg: 700, saldoKg: 500 },
] as const;

export const FRUTO: Rastreio = {
  codigo: "FA-261120-01",
  categoria: "Fruto",
  produto: "Fruto de açaí",
  status: "Zerado",
  data: "20/11/2026",
  validade: "21/11/2026",
  local: "Galpão de recepção",
  inicialKg: 672,
  saldoKg: 0,
  familia: [],
  recepcao: {
    data: "20/11/2026",
    origem: "Terceiro · José da Silva",
    qualidade: "A",
    brutoKg: 700,
    descarteKg: 28,
    documento: "Romaneio 152",
  },
  opOrigem: null,
  frutos: [],
  paraFrente: [{ op: OP, kgDesteLote: 672, polpas: POLPAS_DA_OP }],
  movimentos: [
    { tipo: "ENTRADA", quantidadeKg: 672, motivo: null },
    { tipo: "CONSUMO_OP", quantidadeKg: -672, motivo: null },
  ],
  clientes: [VENDA_AMC, VENDA_AGC, VENDA_CANCELADA],
};

export const POLPA: Rastreio = {
  codigo: "AGC-261120-01",
  categoria: "Polpa",
  produto: "Polpa de açaí grosso/especial – congelada",
  status: "OK",
  data: "20/11/2026",
  validade: "20/11/2027",
  local: "Câmara fria",
  inicialKg: 300,
  saldoKg: 179,
  familia: [],
  recepcao: null,
  opOrigem: OP,
  frutos: [
    {
      codigo: "FA-261120-01",
      produto: "Fruto de açaí",
      kg: 672,
      recepcao: "20/11/2026",
      origem: "Terceiro · José da Silva",
      qualidade: "A",
    },
    {
      codigo: "FA-261120-02",
      produto: "Fruto de açaí",
      kg: 406,
      recepcao: "20/11/2026",
      origem: "Própria · Talhão 3 – Várzea",
      qualidade: "—",
    },
  ],
  paraFrente: [],
  movimentos: [
    { tipo: "PRODUCAO_OP", quantidadeKg: 300, motivo: null },
    { tipo: "AJUSTE", quantidadeKg: -1, motivo: "AMOSTRA" },
    { tipo: "VENDA", quantidadeKg: -120, motivo: null },
  ],
  clientes: [VENDA_AGC, VENDA_CANCELADA],
};

export const FILHO: Rastreio = {
  codigo: "AMC-261120-01/1",
  categoria: "Polpa",
  produto: "Polpa de açaí médio/regular – congelada",
  status: "OK",
  data: "20/11/2026",
  validade: "20/11/2027",
  local: "Câmara da loja",
  inicialKg: 200,
  saldoKg: 150,
  familia: [
    { codigo: "AMC-261120-01", local: "Câmara fria", validade: "20/11/2027", saldoKg: 500 },
    { codigo: "AMC-261120-01/1", local: "Câmara da loja", validade: "20/11/2027", saldoKg: 150 },
  ],
  recepcao: null,
  opOrigem: OP,
  frutos: POLPA.frutos,
  paraFrente: [],
  // A família soma os movimentos do original e do filho: a transferência se anula.
  movimentos: [
    { tipo: "PRODUCAO_OP", quantidadeKg: 700, motivo: null },
    { tipo: "TRANSFERENCIA_SAIDA", quantidadeKg: -200, motivo: null },
    { tipo: "TRANSFERENCIA_ENTRADA", quantidadeKg: 200, motivo: null },
    { tipo: "VENDA", quantidadeKg: -50, motivo: null },
  ],
  clientes: [VENDA_AMC],
};

export const RASTREIOS: readonly Rastreio[] = [FRUTO, POLPA, FILHO];

/** Lotes da filial para a busca por parte do código (mais recentes primeiro, como a tela). */
export const LOTES_DA_FILIAL = [
  { codigo: "FA-261120-02", produto: "Fruto de açaí", data: "20/11/2026", saldoKg: 0 },
  { codigo: "FA-261120-01", produto: "Fruto de açaí", data: "20/11/2026", saldoKg: 0 },
  { codigo: "AMC-261120-01/1", produto: "Polpa de açaí médio/regular – congelada", data: "20/11/2026", saldoKg: 150 },
  { codigo: "AMC-261120-01", produto: "Polpa de açaí médio/regular – congelada", data: "20/11/2026", saldoKg: 500 },
  { codigo: "AGC-261120-01", produto: "Polpa de açaí grosso/especial – congelada", data: "20/11/2026", saldoKg: 179 },
  { codigo: "FA-261118-01", produto: "Fruto de açaí", data: "18/11/2026", saldoKg: 0 },
  { codigo: "FA-261117-01", produto: "Fruto de açaí", data: "17/11/2026", saldoKg: 0 },
] as const;

export const BUSCA_PARCIAL = "FA-2611";
