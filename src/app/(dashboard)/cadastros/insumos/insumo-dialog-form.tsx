"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarInsumoAction, atualizarInsumoAction, type FormState } from "./actions";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

type Insumo = {
  id: string;
  nome: string;
  unidade: string;
  custoUnitario: number;
};

const ESTADO_INICIAL: FormState = {};

export function InsumoDialogForm({ insumo }: { insumo?: Insumo }) {
  const action = insumo ? atualizarInsumoAction : criarInsumoAction;
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(action, ESTADO_INICIAL);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant={insumo ? "outline" : "default"} size={insumo ? "sm" : "default"} />}>
        {insumo ? "Editar" : "Novo insumo"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{insumo ? "Editar insumo" : "Novo insumo"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {insumo ? <input type="hidden" name="id" value={insumo.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={insumo?.nome} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="unidade">Unidade</Label>
              <Input id="unidade" name="unidade" placeholder="un" defaultValue={insumo?.unidade} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custoUnitario">Custo unitário (R$)</Label>
              <Input
                id="custoUnitario"
                name="custoUnitario"
                type="number"
                min="0"
                step="0.0001"
                defaultValue={insumo?.custoUnitario}
                required
              />
            </div>
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
