import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaCriar, CenaGrupo, CenaImportar, CenaLista } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaConciliacao: DefinicaoAjuda = {
  tituloTela: "Conciliação bancária",
  resumo: "Onde o extrato do banco é conferido, linha a linha, com os lançamentos do sistema.",
  cenas: { lista: CenaLista, importar: CenaImportar, criar: CenaCriar, grupo: CenaGrupo },
  roteiros: ROTEIROS,
  observacoes: [
    "A conta Caixa não passa por aqui: os lançamentos em dinheiro já entram conciliados.",
  ],
};
