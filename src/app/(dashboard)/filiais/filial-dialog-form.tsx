"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarFilialAction, atualizarFilialAction, type FormState } from "./actions";

type Filial = {
  id: string;
  nome: string;
  cnpj: string;
};

const ESTADO_INICIAL: FormState = {};

export function FilialDialogForm({ filial }: { filial?: Filial }) {
  const [aberto, setAberto] = useState(false);
  const action = filial ? atualizarFilialAction : criarFilialAction;
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={filial ? "outline" : "default"} size={filial ? "sm" : "default"} />}
      >
        {filial ? "Editar" : "Nova filial"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{filial ? "Editar filial" : "Nova filial"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {filial ? <input type="hidden" name="id" value={filial.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={filial?.nome} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input id="cnpj" name="cnpj" defaultValue={filial?.cnpj} required />
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
