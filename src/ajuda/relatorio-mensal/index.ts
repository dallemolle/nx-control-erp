import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaMensal } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaRelatorioMensal: DefinicaoAjuda = {
  tituloTela: "Relatório mensal",
  resumo:
    "O ano mês a mês: recepção, processamento, vendas e custos de cada fruta, com gráficos e a polpa por produto.",
  cenas: { mensal: CenaMensal },
  roteiros: ROTEIROS,
  observacoes: ["Os gráficos da simulação são simplificados: na tela, eles têm eixos e mostram os valores ao passar o mouse."],
};
