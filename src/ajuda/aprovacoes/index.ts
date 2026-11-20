import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaLista } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaAprovacoes: DefinicaoAjuda = {
  tituloTela: "Aprovações pendentes",
  resumo:
    "Onde os pagamentos e recebimentos registrados nas baixas são conferidos antes de virar lançamento na conta.",
  cenas: { lista: CenaLista },
  roteiros: ROTEIROS,
  observacoes: [
    "Vendas à vista e repasses de cartão confirmados não passam por aqui: o sistema já registra o recebimento " +
      "aprovado.",
  ],
};
