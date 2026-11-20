import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaEditar, CenaExcluir, CenaLista, CenaNova } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaRecepcao: DefinicaoAjuda = {
  tituloTela: "Recepção de fruto",
  resumo:
    "Cada carga de fruto que chega, comprada ou colhida, vira um lote com número, validade e entrada no estoque; " +
    "a compra já gera a conta a pagar ao produtor.",
  cenas: { lista: CenaLista, nova: CenaNova, editar: CenaEditar, excluir: CenaExcluir },
  roteiros: ROTEIROS,
  observacoes: [
    "Antes da primeira recepção, faça os cadastros de produção (frutas, produtos, talhões e locais) e, em " +
      "Administração → Configuração de produção, escolha a categoria de compra de fruto e o prazo de pagamento ao " +
      "produtor.",
  ],
};
