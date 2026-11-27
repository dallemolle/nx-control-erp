"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type Estado = { naoSalvo: boolean; setNaoSalvo: (valor: boolean) => void };

const ProcessoNaoSalvo = createContext<Estado>({ naoSalvo: false, setNaoSalvo: () => {} });

/** Liga a aba Processo ao "Encerrar OP": o encerramento usa só os números já salvos. */
export function ProcessoNaoSalvoProvider({ children }: { children: ReactNode }) {
  const [naoSalvo, setNaoSalvo] = useState(false);
  return <ProcessoNaoSalvo.Provider value={{ naoSalvo, setNaoSalvo }}>{children}</ProcessoNaoSalvo.Provider>;
}

export function useProcessoNaoSalvo() {
  return useContext(ProcessoNaoSalvo);
}
