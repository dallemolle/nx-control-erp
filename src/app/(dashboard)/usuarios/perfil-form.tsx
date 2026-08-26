"use client";

import { useActionState, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERFIS } from "@/lib/schemas/usuario";
import type { Perfil } from "@prisma/client";
import { atualizarPerfilAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

export function PerfilForm({ usuarioId, perfil }: { usuarioId: string; perfil: Perfil }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(atualizarPerfilAction, ESTADO_INICIAL);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="usuarioId" value={usuarioId} />
      <Select
        name="perfil"
        defaultValue={perfil}
        onValueChange={() => formRef.current?.requestSubmit()}
      >
        <SelectTrigger size="sm" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERFIS.map((opcao) => (
            <SelectItem key={opcao} value={opcao}>
              {opcao}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {state.erro ? <p className="text-xs text-destructive">{state.erro}</p> : null}
    </form>
  );
}
