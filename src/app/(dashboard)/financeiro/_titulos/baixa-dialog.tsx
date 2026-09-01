"use client";

import { useActionState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TipoTitulo } from "@prisma/client";
import { registrarBaixaAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

export function BaixaDialog({
  tipo,
  parcelaId,
  contasBancarias,
  aberto,
  onOpenChange,
}: {
  tipo: TipoTitulo;
  parcelaId: string | null;
  contasBancarias: { id: string; nome: string }[];
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const action = registrarBaixaAction.bind(null, tipo, parcelaId ?? "");
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) onOpenChange(false);
  }, [state.sucesso, onOpenChange]);

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar baixa</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data">Data</Label>
              <Input id="data" name="data" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valorPago">Valor pago</Label>
              <Input id="valorPago" name="valorPago" type="number" step="0.01" required />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valorJuros">Juros</Label>
              <Input id="valorJuros" name="valorJuros" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valorMulta">Multa</Label>
              <Input id="valorMulta" name="valorMulta" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valorDesconto">Desconto</Label>
              <Input id="valorDesconto" name="valorDesconto" type="number" step="0.01" defaultValue="0" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contaBancariaId">Conta bancária</Label>
            <Select name="contaBancariaId">
              <SelectTrigger id="contaBancariaId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {contasBancarias.map((opcao) => (
                  <SelectItem key={opcao.id} value={opcao.id}>
                    {opcao.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Registrando..." : "Registrar baixa (fica pendente de aprovação)"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
