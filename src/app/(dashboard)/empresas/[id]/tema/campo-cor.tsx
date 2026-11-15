"use client";

import { useId, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { HERANCA, ROTULOS } from "@/lib/tema/editor";
import type { PapelCor, ParContraste } from "@/lib/tema/validar";

const DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function Selo({ par }: { par: ParContraste }) {
  const cor = par.ok
    ? "text-muted-foreground"
    : par.nivel === "essencial"
      ? "text-destructive font-medium"
      : "text-amber-700 dark:text-amber-400 font-medium";
  return (
    <span className={`text-xs ${cor}`} title={`Contraste com ${ROTULOS[par.fundo]}`}>
      {par.ok ? "✓" : par.nivel === "essencial" ? "✕" : "⚠"} {DECIMAL.format(par.razao)}:1 com {ROTULOS[par.fundo]}
    </span>
  );
}

/** Seletor de cor de um papel: amostra nativa + hex digitado + selo de contraste; opcional tem "Automático". */
export function CampoCor({
  papel,
  valor,
  efetivo,
  opcional,
  pares,
  onChange,
}: {
  papel: PapelCor;
  valor: string | undefined;
  efetivo: string;
  opcional: boolean;
  pares: ParContraste[];
  onChange: (valor: string | undefined) => void;
}) {
  const id = useId();
  const dicaId = `${id}-dica`;
  const automatico = valor === undefined;
  const atual = valor ?? efetivo;
  const [texto, setTexto] = useState(atual);
  const [atualAnterior, setAtualAnterior] = useState(atual);
  if (atual !== atualAnterior) {
    setAtualAnterior(atual);
    setTexto(atual);
  }
  const textoValido = /^#[0-9a-fA-F]{6}$/.test(texto);
  const meus = pares.filter((par) => par.texto === papel);
  const problema = meus.find((par) => !par.ok);

  return (
    <div className="space-y-1" data-papel={papel} data-problema={problema ? problema.nivel : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="min-w-40 flex-1 text-sm">
          {ROTULOS[papel]}
        </label>
        <input
          type="color"
          aria-label={`${ROTULOS[papel]}: escolher cor`}
          value={valor ?? efetivo}
          disabled={automatico}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 shrink-0 cursor-pointer rounded border bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Input
          id={id}
          value={texto}
          disabled={automatico}
          aria-invalid={!textoValido}
          aria-describedby={!automatico && !textoValido ? dicaId : undefined}
          spellCheck={false}
          className="h-8 w-24 font-mono text-xs"
          onChange={(e) => {
            setTexto(e.target.value);
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value);
          }}
        />
      </div>
      {!automatico && !textoValido ? <p id={dicaId} className="text-xs text-destructive">Use #RRGGBB</p> : null}
      {opcional ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={automatico} onChange={(e) => onChange(e.target.checked ? undefined : efetivo)} />
          Automático (herda de {HERANCA[papel]})
        </label>
      ) : null}
      {meus.length > 0 ? (
        <div className="flex flex-wrap gap-x-3">
          {meus.map((par) => (
            <Selo key={par.fundo} par={par} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Grupo recolhível de campos. */
export function Grupo({ titulo, aberto = false, children }: { titulo: string; aberto?: boolean; children: ReactNode }) {
  return (
    <details open={aberto} className="group rounded-lg border">
      <summary className="cursor-pointer list-none px-3 [&::-webkit-details-marker]:hidden py-2 text-sm font-medium select-none">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
        {titulo}
      </summary>
      <div className="space-y-4 border-t px-3 py-3">{children}</div>
    </details>
  );
}
