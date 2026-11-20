/**
 * As baixas que esperam aprovação no exemplo. Dados fictícios e fixos. Quem lê a ajuda é o Carlos Lima, da
 * Tesouraria: a terceira baixa foi registrada por ele mesmo.
 */
export const VOCE = "Carlos Lima";

export const BAIXAS = [
  // A baixa do roteiro de Contas a pagar: parcela 1 do adubo, paga com R$ 12,00 de juros.
  { documento: "NF-e 1234", contraparte: "Agro Insumos Ltda", valor: "R$ 1.012,00", registradoPor: "Maria Souza" },
  // Baixa em dobro: a parcela já tinha sido baixada e aprovada.
  { documento: "Recibo 88", contraparte: "José da Silva", valor: "R$ 1.200,00", registradoPor: "Maria Souza" },
  // A baixa do roteiro de Contas a receber, registrada por quem está aprovando.
  { documento: "NF-e 321", contraparte: "Fazenda Santa Luzia", valor: "R$ 15.060,00", registradoPor: VOCE },
] as const;

export const MOTIVO_REJEICAO = "Em dobro: parcela já paga em 05/11";
