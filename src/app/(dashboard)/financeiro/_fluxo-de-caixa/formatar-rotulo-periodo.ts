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
