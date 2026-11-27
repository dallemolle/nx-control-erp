/**
 * O exemplo do Fluxo de caixa por dimensão: novembro de 2026, o mesmo mês e os mesmos valores da ajuda do
 * Orçamento (adubo da Agro Insumos, recibo do José da Silva, tarifa de R$ 45,90, conta de energia, vendas e o
 * saque de R$ 2.000,00 do banco para o Caixa). Fictício e fixo.
 */
export type Dimensao = "Centro de custo" | "Centro de lucro" | "Safra" | "Projeto";

export type LinhaExemplo = {
  /** Sufixo do alvo `linha.<chave>`. */
  chave: string;
  nome: string;
  entradasRealizadas: number;
  saidasRealizadas: number;
  entradasProjetadas: number;
  saidasProjetadas: number;
};

/** A coluna "Resultado do mês" da tela: a mesma função da página e da exportação. */
export { resultadoDoMes, totalDoFluxo } from "@/lib/fluxoPorDimensao";

const linha = (
  chave: string,
  nome: string,
  [entradasRealizadas, saidasRealizadas, entradasProjetadas, saidasProjetadas]: [number, number, number, number],
): LinhaExemplo => ({ chave, nome, entradasRealizadas, saidasRealizadas, entradasProjetadas, saidasProjetadas });

/**
 * Valores ativos em ordem alfabética e, por último, "Não classificado", como a tela monta.
 * Lavoura: adubo (R$ 800,00 pagos + R$ 1.000,00 a pagar) e mão de obra (R$ 300,00).
 * Administração: tarifa (R$ 45,90) e energia (R$ 580,00 a pagar).
 * Não classificado: as vendas, sem centro de custo. O saque de R$ 2.000,00 não entra: transferência entre
 * contas só move saldo.
 */
export const POR_CENTRO_DE_CUSTO: readonly LinhaExemplo[] = [
  linha("administracao", "Administração", [0, 45.9, 0, 580]),
  linha("lavoura", "Lavoura", [0, 1100, 0, 1000]),
  linha("nao-classificado", "Não classificado", [23500, 0, 4000, 0]),
];

/**
 * Visão Fiscal: saem o recibo gerencial e a venda gerencial (o saque, transferência, não entra em nenhuma
 * visão).
 */
export const POR_CENTRO_DE_CUSTO_FISCAL: readonly LinhaExemplo[] = [
  linha("administracao", "Administração", [0, 45.9, 0, 580]),
  linha("lavoura", "Lavoura", [0, 800, 0, 1000]),
  linha("nao-classificado", "Não classificado", [18000, 0, 4000, 0]),
];

/**
 * O mesmo dinheiro cortado por safra (sem o saque, que é transferência): o adubo e as vendas são da 2025/26;
 * a mão de obra, da 2026/27.
 */
export const POR_SAFRA: readonly LinhaExemplo[] = [
  linha("safra-2025", "2025/26", [23500, 800, 4000, 1000]),
  linha("safra-2026", "2026/27", [0, 300, 0, 0]),
  linha("nao-classificado", "Não classificado", [0, 45.9, 0, 580]),
];

export function linhasDoExemplo(dimensao: string | undefined, filtro: string | undefined): readonly LinhaExemplo[] {
  if (dimensao === "Safra") return POR_SAFRA;
  return filtro ? POR_CENTRO_DE_CUSTO_FISCAL : POR_CENTRO_DE_CUSTO;
}
