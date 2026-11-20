import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaPainel } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaFluxoPorDimensao: DefinicaoAjuda = {
  tituloTela: "Fluxo de caixa por dimensão",
  resumo: "O que entrou e saiu no mês, separado por centro de custo, centro de lucro, safra ou projeto.",
  cenas: { painel: CenaPainel },
  roteiros: ROTEIROS,
  observacoes: [
    "Cada título e cada lançamento tem um valor só por dimensão: não dá para dividir um pagamento entre dois " +
      "centros de custo. Se uma compra serve a duas áreas, lance em títulos separados.",
  ],
};
