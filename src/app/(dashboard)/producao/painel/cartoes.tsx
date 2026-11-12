import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatarMoeda } from "@/lib/formatacao";

const KG = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const PCT = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const INTEIRO = new Intl.NumberFormat("pt-BR");

export const fmt = {
  kg: (v: number) => `${KG.format(v)} kg`,
  pct: (v: number | null) => (v === null ? "—" : PCT.format(v)),
  moeda: (v: number | null) => (v === null ? "—" : formatarMoeda(v)),
  moedaKg: (v: number | null) => (v === null ? "—" : `${formatarMoeda(v)}/kg`),
  n: (v: number) => INTEIRO.format(v),
};

/** Bloco com título e grade de indicadores. */
export function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

/** Indicador: valor total e, opcionalmente, uma linha por fruta. */
export function Indicador({
  rotulo,
  valor,
  nota,
  porFruta,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  porFruta?: { fruta: string; valor: string }[];
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-sm text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums">{valor}</p>
      {porFruta && porFruta.length > 0 ? (
        <dl className="mt-2 space-y-0.5 text-sm">
          {porFruta.map((f) => (
            <div key={f.fruta} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{f.fruta}</dt>
              <dd className="tabular-nums">{f.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {nota ? <p className="mt-1 text-xs text-muted-foreground">{nota}</p> : null}
    </div>
  );
}

/** Alerta: neutro sem ocorrência; destacado e clicável quando há. */
export function Alerta({ rotulo, quantidade, detalhe, href }: { rotulo: string; quantidade: number; detalhe?: string; href: string }) {
  const conteudo = (
    <>
      <p className="text-sm text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums">{fmt.n(quantidade)}</p>
      {detalhe ? <p className="text-xs text-muted-foreground">{detalhe}</p> : null}
    </>
  );
  if (quantidade === 0) return <div className="rounded-lg border bg-card p-3">{conteudo}</div>;
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg border border-l-4 border-l-amber-500 bg-card p-3 transition-colors hover:bg-muted/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {conteudo}
    </Link>
  );
}
