"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, LightbulbIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ehEDepois, limitarIndice, valoresAte } from "@/ajuda/roteiro";
import type { DefinicaoAjuda, Roteiro } from "@/ajuda/tipos";
import { DestaqueContext } from "./campos-simulados";

/** Um roteiro aberto: cena com destaque, texto do passo e navegação. Monte com `key={roteiro.id}`. */
export function Simulador({
  definicao,
  roteiro,
  aoAbrirRoteiro,
}: {
  definicao: DefinicaoAjuda;
  roteiro: Roteiro;
  aoAbrirRoteiro: (id: string) => void;
}) {
  const [indice, setIndice] = useState(0);
  const area = useRef<HTMLDivElement>(null);

  const fim = ehEDepois(roteiro, indice);
  const passo = fim ? null : roteiro.passos[indice];
  const cenaAtual = (passo ?? roteiro.passos[roteiro.passos.length - 1]).cena;
  const Cena = definicao.cenas[cenaAtual];
  const valores = valoresAte(roteiro, indice);
  const proximo = roteiro.eDepois.proximoRoteiro
    ? definicao.roteiros.find((r) => r.id === roteiro.eDepois.proximoRoteiro)
    : undefined;
  const total = roteiro.passos.length;

  function ir(novo: number) {
    setIndice(limitarIndice(roteiro, novo));
  }

  // Leva o campo destacado para a área visível da cena.
  useEffect(() => {
    if (!passo) return;
    const elemento = area.current?.querySelector(`[data-alvo="${CSS.escape(passo.alvo)}"]`);
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    elemento?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduzir ? "auto" : "smooth" });
  }, [passo]);

  // Setas do teclado enquanto o roteiro está aberto.
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "ArrowRight") {
        evento.preventDefault();
        setIndice((atual) => limitarIndice(roteiro, atual + 1));
      } else if (evento.key === "ArrowLeft") {
        evento.preventDefault();
        setIndice((atual) => limitarIndice(roteiro, atual - 1));
      }
    }
    // Fase de captura: o diálogo (Base UI) interrompe a propagação do keydown antes de chegar ao document.
    document.addEventListener("keydown", aoTeclar, true);
    return () => document.removeEventListener("keydown", aoTeclar, true);
  }, [roteiro]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="space-y-1">
        <p className="text-sm">
          <span className="font-medium">Quando usar: </span>
          {roteiro.quandoUsar}
        </p>
        {roteiro.quemPode && <p className="text-xs text-muted-foreground">{roteiro.quemPode}</p>}
      </div>

      <div
        ref={area}
        aria-hidden="true"
        inert
        className="min-h-48 flex-1 overflow-auto rounded-lg border bg-background p-4 select-none"
      >
        <DestaqueContext value={passo?.alvo ?? null}>
          <div key={cenaAtual} className="animate-in duration-200 fade-in-0 motion-reduce:animate-none">
            {Cena ? <Cena tipo={definicao.tipo} valores={valores} /> : null}
          </div>
        </DestaqueContext>
      </div>

      <div aria-live="polite" className="space-y-1 rounded-lg border bg-muted/40 p-3">
        {passo ? (
          <>
            <p className="text-xs text-muted-foreground">
              Passo {indice + 1} de {total}
            </p>
            <p className="font-medium">{passo.instrucao}</p>
            {passo.explicacao && <p className="text-muted-foreground">{passo.explicacao}</p>}
            {passo.dica && (
              <p className="mt-2 flex gap-2 rounded-md bg-primary/10 p-2 text-xs">
                <LightbulbIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{passo.dica}</span>
              </p>
            )}
          </>
        ) : (
          <>
            <p className="font-medium">E depois?</p>
            <p className="text-muted-foreground">{roteiro.eDepois.texto}</p>
            {proximo && (
              <Button variant="outline" size="sm" className="mt-2" onClick={() => aoAbrirRoteiro(proximo.id)}>
                Próximo roteiro: {proximo.titulo}
              </Button>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => ir(indice - 1)} disabled={indice === 0}>
          <ChevronLeftIcon aria-hidden="true" />
          Anterior
        </Button>
        <span className="text-xs text-muted-foreground">{fim ? "Fim" : `${indice + 1} de ${total}`}</span>
        {fim ? (
          <Button variant="outline" size="sm" onClick={() => ir(0)}>
            <RotateCcwIcon aria-hidden="true" />
            Recomeçar
          </Button>
        ) : (
          <Button size="sm" onClick={() => ir(indice + 1)}>
            {indice === total - 1 ? "E depois?" : "Próximo"}
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
