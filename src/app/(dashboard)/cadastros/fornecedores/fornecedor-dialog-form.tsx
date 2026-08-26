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
import { criarFornecedorAction, atualizarFornecedorAction, type FormState } from "./actions";

type Fornecedor = {
  id: string;
  nome: string;
  cnpjCpf: string;
  contato: string | null;
  email: string | null;
  telefone: string | null;
};

const ESTADO_INICIAL: FormState = {};

export function FornecedorDialogForm({ fornecedor }: { fornecedor?: Fornecedor }) {
  const [aberto, setAberto] = useState(false);
  const action = fornecedor ? atualizarFornecedorAction : criarFornecedorAction;
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button variant={fornecedor ? "outline" : "default"} size={fornecedor ? "sm" : "default"} />
        }
      >
        {fornecedor ? "Editar" : "Novo fornecedor"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fornecedor ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {fornecedor ? <input type="hidden" name="id" value={fornecedor.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={fornecedor?.nome} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cnpjCpf">CNPJ/CPF</Label>
            <Input id="cnpjCpf" name="cnpjCpf" defaultValue={fornecedor?.cnpjCpf} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contato">Contato</Label>
            <Input id="contato" name="contato" defaultValue={fornecedor?.contato ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={fornecedor?.email ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone</Label>
            <Input id="telefone" name="telefone" defaultValue={fornecedor?.telefone ?? ""} />
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
