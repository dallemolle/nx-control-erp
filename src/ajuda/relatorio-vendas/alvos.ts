/** Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`). */
export const ALVOS = {
  vendas: [
    "vendas.periodo",
    "vendas.atalhos",
    "vendas.exportar",
    "vendas.graficoCanal",
    "vendas.graficoClientes",
    "tab.clientes",
    "tab.semCompra",
    "tab.produtos",
    "tab.canais",
    "tab.formas",
  ],
} as const;
