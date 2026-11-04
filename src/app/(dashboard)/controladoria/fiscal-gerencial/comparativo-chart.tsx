"use client";

import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";

export type PontoComparativo = {
  mes: string;
  entradasFiscal: number;
  entradasGerencial: number;
  saidasFiscal: number;
  saidasGerencial: number;
};

/** Barras empilhadas por mês: entradas (fiscal + gerencial) ao lado de saídas (fiscal + gerencial). */
export function ComparativoChart({ dados }: { dados: PontoComparativo[] }) {
  return (
    <ChartContainer>
      <BarChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="mes" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="entradasFiscal" stackId="entradas" fill="var(--chart-2)" name="Entradas fiscais" />
        <Bar dataKey="entradasGerencial" stackId="entradas" fill="var(--chart-3)" name="Entradas gerenciais" />
        <Bar dataKey="saidasFiscal" stackId="saidas" fill="var(--chart-4)" name="Saídas fiscais" />
        <Bar dataKey="saidasGerencial" stackId="saidas" fill="var(--chart-5)" name="Saídas gerenciais" />
      </BarChart>
    </ChartContainer>
  );
}
