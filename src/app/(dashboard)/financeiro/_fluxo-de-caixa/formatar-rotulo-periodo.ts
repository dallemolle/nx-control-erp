import type { Granularidade } from "@/server/services/fluxoDeCaixa";

function dataCurta(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function formatarRotuloPeriodo(granularidade: Granularidade, inicio: Date, fim: Date): string {
  if (granularidade === "DIA") {
    return dataCurta(inicio);
  }
  if (granularidade === "SEMANA") {
    return `Semana de ${dataCurta(inicio)} a ${dataCurta(fim)}`;
  }
  if (granularidade === "MES") {
    return inicio.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  return String(inicio.getUTCFullYear());
}

/** Rótulo da linha de parcelas vencidas antes da janela no fluxo projetado. */
export function rotuloEmAtraso(venceuAte: Date): string {
  return `Em atraso (venc. até ${dataCurta(venceuAte)})`;
}

/** Rótulo da linha de parcelas que vencem entre hoje e a véspera de uma janela futura. */
export function rotuloAVencerAntes(venceAte: Date): string {
  return `A vencer até ${dataCurta(venceAte)}`;
}
