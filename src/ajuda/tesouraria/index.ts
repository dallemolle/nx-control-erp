import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaLancamento, CenaPainel, CenaSaldo, CenaTransferencia } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaTesouraria: DefinicaoAjuda = {
  tituloTela: "Tesouraria",
  resumo: "O saldo de cada conta da filial, os lançamentos avulsos, as transferências e a conferência com o banco.",
  cenas: { painel: CenaPainel, lancamento: CenaLancamento, transferencia: CenaTransferencia, saldo: CenaSaldo },
  roteiros: ROTEIROS,
  observacoes: [
    "Pagamentos e recebimentos de títulos não se lançam aqui: eles entram sozinhos quando a baixa é aprovada " +
      "(origem Baixa).",
  ],
};
