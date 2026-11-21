/**
 * Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`).
 * Dois guardam estado da cena: `lista.tabela` = o dia de hoje (DD/MM/AAAA) e `lista.situacao` = o status da entrega
 * do pedido 131 (Pendente, Em rota ou Entregue).
 */
export const ALVOS = {
  lista: [
    "lista.filtros",
    "lista.status",
    "lista.periodo",
    "lista.atrasadas",
    "lista.exportar",
    "lista.tabela",
    "lista.pedido",
    "lista.situacao",
    "lista.atraso",
    "lista.atrasoEntregue",
    "lista.cancelada",
    "lista.emRota",
    "lista.entregue",
    "lista.editar",
  ],
  editar: ["editar.data", "editar.endereco", "editar.responsavel", "editar.observacao", "editar.salvar"],
  entregue: ["entregue.data", "entregue.recebido", "entregue.confirmar"],
} as const;
