"use client";

import { createContext, useContext, type ReactNode } from "react";
import { juntarOpcoes, type ExtrasDoLancamento, type OpcoesDoLancamento } from "@/lib/lancamentoEditavel";

const OpcoesContext = createContext<OpcoesDoLancamento | null>(null);

/** As listas ativas do diálogo de edição, enviadas uma vez para a tabela inteira (não uma vez por linha). */
export function OpcoesDoLancamentoProvider({ opcoes, children }: { opcoes: OpcoesDoLancamento; children: ReactNode }) {
  return <OpcoesContext.Provider value={opcoes}>{children}</OpcoesContext.Provider>;
}

/** As listas da página mais os cadastros inativos que a linha já usa. */
export function useOpcoesDoLancamento(extras: ExtrasDoLancamento): OpcoesDoLancamento {
  const base = useContext(OpcoesContext);
  if (!base) throw new Error("useOpcoesDoLancamento fora do OpcoesDoLancamentoProvider");
  return juntarOpcoes(base, extras);
}
