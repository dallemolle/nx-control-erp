import { avisosDaBaixa, type DadosAvisoBaixa } from "@/lib/financeiro/avisosDaBaixa";
import { nomeDaContaBancaria } from "@/lib/contaBancaria";

/**
 * As baixas que esperam aprovação no exemplo. Dados fictícios e fixos, da mesma história de Contas a pagar e
 * Contas a receber. Quem lê a ajuda é o Carlos Lima, da Tesouraria, em 16/10/2026: a terceira baixa foi
 * registrada por ele mesmo. Os avisos saem da regra real (`avisosDaBaixa`), não são escritos à mão.
 */
export const VOCE = "Carlos Lima";

export const HOJE = new Date("2026-10-16T00:00:00.000Z");

const CONTA_BB = nomeDaContaBancaria({ agencia: "1234", conta: "12345-6", banco: { nome: "Banco do Brasil" } });

export type BaixaDoExemplo = Omit<DadosAvisoBaixa, "hoje"> & {
  documento: string;
  contraparte: string;
  parcela: number;
  totalParcelas: number;
  conta: string;
  registradoPor: string;
};

const SEM_AJUSTE = { valorJuros: 0, valorMulta: 0, valorDesconto: 0 };

export const BAIXAS: readonly BaixaDoExemplo[] = [
  // A baixa do roteiro de Contas a pagar: parcela 1 do adubo, paga com R$ 12,00 de juros.
  {
    documento: "NF-e 1234",
    contraparte: "Agro Insumos Ltda",
    tipoTitulo: "PAGAR",
    parcela: 1,
    totalParcelas: 3,
    data: new Date("2026-10-15T00:00:00.000Z"),
    conta: CONTA_BB,
    valorPago: 1012,
    ...SEM_AJUSTE,
    valorJuros: 12,
    valorParcela: 1000,
    totalAprovado: 0,
    outrasPendentes: 0,
    registradoPor: "Maria Souza",
    criadoEm: new Date("2026-10-15T13:20:00.000Z"),
  },
  // Baixa em dobro: a parcela já tinha sido paga e aprovada em 05/10.
  {
    documento: "Recibo 88",
    contraparte: "José da Silva",
    tipoTitulo: "PAGAR",
    parcela: 1,
    totalParcelas: 1,
    data: new Date("2026-10-15T00:00:00.000Z"),
    conta: CONTA_BB,
    valorPago: 1200,
    ...SEM_AJUSTE,
    valorParcela: 1200,
    totalAprovado: 1200,
    outrasPendentes: 0,
    registradoPor: "Maria Souza",
    criadoEm: new Date("2026-10-15T17:05:00.000Z"),
  },
  // A baixa do roteiro de Contas a receber, registrada por quem está aprovando.
  {
    documento: "NF-e 321",
    contraparte: "Fazenda Santa Luzia",
    tipoTitulo: "RECEBER",
    parcela: 1,
    totalParcelas: 3,
    data: new Date("2026-10-15T00:00:00.000Z"),
    conta: CONTA_BB,
    valorPago: 15060,
    ...SEM_AJUSTE,
    valorJuros: 60,
    valorParcela: 15000,
    totalAprovado: 0,
    outrasPendentes: 0,
    registradoPor: VOCE,
    criadoEm: new Date("2026-10-15T19:45:00.000Z"),
  },
  // Conta de energia paga em 16/10: a Maria digitou janeiro em vez de outubro.
  {
    documento: "Fatura 556",
    contraparte: "Energia Rural S.A.",
    tipoTitulo: "PAGAR",
    parcela: 1,
    totalParcelas: 1,
    data: new Date("2026-01-16T00:00:00.000Z"),
    conta: CONTA_BB,
    valorPago: 845.3,
    ...SEM_AJUSTE,
    valorParcela: 845.3,
    totalAprovado: 0,
    outrasPendentes: 0,
    registradoPor: "Maria Souza",
    criadoEm: new Date("2026-10-16T14:30:00.000Z"),
  },
];

export function avisosDoExemplo(baixa: BaixaDoExemplo) {
  return avisosDaBaixa({ ...baixa, hoje: HOJE });
}

export const MOTIVO_REJEICAO = "Em dobro: parcela já paga em 05/10";
