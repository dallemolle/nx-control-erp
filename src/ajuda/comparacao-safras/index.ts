import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaPainel } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaComparacaoSafras: DefinicaoAjuda = {
  tituloTela: "Comparação entre safras",
  resumo: "O resultado de cada safra (o que entrou menos o que saiu) comparado com o resultado orçado.",
  cenas: { painel: CenaPainel },
  roteiros: ROTEIROS,
  observacoes: [
    "Realizado e projetado são resultado (entradas menos saídas), não custo. Orce o resultado esperado da safra: " +
      "se orçar só o custo, a Variação não faz sentido.",
  ],
};
