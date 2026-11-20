import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaLista } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaRepassesCartao: DefinicaoAjuda = {
  tituloTela: "Repasses de cartão",
  resumo: "O dinheiro das vendas na maquininha que a operadora ainda vai depositar, e a confirmação de cada depósito.",
  cenas: { lista: CenaLista },
  roteiros: ROTEIROS,
  observacoes: [
    "Os repasses nascem dos pedidos de venda pagos na maquininha: não há cadastro manual aqui. As contas a " +
      "receber e a pagar (taxa) desses pedidos não aceitam baixa em Contas a receber ou Contas a pagar.",
  ],
};
