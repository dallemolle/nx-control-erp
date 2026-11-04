const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

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
