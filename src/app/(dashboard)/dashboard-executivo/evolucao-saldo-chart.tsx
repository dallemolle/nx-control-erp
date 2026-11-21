"use client";

import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { PontoEvolucaoSaldo } from "@/server/services/dashboardExecutivo";
import { dicaEmReais, eixoEmReais } from "./formatos";

export function EvolucaoSaldoChart({ dados }: { dados: PontoEvolucaoSaldo[] }) {
  return (
    <ChartContainer>
      <LineChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="mes" />
        <YAxis tickFormatter={eixoEmReais} />
        <Tooltip formatter={dicaEmReais} />
        <Line type="monotone" dataKey="saldo" stroke="var(--chart-3)" name="Saldo" />
      </LineChart>
    </ChartContainer>
  );
}
