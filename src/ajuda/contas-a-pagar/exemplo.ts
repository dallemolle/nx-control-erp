/** A história usada em todos os roteiros de Contas a pagar. Dados fictícios e fixos. */
export const EXEMPLO = {
  fornecedor: "Agro Insumos Ltda",
  documento: "NF-e 1234",
  emissao: "10/09/2026",
  competencia: "10/09/2026",
  categoria: "Insumos Agrícolas",
  centroCusto: "Lavoura",
  safra: "2025/26",
  conta: "Banco do Brasil — CC 12345-6",
  formaPagamento: "Boleto",
  classificacao: "Fiscal (com documento)",
  tipoComprovante: "NF-e",
  numeroNota: "1234",
  serie: "1",
  chave: "4126 0912 3456 7800 0199 5500 1000 0012 3410 0123 4564",
  parcelas: [
    { numero: 1, vencimento: "10/10/2026", valor: "1000,00", valorFormatado: "R$ 1.000,00", status: "VENCIDO" },
    { numero: 2, vencimento: "10/11/2026", valor: "1000,00", valorFormatado: "R$ 1.000,00", status: "VENCIDO" },
    { numero: 3, vencimento: "10/12/2026", valor: "1000,00", valorFormatado: "R$ 1.000,00", status: "EM_ABERTO" },
  ],
  renegociacao: [
    { vencimento: "25/11/2026", valor: "500,00" },
    { vencimento: "25/12/2026", valor: "500,00" },
  ],
} as const;

/** Outros títulos da lista, para a réplica não parecer vazia. */
export const OUTROS_TITULOS = [
  {
    documento: "Fatura 556",
    classificacao: "Fiscal",
    contraparte: "Energia Rural S.A.",
    categoria: "Energia elétrica",
    parcelas: 1,
  },
  {
    documento: "Recibo 88",
    classificacao: "Gerencial",
    contraparte: "José da Silva",
    categoria: "Mão de obra temporária",
    parcelas: 1,
  },
] as const;
