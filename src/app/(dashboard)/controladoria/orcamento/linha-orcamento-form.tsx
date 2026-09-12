"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarLinhaOrcamentoAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

export function LinhaOrcamentoForm({
  categoriaFinanceiraId,
  categoriaNome,
  ano,
  valoresPorMes,
  somenteLeitura,
}: {
  categoriaFinanceiraId: string;
  categoriaNome: string;
  ano: number;
  valoresPorMes: number[]; // índice 0 = mês 1 (janeiro) .. índice 11 = mês 12
  somenteLeitura: boolean;
}) {
  const [state, formAction, pendente] = useActionState(salvarLinhaOrcamentoAction, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex items-center gap-2 border-b py-2">
      <input type="hidden" name="categoriaFinanceiraId" value={categoriaFinanceiraId} />
      <input type="hidden" name="ano" value={ano} />
      <span className="w-40 shrink-0 truncate text-sm font-medium" title={categoriaNome}>
        {categoriaNome}
      </span>
      {valoresPorMes.map((valor, indice) => (
        <Input
          key={indice}
          name={`mes-${indice + 1}`}
          type="number"
          step="0.01"
          defaultValue={valor}
          disabled={somenteLeitura}
          className="w-24"
        />
      ))}
      {!somenteLeitura && (
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar"}
        </Button>
      )}
      {state.erro ? <span className="text-xs text-destructive">{state.erro}</span> : null}
    </form>
  );
}
