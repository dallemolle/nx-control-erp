/** Nomes dos meses, índice 0 = janeiro. */
export const NOMES_DOS_MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

/** Abreviações de três letras, índice 0 = janeiro. */
export const MESES_ABREVIADOS = NOMES_DOS_MESES.map((nome) => nome.slice(0, 3));
