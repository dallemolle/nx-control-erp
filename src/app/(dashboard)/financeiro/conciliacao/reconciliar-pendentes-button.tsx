// src/app/(dashboard)/financeiro/conciliacao/reconciliar-pendentes-button.tsx
"use client";
// Espelhado na ajuda (src/ajuda/conciliacao/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { reconciliarPendentesAction } from "./actions";

export function ReconciliarPendentesButton() {
  const [mensagem, setMensagem] = useState<string>();
  const [pendente, iniciarTransicao] = useTransition();

  function reconciliar() {
    iniciarTransicao(async () => {
      const resultado = await reconciliarPendentesAction();
      if (resultado.erro) {
        setMensagem(resultado.erro);
        return;
      }
      const reclassificadas = resultado.reclassificadas ?? 0;
      setMensagem(
        `${resultado.conciliadasAutomaticamente} de ${resultado.totalProcessadas} linha(s) pendente(s) conciliada(s)` +
          (reclassificadas > 0
            ? `; ${reclassificadas} ${reclassificadas === 1 ? "mudou" : "mudaram"} de situação.`
            : "."),
      );
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" disabled={pendente} onClick={reconciliar}>
        {pendente ? "Reconciliando..." : "Reconciliar pendentes"}
      </Button>
      {mensagem ? <p className="text-xs text-muted-foreground">{mensagem}</p> : null}
    </div>
  );
}
