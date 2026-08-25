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
import { criarEmpresaAction, atualizarEmpresaAction, type FormState } from "./actions";

type Empresa = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  moedaPadrao: string;
};

const ESTADO_INICIAL: FormState = {};

export function EmpresaDialogForm({ empresa }: { empresa?: Empresa }) {
  const [aberto, setAberto] = useState(false);
  const action = empresa ? atualizarEmpresaAction : criarEmpresaAction;
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={empresa ? "outline" : "default"} size={empresa ? "sm" : "default"} />}
      >
        {empresa ? "Editar" : "Nova empresa"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{empresa ? "Editar empresa" : "Nova empresa"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {empresa ? <input type="hidden" name="id" value={empresa.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="razaoSocial">Razão social</Label>
            <Input
              id="razaoSocial"
              name="razaoSocial"
              defaultValue={empresa?.razaoSocial}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nomeFantasia">Nome fantasia</Label>
            <Input
              id="nomeFantasia"
              name="nomeFantasia"
              defaultValue={empresa?.nomeFantasia}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input id="cnpj" name="cnpj" defaultValue={empresa?.cnpj} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="moedaPadrao">Moeda padrão</Label>
            <Input
              id="moedaPadrao"
              name="moedaPadrao"
              defaultValue={empresa?.moedaPadrao ?? "BRL"}
              maxLength={3}
              required
            />
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
