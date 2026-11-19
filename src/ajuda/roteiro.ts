import type { Roteiro, Valores } from "./tipos";

/** Junta os `preenche` do primeiro passo até `indice` (o E depois mostra tudo). */
export function valoresAte(roteiro: Roteiro, indice: number): Valores {
  const ultimo = Math.min(indice, roteiro.passos.length - 1);
  const valores: Record<string, string> = {};
  for (let i = 0; i <= ultimo; i++) {
    for (const [alvo, valor] of Object.entries(roteiro.passos[i].preenche ?? {})) {
      if (valor !== undefined) valores[alvo] = valor;
    }
  }
  return valores;
}

/** Passos mais a tela "E depois?". */
export function totalDeEtapas(roteiro: Roteiro): number {
  return roteiro.passos.length + 1;
}

export function limitarIndice(roteiro: Roteiro, indice: number): number {
  return Math.max(0, Math.min(indice, roteiro.passos.length));
}

export function ehEDepois(roteiro: Roteiro, indice: number): boolean {
  return indice === roteiro.passos.length;
}
