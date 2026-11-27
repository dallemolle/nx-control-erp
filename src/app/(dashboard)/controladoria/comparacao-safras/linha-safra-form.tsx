"use client";

// Espelhado na ajuda (src/ajuda/comparacao-safras/cenas.tsx): mudou campo, botão ou mensagem? Ajuste a ajuda junto.

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarOrcamentoSafraAction, type FormState } from "./actions";
import { formatarMoeda } from "@/lib/formatacao";
import { valorParaCampo } from "@/lib/valorEmReais";

const ESTADO_INICIAL: FormState = {};

export function LinhaSafraForm({
  safraId,
  valorOrcado,
  somenteLeitura,
}: {
  safraId: string;
  valorOrcado: number;
  somenteLeitura: boolean;
}) {
  const [state, formAction, pendente] = useActionState(salvarOrcamentoSafraAction, ESTADO_INICIAL);

  if (somenteLeitura) {
    return <span>{formatarMoeda(valorOrcado)}</span>;
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="safraId" value={safraId} />
      <Input
        key={valorOrcado} // recria o campo quando o valor salvo volta do servidor (mostra "30.000,00")
        name="valor"
        type="text"
        inputMode="decimal"
        aria-label="Orçado da safra"
        defaultValue={valorParaCampo(valorOrcado)}
        className="w-32 text-right"
      />
      <Button type="submit" size="sm" disabled={pendente}>
        {pendente ? "Salvando..." : "Salvar"}
      </Button>
      {state.erro ? <span className="text-xs text-destructive">{state.erro}</span> : null}
      {state.sucesso && !pendente ? (
        <span className="text-xs text-muted-foreground" role="status">
          Salvo
        </span>
      ) : null}
    </form>
  );
}
