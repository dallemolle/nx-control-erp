"use client";

import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { PontoEntradasSaidas } from "@/server/services/dashboardExecutivo";

export function EntradasSaidasChart({ dados }: { dados: PontoEntradasSaidas[] }) {
  return (
    <ChartContainer>
      <BarChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="mes" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="entradas" fill="#16a34a" name="Entradas" />
        <Bar dataKey="saidas" fill="#dc2626" name="Saídas" />
      </BarChart>
    </ChartContainer>
  );
}
