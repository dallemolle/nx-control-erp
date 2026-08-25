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
import { criarCentroCustoAction, atualizarCentroCustoAction, type FormState } from "./actions";

type CentroCusto = { id: string; nome: string; codigo: string; parentId: string | null };

const ESTADO_INICIAL: FormState = {};
const SEM_PAI = "__raiz__";

export function CentroCustoDialogForm({
  centro,
  opcoesPai,
}: {
  centro?: CentroCusto;
  opcoesPai: CentroCusto[];
}) {
  const [aberto, setAberto] = useState(false);
  const action = centro ? atualizarCentroCustoAction : criarCentroCustoAction;
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  const opcoesFiltradas = opcoesPai.filter((opcao) => opcao.id !== centro?.id);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={centro ? "outline" : "default"} size={centro ? "sm" : "default"} />}
      >
        {centro ? "Editar" : "Novo centro de custo"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{centro ? "Editar centro de custo" : "Novo centro de custo"}</DialogTitle>
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
          <div className="space-y-2">
            <Label htmlFor="parentId">Centro de custo pai</Label>
            <Select name="parentId" defaultValue={centro?.parentId ?? SEM_PAI}>
              <SelectTrigger id="parentId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PAI}>Nenhum (raiz)</SelectItem>
                {opcoesFiltradas.map((opcao) => (
                  <SelectItem key={opcao.id} value={opcao.id}>
                    {opcao.codigo} · {opcao.nome}
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
