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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_SAFRA_PROJETO } from "@/lib/schemas/enums";
import { criarProjetoAction, atualizarProjetoAction, type FormState } from "./actions";

type Projeto = {
  id: string;
  nome: string;
  codigo: string;
  status: (typeof STATUS_SAFRA_PROJETO)[number];
};

const ESTADO_INICIAL: FormState = {};

export function ProjetoDialogForm({ projeto }: { projeto?: Projeto }) {
  const [aberto, setAberto] = useState(false);
  const action = projeto ? atualizarProjetoAction : criarProjetoAction;
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={projeto ? "outline" : "default"} size={projeto ? "sm" : "default"} />}
      >
        {projeto ? "Editar" : "Novo projeto"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{projeto ? "Editar projeto" : "Novo projeto"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {projeto ? <input type="hidden" name="id" value={projeto.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={projeto?.nome} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="codigo">Código</Label>
            <Input id="codigo" name="codigo" defaultValue={projeto?.codigo} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue={projeto?.status ?? "PLANEJADO"}>
              <SelectTrigger id="status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_SAFRA_PROJETO.map((opcao) => (
                  <SelectItem key={opcao} value={opcao}>
                    {opcao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
