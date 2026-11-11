"use client";

import { useActionState, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { criarOPAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

/** Data, fruta e responsável; ao salvar, o servidor leva direto ao detalhe da OP. */
export function NovaOPDialog({ hoje, frutas }: { hoje: string; frutas: { id: string; nome: string }[] }) {
  const [state, formAction, pendente] = useActionState(criarOPAction, ESTADO_INICIAL);
  const [frutaId, setFrutaId] = useState(frutas.length === 1 ? frutas[0].id : "");

  return (
    <Dialog>
      <DialogTrigger render={<Button />}>Nova OP</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova ordem de produção</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nova-op-data">Data</Label>
              <Input id="nova-op-data" name="data" type="date" defaultValue={hoje} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nova-op-fruta">Fruta</Label>
              <Select name="frutaId" value={frutaId || null} onValueChange={(v) => setFrutaId(v ?? "")}>
                <SelectTrigger id="nova-op-fruta" className="w-full">
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
          <div className="space-y-2">
            <Label htmlFor="nova-op-responsavel">Responsável (opcional)</Label>
            <Input id="nova-op-responsavel" name="responsavel" />
          </div>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Abrindo..." : "Abrir OP"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
