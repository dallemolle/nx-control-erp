import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaEstornar, CenaLista, CenaNovo } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaAjustes: DefinicaoAjuda = {
  tituloTela: "Ajustes de estoque",
  resumo:
    "Saídas e entradas de estoque que não são recepção, OP nem venda: vencido, avaria, amostra, consumo interno e " +
    "acertos de inventário.",
  cenas: { lista: CenaLista, novo: CenaNovo, estornar: CenaEstornar },
  roteiros: ROTEIROS,
  observacoes: [
    "Mudar um lote de local não é ajuste: use “Transferir” na tela de Estoque.",
  ],
};
