"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { atualizarMarcaAction, restaurarTemaAction, type FormState } from "./actions";

function CampoImagem({
  nome,
  rotulo,
  dica,
  aceita,
  urlAtual,
  fundoEscuro = false,
}: {
  nome: string;
  rotulo: string;
  dica: string;
  aceita: string;
  urlAtual: string | null;
  fundoEscuro?: boolean;
}) {
  const remover = `remover${nome[0].toUpperCase()}${nome.slice(1)}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={`marca-${nome}`}>{rotulo}</Label>
      <div className="flex items-center gap-3">
        {urlAtual ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={urlAtual}
            alt=""
            className={`size-10 shrink-0 rounded object-contain p-1 ${fundoEscuro ? "bg-neutral-800" : "bg-white"} border`}
          />
        ) : null}
        <Input id={`marca-${nome}`} name={nome} type="file" accept={aceita} />
      </div>
      <p className="text-xs text-muted-foreground">{dica}</p>
      {urlAtual ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={remover} value="true" />
          Remover
        </label>
      ) : null}
    </div>
  );
}

export function MarcaForm({
  empresaId,
  logoUrl,
  logoEscuroUrl,
  faviconUrl,
}: {
  empresaId: string;
  logoUrl: string | null;
  logoEscuroUrl: string | null;
  faviconUrl: string | null;
}) {
  const [estado, acao, pendente] = useActionState<FormState, FormData>(atualizarMarcaAction, {});
  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="empresaId" value={empresaId} />
      <div className="grid gap-4 md:grid-cols-3">
        <CampoImagem
          nome="logo"
          rotulo="Logo para fundo claro"
          dica="PNG, JPG, SVG ou WebP, até 1 MB."
          aceita="image/png,image/jpeg,image/svg+xml,image/webp"
          urlAtual={logoUrl}
        />
        <CampoImagem
          nome="logoEscuro"
          rotulo="Logo para fundo escuro"
          dica="Usado quando a barra lateral é escura."
          aceita="image/png,image/jpeg,image/svg+xml,image/webp"
          urlAtual={logoEscuroUrl}
          fundoEscuro
        />
        <CampoImagem
          nome="favicon"
          rotulo="Favicon"
          dica="Ícone da aba do navegador: PNG, SVG ou ICO."
          aceita="image/png,image/svg+xml,image/x-icon,.ico"
          urlAtual={faviconUrl}
        />
      </div>
      {estado.erro ? <p className="text-sm text-destructive">{estado.erro}</p> : null}
      {estado.sucesso ? <p className="text-sm">Marca atualizada.</p> : null}
      <Button type="submit" disabled={pendente}>
        {pendente ? "Salvando..." : "Salvar marca"}
      </Button>
    </form>
  );
}

export function RestaurarTemaForm({ empresaId }: { empresaId: string }) {
  const [estado, acao, pendente] = useActionState<FormState, FormData>(restaurarTemaAction, {});
  return (
    <form
      action={acao}
      onSubmit={(evento) => {
        if (!window.confirm("Voltar ao visual padrão do sistema? Os logos continuam.")) evento.preventDefault();
      }}
    >
      <input type="hidden" name="empresaId" value={empresaId} />
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? "Restaurando..." : "Restaurar padrão"}
      </Button>
      {estado.erro ? <p className="mt-1 text-sm text-destructive">{estado.erro}</p> : null}
    </form>
  );
}
