"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarFrutaAction, atualizarFrutaAction, type FormState } from "./actions";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

type Fruta = {
  id: string;
  nome: string;
  custoPadraoKg: number;
  exigeBranqueamento: boolean;
};

const ESTADO_INICIAL: FormState = {};

export function FrutaDialogForm({ fruta }: { fruta?: Fruta }) {
  const action = fruta ? atualizarFrutaAction : criarFrutaAction;
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(action, ESTADO_INICIAL);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant={fruta ? "outline" : "default"} size={fruta ? "sm" : "default"} />}>
        {fruta ? "Editar" : "Nova fruta"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fruta ? "Editar fruta" : "Nova fruta"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {fruta ? <input type="hidden" name="id" value={fruta.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={fruta?.nome} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="custoPadraoKg">Custo-padrão do fruto próprio (R$/kg)</Label>
            <Input
              id="custoPadraoKg"
              name="custoPadraoKg"
              type="number"
              min="0"
              step="0.0001"
              defaultValue={fruta?.custoPadraoKg ?? 0}
              required
            />
            <p className="text-xs text-muted-foreground">
              Usado no custo e na margem do fruto colhido nos talhões próprios. Deixe 0 se ainda não souber.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="exigeBranqueamento"
              defaultChecked={fruta?.exigeBranqueamento ?? false}
              className="size-4"
            />
            Exige branqueamento no processamento
          </label>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
