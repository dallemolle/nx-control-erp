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
import { criarClienteAction, atualizarClienteAction, type FormState } from "./actions";

type Cliente = {
  id: string;
  nome: string;
  cnpjCpf: string;
  contato: string | null;
  email: string | null;
  telefone: string | null;
};

const ESTADO_INICIAL: FormState = {};

export function ClienteDialogForm({ cliente }: { cliente?: Cliente }) {
  const [aberto, setAberto] = useState(false);
  const action = cliente ? atualizarClienteAction : criarClienteAction;
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={cliente ? "outline" : "default"} size={cliente ? "sm" : "default"} />}
      >
        {cliente ? "Editar" : "Novo cliente"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cliente ? "Editar cliente" : "Novo cliente"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {cliente ? <input type="hidden" name="id" value={cliente.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={cliente?.nome} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cnpjCpf">CNPJ/CPF</Label>
            <Input id="cnpjCpf" name="cnpjCpf" defaultValue={cliente?.cnpjCpf} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contato">Contato</Label>
            <Input id="contato" name="contato" defaultValue={cliente?.contato ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={cliente?.email ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone</Label>
            <Input id="telefone" name="telefone" defaultValue={cliente?.telefone ?? ""} />
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
