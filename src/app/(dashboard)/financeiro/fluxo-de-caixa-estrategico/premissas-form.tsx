"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PremissasCenario } from "@/server/services/fluxoDeCaixaEstrategico";
import type { TipoCenarioEstrategico } from "@prisma/client";
import { atualizarPremissasCenarioAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

export function PremissasForm({
  tipo,
  premissas,
  somenteLeitura,
}: {
  tipo: TipoCenarioEstrategico;
  premissas: PremissasCenario;
  somenteLeitura: boolean;
}) {
  const [state, formAction, pendente] = useActionState(atualizarPremissasCenarioAction, ESTADO_INICIAL);

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="tipo" value={tipo} />
      <div className="space-y-2">
        <Label htmlFor={`${tipo}-crescimentoReceita`}>Crescimento de receita (% a.a.)</Label>
        <Input
          id={`${tipo}-crescimentoReceita`}
          name="crescimentoReceita"
          type="number"
          step="0.01"
          defaultValue={(premissas.crescimentoReceita * 100).toFixed(2)}
          disabled={somenteLeitura}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${tipo}-crescimentoCustos`}>Crescimento de custos/despesas (% a.a.)</Label>
        <Input
          id={`${tipo}-crescimentoCustos`}
          name="crescimentoCustos"
          type="number"
          step="0.01"
          defaultValue={(premissas.crescimentoCustos * 100).toFixed(2)}
          disabled={somenteLeitura}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${tipo}-capexPercentualReceita`}>CAPEX (% da receita)</Label>
        <Input
          id={`${tipo}-capexPercentualReceita`}
          name="capexPercentualReceita"
          type="number"
          step="0.01"
          defaultValue={(premissas.capexPercentualReceita * 100).toFixed(2)}
          disabled={somenteLeitura}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${tipo}-novoEndividamentoAnual`}>Novo endividamento anual (R$)</Label>
        <Input
          id={`${tipo}-novoEndividamentoAnual`}
          name="novoEndividamentoAnual"
          type="number"
          step="0.01"
          defaultValue={premissas.novoEndividamentoAnual}
          disabled={somenteLeitura}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${tipo}-taxaJurosAnual`}>Taxa de juros anual (% a.a.)</Label>
        <Input
          id={`${tipo}-taxaJurosAnual`}
          name="taxaJurosAnual"
          type="number"
          step="0.01"
          defaultValue={(premissas.taxaJurosAnual * 100).toFixed(2)}
          disabled={somenteLeitura}
          required
        />
      </div>
      {!somenteLeitura && (
        <div className="flex items-end">
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar premissas"}
          </Button>
        </div>
      )}
      {state.erro ? <p className="text-sm text-destructive sm:col-span-2 lg:col-span-3">{state.erro}</p> : null}
      {state.sucesso ? <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">Premissas salvas.</p> : null}
    </form>
  );
}
