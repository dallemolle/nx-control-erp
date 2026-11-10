import type { StatusEntrega, StatusParcela } from "@prisma/client";
import { arredondar } from "./arredondar";

const UM_DIA_MS = 86_400_000;

export type ItemParaCalculo = { quantidadeKg: number; precoKg: number; custoKg: number };

/** Valor, custo e margem do item (RN-22), arredondados a 2 casas no fim. */
export function calcularItem({ quantidadeKg, precoKg, custoKg }: ItemParaCalculo) {
  const valor = arredondar(quantidadeKg * precoKg, 2);
  const custo = arredondar(quantidadeKg * custoKg, 2);
  return { valor, custo, margem: arredondar(valor - custo, 2) };
}

/** Totais do pedido: soma dos itens já arredondados (é o valor do título). Margem % em fração. */
export function calcularPedido(itens: ItemParaCalculo[]) {
  let valor = 0;
  let custo = 0;
  for (const item of itens) {
    const r = calcularItem(item);
    valor += r.valor;
    custo += r.custo;
  }
  valor = arredondar(valor, 2);
  custo = arredondar(custo, 2);
  const margem = arredondar(valor - custo, 2);
  return { valor, custo, margem, margemPercentual: valor === 0 ? 0 : margem / valor };
}

function diasEntre(inicio: Date, fim: Date): number {
  return Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / UM_DIA_MS));
}

/** Atraso da entrega em dias (RN-24); nunca negativo; entrega cancelada não tem atraso. */
export function atrasoEntregaDias(
  entrega: { status: StatusEntrega; dataPrevista: Date; dataRealizada: Date | null },
  hoje: Date,
): number | null {
  if (entrega.status === "CANCELADA") return null;
  const fim = entrega.status === "ENTREGUE" ? (entrega.dataRealizada ?? hoje) : hoje;
  return diasEntre(entrega.dataPrevista, fim);
}

export type SituacaoPagamento = "PAGO" | "EM_ABERTO" | "VENCIDO" | "CANCELADO";

export const SITUACOES_PAGAMENTO = ["PAGO", "EM_ABERTO", "VENCIDO", "CANCELADO"] as const satisfies readonly SituacaoPagamento[];

export const ROTULOS_SITUACAO_PAGAMENTO: Record<SituacaoPagamento, string> = {
  PAGO: "Pago",
  EM_ABERTO: "Em aberto",
  VENCIDO: "Vencido",
  CANCELADO: "Cancelado",
};

/**
 * Situação do pedido lida das parcelas do título (RN-26). Usa o vencimento
 * além do status gravado, que só é recalculado quando o financeiro mexe no título.
 */
export function situacaoPagamento(
  parcelas: { status: StatusParcela; dataVencimento: Date }[],
  hoje: Date,
): SituacaoPagamento {
  const ativas = parcelas.filter((p) => p.status !== "CANCELADO" && p.status !== "RENEGOCIADO");
  if (ativas.length === 0) return "CANCELADO";
  if (ativas.every((p) => p.status === "PAGO")) return "PAGO";
  const vencida = ativas.some((p) => p.status !== "PAGO" && (p.status === "VENCIDO" || p.dataVencimento < hoje));
  return vencida ? "VENCIDO" : "EM_ABERTO";
}

/** D-03: o lote está vencido na data da venda quando a validade é anterior a ela. */
export function loteVencidoNaData(validade: Date, data: Date): boolean {
  return validade.getTime() < data.getTime();
}
