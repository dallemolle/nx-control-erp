import { formatarMoeda } from "@/lib/formatacao";
import type { FaixaAging } from "@/server/services/dashboardExecutivo";

const COMPACTO = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** Eixo dos gráficos: "38 mil" em vez de 38000. */
export function eixoEmReais(valor: number): string {
  return COMPACTO.format(valor);
}

/** Dica (tooltip) dos gráficos: "R$ 38.000,00". */
export function dicaEmReais(valor: unknown): string {
  return formatarMoeda(Number(valor));
}

const PERCENTUAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "19,0%" (com `toFixed` saía "19.0%"). */
export function percentualComVirgula(valor: number): string {
  return `${PERCENTUAL.format(valor)}%`;
}

/** O aging só tem parcelas vencidas: a faixa "0-30" começa em 1 dia de atraso. */
export const ROTULOS_FAIXA_AGING: Readonly<Record<FaixaAging, string>> = {
  "0-30": "1–30 dias",
  "31-60": "31–60 dias",
  "61-90": "61–90 dias",
  "90+": "Mais de 90 dias",
};
