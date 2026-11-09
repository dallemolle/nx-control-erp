const UM_DIA_MS = 86_400_000;

/** Validade = data do lote + dias de validade do produto, em dia de calendário UTC (RN-07). */
export function calcularValidade(data: Date, validadeDias: number): Date {
  return new Date(data.getTime() + validadeDias * UM_DIA_MS);
}

/** `FA` + 09/11/2026 → `FA-261109` (RN-01). */
export function prefixoDoLote(codigoProduto: string, data: Date): string {
  const aammdd = data.toISOString().slice(2, 10).replaceAll("-", "");
  return `${codigoProduto}-${aammdd}`;
}

/** Próximo número do dia: maior sequência existente com o prefixo + 1, com 2 dígitos no mínimo. */
export function proximoCodigoDeLote(prefixo: string, codigosExistentes: string[]): string {
  const inicio = `${prefixo}-`;
  const maior = codigosExistentes.reduce((max, codigo) => {
    if (!codigo.startsWith(inicio)) return max;
    const sequencia = codigo.slice(inicio.length);
    return /^\d+$/.test(sequencia) ? Math.max(max, Number(sequencia)) : max;
  }, 0);
  return `${inicio}${String(maior + 1).padStart(2, "0")}`;
}
