import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaVendas } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaRelatorioVendas: DefinicaoAjuda = {
  tituloTela: "Relatório de vendas",
  resumo:
    "As vendas do período por cliente, produto, canal e forma de pagamento, com a margem e o que falta receber hoje.",
  cenas: { vendas: CenaVendas },
  roteiros: ROTEIROS,
  observacoes: ["Os gráficos da simulação são simplificados: na tela, eles têm eixos e mostram os valores ao passar o mouse."],
};
