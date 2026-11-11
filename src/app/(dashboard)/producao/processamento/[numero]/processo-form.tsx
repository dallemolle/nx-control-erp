"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { atualizarProcessoOPAction, type FormState } from "../actions";

const ESTADO_INICIAL: FormState = {};

export type ValoresProcesso = {
  branqueamentoTemperaturaC: number | null;
  branqueamentoTempoS: number | null;
  aguaLitros: number;
  carocoResiduoKg: number;
  perdaKg: number;
  observacao: string | null;
};

function Numero({
  id,
  rotulo,
  valor,
  passo = "0.001",
}: {
  id: keyof ValoresProcesso;
  rotulo: string;
  valor: number | null;
  passo?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`processo-${id}`}>{rotulo}</Label>
      <Input
        id={`processo-${id}`}
        name={id}
        type="number"
        inputMode="decimal"
        min="0"
        step={passo}
        defaultValue={valor ?? ""}
      />
    </div>
  );
}

/** Aba "Processo": salva todos os campos de uma vez. */
export function ProcessoForm({
  opId,
  valores: valoresIniciais,
  exigeBranqueamento,
  minimos,
}: {
  opId: string;
  valores: ValoresProcesso;
  exigeBranqueamento: boolean;
  minimos: { temperaturaMinC: number; tempoMinS: number };
}) {
  const [state, formAction, pendente] = useActionState(atualizarProcessoOPAction, ESTADO_INICIAL);
  // Valores iniciais congelados: depois de salvar, a página volta com os mesmos números e o
  // Input da Base UI reclama se o `defaultValue` de um campo não controlado mudar.
  const [valores] = useState(valoresIniciais);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="opId" value={opId} />
      {exigeBranqueamento ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Branqueamento</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Numero id="branqueamentoTemperaturaC" rotulo="Temperatura (°C)" valor={valores.branqueamentoTemperaturaC} passo="0.1" />
            <Numero id="branqueamentoTempoS" rotulo="Tempo (s)" valor={valores.branqueamentoTempoS} passo="1" />
          </div>
          <p className="text-xs text-muted-foreground">
            Mínimos: {minimos.temperaturaMinC} °C e {minimos.tempoMinS} s.
          </p>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Numero id="aguaLitros" rotulo="Água (L)" valor={valores.aguaLitros} />
        <Numero id="carocoResiduoKg" rotulo="Caroço/resíduo (kg)" valor={valores.carocoResiduoKg} />
        <Numero id="perdaKg" rotulo="Perda (kg)" valor={valores.perdaKg} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="processo-observacao">Observação</Label>
        <textarea
          id="processo-observacao"
          name="observacao"
          rows={3}
          defaultValue={valores.observacao ?? ""}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar processo"}
        </Button>
        {state.erro ? <span className="text-sm text-destructive">{state.erro}</span> : null}
        {state.sucesso && !pendente ? <span className="text-sm text-muted-foreground">Salvo.</span> : null}
      </div>
    </form>
  );
}
