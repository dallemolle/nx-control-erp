import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaEditar, CenaLista, CenaNova } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaContasBancarias: DefinicaoAjuda = {
  tituloTela: "Contas bancárias",
  resumo:
    "As contas no banco e os caixas (dinheiro em espécie) da filial. Todo dinheiro que entra ou sai passa por uma " +
    "delas: baixas, lançamentos da Tesouraria, extrato da Conciliação e Fluxo de caixa.",
  cenas: { lista: CenaLista, nova: CenaNova, editar: CenaEditar },
  roteiros: ROTEIROS,
};
