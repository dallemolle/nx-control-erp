/**
 * O exemplo do Fiscal × gerencial: o ano de 2026 da mesma fazenda das outras ajudas. Novembro bate com o Orçamento
 * (R$ 23.500,00 de vendas, R$ 18.000,00 delas com nota; adubo, tarifa e o recibo do José da Silva). Fictício e fixo.
 * O percentual usa a mesma conta de `percentualGerencial` (src/server/services/relatorioFiscalGerencial.ts); o teste
 * da ajuda confere.
 */
export const ANO = 2026;

export const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export type Movimento = {
  entradasFiscal: number;
  entradasGerencial: number;
  saidasFiscal: number;
  saidasGerencial: number;
};

export type LinhaMes = Movimento & { mes: number };

const MOVIMENTO: readonly [number, number, number, number][] = [
  [12000, 3000, 9500, 1200],
  [9000, 2500, 8200, 900],
  [15000, 4000, 11000, 1500],
  [21000, 6000, 9800, 2000],
  [24000, 7000, 10500, 2200],
  [18000, 5000, 9000, 1800],
  [14000, 4500, 12500, 1600],
  [10000, 3000, 14800, 2400],
  [11000, 3500, 13200, 2100],
  [16000, 4800, 7600, 1100],
  [18000, 5500, 845.9, 300],
  [0, 0, 0, 0],
];

export const COMPARATIVO: readonly LinhaMes[] = MOVIMENTO.map(
  ([entradasFiscal, entradasGerencial, saidasFiscal, saidasGerencial], indice) => ({
    mes: indice + 1,
    entradasFiscal,
    entradasGerencial,
    saidasFiscal,
    saidasGerencial,
  }),
);

/** A linha Total da tabela: a soma dos 12 meses. */
export const TOTAIS: Movimento = COMPARATIVO.reduce(
  (soma, l) => ({
    entradasFiscal: soma.entradasFiscal + l.entradasFiscal,
    entradasGerencial: soma.entradasGerencial + l.entradasGerencial,
    saidasFiscal: soma.saidasFiscal + l.saidasFiscal,
    saidasGerencial: soma.saidasGerencial + l.saidasGerencial,
  }),
  { entradasFiscal: 0, entradasGerencial: 0, saidasFiscal: 0, saidasGerencial: 0 },
);

/** Percentual (0–100) da parte gerencial no total; `null` quando não há movimento. */
export function percentualGerencial(fiscal: number, gerencial: number): number | null {
  const total = fiscal + gerencial;
  return total === 0 ? null : (gerencial / total) * 100;
}

/** Saldo das parcelas em aberto hoje, por tipo e classificação. */
export const EM_ABERTO = [
  { rotulo: "A receber — fiscal", valor: 4000 },
  { rotulo: "A receber — gerencial", valor: 1500 },
  { rotulo: "A pagar — fiscal", valor: 1580 },
  { rotulo: "A pagar — gerencial", valor: 0 },
] as const;

export const PARCEIROS_SEM_NOTA = [
  { nome: "Açaí da Vila", tipo: "Cliente", titulos: 8, valor: 26400 },
  { nome: "José da Silva", tipo: "Fornecedor", titulos: 4, valor: 1200 },
] as const;

export type Pendencia = "Sem tipo de documento" | "Sem número da nota" | "Sem chave de acesso" | "Sem anexo";

export const FILTROS_PENDENCIA: readonly Pendencia[] = [
  "Sem tipo de documento",
  "Sem número da nota",
  "Sem chave de acesso",
  "Sem anexo",
];

export const PENDENCIAS: readonly {
  chave: string;
  documento: string;
  parceiro: string;
  tipo: "A pagar" | "A receber";
  emissao: string;
  valor: number;
  pendencias: readonly Pendencia[];
}[] = [
  {
    chave: "nfe-2210",
    documento: "NF-e 2210",
    parceiro: "Agro Insumos Ltda",
    tipo: "A pagar",
    emissao: "03/11/2026",
    valor: 1800,
    pendencias: ["Sem chave de acesso", "Sem anexo"],
  },
  {
    chave: "fatura-612",
    documento: "Fatura 612",
    parceiro: "Energia Rural S.A.",
    tipo: "A pagar",
    emissao: "01/11/2026",
    valor: 580,
    pendencias: ["Sem tipo de documento", "Sem anexo"],
  },
  {
    chave: "nota-77",
    documento: "Nota do produtor 77",
    parceiro: "Cooperativa Vale Verde",
    tipo: "A receber",
    emissao: "28/10/2026",
    valor: 4000,
    pendencias: ["Sem número da nota", "Sem anexo"],
  },
];
