"use client";

import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { PontoAging } from "@/server/services/dashboardExecutivo";
import { dicaEmReais, eixoEmReais, ROTULOS_FAIXA_AGING } from "./formatos";

export function AgingChart({ dados }: { dados: PontoAging[] }) {
  const comRotulo = dados.map((ponto) => ({ ...ponto, rotulo: ROTULOS_FAIXA_AGING[ponto.faixa] }));
  return (
    <ChartContainer>
      <BarChart data={comRotulo}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="rotulo" />
        <YAxis tickFormatter={eixoEmReais} />
        <Tooltip formatter={dicaEmReais} />
        <Legend />
        <Bar dataKey="contasAPagar" fill="var(--chart-4)" name="Contas a pagar" />
        <Bar dataKey="contasAReceber" fill="var(--chart-2)" name="Contas a receber" />
      </BarChart>
    </ChartContainer>
  );
}
