/** Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`). */
export const ALVOS = {
  processamento: [
    "proc.periodo",
    "proc.atalhos",
    "proc.exportar",
    "proc.verOps",
    "tab.resumo",
    "tab.balanco",
    "tab.acerola",
    "tab.custo",
  ],
} as const;
