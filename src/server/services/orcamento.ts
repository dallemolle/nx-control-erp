import type { TipoCategoriaFinanceira } from "@prisma/client";

export type LinhaComparativoOrcamento = {
  categoriaFinanceiraId: string;
  categoriaNome: string;
  tipoCategoria: TipoCategoriaFinanceira;
  ano: number;
  mes: number;
  orcado: number;
  realizado: number;
  projetado: number;
  variacaoAbsolutaRealizado: number;
  variacaoPercentualRealizado: number | null;
  alerta: boolean;
};

/**
 * Monta uma linha do comparativo orçado x realizado x projetado — ver
 * "Comparativos" na spec. Variação percentual é null quando o orçado é
 * zero (divisão por zero não faz sentido de negócio). Alerta só existe
 * pra categorias DESPESA: ultrapassar o orçado de uma categoria RECEITA
 * é notícia boa, não estouro.
 */
export function montarLinhaComparativo(
  categoriaFinanceiraId: string,
  categoriaNome: string,
  tipoCategoria: TipoCategoriaFinanceira,
  ano: number,
  mes: number,
  orcado: number,
  realizado: number,
  projetado: number,
): LinhaComparativoOrcamento {
  const variacaoAbsolutaRealizado = realizado - orcado;
  const variacaoPercentualRealizado = orcado === 0 ? null : variacaoAbsolutaRealizado / orcado;
  const alerta = tipoCategoria === "DESPESA" && realizado + projetado > orcado;

  return {
    categoriaFinanceiraId,
    categoriaNome,
    tipoCategoria,
    ano,
    mes,
    orcado,
    realizado,
    projetado,
    variacaoAbsolutaRealizado,
    variacaoPercentualRealizado,
    alerta,
  };
}
