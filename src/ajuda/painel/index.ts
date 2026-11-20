import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaPainel } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaPainel: DefinicaoAjuda = {
  tituloTela: "Painel de produção",
  resumo:
    "O resumo do período: fruto recebido e processado, rendimento, custo, vendas e margem, mais o estoque de hoje e " +
    "os alertas.",
  cenas: { painel: CenaPainel },
  roteiros: ROTEIROS,
  observacoes: [
    "O período vale para recepções, OPs e vendas. A receber, estoque e entregas são sempre a posição de hoje.",
  ],
};
