/**
 * O exemplo dos Ajustes de estoque: a mesma filial do Estoque, em 20/11/2026. A Maria (perfil Produção) tira uma
 * amostra da polpa grossa para o laboratório e acerta a contagem da Câmara fria; a lista traz também o histórico de
 * novembro. Fictício e fixo.
 */

export const HOJE = "20/11/2026";
export const USUARIO = "Maria";

/** Lote que aparece no seletor do formulário (ordem de validade, como a tela). */
export type LoteOpcao = { codigo: string; saldoKg: number; validade: string };

export const LOTES_OPCOES: readonly LoteOpcao[] = [
  { codigo: "FA-261120-01", saldoKg: 0, validade: "21/11/2026" },
  { codigo: "FA-261120-02", saldoKg: 0, validade: "21/11/2026" },
  { codigo: "FC-261117-01", saldoKg: 40, validade: "19/11/2026" },
  { codigo: "AMR-261118-01", saldoKg: 80, validade: "20/11/2026" },
  { codigo: "AMC-261118-01", saldoKg: 420, validade: "18/11/2027" },
  { codigo: "ACC-261119-01", saldoKg: 190, validade: "19/11/2027" },
  { codigo: "AGC-261120-01", saldoKg: 300, validade: "20/11/2027" },
  { codigo: "AMC-261120-01", saldoKg: 700, validade: "20/11/2027" },
].sort((a, b) => {
  const iso = (d: string) => d.split("/").reverse().join("-");
  return iso(a.validade).localeCompare(iso(b.validade)) || a.codigo.localeCompare(b.codigo);
});

export const KG_SALDO = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

export const rotuloLote = (l: LoteOpcao) => `${l.codigo} · ${KG_SALDO.format(l.saldoKg)} kg · vence ${l.validade}`;

export const AMOSTRA = {
  lote: "AGC-261120-01",
  produto: "Polpa de açaí grosso/especial – congelada",
  kg: 1,
  motivo: "Amostra (ADEPARA/laboratório)",
  observacao: "Análise microbiológica",
} as const;

/** A amostra saiu do lote errado: era do AGC-261118-01. A Maria estorna e lança de novo. */
export const ESTORNO = { motivo: "Amostra saiu do lote errado" } as const;

export const SOBRA = {
  lote: "AMC-261118-01",
  produto: "Polpa de açaí médio/regular – congelada",
  kg: 2,
  motivo: "Inventário",
  observacao: "Contagem da Câmara fria",
} as const;

export type LinhaAjuste = {
  data: string;
  lote: string;
  produto: string;
  /** Negativo = saída. */
  kg: number;
  motivo: string;
  observacao: string | null;
  usuario: string;
  /** "data por quem: motivo", quando o ajuste foi estornado. */
  estorno?: string;
};

/** Ajustes de novembro já lançados antes de hoje (a lista vem da data mais recente para a mais antiga). */
export const HISTORICO: readonly LinhaAjuste[] = [
  {
    data: "19/11/2026",
    lote: "FA-261117-01",
    produto: "Fruto de açaí",
    kg: -35,
    motivo: "Vencido",
    observacao: "Sobra do dia 17 que não foi processada",
    usuario: "João",
  },
  {
    data: "12/11/2026",
    lote: "AMC-261105-01",
    produto: "Polpa de açaí médio/regular – congelada",
    kg: -3,
    motivo: "Avaria/quebra",
    observacao: "Caixa rasgada na descarga",
    usuario: "João",
  },
  {
    data: "10/11/2026",
    lote: "AGC-261103-01",
    produto: "Polpa de açaí grosso/especial – congelada",
    kg: -2,
    motivo: "Consumo interno",
    observacao: "Degustação na loja",
    usuario: USUARIO,
  },
];

export const MOTIVOS = [
  "Vencido",
  "Avaria/quebra",
  "Amostra (ADEPARA/laboratório)",
  "Inventário",
  "Consumo interno",
  "Outro",
] as const;
