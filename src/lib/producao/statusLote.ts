import type { Conservacao } from "@prisma/client";

export type StatusLote = "OK" | "VENCENDO" | "VENCIDO" | "ZERADO";

export const ROTULOS_STATUS_LOTE: Record<StatusLote, string> = {
  OK: "OK",
  VENCENDO: "Vencendo",
  VENCIDO: "Vencido",
  ZERADO: "Zerado",
};

export const STATUS_LOTE: StatusLote[] = ["OK", "VENCENDO", "VENCIDO", "ZERADO"];

const UM_DIA_MS = 86_400_000;

/** Dias inteiros entre a referência e a validade (negativo = vencido). */
export function diasParaVencer(validade: Date, referencia: Date): number {
  return Math.round((validade.getTime() - referencia.getTime()) / UM_DIA_MS);
}

/** Status calculado na consulta, nesta ordem: Zerado → Vencido → Vencendo → OK (RN-16). */
export function statusDoLote(
  lote: { saldoKg: number; validade: Date; conservacao: Conservacao },
  referencia: Date,
  alertas: { alertaVencimentoCongeladoDias: number; alertaVencimentoResfriadoDias: number },
): StatusLote {
  if (lote.saldoKg <= 0) return "ZERADO";
  const dias = diasParaVencer(lote.validade, referencia);
  if (dias < 0) return "VENCIDO";
  const alerta =
    lote.conservacao === "CONGELADO" ? alertas.alertaVencimentoCongeladoDias : alertas.alertaVencimentoResfriadoDias;
  return dias <= alerta ? "VENCENDO" : "OK";
}
