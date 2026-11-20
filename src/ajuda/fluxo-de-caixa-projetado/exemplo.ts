/**
 * Os números da projeção do exemplo. Fictícios e fixos, com "hoje" em 20/11/2026. As três visões (móvel,
 * janela futura e ano civil) são o mesmo conjunto de parcelas cortado de jeitos diferentes, então os saldos
 * batem entre elas. Valores em reais inteiros; a cena encadeia os saldos.
 */
export type Linha = { rotulo: string; entradas: number; saidas: number; tipo?: "atraso" | "aVencer" };

/** Saldo em caixa conciliado de hoje (o mesmo do fim de novembro no exemplo do Fluxo de caixa). */
export const SALDO_DE_HOJE = 47_850;

const mes = (rotulo: string, entradas: number, saidas: number): Linha => ({ rotulo, entradas, saidas });

/** Móvel, a partir de novembro de 2026 (a tela abre assim). */
export const MOVEL: readonly Linha[] = [
  { rotulo: "Em atraso (venc. até 31/10/2026)", entradas: 3_200, saidas: 1_850, tipo: "atraso" },
  mes("novembro de 2026", 9_850, 12_400),
  mes("dezembro de 2026", 22_500, 18_300),
  mes("janeiro de 2027", 6_000, 14_800),
  mes("fevereiro de 2027", 4_500, 52_000),
  mes("março de 2027", 18_000, 9_500),
  mes("abril de 2027", 31_000, 8_200),
  mes("maio de 2027", 12_000, 6_100),
  mes("junho de 2027", 0, 4_300),
  mes("julho de 2027", 0, 2_100),
  mes("agosto de 2027", 0, 0),
  mes("setembro de 2027", 0, 0),
  mes("outubro de 2027", 0, 0),
];

/**
 * Depois de um clique em Próximo: a janela começa em dezembro, depois de hoje. O que venceu até ontem vai para
 * "Em atraso" e o que vence de hoje até 30/11 vai para "A vencer até". As duas linhas somam o atraso antigo e
 * novembro inteiro da visão móvel.
 */
export const FUTURA: readonly Linha[] = [
  { rotulo: "Em atraso (venc. até 19/11/2026)", entradas: 4_700, saidas: 11_450, tipo: "atraso" },
  { rotulo: "A vencer até 30/11/2026", entradas: 8_350, saidas: 2_800, tipo: "aVencer" },
  ...MOVEL.slice(2),
  mes("novembro de 2027", 0, 0),
];

/** Ano civil de 2026: os meses que já passaram mostram só o que deles continua em aberto. */
export const ANO_CIVIL: readonly Linha[] = [
  { rotulo: "Em atraso (venc. até 31/12/2025)", entradas: 0, saidas: 0, tipo: "atraso" },
  ...["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho"].map((m) => mes(`${m} de 2026`, 0, 0)),
  mes("agosto de 2026", 1_200, 0),
  mes("setembro de 2026", 2_000, 850),
  mes("outubro de 2026", 0, 1_000),
  MOVEL[1],
  MOVEL[2],
];

/** Visão Fiscal: só títulos fiscais, acumulado a partir de zero, sem alerta. */
export const MOVEL_FISCAL: readonly Linha[] = MOVEL.map((l) => ({
  ...l,
  entradas: Math.round(l.entradas * 0.8),
  saidas: Math.round(l.saidas * 0.9),
}));
