import type { ExemploTitulos } from "@/ajuda/_titulos/exemplo";

/**
 * A história usada em todos os roteiros de Contas a receber. Dados fictícios e fixos. É uma receita que não
 * vem de pedido de venda (a venda do trator usado), porque as vendas de produto criam a conta a receber sozinhas.
 */
export const EXEMPLO = {
  contraparte: "Fazenda Santa Luzia",
  documento: "NF-e 321",
  emissao: "10/09/2026",
  competencia: "10/09/2026",
  categoria: "Venda de bens usados",
  conta: "Banco do Brasil — CC 12345-6",
  formaPagamento: "PIX",
  classificacao: "Fiscal (com documento)",
  tipoComprovante: "NF-e",
  numeroNota: "321",
  serie: "1",
  chave: "4126 0998 7654 3200 0190 5500 1000 0003 2110 0004 5678",
  parcelas: [
    { numero: 1, vencimento: "10/10/2026", valor: "15000,00", valorFormatado: "R$ 15.000,00", status: "VENCIDO" },
    { numero: 2, vencimento: "10/11/2026", valor: "15000,00", valorFormatado: "R$ 15.000,00", status: "VENCIDO" },
    { numero: 3, vencimento: "10/12/2026", valor: "15000,00", valorFormatado: "R$ 15.000,00", status: "EM_ABERTO" },
  ],
  renegociacao: [
    { vencimento: "25/11/2026", valor: "7500,00" },
    { vencimento: "25/12/2026", valor: "7500,00" },
  ],
  baixa: {
    data: "15/10/2026",
    conta: "Sicredi - Ag 0101/CC 98765-4",
    valorFormatado: "R$ 15.060,00",
    ajuste: "+ juros R$ 60,00",
    registradaPor: "Maria",
    aprovadaPor: "João",
    estornadaPor: "João",
    estornadaEm: "16/10/2026 09:40",
    motivoEstorno: "Conta errada: o PIX entrou no Banco do Brasil",
  },
  outrosTitulos: [
    {
      documento: "PV-12",
      classificacao: "Gerencial",
      contraparte: "Mercado Bom Preço",
      categoria: "Venda de produtos",
      parcelas: 2,
    },
    {
      documento: "318",
      classificacao: "Fiscal",
      contraparte: "Cartões Rurais S.A.",
      categoria: "Venda de produtos",
      parcelas: 3,
    },
  ],
} as const satisfies ExemploTitulos;
