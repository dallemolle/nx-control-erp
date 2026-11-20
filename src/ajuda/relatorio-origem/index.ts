import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaOrigem } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaRelatorioOrigem: DefinicaoAjuda = {
  tituloTela: "Relatório de origem",
  resumo:
    "De onde veio o fruto: cada fornecedor e talhão com kg, valor pago e descarte, a produtividade dos talhões e o " +
    "preço pago a terceiros mês a mês.",
  cenas: { origem: CenaOrigem },
  roteiros: ROTEIROS,
  observacoes: ["O gráfico da simulação é simplificado: na tela, ele tem eixos e mostra os valores ao passar o mouse."],
};
