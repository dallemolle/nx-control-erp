import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaEditar, CenaEntregue, CenaLista } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaEntregas: DefinicaoAjuda = {
  tituloTela: "Entregas",
  resumo:
    "Cada pedido que o cliente não retira na propriedade gera uma entrega. Aqui ela é acompanhada de pendente a " +
    "entregue, com quem levou, quem recebeu e o atraso.",
  cenas: { lista: CenaLista, editar: CenaEditar, entregue: CenaEntregue },
  roteiros: ROTEIROS,
  observacoes: [
    "Se o cliente vem buscar, marque “Retira na propriedade” no pedido (ou no cadastro do cliente): o pedido não gera " +
      "entrega.",
  ],
};
