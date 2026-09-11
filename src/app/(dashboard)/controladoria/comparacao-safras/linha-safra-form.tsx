"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarOrcamentoSafraAction, type FormState } from "./actions";

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
    return <span>{valorOrcado.toFixed(2)}</span>;
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="safraId" value={safraId} />
      <Input name="valor" type="number" step="0.01" defaultValue={valorOrcado} className="w-32" />
      <Button type="submit" size="sm" disabled={pendente}>
        {pendente ? "Salvando..." : "Salvar"}
      </Button>
      {state.erro ? <span className="text-xs text-destructive">{state.erro}</span> : null}
    </form>
  );
}
