"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { transferirLoteAction, type FormState } from "./actions";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

const ESTADO_INICIAL: FormState = {};
const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function TransferirLoteDialog({
  lote,
  locais,
}: {
  lote: { id: string; codigo: string; localId: string; saldoKg: number };
  locais: { id: string; nome: string }[];
}) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(transferirLoteAction, ESTADO_INICIAL);
  const destinos = locais.filter((l) => l.id !== lote.localId);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Transferir</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir lote {lote.codigo}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="loteId" value={lote.id} />
          <p className="text-sm text-muted-foreground">
            Com o saldo inteiro, o lote só muda de local. Com parte dele, a parte vira o lote {lote.codigo}/N no novo
            local (ou soma no lote desta família que já estiver lá).
          </p>
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
          <div className="space-y-2">
            <Label htmlFor={`kg-${lote.id}`}>Quantidade (kg)</Label>
            <Input
              id={`kg-${lote.id}`}
              name="quantidadeKg"
              type="number"
              step="0.001"
              min="0.001"
              max={lote.saldoKg}
              defaultValue={lote.saldoKg}
              required
            />
            <p className="text-xs text-muted-foreground">Saldo do lote: {KG.format(lote.saldoKg)} kg</p>
          </div>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente || destinos.length === 0}>
            {pendente ? "Transferindo..." : "Transferir"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
