import Link from "next/link";
import { cn } from "@/lib/utils";
import { ROTULOS_STATUS_LOTE } from "@/lib/producao/statusLote";
import { STATUS_RESUMIDOS, type ResumoStatus } from "@/server/services/estoque";

const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const COR: Record<keyof ResumoStatus, string> = {
  OK: "border-l-muted-foreground/40",
  VENCENDO: "border-l-amber-500",
  VENCIDO: "border-l-destructive",
};

/** Três cartões clicáveis: clicar filtra a lista de lotes pelo status; clicar no ativo limpa. */
export function ResumoStatusEstoque({
  resumo,
  ativo,
  hrefStatus,
}: {
  resumo: ResumoStatus;
  ativo: string;
  hrefStatus: (status: string) => string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {STATUS_RESUMIDOS.map((status) => {
        const selecionado = ativo === status;
        const { quantidade, kg } = resumo[status];
        return (
          <Link
            key={status}
            href={hrefStatus(selecionado ? "" : status)}
            aria-current={selecionado ? "true" : undefined}
            className={cn(
              "rounded-lg border border-l-4 bg-card p-3 transition-colors hover:bg-muted/50",
              COR[status],
              selecionado && "ring-2 ring-primary",
            )}
          >
            <p className="text-sm text-muted-foreground">{ROTULOS_STATUS_LOTE[status]}</p>
            <p className="text-lg font-semibold tabular-nums">
              {quantidade} {quantidade === 1 ? "lote" : "lotes"}
            </p>
            <p className="text-sm tabular-nums text-muted-foreground">{KG.format(kg)} kg</p>
          </Link>
        );
      })}
    </div>
  );
}
