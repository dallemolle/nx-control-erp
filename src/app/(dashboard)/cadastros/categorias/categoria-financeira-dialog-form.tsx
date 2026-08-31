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
import { TIPO_CATEGORIA_FINANCEIRA } from "@/lib/schemas/enums";
import {
  criarCategoriaFinanceiraAction,
  atualizarCategoriaFinanceiraAction,
  type FormState,
} from "./actions";

type CategoriaFinanceira = {
  id: string;
  nome: string;
  tipo: (typeof TIPO_CATEGORIA_FINANCEIRA)[number];
  parentId: string | null;
};

const ESTADO_INICIAL: FormState = {};
const SEM_PAI = "__raiz__";

export function CategoriaFinanceiraDialogForm({
  categoria,
  opcoesPai,
}: {
  categoria?: CategoriaFinanceira;
  opcoesPai: CategoriaFinanceira[];
}) {
  const [aberto, setAberto] = useState(false);
  const action = categoria ? atualizarCategoriaFinanceiraAction : criarCategoriaFinanceiraAction;
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  const opcoesFiltradas = opcoesPai.filter((opcao) => opcao.id !== categoria?.id);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={categoria ? "outline" : "default"} size={categoria ? "sm" : "default"} />}
      >
        {categoria ? "Editar" : "Nova categoria financeira"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{categoria ? "Editar categoria financeira" : "Nova categoria financeira"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {categoria ? <input type="hidden" name="id" value={categoria.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={categoria?.nome} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo</Label>
            <Select name="tipo" defaultValue={categoria?.tipo ?? "RECEITA"}>
              <SelectTrigger id="tipo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPO_CATEGORIA_FINANCEIRA.map((opcao) => (
                  <SelectItem key={opcao} value={opcao}>
                    {opcao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="parentId">Categoria pai</Label>
            <Select name="parentId" defaultValue={categoria?.parentId ?? SEM_PAI}>
              <SelectTrigger id="parentId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PAI}>Nenhuma (raiz)</SelectItem>
                {opcoesFiltradas.map((opcao) => (
                  <SelectItem key={opcao.id} value={opcao.id}>
                    {opcao.nome}
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
