/** Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`). */
export const ALVOS = {
  painel: [
    "painel.granularidade",
    "painel.anterior",
    "painel.proximo",
    "painel.classificacao",
    "painel.aviso",
    "painel.exportar",
    "painel.tabela",
    "col.saldoInicial",
    "col.entradas",
    "col.geracao",
    "col.saldoFinal",
  ],
} as const;
