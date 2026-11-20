import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaPainel } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaFiscalGerencial: DefinicaoAjuda = {
  tituloTela: "Fiscal × gerencial",
  resumo: "Quanto do movimento tem nota e quanto é negociado sem nota, e o que falta completar nos títulos fiscais.",
  cenas: { painel: CenaPainel },
  roteiros: ROTEIROS,
  observacoes: ["O gráfico da simulação é simplificado: na tela, ele tem eixos e mostra os valores ao passar o mouse."],
};
