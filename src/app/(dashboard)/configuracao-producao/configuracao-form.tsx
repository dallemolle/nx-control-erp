"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConfiguracaoProducaoValores } from "@/server/services/configuracaoProducao";
import { salvarConfiguracaoProducaoAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

/** 0,03 → 3 (sem ruído de ponto flutuante como 7.000000000000001). */
function paraPercentual(fracao: number): number {
  return Math.round(fracao * 10000) / 100;
}

function Campo({
  id,
  rotulo,
  ajuda,
  ...props
}: { id: string; rotulo: string; ajuda?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input id={id} name={id} {...props} />
      {ajuda ? <p className="text-xs text-muted-foreground">{ajuda}</p> : null}
    </div>
  );
}

export function ConfiguracaoForm({
  valores,
  somenteLeitura,
}: {
  valores: ConfiguracaoProducaoValores;
  somenteLeitura: boolean;
}) {
  const [state, formAction, pendente] = useActionState(salvarConfiguracaoProducaoAction, ESTADO_INICIAL);

  return (
    <form action={formAction} className="space-y-6">
      <fieldset disabled={somenteLeitura} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Registro</CardTitle>
          </CardHeader>
          <CardContent>
            <Campo
              id="registroAdepara"
              rotulo="Registro na ADEPARA"
              defaultValue={valores.registroAdepara ?? ""}
              ajuda="Aparece na etiqueta do lote."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alertas de vencimento</CardTitle>
            <CardDescription>Com quantos dias de antecedência o lote aparece como "vencendo".</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="alertaVencimentoCongeladoDias"
              rotulo="Congelado (dias)"
              type="number"
              min="0"
              step="1"
              defaultValue={valores.alertaVencimentoCongeladoDias}
              required
            />
            <Campo
              id="alertaVencimentoResfriadoDias"
              rotulo="In natura e resfriado (dias)"
              type="number"
              min="0"
              step="1"
              defaultValue={valores.alertaVencimentoResfriadoDias}
              required
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Branqueamento</CardTitle>
            <CardDescription>Mínimos para as frutas que exigem branqueamento (ex.: açaí).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="branqueamentoTemperaturaMinC"
              rotulo="Temperatura mínima (°C)"
              type="number"
              min="0"
              max="150"
              step="0.1"
              defaultValue={valores.branqueamentoTemperaturaMinC}
              required
            />
            <Campo
              id="branqueamentoTempoMinS"
              rotulo="Tempo mínimo (segundos)"
              type="number"
              min="0"
              step="1"
              defaultValue={valores.branqueamentoTempoMinS}
              required
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Balanço de massa</CardTitle>
            <CardDescription>
              Diferença aceita entre o que entra (fruto + água) e o que sai (polpa + caroço + perda) numa ordem de
              produção.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="toleranciaBalancoMassaPercentual"
              rotulo="Tolerância (%)"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue={paraPercentual(valores.toleranciaBalancoMassa)}
              required
            />
          </CardContent>
        </Card>
      </fieldset>

      {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
      {state.sucesso && !pendente ? <p className="text-sm text-muted-foreground">Configuração salva.</p> : null}
      {!somenteLeitura && (
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar"}
        </Button>
      )}
    </form>
  );
}
