/**
 * O exemplo da Comparação entre safras: a mesma fazenda das outras ajudas, com três safras. Fictício e fixo. A conta
 * da variação é a mesma de `montarLinhaComparativoSafra` (src/server/services/orcamentoSafra.ts), repetida aqui
 * porque a réplica roda no navegador e o serviço importa o banco; o teste da ajuda confere que as duas batem.
 */
export type StatusSafra = "PLANEJADO" | "EM_ANDAMENTO" | "ENCERRADO";

export type SafraExemplo = {
  /** Sufixo dos alvos: `linha.<chave>`, `orcado.<chave>`. */
  chave: string;
  nome: string;
  status: StatusSafra;
  orcado: number;
  /** Entradas − saídas, de tudo o que está marcado com a safra, em qualquer data. */
  realizado: number;
  projetado: number;
  realizadoFiscal: number;
  projetadoFiscal: number;
};

/** Da mais nova para a mais antiga (data de início), como a tela lista. */
export const SAFRAS: readonly SafraExemplo[] = [
  {
    chave: "safra-2026",
    nome: "2026/27",
    status: "PLANEJADO",
    orcado: 0,
    realizado: -300,
    projetado: 0,
    realizadoFiscal: 0,
    projetadoFiscal: 0,
  },
  {
    chave: "safra-2025",
    nome: "2025/26",
    status: "EM_ANDAMENTO",
    orcado: 40000,
    realizado: 33000,
    projetado: 3000,
    realizadoFiscal: 26000,
    projetadoFiscal: 3000,
  },
  {
    chave: "safra-2024",
    nome: "2024/25",
    status: "ENCERRADO",
    orcado: 35000,
    realizado: 38200,
    projetado: 0,
    realizadoFiscal: 31500,
    projetadoFiscal: 0,
  },
];

export function variacao(orcado: number, realizado: number) {
  const variacaoAbsolutaRealizado = realizado - orcado;
  return {
    variacaoAbsolutaRealizado,
    variacaoPercentualRealizado: orcado === 0 ? null : variacaoAbsolutaRealizado / orcado,
  };
}
