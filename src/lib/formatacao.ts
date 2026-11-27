const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Formata uma fração como percentual brasileiro, com uma casa: 0.175 → "17,5%". */
export function formatarPercentual(fracao: number): string {
  return PERCENTUAL.format(fracao);
}

/**
 * Formata um valor em reais ("R$ 1.234,56"). Aceita `number`, `string` e o
 * `Decimal` do Prisma (qualquer coisa com `toString()` numérico).
 */
export function formatarMoeda(valor: number | string | { toString(): string }): string {
  return MOEDA.format(Number(typeof valor === "number" ? valor : valor.toString()));
}

/**
 * Formata uma data de calendário (vencimento, emissão, data de lançamento/
 * extrato) como "dd/mm/aaaa". Essas datas são gravadas à meia-noite UTC, por
 * isso a formatação é em UTC — no fuso local (UTC-3) elas apareceriam um dia
 * antes. Não usar para instantes (criadoEm, último uso etc.).
 */
export function formatarData(data: Date | string): string {
  return DATA.format(new Date(data));
}

const DATA_BRASILIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const HORA_BRASILIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});

/** Formata um instante (criadoEm, avaliadoEm) como "dd/mm/aaaa hh:mm" no horário de Brasília. */
export function formatarDataHora(instante: Date): string {
  return `${DATA_BRASILIA.format(instante)} ${HORA_BRASILIA.format(instante)}`;
}
