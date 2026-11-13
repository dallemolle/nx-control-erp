"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";

export type PontoKg = { nome: string; kg: number };

const COMPACTO = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const KG = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Barras horizontais de kg líquido (top 10 origens). */
export function KgBarras({ dados, cor }: { dados: PontoKg[]; cor: string }) {
  return (
    <ChartContainer className="h-72 w-full">
      <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tickFormatter={(v: number) => COMPACTO.format(v)} />
        <YAxis type="category" dataKey="nome" width={140} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(v) => `${KG.format(Number(v))} kg`} />
        <Bar dataKey="kg" fill={cor} name="Kg líquido" />
      </BarChart>
    </ChartContainer>
  );
}
