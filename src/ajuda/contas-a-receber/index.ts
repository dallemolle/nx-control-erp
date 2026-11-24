import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { criarCenas } from "@/ajuda/_titulos/cenas";
import { EXEMPLO } from "./exemplo";
import { ROTEIROS } from "./roteiros";

export const ajudaContasAReceber: DefinicaoAjuda = {
  tituloTela: "Contas a receber",
  resumo: "Tudo o que a fazenda tem a receber: cada título com as suas parcelas, do cadastro ao recebimento.",
  cenas: criarCenas("RECEBER", EXEMPLO),
  roteiros: ROTEIROS,
  observacoes: [
    "Os pedidos de venda criam a conta a receber sozinhos, com o documento igual ao número da nota ou a " +
      "PV-número do pedido. Venda na maquininha sai em nome da operadora e é recebida em Financeiro → Repasses " +
      "de cartão.",
    "Para cadastrar muitos títulos de uma vez a partir de uma planilha, use o botão Importar CSV, acima da " +
      "lista. O próprio diálogo explica as colunas do arquivo e tem um modelo para baixar.",
  ],
};
