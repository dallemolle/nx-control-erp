import type { Conservacao } from "@prisma/client";

/**
 * O exemplo do Estoque: a filial em 20/11/2026, depois da OP-261120-01 (as polpas AGC e AMC na Câmara fria; os lotes
 * de fruto da Recepção foram consumidos e estão zerados). A OP-261118-01 deu 420 kg de AMC e 80 kg de AMR (resfriado,
 * vence hoje); a OP-261119-01, 190 kg de polpa de acerola. Fictício e fixo. A réplica calcula dias e status com as
 * funções do sistema (`diasParaVencer`, `statusDoLote`); o teste confere os totais, a ocupação e os códigos.
 */

export const HOJE = "20/11/2026";
export const HOJE_ISO = "2026-11-20";
/** Data de referência usada no roteiro de filtros. */
export const OUTRO_DIA = "22/11/2026";
export const OUTRO_DIA_ISO = "2026-11-22";

export const ALERTAS = { alertaVencimentoCongeladoDias: 30, alertaVencimentoResfriadoDias: 1 } as const;

export type LoteExemplo = {
  codigo: string;
  produto: string;
  conservacao: Conservacao;
  local: string;
  data: string;
  /** Validade em AAAA-MM-DD. */
  validade: string;
  saldoKg: number;
  custoKg: number;
};

/** Lotes com saldo, em ordem de validade (e código), como a tela lista. */
export const LOTES: readonly LoteExemplo[] = [
  {
    codigo: "FC-261117-01",
    produto: "Fruto de acerola",
    conservacao: "IN_NATURA",
    local: "Galpão de recepção",
    data: "17/11/2026",
    validade: "2026-11-19",
    saldoKg: 40,
    custoKg: 3.5,
  },
  {
    codigo: "AMR-261118-01",
    produto: "Açaí médio/regular – resfriado",
    conservacao: "RESFRIADO",
    local: "Câmara de resfriados",
    data: "18/11/2026",
    validade: "2026-11-20",
    saldoKg: 80,
    custoKg: 6,
  },
  {
    codigo: "AMC-261118-01",
    produto: "Polpa de açaí médio/regular – congelada",
    conservacao: "CONGELADO",
    local: "Câmara fria",
    data: "18/11/2026",
    validade: "2027-11-18",
    saldoKg: 420,
    custoKg: 6.1,
  },
  {
    codigo: "ACC-261119-01",
    produto: "Polpa de acerola – congelada",
    conservacao: "CONGELADO",
    local: "Câmara fria",
    data: "19/11/2026",
    validade: "2027-11-19",
    saldoKg: 190,
    custoKg: 5.2,
  },
  {
    codigo: "AGC-261120-01",
    produto: "Polpa de açaí grosso/especial – congelada",
    conservacao: "CONGELADO",
    local: "Câmara fria",
    data: "20/11/2026",
    validade: "2027-11-20",
    saldoKg: 300,
    custoKg: 7.5157,
  },
  {
    codigo: "AMC-261120-01",
    produto: "Polpa de açaí médio/regular – congelada",
    conservacao: "CONGELADO",
    local: "Câmara fria",
    data: "20/11/2026",
    validade: "2027-11-20",
    saldoKg: 700,
    custoKg: 5.0104,
  },
];

/** Lotes zerados (aparecem com "Mostrar zerados"): o fruto da Recepção, consumido na OP. */
export const ZERADOS: readonly LoteExemplo[] = [
  {
    codigo: "FA-261120-01",
    produto: "Fruto de açaí",
    conservacao: "IN_NATURA",
    local: "Galpão de recepção",
    data: "20/11/2026",
    validade: "2026-11-21",
    saldoKg: 0,
    custoKg: 5,
  },
  {
    codigo: "FA-261120-02",
    produto: "Fruto de açaí",
    conservacao: "IN_NATURA",
    local: "Galpão de recepção",
    data: "20/11/2026",
    validade: "2026-11-21",
    saldoKg: 0,
    custoKg: 4,
  },
];

/** Locais ativos da filial, em ordem alfabética, com a capacidade cadastrada. */
export const LOCAIS = [
  { nome: "Câmara da loja", capacidadeKg: 1000 },
  { nome: "Câmara de resfriados", capacidadeKg: 500 },
  { nome: "Câmara fria", capacidadeKg: 5000 },
  { nome: "Galpão de recepção", capacidadeKg: null },
] as const;

/** Transferência do roteiro: parte do AMC-261120-01 para a Câmara da loja. */
export const TRANSFERENCIA = {
  lote: "AMC-261120-01",
  destino: "Câmara da loja",
  kg: 200,
  filho: "AMC-261120-01/1",
} as const;

/** Liberação do roteiro: o fruto de acerola vencido, com 2 dias de liberação no cadastro do produto. */
export const LIBERACAO = {
  lote: "FC-261117-01",
  dias: 2,
  liberadoAte: "21/11/2026",
  motivo: "Fruto conferido, ainda bom para polpa",
  limiteEncerrado: "13/11/2026",
} as const;

/** Números citados nos roteiros (o teste confere com a réplica). */
export const CITADOS = {
  okLotes: 4,
  okKg: "1.610,000",
  totalKg: "1.730,000",
  totalValor: 9931.99,
  ocupacaoCamaraFria: "32,2%",
} as const;
