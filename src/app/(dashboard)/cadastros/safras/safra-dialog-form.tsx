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
import { criarSafraAction, atualizarSafraAction, type FormState } from "./actions";

type Safra = {
  id: string;
  nome: string;
  dataInicio: Date;
  dataFim: Date;
  status: (typeof STATUS_SAFRA_PROJETO)[number];
};

const ESTADO_INICIAL: FormState = {};

function paraDataInput(data?: Date): string | undefined {
  return data ? data.toISOString().slice(0, 10) : undefined;
}

export function SafraDialogForm({ safra }: { safra?: Safra }) {
  const [aberto, setAberto] = useState(false);
  const action = safra ? atualizarSafraAction : criarSafraAction;
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={safra ? "outline" : "default"} size={safra ? "sm" : "default"} />}
      >
        {safra ? "Editar" : "Nova safra"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{safra ? "Editar safra" : "Nova safra"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {safra ? <input type="hidden" name="id" value={safra.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={safra?.nome} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dataInicio">Início</Label>
            <Input
              id="dataInicio"
              name="dataInicio"
              type="date"
              defaultValue={paraDataInput(safra?.dataInicio)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dataFim">Fim</Label>
            <Input
              id="dataFim"
              name="dataFim"
              type="date"
              defaultValue={paraDataInput(safra?.dataFim)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue={safra?.status ?? "PLANEJADO"}>
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
