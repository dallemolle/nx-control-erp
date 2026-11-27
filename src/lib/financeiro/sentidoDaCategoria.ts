/**
 * Quanto uma movimentação conta para a sua categoria (itens 15 e 63 do backlog). Despesa: saída soma e entrada
 * (devolução, estorno, reembolso) abate. Receita: entrada soma e saída (devolução ao cliente) abate. Usada pelo
 * realizado e pelo projetado do Orçamento e pelo ano-base do Fluxo de caixa estratégico.
 */
export function valorNoSentidoDaCategoria(
  tipoCategoria: "RECEITA" | "DESPESA",
  sentido: "ENTRADA" | "SAIDA",
  valor: number,
): number {
  const noSentido = tipoCategoria === "RECEITA" ? sentido === "ENTRADA" : sentido === "SAIDA";
  return noSentido ? valor : -valor;
}
