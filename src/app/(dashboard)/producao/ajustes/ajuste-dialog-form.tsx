"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MOTIVO_AJUSTE_ESTOQUE, ROTULOS_MOTIVO_AJUSTE } from "@/lib/schemas/enums";
import { criarAjusteAction, type FormState } from "./actions";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

export type LoteParaAjuste = { id: string; rotulo: string; saldoKg: number };

const ESTADO_INICIAL: FormState = {};

export function AjusteDialogForm({ lotes, hoje }: { lotes: LoteParaAjuste[]; hoje: string }) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(criarAjusteAction, ESTADO_INICIAL);
  const [sentido, setSentido] = useState<"SAIDA" | "ENTRADA">("SAIDA");
  // Saída só de lote com saldo; entrada (inventário) também em lote zerado.
  const opcoes = sentido === "SAIDA" ? lotes.filter((l) => l.saldoKg > 0) : lotes;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button />}>Novo ajuste</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo ajuste de estoque</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="sentido" value={sentido} />
          <div className="flex flex-wrap gap-4 text-sm">
            {(["SAIDA", "ENTRADA"] as const).map((valor) => (
              <label key={valor} className="flex items-center gap-2">
                <input type="radio" className="size-4" checked={sentido === valor} onChange={() => setSentido(valor)} />
                {valor === "SAIDA" ? "Saída (baixa do estoque)" : "Entrada (sobra de inventário)"}
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="loteId">Lote</Label>
            <Select name="loteId" key={sentido}>
              <SelectTrigger id="loteId" className="w-full">
                <SelectValue placeholder="Selecione o lote" />
              </SelectTrigger>
              <SelectContent>
                {opcoes.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Em ordem de validade: o primeiro vence antes.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quantidadeKg">Quantidade (kg)</Label>
              <Input id="quantidadeKg" name="quantidadeKg" type="number" min="0" step="0.001" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data">Data</Label>
              <Input id="data" name="data" type="date" defaultValue={hoje} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo</Label>
            <Select name="motivo" defaultValue={sentido === "ENTRADA" ? "INVENTARIO" : "AVARIA"} key={`motivo-${sentido}`}>
              <SelectTrigger id="motivo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOTIVO_AJUSTE_ESTOQUE.map((m) => (
                  <SelectItem key={m} value={m}>
                    {ROTULOS_MOTIVO_AJUSTE[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="observacao">Observação</Label>
            <Input id="observacao" name="observacao" />
          </div>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar ajuste"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
