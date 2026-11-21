import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { criarCenas } from "@/ajuda/_titulos/cenas";
import { EXEMPLO } from "./exemplo";
import { ROTEIROS } from "./roteiros";

export const ajudaContasAPagar: DefinicaoAjuda = {
  tituloTela: "Contas a pagar",
  resumo: "Tudo o que a fazenda deve: cada título com as suas parcelas, do cadastro ao pagamento.",
  cenas: criarCenas("PAGAR", EXEMPLO),
  roteiros: ROTEIROS,
  observacoes: [
    "Para cadastrar muitos títulos de uma vez a partir de uma planilha, use o botão Importar CSV, acima da " +
      "lista. O próprio diálogo explica as colunas do arquivo e tem um modelo para baixar.",
  ],
};
