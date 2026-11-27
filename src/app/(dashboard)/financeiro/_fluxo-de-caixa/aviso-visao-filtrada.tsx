import type { ReactNode } from "react";
import type { ClassificacaoFiscal } from "@prisma/client";

/**
 * Explica a visão filtrada por Fiscal/Gerencial. Sem `detalhe`, o texto é o das telas de fluxo do Financeiro
 * (o saldo vira "acumulado"); o Fluxo por dimensão passa o dele.
 */
export function AvisoVisaoFiltrada({
  classificacao,
  detalhe,
}: {
  classificacao?: ClassificacaoFiscal;
  detalhe?: ReactNode;
}) {
  if (!classificacao) return null;
  return (
    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="note">
      Visão filtrada: mostra apenas o movimento classificado como{" "}
      <span className="font-medium text-foreground">{classificacao === "FISCAL" ? "Fiscal" : "Gerencial"}</span>
      {detalhe ?? (
        <>
          , acumulado a partir de zero. O saldo bancário é único e aparece só na visão &quot;Todos&quot;;
          transferências entre contas também ficam de fora.
        </>
      )}
    </p>
  );
}
