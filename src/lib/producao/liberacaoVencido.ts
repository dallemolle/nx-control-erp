/** Liberação de lote vencido no próprio lote (D-35). */

const UM_DIA_MS = 86_400_000;

export const MSG_SEM_PRAZO_LIBERACAO = "Configure os dias de liberação após vencimento no cadastro do produto";

/** Último dia em que o lote pode ser movimentado: validade + dias do produto. */
export function liberadoAteDoLote(validade: Date, dias: number): Date {
  return new Date(validade.getTime() + dias * UM_DIA_MS);
}

/** A liberação vale para a data da operação (último dia inclusive)? */
export function liberacaoCobre(liberadoAte: Date | null, data: Date): boolean {
  return liberadoAte !== null && data.getTime() <= liberadoAte.getTime();
}

export type SituacaoLiberacao =
  | { tipo: "PODE"; liberadoAte: Date; dias: number }
  | { tipo: "SEM_PRAZO" }
  | { tipo: "PRAZO_ENCERRADO"; limite: Date };

/** O que acontece se o lote for liberado hoje. */
export function situacaoLiberacao(validade: Date, dias: number | null, hoje: Date): SituacaoLiberacao {
  if (dias == null) return { tipo: "SEM_PRAZO" };
  const limite = liberadoAteDoLote(validade, dias);
  if (limite.getTime() < hoje.getTime()) return { tipo: "PRAZO_ENCERRADO", limite };
  return { tipo: "PODE", liberadoAte: limite, dias };
}
