/**
 * A história usada nos roteiros da Tesouraria. Dados fictícios e fixos. O extrato do Banco do Brasil de
 * 20/11/2026 fecha em R$ 48.204,10, mas o sistema tem R$ 48.250,00: faltava lançar a tarifa de R$ 45,90.
 */
export const BANCO = "Banco do Brasil - Ag 1234/CC 12345-6";
export const CAIXA = "Caixa · Fazenda";

export const SALDO = {
  contabilBanco: "R$ 48.250,00",
  informadoBanco: "48204,10",
  informadoBancoFormatado: "R$ 48.204,10",
  dataInformadoBanco: "20/11/2026",
  diferencaBanco: "R$ 45,90",
  contabilCaixa: "R$ 1.350,00",
  informadoCaixa: "R$ 1.350,00",
  dataInformadoCaixa: "18/11/2026",
} as const;

export const TARIFA = {
  valor: "45,90",
  data: "20/11/2026",
  descricao: "Tarifa de manutenção de conta — novembro",
  classificacao: "Fiscal (com documento)",
  comprovante: "Tarifa bancária",
  categoria: "Despesas bancárias",
} as const;

export const SAQUE = {
  valor: "2000,00",
  data: "18/11/2026",
  descricao: "Saque para o caixa — pagamento de diárias",
} as const;

export const LANCAMENTOS = [
  {
    data: "19/11/2026",
    conta: BANCO,
    tipo: "Saída",
    valor: "R$ 1.012,00",
    origem: "Baixa",
    classificacao: "Fiscal",
    comprovante: "1234",
    descricao: "Baixa aprovada — parcela nº 1",
  },
  {
    data: "18/11/2026",
    conta: BANCO,
    tipo: "Saída",
    valor: "R$ 2.000,00",
    origem: "Transferência",
    conciliado: true,
    acoes: true,
    descricao: SAQUE.descricao,
  },
  {
    data: "18/11/2026",
    conta: CAIXA,
    tipo: "Entrada",
    valor: "R$ 2.000,00",
    origem: "Transferência",
    acoes: true,
    descricao: SAQUE.descricao,
  },
  {
    data: "18/11/2026",
    conta: CAIXA,
    tipo: "Saída",
    valor: "R$ 650,00",
    origem: "Manual",
    classificacao: "Gerencial",
    acoes: true,
    descricao: "Diárias da colheita",
  },
] as const;

/** Lançamento corrigido no roteiro "Corrigir ou excluir um lançamento". */
export const DIARIAS = {
  descricao: "Diárias da colheita",
  valorErrado: "650,00",
  valorCerto: "560,00",
  motivo: "Lançado em duplicidade",
} as const;
