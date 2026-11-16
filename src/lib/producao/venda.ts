import type { StatusEntrega, StatusParcela } from "@prisma/client";
import { formatarMoeda } from "@/lib/formatacao";
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

/** Limite de parcelas da venda a prazo: só protege contra erro de digitação. */
export const MAX_PARCELAS_VENDA = 60;

export type ParcelaVenda = { dataVencimento: Date; valor: number };

const centavos = (valor: number) => Math.round(valor * 100);

/** `28/56` → [28, 56]: dias inteiros ≥ 0, estritamente crescentes, de 1 a 60. */
export function interpretarPrazos(texto: string): { ok: true; prazos: number[] } | { ok: false; erro: string } {
  if (texto.trim() === "") return { ok: false, erro: "Informe os prazos" };
  const prazos: number[] = [];
  for (const parte of texto.split("/").map((p) => p.trim())) {
    if (!/^\d+$/.test(parte)) return { ok: false, erro: `Prazo inválido: ${parte || "(vazio)"}` };
    prazos.push(Number(parte));
  }
  if (prazos.length > MAX_PARCELAS_VENDA) return { ok: false, erro: `No máximo ${MAX_PARCELAS_VENDA} parcelas` };
  if (prazos.some((prazo, i) => i > 0 && prazo <= prazos[i - 1])) {
    return { ok: false, erro: "Os prazos devem ser crescentes" };
  }
  return { ok: true, prazos };
}

/** Vencimento = data + dias; valor dividido igual e a última parcela leva a diferença de centavos. */
export function gerarParcelasPorPrazos(data: Date, total: number, prazos: number[]): ParcelaVenda[] {
  const totalCentavos = centavos(total);
  const parte = Math.floor(totalCentavos / prazos.length);
  return prazos.map((dias, i) => ({
    dataVencimento: new Date(data.getTime() + dias * UM_DIA_MS),
    valor: (i === prazos.length - 1 ? totalCentavos - parte * (prazos.length - 1) : parte) / 100,
  }));
}

/** Condição gravada no pedido: dias de cada vencimento desde a data do pedido (`28/56`). */
export function condicaoDasParcelas(data: Date, vencimentos: Date[]): string {
  return vencimentos.map((vencimento) => Math.round((vencimento.getTime() - data.getTime()) / UM_DIA_MS)).join("/");
}

/** Regras das parcelas da venda a prazo; devolve a mensagem do primeiro erro ou `null`. */
export function validarParcelasVenda(data: Date, total: number, parcelas: ParcelaVenda[]): string | null {
  if (parcelas.length === 0) return "Informe os prazos";
  if (parcelas.length > MAX_PARCELAS_VENDA) return `No máximo ${MAX_PARCELAS_VENDA} parcelas`;
  if (parcelas.some((p) => !Number.isFinite(p.valor) || Number.isNaN(p.dataVencimento.getTime()))) {
    return "Preencha vencimento e valor de cada parcela";
  }
  if (parcelas.some((p) => p.dataVencimento.getTime() < data.getTime())) {
    return "O vencimento não pode ser antes da data do pedido";
  }
  if (parcelas.some((p, i) => i > 0 && p.dataVencimento.getTime() <= parcelas[i - 1].dataVencimento.getTime())) {
    return "Os vencimentos devem ser crescentes";
  }
  if (parcelas.some((p) => centavos(p.valor) <= 0)) return "O valor de cada parcela deve ser maior que zero";
  const soma = parcelas.reduce((acc, p) => acc + centavos(p.valor), 0);
  if (soma !== centavos(total)) {
    return `A soma das parcelas (${formatarMoeda(soma / 100)}) difere do total do pedido (${formatarMoeda(total)})`;
  }
  return null;
}
