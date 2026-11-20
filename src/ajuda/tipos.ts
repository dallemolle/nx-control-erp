import type { ComponentType } from "react";

export type TipoTela = "PAGAR" | "RECEBER";

/** Valores mostrados nos campos da cena, pelo nome do alvo. */
export type Valores = Readonly<Partial<Record<string, string>>>;

export type PropsCena = { tipo: TipoTela; valores: Valores };

export type Passo = {
  /** Cena mostrada neste passo (chave de `DefinicaoAjuda.cenas`). */
  cena: string;
  /** `data-alvo` destacado na cena. */
  alvo: string;
  /** Frase curta no imperativo: "Escolha o fornecedor". */
  instrucao: string;
  explicacao: string;
  dica?: string;
  /** Valores que passam a aparecer na cena a partir deste passo. */
  preenche?: Valores;
};

export type Roteiro = {
  /** Usado no link do manual: `#ajuda/<tela>/<id>`. */
  id: string;
  titulo: string;
  quandoUsar: string;
  quemPode?: string;
  passos: readonly Passo[];
  eDepois: { texto: string; proximoRoteiro?: string };
};

export type DefinicaoAjuda = {
  tituloTela: string;
  resumo: string;
  tipo: TipoTela;
  cenas: Readonly<Record<string, ComponentType<PropsCena>>>;
  roteiros: readonly Roteiro[];
  /** Avisos do índice que não viram roteiro (ex.: importação por CSV). */
  observacoes?: readonly string[];
};

type PassoTipado<M extends Record<string, readonly string[]>> = {
  [C in keyof M & string]: Omit<Passo, "cena" | "alvo" | "preenche"> & {
    cena: C;
    alvo: M[C][number];
    preenche?: Partial<Record<M[keyof M][number], string>>;
  };
}[keyof M & string];

/**
 * Amarra os roteiros de uma tela aos alvos das cenas dela: um passo que aponta
 * para um alvo que a cena não tem não compila. Uso:
 * `const roteiro = construtorDeRoteiros<typeof ALVOS>();`
 */
export function construtorDeRoteiros<M extends Record<string, readonly string[]>>() {
  return (roteiro: Omit<Roteiro, "passos"> & { passos: readonly PassoTipado<M>[] }): Roteiro => roteiro;
}
