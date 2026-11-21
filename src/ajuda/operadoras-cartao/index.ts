import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaEditar, CenaLista, CenaNova } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaOperadorasCartao: DefinicaoAjuda = {
  tituloTela: "Operadoras de cartão",
  resumo:
    "As maquininhas da filial: em que conta cada uma deposita e a taxa e o prazo de cada modalidade. A venda no " +
    "cartão usa essas condições para lançar os repasses a receber e a taxa a pagar.",
  cenas: { lista: CenaLista, nova: CenaNova, editar: CenaEditar },
  roteiros: ROTEIROS,
};
