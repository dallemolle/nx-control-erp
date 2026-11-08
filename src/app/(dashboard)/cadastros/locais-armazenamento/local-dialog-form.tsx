"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROTULOS_TIPO_LOCAL, TIPO_LOCAL_ARMAZENAMENTO } from "@/lib/schemas/enums";
import { criarLocalAction, atualizarLocalAction, type FormState } from "./actions";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

type Local = {
  id: string;
  nome: string;
  tipo: (typeof TIPO_LOCAL_ARMAZENAMENTO)[number];
  temperatura: string | null;
  capacidadeKg: number | null;
};

const ESTADO_INICIAL: FormState = {};

export function LocalDialogForm({ local }: { local?: Local }) {
  const action = local ? atualizarLocalAction : criarLocalAction;
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(action, ESTADO_INICIAL);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant={local ? "outline" : "default"} size={local ? "sm" : "default"} />}>
        {local ? "Editar" : "Novo local"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{local ? "Editar local" : "Novo local de armazenamento"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {local ? <input type="hidden" name="id" value={local.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" placeholder="Câmara fria 01" defaultValue={local?.nome} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo</Label>
            <Select name="tipo" defaultValue={local?.tipo ?? "CAMARA_FRIA"}>
              <SelectTrigger id="tipo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPO_LOCAL_ARMAZENAMENTO.map((opcao) => (
                  <SelectItem key={opcao} value={opcao}>
                    {ROTULOS_TIPO_LOCAL[opcao]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="temperatura">Temperatura</Label>
              <Input
                id="temperatura"
                name="temperatura"
                placeholder="-18 °C"
                defaultValue={local?.temperatura ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacidadeKg">Capacidade (kg)</Label>
              <Input
                id="capacidadeKg"
                name="capacidadeKg"
                type="number"
                min="0"
                step="0.001"
                defaultValue={local?.capacidadeKg ?? ""}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            A capacidade é opcional e serve para mostrar a ocupação no relatório de estoque.
          </p>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
