"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { moverLoteAction, type FormState } from "./actions";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

const ESTADO_INICIAL: FormState = {};

export function MoverLoteDialog({
  lote,
  locais,
}: {
  lote: { id: string; codigo: string; localId: string };
  locais: { id: string; nome: string }[];
}) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(moverLoteAction, ESTADO_INICIAL);
  const destinos = locais.filter((l) => l.id !== lote.localId);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Mover</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover lote {lote.codigo}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="loteId" value={lote.id} />
          <p className="text-sm text-muted-foreground">O lote inteiro passa para o novo local.</p>
          <div className="space-y-2">
            <Label htmlFor={`local-${lote.id}`}>Novo local</Label>
            <Select name="localId">
              <SelectTrigger id={`local-${lote.id}`} className="w-full">
                <SelectValue placeholder="Selecione o local" />
              </SelectTrigger>
              <SelectContent>
                {destinos.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente || destinos.length === 0}>
            {pendente ? "Movendo..." : "Mover"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
