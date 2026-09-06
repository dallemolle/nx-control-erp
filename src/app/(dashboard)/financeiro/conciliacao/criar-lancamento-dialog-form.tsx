// src/app/(dashboard)/financeiro/conciliacao/criar-lancamento-dialog-form.tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEM_VALOR } from "@/lib/schemas/enums";
import { criarLancamentoDaLinhaAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

export function CriarLancamentoDialogForm({
  linhaExtratoId,
  categorias,
}: {
  linhaExtratoId: string;
  categorias: { id: string; nome: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pendente] = useActionState(criarLancamentoDaLinhaAction, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        Criar lançamento
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar lançamento a partir desta linha</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="linhaExtratoId" value={linhaExtratoId} />
          <div className="space-y-2">
            <Label htmlFor={`descricao-${linhaExtratoId}`}>Descrição</Label>
            <Input id={`descricao-${linhaExtratoId}`} name="descricao" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`categoriaFinanceiraId-${linhaExtratoId}`}>Categoria financeira</Label>
            <Select name="categoriaFinanceiraId" defaultValue={SEM_VALOR}>
              <SelectTrigger id={`categoriaFinanceiraId-${linhaExtratoId}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhuma</SelectItem>
                {categorias.map((categoria) => (
                  <SelectItem key={categoria.id} value={categoria.id}>
                    {categoria.nome}
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
