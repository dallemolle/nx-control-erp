"use client";

import { useState, type ReactNode } from "react";
import { CircleHelpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { carregarAjuda, temAjuda, tituloDaAjuda } from "@/ajuda/registro";
import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { AjudaConteudo } from "./ajuda-dialog";

type Estado = { tipo: "carregando" } | { tipo: "pronto"; definicao: DefinicaoAjuda } | { tipo: "erro" };

/**
 * Ícone (ou link) que abre a ajuda de uma tela. Não renderiza nada para tela sem ajuda.
 * O conteúdo é baixado só na primeira abertura.
 */
export function BotaoAjuda({
  tela,
  roteiroInicial,
  gatilho = "icone",
  children,
}: {
  tela: string;
  roteiroInicial?: string;
  gatilho?: "icone" | "link";
  children?: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });

  if (!temAjuda(tela)) return null;
  const titulo = tituloDaAjuda(tela);

  function aoAbrirOuFechar(novo: boolean) {
    setAberto(novo);
    if (novo && estado.tipo !== "pronto") {
      setEstado({ tipo: "carregando" });
      carregarAjuda(tela).then(
        (definicao) => setEstado({ tipo: "pronto", definicao }),
        () => setEstado({ tipo: "erro" }),
      );
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={aoAbrirOuFechar}>
      {gatilho === "icone" ? (
        <DialogTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Ajuda: ${titulo}`} title="Como usar esta tela" />}
        >
          <CircleHelpIcon className="text-muted-foreground" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="link" className="h-auto p-0" />}>{children}</DialogTrigger>
      )}
      <DialogContent
        className={
          "flex h-dvh max-w-full flex-col rounded-none sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-xl"
        }
      >
        {estado.tipo === "pronto" ? (
          <AjudaConteudo definicao={estado.definicao} roteiroInicial={roteiroInicial} />
        ) : (
          <>
            <DialogTitle>Ajuda — {titulo}</DialogTitle>
            {estado.tipo === "carregando" ? (
              <div className="space-y-3" aria-busy="true">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                <div className="h-40 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
              </div>
            ) : (
              <p className="text-muted-foreground">
                Não foi possível carregar a ajuda. Recarregue a página.{" "}
                <a href="/ajuda/passo-a-passo" className="text-primary underline underline-offset-2">
                  Abrir o Passo a passo
                </a>
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
