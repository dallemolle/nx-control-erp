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
        <Bar dataKey="contasAPagar" fill="#dc2626" name="Contas a pagar" />
        <Bar dataKey="contasAReceber" fill="#16a34a" name="Contas a receber" />
      </BarChart>
    </ChartContainer>
  );
}
