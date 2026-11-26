/**
 * Os números do fluxo de caixa do exemplo (filial com Banco do Brasil e Caixa, ano de 2026). Fictícios e fixos.
 * Valores em reais inteiros; a cena calcula saldos e formata.
 */
export type Movimento = { periodo: string; entradas: number; saidas: number; transferencias?: number };

export const SALDO_INICIAL_DO_ANO = 40_000;

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const ENTRADAS = [18_000, 12_500, 9_800, 22_400, 31_000, 27_300, 15_200, 11_900, 14_600, 26_800, 17_400, 0];
const SAIDAS = [21_300, 14_200, 16_900, 18_700, 19_500, 22_100, 17_800, 13_400, 15_200, 20_300, 18_638, 0];

export const POR_MES: readonly Movimento[] = MESES.map((mes, i) => ({
  periodo: `${mes} de 2026`,
  entradas: ENTRADAS[i],
  saidas: SAIDAS[i],
}));

/** Só o que é Fiscal: tira o gerencial. */
const FATOR_FISCAL = [0.8, 0.85, 0.75, 0.9, 0.9, 0.85, 0.8, 0.75, 0.8, 0.9, 0.7, 0];
export const POR_MES_FISCAL: readonly Movimento[] = POR_MES.map((m, i) => ({
  periodo: m.periodo,
  entradas: Math.round(m.entradas * FATOR_FISCAL[i]),
  saidas: Math.round(m.saidas * FATOR_FISCAL[i]),
}));

/**
 * Novembro de 2026 por semana, batendo com o mês: a semana de 26/10 só tem movimento de outubro, e as de
 * novembro somam as entradas e saídas de novembro (sem o saque de R$ 2.000 do banco para o Caixa, que é
 * transferência e fica fora das duas colunas).
 */
export const SALDO_ANTES_DAS_SEMANAS = 49_250;
export const POR_SEMANA: readonly Movimento[] = [
  { periodo: "Semana de 26/10/2026 a 01/11/2026", entradas: 4_100, saidas: 3_250 },
  { periodo: "Semana de 02/11/2026 a 08/11/2026", entradas: 7_300, saidas: 8_100 },
  { periodo: "Semana de 09/11/2026 a 15/11/2026", entradas: 3_900, saidas: 4_800 },
  { periodo: "Semana de 16/11/2026 a 22/11/2026", entradas: 6_200, saidas: 5_738 },
  { periodo: "Semana de 23/11/2026 a 29/11/2026", entradas: 0, saidas: 0 },
  { periodo: "Semana de 30/11/2026 a 06/12/2026", entradas: 0, saidas: 0 },
];
