import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaEditar, CenaLista, CenaNovo } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaProdutos: DefinicaoAjuda = {
  tituloTela: "Produtos",
  resumo:
    "Os frutos que entram pela Recepção e as polpas que saem da OP. O produto define o código do lote, a validade, " +
    "o preço sugerido na venda e o que sai na etiqueta. Vale para todas as filiais.",
  cenas: { lista: CenaLista, novo: CenaNovo, editar: CenaEditar },
  roteiros: ROTEIROS,
};
