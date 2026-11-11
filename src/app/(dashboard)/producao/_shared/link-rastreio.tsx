import Link from "next/link";
import { cn } from "@/lib/utils";

export function hrefRastreio(codigo: string, incluirCancelados = false): string {
  const params = new URLSearchParams({ lote: codigo });
  if (incluirCancelados) params.set("cancelados", "1");
  return `/producao/rastreabilidade?${params}`;
}

/** Código do lote que abre a rastreabilidade. */
export function LinkRastreio({
  codigo,
  incluirCancelados = false,
  className,
}: {
  codigo: string;
  incluirCancelados?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={hrefRastreio(codigo, incluirCancelados)}
      title="Rastrear lote"
      className={cn("underline decoration-dotted underline-offset-4 hover:decoration-solid", className)}
    >
      {codigo}
    </Link>
  );
}
