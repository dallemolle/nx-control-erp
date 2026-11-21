import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaEstoque, CenaLiberar, CenaTransferir } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaEstoque: DefinicaoAjuda = {
  tituloTela: "Estoque",
  resumo:
    "O saldo de cada lote, em ordem de validade, com status, valor a custo e local; a transferência entre locais e " +
    "a liberação de lote vencido.",
  cenas: { estoque: CenaEstoque, transferir: CenaTransferir, liberar: CenaLiberar },
  roteiros: ROTEIROS,
  observacoes: [
    "O estoque não se edita aqui: entra pela Recepção e pelas OPs, sai pelas OPs e pelos pedidos, e os acertos " +
      "vão pela tela de Ajustes de estoque.",
  ],
};
