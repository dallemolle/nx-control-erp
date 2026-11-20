import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaPainel } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaFluxoDeCaixaProjetado: DefinicaoAjuda = {
  tituloTela: "Fluxo de caixa projetado",
  resumo: "Para onde o saldo vai nos próximos meses, a partir do saldo de hoje e das contas a pagar e a receber.",
  cenas: { painel: CenaPainel },
  roteiros: ROTEIROS,
  observacoes: [
    "A projeção só enxerga o que já é título. Uma despesa que ainda não foi lançada em Contas a pagar não aparece " +
      "aqui: cadastre os títulos assim que souber deles.",
  ],
};
