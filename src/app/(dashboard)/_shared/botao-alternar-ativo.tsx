"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

export type EstadoAlternarAtivo = { erro?: string };

/**
 * Inativar/Reativar de uma linha de cadastro, com a recusa do servidor ao lado do botão (ex.: "A conta tem saldo
 * contábil de ..."). Sem isto, a exceção da action vira a página de erro genérica.
 */
export function BotaoAlternarAtivo({
  id,
  ativo,
  action,
}: {
  id: string;
  ativo: boolean;
  action: (anterior: EstadoAlternarAtivo, dados: FormData) => Promise<EstadoAlternarAtivo>;
}) {
  const [state, formAction, pendente] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="ativo" value={(!ativo).toString()} />
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {ativo ? "Inativar" : "Reativar"}
      </Button>
      {state.erro ? <p className="max-w-64 text-right text-xs text-destructive">{state.erro}</p> : null}
    </form>
  );
}
