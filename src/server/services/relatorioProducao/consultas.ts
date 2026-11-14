import type { StatusParcela } from "@prisma/client";
import { prisma } from "@/server/db/client";
import type { ItemVendido, OPDatada, SaldoAReceber } from "@/lib/producao/relatorios";
import type { OPDoProcessamento } from "@/lib/producao/relatoriosProcessamento";
import type { OPListada } from "../ordemProducao";
import { saldoRemanescenteParcela } from "../fluxoDeCaixaProjetado";

/** Parcela ainda devida (RN-26); paga, cancelada e renegociada ficam fora. */
const PARCELA_ABERTA: StatusParcela[] = ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"];

/** Itens de pedidos confirmados com data no período (RN-31), com produto, cliente, canal e forma. */
export async function buscarItensVendidos(
  filialId: string,
  periodo: { inicio: Date; fim: Date },
): Promise<ItemVendido[]> {
  const itens = await prisma.itemPedidoVenda.findMany({
    where: { pedido: { filialId, status: "CONFIRMADO", data: { gte: periodo.inicio, lte: periodo.fim } } },
    select: {
      pedidoId: true,
      quantidadeKg: true,
      precoKg: true,
      custoKg: true,
      lote: { select: { produto: { select: { id: true, categoria: true, frutaId: true } } } },
      pedido: {
        select: {
          data: true,
          canal: true,
          formaPagamento: true,
          cliente: { select: { id: true, nome: true } },
        },
      },
    },
  });
  return itens.map((i) => ({
    pedidoId: i.pedidoId,
    produtoId: i.lote.produto.id,
    categoria: i.lote.produto.categoria,
    frutaId: i.lote.produto.frutaId,
    quantidadeKg: Number(i.quantidadeKg),
    precoKg: Number(i.precoKg),
    custoKg: Number(i.custoKg),
    data: i.pedido.data,
    clienteId: i.pedido.cliente.id,
    cliente: i.pedido.cliente.nome,
    canal: i.pedido.canal,
    formaPagamento: i.pedido.formaPagamento,
  }));
}

/** Saldo de hoje das parcelas abertas dos títulos de pedidos confirmados da filial, de qualquer data. */
export async function buscarSaldosAReceber(filialId: string): Promise<SaldoAReceber[]> {
  const parcelas = await prisma.parcela.findMany({
    where: {
      status: { in: PARCELA_ABERTA },
      titulo: { pedidoVenda: { is: { filialId, status: "CONFIRMADO" } } },
    },
    select: {
      valorAtualizado: true,
      baixas: { where: { statusAprovacao: "APROVADO" }, select: { valorPago: true } },
      titulo: {
        select: {
          pedidoVenda: { select: { formaPagamento: true, cliente: { select: { id: true, nome: true } } } },
        },
      },
    },
  });
  return parcelas.flatMap((p) => {
    const pedido = p.titulo.pedidoVenda;
    if (!pedido) return [];
    return [
      {
        clienteId: pedido.cliente.id,
        cliente: pedido.cliente.nome,
        formaPagamento: pedido.formaPagamento,
        saldo: saldoRemanescenteParcela(
          Number(p.valorAtualizado),
          p.baixas.map((b) => ({ valorPago: Number(b.valorPago) })),
        ),
      },
    ];
  });
}

/** OP da listagem de Processamento no formato das agregações (mesmos números da lista). */
export function opDoPainel(op: OPListada): OPDatada {
  return {
    frutaId: op.frutaId,
    status: op.status,
    frutoKg: op.resumo.frutoKg,
    polpaKg: op.resumo.polpaKg,
    custoTotal: op.resumo.custo.custoTotal,
    balancoVerificar: op.resumo.balanco.status === "VERIFICAR",
    branqueamentoVerificar: op.resumo.branqueamento === "VERIFICAR",
    data: op.data,
  };
}

/** OP da listagem com o processo (água, caroço, perda) e o custo separado em fruto e insumos. */
export function opDoProcessamento(op: OPListada): OPDoProcessamento {
  return {
    ...opDoPainel(op),
    aguaLitros: Number(op.aguaLitros),
    carocoResiduoKg: Number(op.carocoResiduoKg),
    perdaKg: Number(op.perdaKg),
    custoFrutoTotal: op.resumo.custo.custoFrutoTotal,
    custoInsumosTotal: op.resumo.custo.custoInsumosTotal,
  };
}
