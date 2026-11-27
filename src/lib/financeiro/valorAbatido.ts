/** Valores de uma baixa que definem quanto ela quita da parcela. */
export type ValoresDaBaixa = { valorPago: number; valorJuros: number; valorMulta: number; valorDesconto: number };

export const MSG_BAIXA_SEM_ABATIMENTO = "Juros e multa não podem ser maiores que o valor pago mais o desconto";

const centavos = (valor: number) => Math.round(valor * 100);

/**
 * Quanto a baixa quita da parcela: o valor pago (total que saiu ou entrou na conta,
 * já com juros e multa) menos juros e multa, mais o desconto.
 */
export function valorAbatidoDaBaixa(b: ValoresDaBaixa): number {
  return (centavos(b.valorPago) - centavos(b.valorJuros) - centavos(b.valorMulta) + centavos(b.valorDesconto)) / 100;
}

export function totalAbatido(baixas: readonly ValoresDaBaixa[]): number {
  return baixas.reduce((soma, b) => soma + centavos(valorAbatidoDaBaixa(b)), 0) / 100;
}
