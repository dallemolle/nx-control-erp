import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaProcessamento } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaRelatorioProcessamento: DefinicaoAjuda = {
  tituloTela: "Relatório de processamento",
  resumo:
    "As OPs do período por fruta: rendimento, balanço de massa e custo da polpa, com o link para as OPs.",
  cenas: { processamento: CenaProcessamento },
  roteiros: ROTEIROS,
};
