import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaEditar, CenaLista, CenaNovo } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaClientes: DefinicaoAjuda = {
  tituloTela: "Clientes",
  resumo:
    "Quem compra da empresa. O cadastro vale para todas as filiais e já preenche o pedido e as contas a receber: " +
    "canal, classificação, endereço de entrega e se o cliente retira na propriedade.",
  cenas: { lista: CenaLista, novo: CenaNovo, editar: CenaEditar },
  roteiros: ROTEIROS,
};
