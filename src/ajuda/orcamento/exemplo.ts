/**
 * O exemplo do Orçamento: novembro de 2026 na mesma fazenda das telas do Financeiro (adubo da Agro Insumos,
 * tarifa de R$ 45,90, recibo do José da Silva). Fictício e fixo. A conta de cada linha é a mesma de
 * `montarLinhaComparativo` (src/server/services/orcamento.ts), repetida aqui porque a réplica roda no navegador e o
 * serviço importa o banco; o teste da ajuda confere que as duas dão o mesmo resultado.
 */
export type TipoCategoria = "RECEITA" | "DESPESA";

export type CategoriaExemplo = {
  /** Sufixo dos alvos: `grade.<chave>`, `comp.linha.<chave>`. */
  chave: string;
  nome: string;
  tipo: TipoCategoria;
  /** Chave da categoria pai, se houver. */
  pai?: string;
  /** Orçado de janeiro (índice 0) a dezembro (índice 11). */
  orcadoPorMes: readonly number[];
  /** Realizado e projetado de novembro, na visão Todos e na visão Fiscal. */
  novembro: { realizado: number; projetado: number };
  novembroFiscal: { realizado: number; projetado: number };
};

export const ANO = 2026;
export const MES = 11;

const todoMes = (valor: number) => Array.from({ length: 12 }, () => valor);

/** Em ordem alfabética, como a tela lista as categorias ativas da filial. */
export const CATEGORIAS: readonly CategoriaExemplo[] = [
  {
    chave: "bancarias",
    nome: "Despesas bancárias",
    tipo: "DESPESA",
    orcadoPorMes: todoMes(50),
    novembro: { realizado: 45.9, projetado: 0 },
    novembroFiscal: { realizado: 45.9, projetado: 0 },
  },
  {
    chave: "taxas",
    nome: "Taxas de cartão",
    tipo: "DESPESA",
    pai: "bancarias",
    orcadoPorMes: todoMes(30),
    novembro: { realizado: 12.5, projetado: 0 },
    novembroFiscal: { realizado: 12.5, projetado: 0 },
  },
  {
    chave: "energia",
    nome: "Energia elétrica",
    tipo: "DESPESA",
    orcadoPorMes: todoMes(600),
    novembro: { realizado: 0, projetado: 580 },
    novembroFiscal: { realizado: 0, projetado: 580 },
  },
  {
    chave: "insumos",
    nome: "Insumos Agrícolas",
    tipo: "DESPESA",
    orcadoPorMes: [0, 0, 0, 0, 0, 0, 0, 2500, 2500, 1500, 1500, 0],
    novembro: { realizado: 800, projetado: 1000 },
    novembroFiscal: { realizado: 800, projetado: 1000 },
  },
  {
    chave: "mao-de-obra",
    nome: "Mão de obra temporária",
    tipo: "DESPESA",
    orcadoPorMes: todoMes(0),
    novembro: { realizado: 300, projetado: 0 },
    novembroFiscal: { realizado: 0, projetado: 0 },
  },
  {
    chave: "venda",
    nome: "Venda de produtos",
    tipo: "RECEITA",
    orcadoPorMes: todoMes(20000),
    novembro: { realizado: 23500, projetado: 4000 },
    novembroFiscal: { realizado: 18000, projetado: 4000 },
  },
];

export type LinhaComparativo = {
  previsto: number;
  variacaoAbsoluta: number;
  variacaoPercentual: number | null;
  alerta: boolean;
};

/** Réplica de `montarLinhaComparativo`: a variação é sobre o previsto (realizado + projetado). */
export function compararLinha(tipo: TipoCategoria, orcado: number, realizado: number, projetado: number): LinhaComparativo {
  const previsto = (Math.round(realizado * 100) + Math.round(projetado * 100)) / 100;
  const variacaoAbsoluta = (Math.round(previsto * 100) - Math.round(orcado * 100)) / 100;
  return {
    previsto,
    variacaoAbsoluta,
    variacaoPercentual: orcado === 0 ? null : variacaoAbsoluta / orcado,
    alerta: tipo === "DESPESA" && variacaoAbsoluta > 0,
  };
}
