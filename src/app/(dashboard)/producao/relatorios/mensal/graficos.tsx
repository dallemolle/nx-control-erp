"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { formatarMoeda } from "@/lib/formatacao";

export type PontoMensal = {
  mes: string;
  recebido: number;
  processado: number;
  vendido: number;
  faturamento: number;
  /** 0–100; `null` sem faturamento. */
  margemPercentual: number | null;
};

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function VolumesChart({ dados }: { dados: PontoMensal[] }) {
  return (
    <ChartContainer className="h-72 w-full">
      <BarChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="mes" />
        <YAxis tickFormatter={(v: number) => NUMERO.format(v)} />
        <Tooltip formatter={(v) => `${NUMERO.format(Number(v))} kg`} />
        <Legend />
        <Bar dataKey="recebido" fill="var(--chart-2)" name="Recebido" />
        <Bar dataKey="processado" fill="var(--chart-3)" name="Processado" />
        <Bar dataKey="vendido" fill="var(--chart-4)" name="Vendido" />
      </BarChart>
    </ChartContainer>
  );
}

export function FaturamentoMargemChart({ dados }: { dados: PontoMensal[] }) {
  return (
    <ChartContainer className="h-72 w-full">
      <ComposedChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="mes" />
        <YAxis yAxisId="valor" tickFormatter={(v: number) => NUMERO.format(v)} />
        <YAxis yAxisId="pct" orientation="right" unit="%" />
        <Tooltip
          formatter={(v, nome) => (nome === "Margem %" ? `${NUMERO.format(Number(v))}%` : formatarMoeda(Number(v)))}
        />
        <Legend />
        <Bar yAxisId="valor" dataKey="faturamento" fill="var(--chart-2)" name="Faturamento" />
        <Line yAxisId="pct" dataKey="margemPercentual" stroke="var(--chart-4)" strokeWidth={2} name="Margem %" connectNulls={false} />
      </ComposedChart>
    </ChartContainer>
  );
}
