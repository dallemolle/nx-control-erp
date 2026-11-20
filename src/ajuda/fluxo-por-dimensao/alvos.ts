/** Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`). */
export const ALVOS = {
  painel: [
    "painel.dimensao",
    "painel.periodo",
    "painel.classificacao",
    "painel.exportar",
    "painel.tabela",
    "cab.realizadas",
    "cab.projetadas",
    "cab.saldo",
    "linha.lavoura",
    "linha.nao-classificado",
    "linha.safra-2025",
  ],
} as const;
