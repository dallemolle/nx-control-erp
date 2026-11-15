"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { aplicarTemaAction, validarTemaAction, type EstadoValidacao, type FormState } from "./actions";
import { PreviaDoTema } from "./previa-tema";

const CLASSE_TEXTAREA =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Validar (sem gravar) → erros, avisos e prévia → Aplicar. */
export function ImportarTemaForm({
  empresaId,
  logoUrl,
  logoEscuroUrl,
}: {
  empresaId: string;
  logoUrl: string | null;
  logoEscuroUrl: string | null;
}) {
  const [validacao, validar, validando] = useActionState<EstadoValidacao, FormData>(validarTemaAction, {});
  const [aplicacao, aplicar, aplicando] = useActionState<FormState, FormData>(aplicarTemaAction, {});
  const [confirmado, setConfirmado] = useState(false);
  const avisos = validacao.avisos ?? [];
  const podeAplicar = validacao.previa && (avisos.length === 0 || confirmado);

  return (
    <div className="space-y-4">
      <form action={validar} className="space-y-3" onSubmit={() => setConfirmado(false)}>
        <div className="space-y-2">
          <Label htmlFor="arquivo-tema">Arquivo do tema (.json)</Label>
          <Input id="arquivo-tema" name="arquivo" type="file" accept="application/json,.json" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="texto-tema">Ou cole o JSON</Label>
          <textarea id="texto-tema" name="texto" rows={6} className={CLASSE_TEXTAREA} spellCheck={false} />
        </div>
        <Button type="submit" variant="outline" disabled={validando}>
          {validando ? "Validando..." : "Validar"}
        </Button>
      </form>

      {validacao.erros?.length ? (
        <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
          <p className="font-medium">O tema não pode ser aplicado:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {validacao.erros.map((erro) => (
              <li key={erro} className="break-words">
                {erro}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {validacao.previa ? (
        <div className="space-y-3">
          <p className="text-sm">
            Tema <strong>{validacao.previa.nome}</strong> válido.
          </p>
          {avisos.length > 0 ? (
            <div className="rounded-lg border border-amber-500/50 p-3 text-sm">
              <p className="font-medium">Avisos de contraste (o tema pode ser aplicado mesmo assim):</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {avisos.map((aviso) => (
                  <li key={aviso} className="break-words">
                    {aviso}
                  </li>
                ))}
              </ul>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
                Aplicar mesmo com os avisos
              </label>
            </div>
          ) : null}
          <PreviaDoTema previa={validacao.previa} logoUrl={logoUrl} logoEscuroUrl={logoEscuroUrl} />
          <form action={aplicar}>
            <input type="hidden" name="empresaId" value={empresaId} />
            <input type="hidden" name="texto" value={validacao.texto ?? ""} />
            <input type="hidden" name="confirmarAvisos" value={confirmado ? "true" : "false"} />
            <Button type="submit" disabled={!podeAplicar || aplicando}>
              {aplicando ? "Aplicando..." : "Aplicar tema"}
            </Button>
          </form>
        </div>
      ) : null}

      {aplicacao.erro ? <p className="text-sm whitespace-pre-line text-destructive">{aplicacao.erro}</p> : null}
      {aplicacao.sucesso ? <p className="text-sm">Tema aplicado. As telas do painel já usam as cores novas.</p> : null}
    </div>
  );
}
