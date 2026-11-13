"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { formatarMoeda } from "@/lib/formatacao";

export type PontoBarra = { nome: string; faturamento: number };

const COMPACTO = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** Barras horizontais de faturamento (canal ou top 10 clientes). */
export function FaturamentoBarras({ dados, cor }: { dados: PontoBarra[]; cor: string }) {
  return (
    <ChartContainer className="h-72 w-full">
      <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tickFormatter={(v: number) => COMPACTO.format(v)} />
        <YAxis type="category" dataKey="nome" width={140} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(v) => formatarMoeda(Number(v))} />
        <Bar dataKey="faturamento" fill={cor} name="Faturamento" />
      </BarChart>
    </ChartContainer>
  );
}
