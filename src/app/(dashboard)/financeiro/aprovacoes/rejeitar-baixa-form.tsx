"use client";
// Espelhado na ajuda (src/ajuda/aprovacoes/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.

import { useFormularioDaAcao } from "@/components/use-formulario-da-acao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rejeitarBaixaAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

export function RejeitarBaixaForm({ baixaId }: { baixaId: string }) {
  const [state, formAction, pendente] = useFormularioDaAcao(rejeitarBaixaAction, ESTADO_INICIAL);

  return (
    <form onSubmit={formAction} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input type="hidden" name="baixaId" value={baixaId} />
        <Input name="motivo" placeholder="Motivo da rejeição" className="w-40" required />
        <Button type="submit" variant="outline" size="sm" disabled={pendente}>
          {pendente ? "..." : "Rejeitar"}
        </Button>
      </div>
      {state.erro ? <p className="text-xs text-destructive">{state.erro}</p> : null}
    </form>
  );
}
