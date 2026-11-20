/** Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`). */
export const ALVOS = {
  painel: [
    "painel.classificacao",
    "painel.exportar",
    "painel.aviso",
    "painel.tabela",
    "cab.status",
    "cab.realizado",
    "cab.projetado",
    "cab.variacao",
    "orcado.safra-2026",
    "salvar.safra-2026",
    "linha.safra-2026",
    "linha.safra-2025",
    "linha.safra-2024",
  ],
} as const;
