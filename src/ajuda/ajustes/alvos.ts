/** Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`). */
export const ALVOS = {
  lista: [
    "lista.novo",
    "lista.filtros",
    "lista.motivo",
    "lista.exportar",
    "lista.tabela",
    "lista.amostra",
    "lista.sobra",
  ],
  novo: [
    "novo.sentido",
    "novo.lote",
    "novo.kg",
    "novo.data",
    "novo.motivo",
    "novo.observacao",
    "novo.salvar",
  ],
} as const;
