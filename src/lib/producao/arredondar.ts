/** Arredonda para `casas` decimais (meio para cima), corrigindo o erro de ponto flutuante. */
export function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * fator) / fator;
}
