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
  cnpjCpf: string;
  moedaPadrao: string;
  corPrimaria: string | null;
  logoUrl: string | null;
};

const ESTADO_INICIAL: FormState = {};
const COR_PADRAO = "#0b2545";

export function EmpresaDialogForm({ empresa }: { empresa?: Empresa }) {
  const [aberto, setAberto] = useState(false);
  const [usarCor, setUsarCor] = useState(!!empresa?.corPrimaria);
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
            <Label htmlFor="cnpjCpf">CNPJ/CPF</Label>
            <Input id="cnpjCpf" name="cnpjCpf" defaultValue={empresa?.cnpjCpf} required />
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
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="usarCorPersonalizada"
                name="usarCorPersonalizada"
                value="true"
                checked={usarCor}
                onChange={(e) => setUsarCor(e.target.checked)}
                className="size-4"
              />
              <Label htmlFor="usarCorPersonalizada">Usar cor personalizada nesta empresa</Label>
            </div>
            <input
              type="color"
              id="corPrimaria"
              name="corPrimaria"
              defaultValue={empresa?.corPrimaria ?? COR_PADRAO}
              className={usarCor ? "h-9 w-16" : "h-9 w-16 opacity-40"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logo">Logo</Label>
            {empresa?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={empresa.logoUrl} alt="Logo atual" className="h-10 w-10 rounded object-contain" />
            ) : null}
            <Input
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
            />
            {empresa?.logoUrl ? (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="removerLogo" name="removerLogo" value="true" className="size-4" />
                <Label htmlFor="removerLogo">Remover logo atual</Label>
              </div>
            ) : null}
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
