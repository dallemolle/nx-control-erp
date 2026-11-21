import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaEditar, CenaLista, CenaMarca, CenaNova, CenaTema } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaEmpresas: DefinicaoAjuda = {
  tituloTela: "Empresas",
  resumo:
    "As empresas que você administra. Cada uma tem os próprios dados, filiais e usuários; aqui também ficam a regra " +
    "de aprovação das baixas e o tema e a marca do painel.",
  cenas: { lista: CenaLista, nova: CenaNova, editar: CenaEditar, tema: CenaTema, marca: CenaMarca },
  roteiros: ROTEIROS,
};
