/**
 * Baixa rejeitada que ainda pede ação (spec 2026-11-25-rejeicao-visivel): ninguém dispensou, nenhuma baixa
 * foi registrada na parcela depois da rejeição e a parcela continua em aberto. Calculada na hora, nunca
 * gravada: assim cancelar, renegociar, quitar ou relançar resolvem a rejeição sem código a mais.
 */
export type BaixaParaRejeicao = {
  id: string;
  statusAprovacao: string;
  criadoEm: Date;
  avaliadoEm: Date | null;
  dispensadaEm: Date | null;
};

const PARCELA_FECHADA = new Set(["PAGO", "CANCELADO", "RENEGOCIADO"]);

export function rejeicaoEmAberto(
  baixa: BaixaParaRejeicao,
  baixasDaParcela: readonly Pick<BaixaParaRejeicao, "id" | "criadoEm">[],
  statusParcela: string,
): boolean {
  if (baixa.statusAprovacao !== "REJEITADO" || baixa.dispensadaEm !== null) return false;
  if (PARCELA_FECHADA.has(statusParcela)) return false;
  // Rejeição gravada antes de `avaliadoEm` existir: o registro da própria baixa é o limite.
  const rejeitadaEm = (baixa.avaliadoEm ?? baixa.criadoEm).getTime();
  return !baixasDaParcela.some((outra) => outra.id !== baixa.id && outra.criadoEm.getTime() > rejeitadaEm);
}

export function parcelaTemRejeicaoEmAberto(parcela: { status: string; baixas: readonly BaixaParaRejeicao[] }): boolean {
  return parcela.baixas.some((baixa) => rejeicaoEmAberto(baixa, parcela.baixas, parcela.status));
}
