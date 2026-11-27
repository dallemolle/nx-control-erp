"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";
import { estornarAjusteAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

/** Estorna um ajuste errado: o movimento contrário entra na data do ajuste. */
export function EstornarAjusteDialog({ ajuste }: { ajuste: { id: string; lote: string; descricao: string } }) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(estornarAjusteAction, ESTADO_INICIAL);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Estornar</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Estornar ajuste do lote {ajuste.lote}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={ajuste.id} />
          <p className="text-sm text-muted-foreground">
            {ajuste.descricao}. O estorno desfaz o ajuste na data dele: o saldo volta como se ele não tivesse sido
            lançado, e ele sai dos totais por motivo. A linha continua na lista, marcada como estornada.
          </p>
          <div className="space-y-2">
            <Label htmlFor={`motivo-estorno-${ajuste.id}`}>Motivo</Label>
            <Input id={`motivo-estorno-${ajuste.id}`} name="motivo" required minLength={3} />
          </div>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" variant="destructive" className="w-full" disabled={pendente}>
            {pendente ? "Estornando..." : "Estornar ajuste"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
