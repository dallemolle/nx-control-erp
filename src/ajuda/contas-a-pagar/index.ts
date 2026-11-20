import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { criarCenas } from "@/ajuda/_titulos/cenas";
import { EXEMPLO } from "./exemplo";
import { ROTEIROS } from "./roteiros";

export const ajudaContasAPagar: DefinicaoAjuda = {
  tituloTela: "Contas a pagar",
  resumo: "Tudo o que a fazenda deve: cada título com as suas parcelas, do cadastro ao pagamento.",
  tipo: "PAGAR",
  cenas: criarCenas(EXEMPLO),
  roteiros: ROTEIROS,
  observacoes: [
    "Para cadastrar muitos títulos de uma vez a partir de uma planilha, use o botão Importar CSV, acima da " +
      "lista. O formato do arquivo está no Passo a passo, seção 3.1.",
  ],
};
