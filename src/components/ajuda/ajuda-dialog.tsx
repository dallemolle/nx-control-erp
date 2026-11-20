"use client";

import { useState } from "react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { Simulador } from "./simulador";

/** Conteúdo do popup de ajuda de uma tela. Fica dentro de um `DialogContent`. */
export function AjudaConteudo({ definicao, roteiroInicial }: { definicao: DefinicaoAjuda; roteiroInicial?: string }) {
  const inicial = definicao.roteiros.some((r) => r.id === roteiroInicial) ? roteiroInicial : undefined;
  const [roteiroId, setRoteiroId] = useState<string | null>(inicial ?? null);
  const roteiro = definicao.roteiros.find((r) => r.id === roteiroId);

  return (
    <>
      <DialogHeader className="pr-8">
        <DialogTitle>Ajuda — {definicao.tituloTela}</DialogTitle>
        <DialogDescription>{definicao.resumo}</DialogDescription>
      </DialogHeader>

      <nav aria-label="Roteiros" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[{ id: null, titulo: "Início" }, ...definicao.roteiros].map((item) => (
          <button
            key={item.id ?? "inicio"}
            type="button"
            aria-pressed={roteiroId === item.id}
            onClick={() => setRoteiroId(item.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs whitespace-nowrap transition-colors",
              "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              roteiroId === item.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {item.titulo}
          </button>
        ))}
      </nav>

      {roteiro ? (
        <Simulador key={roteiro.id} definicao={definicao} roteiro={roteiro} aoAbrirRoteiro={setRoteiroId} />
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <p className="text-muted-foreground">
            Escolha o que você quer fazer. Cada roteiro mostra a tela passo a passo, com um exemplo preenchido.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {definicao.roteiros.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setRoteiroId(r.id)}
                  className={cn(
                    "h-full w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted",
                    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  )}
                >
                  <span className="block font-medium">{r.titulo}</span>
                  <span className="block text-muted-foreground">{r.quandoUsar}</span>
                </button>
              </li>
            ))}
          </ul>
          {definicao.observacoes?.map((texto) => (
            <p key={texto} className="text-xs text-muted-foreground">
              {texto}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
