/**
 * O extrato do Banco do Brasil usado nos roteiros da Conciliação. Dados fictícios e fixos, que continuam as
 * histórias das outras ajudas: o pagamento do adubo (Contas a pagar), o depósito da Cartões Rurais (Repasses de
 * cartão), a tarifa e o saque (Tesouraria).
 */
export const CONTA = "Banco do Brasil - Ag 1234/CC 12345-6";

export const LINHAS = {
  l1: {
    data: "19/11/2026",
    historico: "PAGTO BOLETO AGRO INSUMOS",
    valor: "R$ 1.012,00",
    lancamento: "NF-e 1234 · Agro Insumos Ltda · parcela 2/3",
  },
  l2: { data: "19/11/2026", historico: "CRED CARTOES RURAIS", valor: "R$ 1.462,50" },
  l3: { data: "20/11/2026", historico: "TARIFA PACOTE SERVICOS", valor: "R$ 45,90" },
  l4: { data: "18/11/2026", historico: "SAQUE TERMINAL", valor: "R$ 2.000,00" },
} as const;

/** O lançamento que a linha do saque deve receber (a transferência feita na Tesouraria). */
export const CANDIDATO_SAQUE = "Saque para o caixa — pagamento de diárias — R$ 2.000,00 em 18/11/2026";

/**
 * Os lançamentos do depósito da operadora: bruto e taxa de cada repasse confirmado. A descrição vem do título
 * (`descricaoDoLancamentoDaBaixa`): documento · cliente ou fornecedor · parcela.
 */
export const LANCAMENTOS_DO_DEPOSITO = [
  { data: "19/11/2026", descricao: "PV-41 · Açaí da Vila · parcela 1/1", valor: "+ R$ 500,00" },
  { data: "19/11/2026", descricao: "PV-42 · Sorveteria Polar · parcela 1/1", valor: "+ R$ 1.000,00" },
  { data: "19/11/2026", descricao: "Taxa PV-41 · Cartões Rurais S.A. · parcela 1/1", valor: "− R$ 7,50" },
  { data: "19/11/2026", descricao: "Taxa PV-42 · Cartões Rurais S.A. · parcela 1/1", valor: "− R$ 30,00" },
] as const;

export const OUTRA_LINHA_PROXIMA = { data: "20/11/2026", descricao: "TARIFA PACOTE SERVICOS", valor: "− R$ 45,90" };

export const TARIFA = {
  descricao: "Tarifa de manutenção de conta — novembro",
  classificacao: "Fiscal (com documento)",
  comprovante: "Tarifa bancária",
  categoria: "Despesas bancárias",
} as const;
