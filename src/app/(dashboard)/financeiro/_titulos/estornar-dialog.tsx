"use client";
// Espelhado na ajuda (src/ajuda/_titulos/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TipoTitulo } from "@prisma/client";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { estornarBaixaAction } from "./actions";
import type { BaixaDaParcela } from "./titulos-para-cliente";

export function EstornarDialog({
  tipo,
  baixa,
  onOpenChange,
}: {
  tipo: TipoTitulo;
  baixa: BaixaDaParcela | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string>();
  const [pendente, iniciarTransicao] = useTransition();

  function mudarAbertura(aberto: boolean) {
    if (!aberto) {
      setMotivo("");
      setErro(undefined);
    }
    onOpenChange(aberto);
  }

  function confirmar() {
    if (!baixa) return;
    iniciarTransicao(async () => {
      const resultado = await estornarBaixaAction(tipo, baixa.id, motivo);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      mudarAbertura(false);
    });
  }

  return (
    <Dialog open={baixa !== null} onOpenChange={mudarAbertura}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Estornar baixa</DialogTitle>
        </DialogHeader>
        {baixa && (
          <div className="space-y-4 text-sm">
            <p>{`Baixa de ${formatarData(baixa.data)} · ${baixa.conta} · ${formatarMoeda(baixa.valorPago)}`}</p>
            <p className="text-muted-foreground">
              {`O lançamento sai da conta ${baixa.conta} e a parcela volta a ficar em aberto. ` +
                "A baixa continua no histórico como estornada."}
            </p>
            <div className="space-y-2">
              <Label htmlFor="motivo-estorno">Motivo</Label>
              <Input
                id="motivo-estorno"
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                placeholder="Ex.: lançada na conta errada"
              />
            </div>
            {erro ? (
              <p className="text-sm text-destructive" role="alert">
                {erro}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={pendente}
                onClick={() => mudarAbertura(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="flex-1"
                disabled={pendente || motivo.trim().length < 3}
                onClick={confirmar}
              >
                {pendente ? "Estornando..." : "Estornar baixa"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
