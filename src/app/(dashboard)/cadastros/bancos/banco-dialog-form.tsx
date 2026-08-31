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
import { criarBancoAction, atualizarBancoAction, type FormState } from "./actions";

type Banco = {
  id: string;
  codigo: string;
  nome: string;
};

const ESTADO_INICIAL: FormState = {};

export function BancoDialogForm({ banco }: { banco?: Banco }) {
  const [aberto, setAberto] = useState(false);
  const action = banco ? atualizarBancoAction : criarBancoAction;
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={banco ? "outline" : "default"} size={banco ? "sm" : "default"} />}
      >
        {banco ? "Editar" : "Novo banco"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{banco ? "Editar banco" : "Novo banco"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {banco ? <input type="hidden" name="id" value={banco.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="codigo">Código</Label>
            <Input id="codigo" name="codigo" defaultValue={banco?.codigo} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={banco?.nome} required />
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
