"use client";
// Espelhado na ajuda (src/ajuda/tesouraria/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Editavel } from "@/lib/lancamentoEditavel";
import { excluirLancamentoAction } from "./actions";

export function ExcluirLancamentoDialog({
  editavel,
  aberto,
  onOpenChange,
}: {
  editavel: Editavel;
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string>();
  const [pendente, iniciarTransicao] = useTransition();
  const ehTransferencia = editavel.tipo === "transferencia";

  function mudarAbertura(novo: boolean) {
    if (!novo) {
      setMotivo("");
      setErro(undefined);
    }
    onOpenChange(novo);
  }

  function confirmar() {
    const id = editavel.tipo === "transferencia" ? editavel.idParaExcluir : editavel.id;
    iniciarTransicao(async () => {
      const resultado = await excluirLancamentoAction(id, motivo);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      mudarAbertura(false);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={mudarAbertura}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ehTransferencia ? "Excluir transferência" : "Excluir lançamento"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p>{editavel.resumo}</p>
          <p className="text-muted-foreground">
            {ehTransferencia
              ? "Os dois lados da transferência saem das contas. A exclusão fica registrada na Auditoria, com o motivo."
              : "O lançamento sai da conta e dos relatórios. A exclusão fica registrada na Auditoria, com o motivo."}
          </p>
          <div className="space-y-2">
            <Label htmlFor="motivo-exclusao">Motivo</Label>
            <Input
              id="motivo-exclusao"
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Ex.: valor digitado errado"
            />
          </div>
          {erro ? (
            <p className="text-sm text-destructive" role="alert">
              {erro}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={pendente} onClick={() => mudarAbertura(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              disabled={pendente || motivo.trim().length === 0}
              onClick={confirmar}
            >
              {pendente ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
