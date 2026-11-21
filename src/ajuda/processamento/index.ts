import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaDesfazer, CenaEncerrar, CenaLista, CenaNovaOp, CenaOP } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaProcessamento: DefinicaoAjuda = {
  tituloTela: "Processamento",
  resumo:
    "Cada batelada de fruto processado em polpa é uma ordem de produção (OP): fruto consumido, polpa produzida, " +
    "insumos, processo, rendimento e custo.",
  cenas: { lista: CenaLista, novaOp: CenaNovaOp, op: CenaOP, encerrar: CenaEncerrar, desfazer: CenaDesfazer },
  roteiros: ROTEIROS,
  observacoes: [
    "A tolerância do balanço de massa e os mínimos do branqueamento ficam em Administração → Configuração de " +
      "produção; o preço de referência de cada polpa, em Cadastros → Produtos.",
  ],
};
