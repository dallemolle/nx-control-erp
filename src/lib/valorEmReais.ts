/**
 * Lê um valor em reais digitado do jeito brasileiro (item 17 do backlog). Ponto seguido de grupos de 3 dígitos é
 * milhar ("1.500" = 1500); a vírgula é o decimal ("1.500,50"). Sem vírgula, um ponto que não separa milhar é
 * decimal ("1.5", "1500.75"), para quem digita no formato do sistema. Aceita "R$" e espaços. Vazio vale 0;
 * qualquer outra coisa que não seja um número claro devolve `null`.
 */
export function lerValorEmReais(texto: string): number | null {
  if (texto.trim() === "") return 0;
  const limpo = texto.replace(/R\$/gi, "").replace(/[\s ]/g, "");

  if (limpo.includes(",")) {
    if (!/^-?(\d{1,3}(\.\d{3})+|\d+),\d+$/.test(limpo)) return null;
    return Number(limpo.replace(/\./g, "").replace(",", "."));
  }
  if (/^-?\d{1,3}(\.\d{3})+$/.test(limpo)) return Number(limpo.replace(/\./g, ""));
  if (/^-?\d+(\.\d+)?$/.test(limpo)) return Number(limpo);
  return null;
}

const CAMPO = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** O valor como ele aparece no campo ao abrir ("1.500,00"), sem "R$". */
export function valorParaCampo(valor: number): string {
  return CAMPO.format(valor);
}
