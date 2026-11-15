"use client";

import { useState } from "react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { temaSchema } from "@/lib/tema/schema";
import { pilhaDaFonte, tipoDaPilha, type FonteTema, type TipoFonte } from "@/lib/tema/editor";

const ROTULO = { texto: "Fonte do texto", titulos: "Fonte dos títulos" } as const;

const fonteSchema = temaSchema.shape.fontes.unwrap().shape.texto.unwrap();

/** Primeira mensagem do schema para o campo (`pilha` ou `google`), na mesma língua do validarTema. */
function erroDoCampo(fonte: FonteTema | undefined, campo: "pilha" | "google"): string | null {
  if (!fonte) return null;
  const resultado = fonteSchema.safeParse(fonte, { error: z.locales.pt().localeError });
  if (resultado.success) return null;
  return resultado.error.issues.find((i) => i.path[0] === campo)?.message ?? null;
}

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
  const googleProp = fonte?.google?.[0] ?? "";
  const [rascunho, setRascunho] = useState(googleProp);
  const [googleAnterior, setGoogleAnterior] = useState(googleProp);
  if (googleProp !== googleAnterior) {
    setGoogleAnterior(googleProp);
    // Só ressincroniza quando a mudança veio de fora (o rascunho aparado já é o valor da prop).
    if (rascunho.trim() !== googleProp) setRascunho(googleProp);
  }

  const tipo = fonte ? tipoDaPilha(fonte.pilha) : "sans";
  const erroGoogle = erroDoCampo(fonte, "google");
  const erroPilha = erroDoCampo(fonte, "pilha");

  // Painel da pilha avançada: abre sozinho quando surge um erro e nunca fecha sob o cursor.
  const [pilhaAberta, setPilhaAberta] = useState(false);
  const [havia, setHavia] = useState(erroPilha !== null);
  if ((erroPilha !== null) !== havia) {
    setHavia(erroPilha !== null);
    if (erroPilha !== null) setPilhaAberta(true);
  }

  const mudarNome = (texto: string) => {
    setRascunho(texto);
    const nome = texto.trim();
    if (nome) {
      onChange({ pilha: pilhaDaFonte(nome, tipo), google: [nome] });
    } else if (fonte && googleProp && fonte.pilha !== pilhaDaFonte(googleProp, tipo)) {
      onChange({ pilha: fonte.pilha });
    } else {
      onChange(undefined);
    }
  };

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{ROTULO[grupo]}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={`${ROTULO[grupo]}: nome no Google Fonts`}
          placeholder="Nome no Google Fonts (vazio = padrão)"
          value={rascunho}
          aria-invalid={erroGoogle !== null}
          className="h-8 min-w-48 flex-1"
          onChange={(e) => mudarNome(e.target.value)}
        />
        <select
          aria-label={`${ROTULO[grupo]}: tipo`}
          value={tipo}
          disabled={!googleProp}
          onChange={(e) =>
            googleProp && onChange({ pilha: pilhaDaFonte(googleProp, e.target.value as TipoFonte), google: [googleProp] })
          }
          className="h-8 rounded-lg border bg-transparent px-2 text-sm"
        >
          <option value="sans">Sem serifa</option>
          <option value="serif">Com serifa</option>
        </select>
      </div>
      {erroGoogle ? (
        <p className="text-xs text-destructive" data-problema="essencial">
          {erroGoogle}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Se o nome não existir no Google Fonts, vale a fonte alternativa da pilha.
      </p>
      {fonte ? (
        <details
          open={pilhaAberta || erroPilha !== null}
          onToggle={(e) => setPilhaAberta(e.currentTarget.open)}
          data-problema={erroPilha ? "essencial" : undefined}
        >
          <summary className="cursor-pointer text-xs text-muted-foreground">Pilha avançada</summary>
          <Input
            aria-label={`${ROTULO[grupo]}: pilha completa`}
            value={fonte.pilha}
            aria-invalid={erroPilha !== null}
            spellCheck={false}
            className="mt-1 h-8 font-mono text-xs"
            onChange={(e) => onChange({ ...fonte, pilha: e.target.value })}
          />
          {erroPilha ? <p className="mt-1 text-xs text-destructive">{erroPilha}</p> : null}
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
