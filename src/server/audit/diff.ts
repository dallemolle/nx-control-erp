export type AuditDiff = {
  valorAnterior: Record<string, unknown> | null;
  valorNovo: Record<string, unknown> | null;
};

/**
 * Normaliza valores não-primitivos antes da comparação de diff: `Date` vira
 * ISO string, e qualquer objeto com `toString()` próprio (ex: `Decimal` do
 * Prisma) vira sua representação em texto. Sem isso, `!==` compara por
 * referência e duas instâncias equivalentes (mesma data, mesmo valor
 * monetário) sempre aparecem como "alteradas" no log de auditoria.
 */
function normalizarValor(valor: unknown): unknown {
  if (valor instanceof Date) {
    return valor.toISOString();
  }

  // Array tem toString próprio, mas deve ser gravado como lista (JSON), não como texto.
  if (Array.isArray(valor)) {
    return valor;
  }

  if (
    valor !== null &&
    typeof valor === "object" &&
    typeof (valor as { toString?: unknown }).toString === "function" &&
    (valor as { toString: () => string }).toString !== Object.prototype.toString
  ) {
    return (valor as { toString: () => string }).toString();
  }

  return valor;
}

function iguais(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

export function buildAuditDiff(
  anterior: Record<string, unknown> | null,
  novo: Record<string, unknown> | null,
): AuditDiff {
  if (anterior === null || novo === null) {
    return { valorAnterior: anterior, valorNovo: novo };
  }

  const chaves = new Set([...Object.keys(anterior), ...Object.keys(novo)]);
  const valorAnterior: Record<string, unknown> = {};
  const valorNovo: Record<string, unknown> = {};

  for (const chave of chaves) {
    const valorAnteriorNormalizado = normalizarValor(anterior[chave]);
    const valorNovoNormalizado = normalizarValor(novo[chave]);

    if (!iguais(valorAnteriorNormalizado, valorNovoNormalizado)) {
      valorAnterior[chave] = valorAnteriorNormalizado;
      valorNovo[chave] = valorNovoNormalizado;
    }
  }

  return { valorAnterior, valorNovo };
}
