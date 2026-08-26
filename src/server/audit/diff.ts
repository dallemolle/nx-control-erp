export type AuditDiff = {
  valorAnterior: Record<string, unknown> | null;
  valorNovo: Record<string, unknown> | null;
};

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
    if (anterior[chave] !== novo[chave]) {
      valorAnterior[chave] = anterior[chave];
      valorNovo[chave] = novo[chave];
    }
  }

  return { valorAnterior, valorNovo };
}
