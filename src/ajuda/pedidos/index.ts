import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaCancelar, CenaLista, CenaLotes, CenaNovo, CenaPedido } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaPedidos: DefinicaoAjuda = {
  tituloTela: "Pedidos de venda",
  resumo:
    "Cada venda é um pedido: ele tira a polpa (ou o fruto) do estoque, lote por lote, cria a conta a receber do " +
    "cliente e, se o cliente não retira, a entrega.",
  cenas: { lista: CenaLista, novo: CenaNovo, lotes: CenaLotes, pedido: CenaPedido, cancelar: CenaCancelar },
  roteiros: ROTEIROS,
  observacoes: [
    "Antes do primeiro pedido, escolha em Administração → Configuração de produção a categoria de venda, a conta de " +
      "recebimento (Pix e transferência) e a conta Caixa (dinheiro). Sem a categoria de venda, o pedido não salva.",
  ],
};
