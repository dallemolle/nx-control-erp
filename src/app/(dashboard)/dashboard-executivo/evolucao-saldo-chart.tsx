"use client";

import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { PontoEvolucaoSaldo } from "@/server/services/dashboardExecutivo";

export function EvolucaoSaldoChart({ dados }: { dados: PontoEvolucaoSaldo[] }) {
  return (
    <ChartContainer>
      <LineChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="mes" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="saldo" stroke="#2563eb" name="Saldo" />
      </LineChart>
    </ChartContainer>
  );
}
