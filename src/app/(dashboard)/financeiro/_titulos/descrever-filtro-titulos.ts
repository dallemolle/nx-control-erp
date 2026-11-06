import type { FiltroTitulos } from "@/server/services/titulo";
import { formatarData } from "@/lib/formatacao";
import { filtroDeClassificacao } from "@/server/export/cabecalhoDoRelatorio";

const ROTULOS_FILTRO_POR_ID: [keyof FiltroTitulos, string][] = [
  ["categoriaId", "categoria"],
  ["contraparteId", "contraparte"],
  ["centroCustoId", "centro de custo"],
  ["centroLucroId", "centro de lucro"],
  ["safraId", "safra"],
  ["projetoId", "projeto"],
];

/**
 * Filtros de títulos em texto para o cabeçalho do PDF. Os filtros por cadastro
 * (categoria, contraparte…) chegam como id; o PDF só diz que estão aplicados —
 * o nome de cada item já aparece nas colunas das linhas exportadas.
 */
export function descreverFiltroTitulos(filtros: FiltroTitulos): (string | null)[] {
  const porCadastro = ROTULOS_FILTRO_POR_ID.filter(([campo]) => filtros[campo]).map(([, rotulo]) => rotulo);
  return [
    filtros.status ? `Status: ${filtros.status}` : null,
    filtros.vencimentoDe ? `Vencimento de: ${formatarData(filtros.vencimentoDe)}` : null,
    filtros.vencimentoAte ? `Vencimento até: ${formatarData(filtros.vencimentoAte)}` : null,
    filtroDeClassificacao(filtros.classificacao),
    porCadastro.length > 0 ? `Filtrado por ${porCadastro.join(", ")}` : null,
  ];
}
