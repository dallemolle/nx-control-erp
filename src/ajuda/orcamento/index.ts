import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaPainel } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaOrcamento: DefinicaoAjuda = {
  tituloTela: "Orçamento",
  resumo: "Quanto se espera gastar e receber em cada categoria, mês a mês, comparado com o que já aconteceu.",
  cenas: { painel: CenaPainel },
  roteiros: ROTEIROS,
  observacoes: [
    "O orçamento é por filial: cada filial orça as suas categorias, e não há visão consolidada da empresa.",
  ],
};
