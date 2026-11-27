/** Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`). */
export const ALVOS = {
  painel: [
    "painel.ano",
    "painel.mes",
    "painel.classificacao",
    "painel.exportar",
    "painel.aviso",
    "grade.secao",
    "grade.insumos",
    "grade.insumos.mes-11",
    "grade.insumos.salvar",
    "comp.tabela",
    "comp.realizado",
    "comp.projetado",
    "comp.linha.bancarias",
    "comp.linha.insumos",
    "comp.linha.mao-de-obra",
    "comp.linha.venda",
  ],
} as const;
