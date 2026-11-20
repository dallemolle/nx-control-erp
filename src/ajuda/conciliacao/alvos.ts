/** Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`). */
export const ALVOS = {
  lista: [
    "lista.reconciliar",
    "lista.importar",
    "lista.filtroStatus",
    "lista.exportar",
    "lista.tabela",
    "l1.status",
    "l1.desconciliar",
    "l2.status",
    "l2.grupo",
    "l3.criar",
    "l4.status",
    "l4.selecionar",
    "l4.confirmar",
  ],
  importar: ["imp.conta", "imp.arquivo", "imp.importar", "imp.resumo"],
  criar: ["criar.descricao", "criar.classificacao", "criar.comprovante", "criar.categoria", "criar.salvar"],
  grupo: ["grupo.linhas", "grupo.lancamentos", "grupo.totais", "grupo.conciliar"],
} as const;
