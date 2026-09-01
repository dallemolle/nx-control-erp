"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TipoTitulo } from "@prisma/client";
import { renegociarParcelaAction } from "./actions";

type NovaParcela = { dataVencimento: string; valorOriginal: string };

export function RenegociarDialog({
  tipo,
  parcelaId,
  aberto,
  onOpenChange,
}: {
  tipo: TipoTitulo;
  parcelaId: string | null;
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const [novasParcelas, setNovasParcelas] = useState<NovaParcela[]>([{ dataVencimento: "", valorOriginal: "" }]);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciarTransicao] = useTransition();

  function confirmar() {
    if (!parcelaId) return;
    iniciarTransicao(async () => {
      const resultado = await renegociarParcelaAction(tipo, parcelaId, novasParcelas);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renegociar parcela</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {novasParcelas.map((parcela, indice) => (
            <div key={indice} className="flex gap-2">
              <Input
                type="date"
                value={parcela.dataVencimento}
                onChange={(e) =>
                  setNovasParcelas((atual) =>
                    atual.map((p, i) => (i === indice ? { ...p, dataVencimento: e.target.value } : p)),
                  )
                }
              />
              <Input
                type="number"
                step="0.01"
                placeholder="Valor"
                value={parcela.valorOriginal}
                onChange={(e) =>
                  setNovasParcelas((atual) =>
                    atual.map((p, i) => (i === indice ? { ...p, valorOriginal: e.target.value } : p)),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setNovasParcelas((atual) => [...atual, { dataVencimento: "", valorOriginal: "" }])}
          >
            Adicionar nova parcela
          </Button>
          {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
          <Button type="button" className="w-full" disabled={pendente} onClick={confirmar}>
            {pendente ? "Renegociando..." : "Confirmar renegociação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
