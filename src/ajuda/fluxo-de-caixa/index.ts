import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaPainel } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaFluxoDeCaixa: DefinicaoAjuda = {
  tituloTela: "Fluxo de caixa",
  resumo: "O que já entrou e saiu das contas da filial, período a período, a partir dos lançamentos conciliados.",
  cenas: { painel: CenaPainel },
  roteiros: ROTEIROS,
};
