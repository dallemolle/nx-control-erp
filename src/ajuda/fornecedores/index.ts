import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaLista, CenaNovo } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaFornecedores: DefinicaoAjuda = {
  tituloTela: "Fornecedores",
  resumo:
    "De quem a empresa compra: insumos, serviços e fruto. O cadastro vale para todas as filiais e já preenche a " +
    "classificação das contas a pagar e da recepção de fruto.",
  cenas: { lista: CenaLista, novo: CenaNovo },
  roteiros: ROTEIROS,
};
