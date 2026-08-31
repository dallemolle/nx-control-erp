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
import { TIPO_CONTA_BANCARIA } from "@/lib/schemas/enums";
import {
  criarContaBancariaAction,
  atualizarContaBancariaAction,
  type FormState,
} from "./actions";

type Banco = {
  id: string;
  codigo: string;
  nome: string;
};

type ContaBancaria = {
  id: string;
  bancoId: string;
  agencia: string;
  conta: string;
  tipo: (typeof TIPO_CONTA_BANCARIA)[number];
  moeda: string;
  saldoInicial: number;
};

const ESTADO_INICIAL: FormState = {};

export function ContaBancariaDialogForm({
  conta,
  bancos,
}: {
  conta?: ContaBancaria;
  bancos: Banco[];
}) {
  const [aberto, setAberto] = useState(false);
  const action = conta ? atualizarContaBancariaAction : criarContaBancariaAction;
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={conta ? "outline" : "default"} size={conta ? "sm" : "default"} />}
      >
        {conta ? "Editar" : "Nova conta bancária"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{conta ? "Editar conta bancária" : "Nova conta bancária"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {conta ? <input type="hidden" name="id" value={conta.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="bancoId">Banco</Label>
            <Select name="bancoId" defaultValue={conta?.bancoId}>
              <SelectTrigger id="bancoId" className="w-full">
                <SelectValue placeholder="Selecione o banco" />
              </SelectTrigger>
              <SelectContent>
                {bancos.map((banco) => (
                  <SelectItem key={banco.id} value={banco.id}>
                    {banco.codigo} · {banco.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agencia">Agência</Label>
            <Input id="agencia" name="agencia" defaultValue={conta?.agencia} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="conta">Conta</Label>
            <Input id="conta" name="conta" defaultValue={conta?.conta} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo</Label>
            <Select name="tipo" defaultValue={conta?.tipo ?? "CORRENTE"}>
              <SelectTrigger id="tipo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPO_CONTA_BANCARIA.map((opcao) => (
                  <SelectItem key={opcao} value={opcao}>
                    {opcao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="moeda">Moeda</Label>
            <Input id="moeda" name="moeda" defaultValue={conta?.moeda ?? "BRL"} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="saldoInicial">Saldo inicial</Label>
            <Input
              id="saldoInicial"
              name="saldoInicial"
              type="number"
              step="0.01"
              defaultValue={conta?.saldoInicial ?? 0}
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
