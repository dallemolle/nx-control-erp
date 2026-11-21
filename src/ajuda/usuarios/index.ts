import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaAcessos, CenaChaves, CenaLista, CenaNovo, CenaPerfis } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaUsuarios: DefinicaoAjuda = {
  tituloTela: "Usuários",
  resumo:
    "Quem entra nesta empresa, com que perfil e em quais filiais pode ler ou alterar. Aqui também ficam as chaves de " +
    "API, para sistemas e agentes que usam a API em nome de um usuário.",
  cenas: { lista: CenaLista, novo: CenaNovo, perfis: CenaPerfis, acessos: CenaAcessos, chaves: CenaChaves },
  roteiros: ROTEIROS,
};
