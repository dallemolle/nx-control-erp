"use client";

import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { PontoAging } from "@/server/services/dashboardExecutivo";

export function AgingChart({ dados }: { dados: PontoAging[] }) {
  return (
    <ChartContainer>
      <BarChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="faixa" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="contasAPagar" fill="var(--chart-4)" name="Contas a pagar" />
        <Bar dataKey="contasAReceber" fill="var(--chart-2)" name="Contas a receber" />
      </BarChart>
    </ChartContainer>
  );
}
