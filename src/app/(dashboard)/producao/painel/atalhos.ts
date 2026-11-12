import { paraDataIso } from "@/lib/producao/periodo";

const dia = (ano: number, mes: number, d: number) => paraDataIso(new Date(Date.UTC(ano, mes, d)));

/** Atalhos do filtro do painel, a partir de hoje (data de calendário). */
export function atalhosDePeriodo(hoje: Date): { rotulo: string; inicio: string; fim: string }[] {
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth();
  return [
    { rotulo: "Mês atual", inicio: dia(ano, mes, 1), fim: dia(ano, mes + 1, 0) },
    { rotulo: "Mês anterior", inicio: dia(ano, mes - 1, 1), fim: dia(ano, mes, 0) },
    { rotulo: "Ano", inicio: dia(ano, 0, 1), fim: dia(ano, 11, 31) },
  ];
}
