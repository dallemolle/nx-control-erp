import type { ClassificacaoFiscal } from "@prisma/client";

/** Explica por que, com o filtro Fiscal/Gerencial, o saldo vira "acumulado". */
export function AvisoVisaoFiltrada({ classificacao }: { classificacao?: ClassificacaoFiscal }) {
  if (!classificacao) return null;
  return (
    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="note">
      Visão filtrada: mostra apenas o movimento classificado como{" "}
      <span className="font-medium text-foreground">{classificacao === "FISCAL" ? "Fiscal" : "Gerencial"}</span>,
      acumulado a partir de zero. O saldo bancário é único e aparece só na visão &quot;Todos&quot;; transferências
      entre contas também ficam de fora.
    </p>
  );
}
