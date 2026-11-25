import { formatarMoeda } from "@/lib/formatacao";
import { totalAbatido, type ValoresDaBaixa } from "./valorAbatido";
import { hojeDeCalendario } from "@/lib/producao/periodo";

/** Mais que isto, em dias, entre a data da baixa e o dia do registro vira aviso (provável erro de digitação). */
export const DIAS_LIMITE_DATA_ANTIGA = 30;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

export type TipoAvisoBaixa =
  | "DATA_FUTURA"
  | "DATA_ANTIGA"
  | "PARCELA_PAGA"
  | "PARCIAL"
  | "ACIMA_DO_SALDO"
  | "OUTRA_PENDENTE";

export type AvisoBaixa = { tipo: TipoAvisoBaixa; texto: string };

export type DadosAvisoBaixa = {
  tipoTitulo: "PAGAR" | "RECEBER";
  /** Data da baixa (data de calendário, meia-noite UTC). */
  data: Date;
  /** Instante em que a baixa foi registrada. */
  criadoEm: Date;
  /** Total que saiu ou entrou na conta, já com juros e multa. */
  valorPago: number;
  valorJuros: number;
  valorMulta: number;
  valorDesconto: number;
  /** `valorAtualizado` da parcela. */
  valorParcela: number;
  /** Soma do valor abatido (pago − juros − multa + desconto) das baixas aprovadas da parcela. */
  totalAprovado: number;
  /** Outras baixas pendentes na mesma parcela, sem contar esta. */
  outrasPendentes: number;
  /** Hoje como data de calendário (`hojeDeCalendario()`). */
  hoje: Date;
};

const centavos = (valor: number) => Math.round(valor * 100);

/**
 * O que merece atenção de quem aprova a baixa. Só informa: a aprovação não é bloqueada.
 * Ordem: data, valor, outra baixa pendente.
 */
export function avisosDaBaixa(dados: DadosAvisoBaixa): AvisoBaixa[] {
  const avisos: AvisoBaixa[] = [];

  // A API aceita data com hora: vale o dia de calendário UTC.
  const d = dados.data;
  const data = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

  if (data.getTime() > dados.hoje.getTime()) {
    avisos.push({ tipo: "DATA_FUTURA", texto: "Data da baixa no futuro" });
  }
  const diasAntes = Math.round((hojeDeCalendario(dados.criadoEm).getTime() - data.getTime()) / UM_DIA_MS);
  if (diasAntes > DIAS_LIMITE_DATA_ANTIGA) {
    avisos.push({ tipo: "DATA_ANTIGA", texto: `Data da baixa ${diasAntes} dias antes do registro` });
  }

  const saldo = centavos(dados.valorParcela) - centavos(dados.totalAprovado);
  const esperado = saldo + centavos(dados.valorJuros) + centavos(dados.valorMulta) - centavos(dados.valorDesconto);
  const pago = centavos(dados.valorPago);
  if (saldo <= 0) {
    avisos.push({ tipo: "PARCELA_PAGA", texto: "A parcela já está paga" });
  } else if (pago < esperado) {
    const sentido = dados.tipoTitulo === "PAGAR" ? "Pagamento" : "Recebimento";
    avisos.push({ tipo: "PARCIAL", texto: `${sentido} parcial: faltam ${formatarMoeda((esperado - pago) / 100)}` });
  } else if (pago > esperado) {
    avisos.push({ tipo: "ACIMA_DO_SALDO", texto: `Acima do saldo em ${formatarMoeda((pago - esperado) / 100)}` });
  }

  if (dados.outrasPendentes > 0) {
    avisos.push({ tipo: "OUTRA_PENDENTE", texto: "Há outra baixa pendente nesta parcela" });
  }
  return avisos;
}

/** A partir de todas as baixas da parcela: soma das aprovadas e quantas outras esperam aprovação. */
export function resumirBaixasDaParcela(
  baixaId: string,
  baixas: readonly (ValoresDaBaixa & { id: string; statusAprovacao: string })[],
): { totalAprovado: number; outrasPendentes: number } {
  const aprovadas = baixas.filter((b) => b.statusAprovacao === "APROVADO");
  return {
    totalAprovado: totalAbatido(aprovadas),
    outrasPendentes: baixas.filter((b) => b.statusAprovacao === "PENDENTE" && b.id !== baixaId).length,
  };
}
