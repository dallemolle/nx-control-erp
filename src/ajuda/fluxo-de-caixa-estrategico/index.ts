import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaPainel } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaFluxoDeCaixaEstrategico: DefinicaoAjuda = {
  tituloTela: "Fluxo de caixa estratégico",
  resumo: "Os próximos 5 anos da empresa em três cenários, a partir do realizado dos últimos 12 meses.",
  cenas: { painel: CenaPainel },
  roteiros: ROTEIROS,
  observacoes: [
    "Os três cenários começam zerados: sem premissas, a projeção só repete o ano-base. Ajuste ao menos o " +
      "cenário Base antes de usar os números.",
  ],
};
