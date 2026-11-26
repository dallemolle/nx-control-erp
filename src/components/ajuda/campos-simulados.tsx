"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import { ChevronDownIcon, XIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Alvo destacado no passo atual (`null` = nenhum, como no "E depois?"). */
export const DestaqueContext = createContext<string | null>(null);

export function Alvo({ nome, className, children }: { nome: string; className?: string; children: ReactNode }) {
  const ativo = useContext(DestaqueContext) === nome;
  return (
    <div
      data-alvo={nome}
      data-destacado={ativo ? "true" : undefined}
      className={cn(
        "scroll-m-3 rounded-lg transition-[box-shadow,background-color] duration-200 motion-reduce:transition-none",
        ativo && "bg-primary/5 ring-2 ring-primary ring-offset-2 ring-offset-background",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Mesmo visual do `Input`/`SelectTrigger` de src/components/ui, sem ser campo de verdade. */
const CAIXA =
  "flex h-8 w-full min-w-0 items-center rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30";

function Envoltorio({
  alvo,
  rotulo,
  compacto,
  className,
  children,
}: {
  alvo?: string;
  rotulo?: string;
  compacto?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const conteudo = (
    <>
      {rotulo &&
        (compacto ? (
          <span className="text-xs text-muted-foreground">{rotulo}</span>
        ) : (
          <span className="text-sm leading-none font-medium">{rotulo}</span>
        ))}
      {children}
    </>
  );
  const classes = cn(compacto ? "flex flex-col gap-1" : "space-y-2", className);
  return alvo ? (
    <Alvo nome={alvo} className={classes}>
      {conteudo}
    </Alvo>
  ) : (
    <div className={classes}>{conteudo}</div>
  );
}

export function CampoSimulado({
  alvo,
  rotulo,
  valor,
  placeholder,
  compacto,
  className,
}: {
  alvo?: string;
  rotulo?: string;
  valor?: string;
  placeholder?: string;
  compacto?: boolean;
  className?: string;
}) {
  return (
    <Envoltorio alvo={alvo} rotulo={rotulo} compacto={compacto} className={className}>
      <div className={cn(CAIXA, !valor && "text-muted-foreground")}>
        <span className="truncate">{valor || placeholder || " "}</span>
      </div>
    </Envoltorio>
  );
}

export function SelectSimulado({
  alvo,
  rotulo,
  valor,
  compacto,
  className,
}: {
  alvo?: string;
  rotulo?: string;
  valor?: string;
  compacto?: boolean;
  className?: string;
}) {
  return (
    <Envoltorio alvo={alvo} rotulo={rotulo} compacto={compacto} className={className}>
      <div className={cn(CAIXA, "justify-between gap-1.5 pr-2")}>
        <span className="truncate">{valor || " "}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </div>
    </Envoltorio>
  );
}

export function BotaoSimulado({
  alvo,
  variant,
  size,
  largo,
  disabled,
  className,
  children,
}: VariantProps<typeof buttonVariants> & {
  alvo?: string;
  /** Aparência de botão desabilitado. */
  disabled?: boolean;
  /** Ocupa a largura toda, como os botões de enviar dos formulários. */
  largo?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const botao = (
    <span
      aria-disabled={disabled || undefined}
      className={cn(buttonVariants({ variant, size }), largo && "w-full", disabled && "opacity-50", className)}
    >
      {children}
    </span>
  );
  return alvo ? (
    <Alvo nome={alvo} className={largo ? "flex w-full" : "inline-flex"}>
      {botao}
    </Alvo>
  ) : (
    botao
  );
}

/** Imita o `DialogContent` (sem portal nem overlay) para mostrar formulários dentro da cena. */
export function JanelaSimulada({
  titulo,
  className,
  children,
}: {
  titulo: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto grid w-full max-w-sm gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-md",
        "ring-1 ring-foreground/10",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-heading text-base leading-none font-medium">{titulo}</span>
        <XIcon className="size-4 text-muted-foreground" />
      </div>
      {children}
    </div>
  );
}
