// Usado na tela e na réplica da ajuda (src/ajuda/aprovacoes/cenas.tsx).

import { TriangleAlert } from "lucide-react";
import type { AvisoBaixa } from "@/lib/financeiro/avisosDaBaixa";
import { formatarMoeda } from "@/lib/formatacao";

/** Os avisos da baixa, um por linha. Só informam: não bloqueiam a aprovação. */
export function AvisosDaBaixa({ avisos }: { avisos: readonly AvisoBaixa[] }) {
  if (avisos.length === 0) return null;
  return (
    <ul className="mt-1 max-w-60 space-y-0.5 whitespace-normal">
      {avisos.map((aviso) => (
        <li key={aviso.tipo} className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-500">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {aviso.texto}
        </li>
      ))}
    </ul>
  );
}

/** Embaixo do valor pago: o valor da parcela e só os ajustes diferentes de zero. */
export function DetalheDoValor({
  valorParcela,
  valorJuros,
  valorMulta,
  valorDesconto,
}: {
  valorParcela: number;
  valorJuros: number;
  valorMulta: number;
  valorDesconto: number;
}) {
  const ajustes = [
    valorJuros > 0 ? `+ juros ${formatarMoeda(valorJuros)}` : null,
    valorMulta > 0 ? `+ multa ${formatarMoeda(valorMulta)}` : null,
    valorDesconto > 0 ? `− desconto ${formatarMoeda(valorDesconto)}` : null,
  ].filter((ajuste) => ajuste !== null);
  return (
    <div className="text-xs text-muted-foreground">
      <p>parcela {formatarMoeda(valorParcela)}</p>
      {ajustes.map((ajuste) => (
        <p key={ajuste}>{ajuste}</p>
      ))}
    </div>
  );
}
