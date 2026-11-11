"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatarData } from "@/lib/formatacao";
import {
  atualizarCabecalhoOPAction,
  cancelarOPAction,
  encerrarOPAction,
  reabrirOPAction,
  type FormState,
} from "../actions";
import { useAcaoDoDialogo } from "../../../_shared/use-acao-do-dialogo";

const ESTADO_INICIAL: FormState = {};

type Situacao = { pode: true } | { pode: false; motivo: string };

export function EncerrarOP({ opId, numero, aVerificar }: { opId: string; numero: string; aVerificar: string[] }) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(encerrarOPAction, ESTADO_INICIAL);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button />}>Encerrar OP</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Encerrar {numero}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="opId" value={opId} />
          <p className="text-sm text-muted-foreground">
            O custo é gravado e a polpa fica liberada para venda e ajuste. Se precisar corrigir depois, a OP pode ser
            reaberta enquanto nenhum lote de polpa tiver saída.
          </p>
          {aVerificar.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-destructive/40 p-3">
              <p className="text-sm font-medium text-destructive">A verificar: {aVerificar.join(", ")}</p>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="confirmarVerificar" required className="mt-0.5" />
                Confirmo o encerramento com itens a verificar
              </label>
            </div>
          ) : null}
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Encerrando..." : "Encerrar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Reabrir ou cancelar, com motivo; quando a polpa já saiu, o botão fica desabilitado com a explicação. */
export function DesfazerOP({
  tipo,
  opId,
  numero,
  situacao,
}: {
  tipo: "reabrir" | "cancelar";
  opId: string;
  numero: string;
  situacao: Situacao;
}) {
  const action = tipo === "reabrir" ? reabrirOPAction : cancelarOPAction;
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(action, ESTADO_INICIAL);
  const rotulo = tipo === "reabrir" ? "Reabrir" : "Cancelar OP";
  if (!situacao.pode) {
    return (
      <Button variant="outline" disabled title={situacao.motivo}>
        {rotulo}
      </Button>
    );
  }
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" />}>{rotulo}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {tipo === "reabrir" ? "Reabrir" : "Cancelar"} {numero}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="opId" value={opId} />
          <p className="text-sm text-muted-foreground">
            {tipo === "reabrir"
              ? "A OP volta para aberta: os custos gravados são limpos e a polpa fica bloqueada até encerrar de novo."
              : "O fruto volta para os lotes de origem e os lotes de polpa são zerados. Não dá para desfazer."}
          </p>
          <div className="space-y-2">
            <Label htmlFor={`motivo-${tipo}`}>Motivo</Label>
            <Input id={`motivo-${tipo}`} name="motivo" required minLength={3} />
          </div>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button
            type="submit"
            variant={tipo === "reabrir" ? "default" : "destructive"}
            className="w-full"
            disabled={pendente}
          >
            {pendente ? "Salvando..." : rotulo}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Responsável sempre; data e fruta só enquanto a OP não tem linhas (validade e fruta dos lotes dependem delas). */
export function EditarCabecalhoOP({
  op,
  frutas,
  temLinhas,
}: {
  op: { id: string; data: string; frutaId: string; frutaNome: string; responsavel: string | null };
  frutas: { id: string; nome: string }[];
  temLinhas: boolean;
}) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(
    atualizarCabecalhoOPAction,
    ESTADO_INICIAL,
  );
  const [frutaId, setFrutaId] = useState(op.frutaId);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Editar</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar OP</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="opId" value={op.id} />
          {temLinhas ? (
            <>
              <input type="hidden" name="data" value={op.data} />
              <input type="hidden" name="frutaId" value={op.frutaId} />
              <p className="text-sm text-muted-foreground">
                {formatarData(op.data)} · {op.frutaNome}. Para mudar a data ou a fruta, remova as linhas antes.
              </p>
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="editar-op-data">Data</Label>
                <Input id="editar-op-data" name="data" type="date" defaultValue={op.data} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editar-op-fruta">Fruta</Label>
                <Select name="frutaId" value={frutaId || null} onValueChange={(v) => setFrutaId(v ?? "")}>
                  <SelectTrigger id="editar-op-fruta" className="w-full">
                    <SelectValue placeholder="Selecione a fruta" />
                  </SelectTrigger>
                  <SelectContent>
                    {frutas.map((fruta) => (
                      <SelectItem key={fruta.id} value={fruta.id}>
                        {fruta.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="editar-op-responsavel">Responsável</Label>
            <Input id="editar-op-responsavel" name="responsavel" defaultValue={op.responsavel ?? ""} />
          </div>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
