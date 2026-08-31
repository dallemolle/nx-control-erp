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
import { criarCentroLucroAction, atualizarCentroLucroAction, type FormState } from "./actions";

type CentroLucro = {
  id: string;
  nome: string;
  codigo: string;
};

const ESTADO_INICIAL: FormState = {};

export function CentroLucroDialogForm({ centro }: { centro?: CentroLucro }) {
  const [aberto, setAberto] = useState(false);
  const action = centro ? atualizarCentroLucroAction : criarCentroLucroAction;
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={centro ? "outline" : "default"} size={centro ? "sm" : "default"} />}
      >
        {centro ? "Editar" : "Novo centro de lucro"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{centro ? "Editar centro de lucro" : "Novo centro de lucro"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {centro ? <input type="hidden" name="id" value={centro.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={centro?.nome} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="codigo">Código</Label>
            <Input id="codigo" name="codigo" defaultValue={centro?.codigo} required />
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
