import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaRastreio } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaRastreabilidade: DefinicaoAjuda = {
  tituloTela: "Rastreabilidade",
  resumo:
    "De onde veio um lote e para quem foi: do produtor ou talhão até os clientes da polpa feita com o fruto. Para " +
    "recall e fiscalização.",
  cenas: { rastreio: CenaRastreio },
  roteiros: ROTEIROS,
  observacoes: ["A tela só consulta: nada é alterado por aqui."],
};
