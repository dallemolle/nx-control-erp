/** Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`). */
export const ALVOS = {
  painel: [
    "painel.classificacao",
    "painel.exportar",
    "painel.aviso",
    "BASE.receita",
    "BASE.custos",
    "BASE.capex",
    "BASE.endividamento",
    "BASE.juros",
    "BASE.salvar",
    "BASE.tabela",
    "BASE.linha.receita",
    "BASE.linha.capex",
    "BASE.linha.juros",
    "BASE.linha.saldo",
    "BASE.linha.margem",
    "OTIMISTA.secao",
    "PESSIMISTA.secao",
    "PESSIMISTA.linha.saldo",
  ],
} as const;
