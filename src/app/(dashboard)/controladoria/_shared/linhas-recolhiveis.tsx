"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { recuoDoNivel } from "@/lib/recuoDoNivel";

export type LinhaRecolhivel = {
  chave: string;
  paiChave: string | null;
  nivel: number;
  temFilhos: boolean;
  direto: boolean;
  nome: string;
  className?: string;
  /** As demais células da linha (TableCell), já prontas no servidor. */
  celulas: ReactNode;
};

/**
 * Linhas de um relatório em árvore (Orçamento, Fluxo por dimensão): o pai tem ▸/▾ para recolher os
 * descendentes. Recolher não muda número nenhum: o total já está na linha do pai. Começa tudo aberto.
 */
export function LinhasRecolhiveis({ linhas }: { linhas: LinhaRecolhivel[] }) {
  const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(new Set());
  const paiDe = new Map(linhas.map((linha) => [linha.chave, linha.paiChave]));
  const escondida = (linha: LinhaRecolhivel) => {
    for (let pai = linha.paiChave; pai !== null; pai = paiDe.get(pai) ?? null) {
      if (recolhidos.has(pai)) return true;
    }
    return false;
  };
  const alternar = (chave: string) =>
    setRecolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });

  return (
    <>
      {linhas
        .filter((linha) => !escondida(linha))
        .map((linha) => {
          const aberto = !recolhidos.has(linha.chave);
          return (
            <TableRow key={linha.chave} className={linha.className}>
              <TableCell
                className={linha.direto ? "text-muted-foreground" : linha.temFilhos ? "font-semibold" : "font-medium"}
              >
                <div className="flex items-center gap-1" style={recuoDoNivel(linha.nivel)}>
                  {linha.temFilhos ? (
                    <button
                      type="button"
                      onClick={() => alternar(linha.chave)}
                      aria-expanded={aberto}
                      aria-label={`${aberto ? "Recolher" : "Expandir"} ${linha.nome}`}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                  ) : (
                    <span className="inline-block w-5" aria-hidden />
                  )}
                  {linha.nome}
                </div>
              </TableCell>
              {linha.celulas}
            </TableRow>
          );
        })}
    </>
  );
}
