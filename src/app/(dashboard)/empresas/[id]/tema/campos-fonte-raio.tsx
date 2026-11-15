"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { pilhaDaFonte, tipoDaPilha, type FonteTema, type TipoFonte } from "@/lib/tema/editor";

const ROTULO = { texto: "Fonte do texto", titulos: "Fonte dos títulos" } as const;

/** Fonte do Google + sans/serif (pilha montada sozinha) ou pilha avançada; vazio = fonte padrão. */
export function CamposFonte({
  grupo,
  fonte,
  onChange,
}: {
  grupo: "texto" | "titulos";
  fonte: FonteTema | undefined;
  onChange: (fonte: FonteTema | undefined) => void;
}) {
  const id = useId();
  const google = fonte?.google?.[0] ?? "";
  const tipo = fonte ? tipoDaPilha(fonte.pilha) : "sans";
  const montar = (nome: string, novoTipo: TipoFonte) =>
    onChange(nome.trim() ? { pilha: pilhaDaFonte(nome.trim(), novoTipo), google: [nome.trim()] } : undefined);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{ROTULO[grupo]}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          aria-label={`${ROTULO[grupo]}: nome no Google Fonts`}
          placeholder="Nome no Google Fonts (vazio = padrão)"
          value={google}
          className="h-8 min-w-48 flex-1"
          onChange={(e) => montar(e.target.value, tipo)}
        />
        <select
          aria-label={`${ROTULO[grupo]}: tipo`}
          value={tipo}
          disabled={!fonte}
          onChange={(e) => fonte && google && montar(google, e.target.value as TipoFonte)}
          className="h-8 rounded-lg border bg-transparent px-2 text-sm"
        >
          <option value="sans">Sem serifa</option>
          <option value="serif">Com serifa</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        Se o nome não existir no Google Fonts, vale a fonte alternativa da pilha.
      </p>
      {fonte ? (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">Pilha avançada</summary>
          <Input
            aria-label={`${ROTULO[grupo]}: pilha completa`}
            value={fonte.pilha}
            spellCheck={false}
            className="mt-1 h-8 font-mono text-xs"
            onChange={(e) => onChange({ ...fonte, pilha: e.target.value })}
          />
        </details>
      ) : null}
    </fieldset>
  );
}

function emPx(raio: string): number {
  const numero = parseFloat(raio);
  return raio.endsWith("rem") ? numero * 16 : numero;
}

/** Raio de 0 a 32px; "Automático" = raio padrão do sistema. */
export function CampoRaio({ raio, onChange }: { raio: string | undefined; onChange: (px: number | undefined) => void }) {
  const px = raio ? emPx(raio) : 10;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Arredondamento dos cantos</legend>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={32}
          step={1}
          value={px}
          disabled={raio === undefined}
          aria-label="Raio dos cantos em pixels"
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1"
        />
        <span className="w-12 text-right font-mono text-xs">{raio === undefined ? "padrão" : `${px}px`}</span>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={raio === undefined} onChange={(e) => onChange(e.target.checked ? undefined : px)} />
        Automático (padrão do sistema)
      </label>
    </fieldset>
  );
}
