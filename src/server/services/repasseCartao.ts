import { Prisma, type StatusParcela } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireAlteracaoFilial, requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { hojeDeCalendario } from "@/lib/producao/periodo";
import { efetivarBaixa } from "./baixa";
import { recalcularEPersistirStatusParcela } from "./parcela";

export type SituacaoRepasse = "A_RECEBER" | "ATRASADO" | "RECEBIDO";

export type FiltroRepasses = {
  operadoraId?: string;
  inicio?: Date;
  fim?: Date;
  situacao?: SituacaoRepasse | "PENDENTES";
};

const EM_ABERTO: StatusParcela[] = ["EM_ABERTO", "A_VENCER", "VENCIDO"];
const centavos = (valor: Prisma.Decimal | number) => Math.round(Number(valor) * 100);

/** Uma linha por parcela a receber de venda na maquininha, com a taxa da parcela de mesmo número. */
export async function listarRepasses(filialId: string, filtro: FiltroRepasses, hoje: Date) {
  const periodo =
    filtro.inicio || filtro.fim
      ? {
          dataVencimento: {
            ...(filtro.inicio ? { gte: filtro.inicio } : {}),
            ...(filtro.fim ? { lte: filtro.fim } : {}),
          },
        }
      : {};
  const parcelas = await prisma.parcela.findMany({
    where: {
      status: { notIn: ["CANCELADO", "RENEGOCIADO"] },
      ...periodo,
      titulo: {
        filialId,
        tipo: "RECEBER",
        pedidoVenda: {
          is: filtro.operadoraId ? { operadoraCartaoId: filtro.operadoraId } : { operadoraCartaoId: { not: null } },
        },
      },
    },
    include: {
      repasseCartao: { select: { data: true } },
      titulo: {
        select: {
          _count: { select: { parcelas: true } },
          pedidoVenda: {
            select: {
              numero: true,
              operadoraCartao: { select: { nome: true } },
              tituloTaxa: { select: { parcelas: { select: { numero: true, valorAtualizado: true, status: true } } } },
            },
          },
        },
      },
    },
    orderBy: [{ dataVencimento: "asc" }, { numero: "asc" }],
  });

  const listados = parcelas.map((parcela) => {
    const pedido = parcela.titulo.pedidoVenda!;
    const parcelaTaxa = pedido.tituloTaxa?.parcelas.find(
      (t) => t.numero === parcela.numero && t.status !== "CANCELADO",
    );
    const bruto = centavos(parcela.valorAtualizado);
    const taxa = parcelaTaxa ? centavos(parcelaTaxa.valorAtualizado) : 0;
    const situacao: SituacaoRepasse =
      parcela.repasseCartao || parcela.status === "PAGO"
        ? "RECEBIDO"
        : parcela.dataVencimento < hoje
          ? "ATRASADO"
          : "A_RECEBER";
    return {
      parcelaId: parcela.id,
      operadora: pedido.operadoraCartao!.nome,
      pedidoNumero: pedido.numero,
      numero: parcela.numero,
      totalRepasses: parcela.titulo._count.parcelas,
      dataPrevista: parcela.dataVencimento,
      bruto: bruto / 100,
      taxa: taxa / 100,
      liquido: (bruto - taxa) / 100,
      situacao,
      recebidoEm: parcela.repasseCartao?.data ?? null,
    };
  });
  if (!filtro.situacao) return listados;
  if (filtro.situacao === "PENDENTES") return listados.filter((r) => r.situacao !== "RECEBIDO");
  return listados.filter((r) => r.situacao === filtro.situacao);
}

export type RepasseListado = Awaited<ReturnType<typeof listarRepasses>>[number];

/**
 * D-39: baixa o bruto e a taxa de cada repasse, já efetivadas (sem fila de
 * aprovação), numa transação só. Os valores vêm do pedido; só a data é escolhida.
 */
export async function confirmarRepasses(sessao: SessaoAtiva, parcelaIds: string[], data: Date): Promise<void> {
  requirePermission(sessao.perfil, "titulo:baixar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  const ids = [...new Set(parcelaIds)];
  if (ids.length === 0) throw new Error("Marque ao menos um repasse");
  if (Number.isNaN(data.getTime())) throw new Error("Informe a data do recebimento");
  if (data.getTime() > hojeDeCalendario().getTime()) throw new Error("A data do recebimento não pode ser futura");

  await prisma.$transaction(async (tx) => {
    // Trava as parcelas: duas confirmações simultâneas não baixam o mesmo repasse duas vezes.
    await tx.$queryRaw`SELECT id FROM parcelas WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
    const parcelas = await tx.parcela.findMany({
      where: { id: { in: ids }, titulo: { filialId: sessao.filialId } },
      include: {
        repasseCartao: { select: { id: true } },
        titulo: {
          select: {
            tipo: true,
            pedidoVenda: {
              select: {
                numero: true,
                operadoraCartao: { select: { contaBancariaId: true } },
                tituloTaxa: { select: { parcelas: true } },
              },
            },
          },
        },
      },
      orderBy: [{ tituloId: "asc" }, { numero: "asc" }],
    });
    if (parcelas.length !== ids.length) throw new Error("Repasse não encontrado");

    for (const parcela of parcelas) {
      const pedido = parcela.titulo.pedidoVenda;
      if (parcela.titulo.tipo !== "RECEBER" || !pedido?.operadoraCartao) {
        throw new Error("Esta parcela não é repasse de venda na maquininha");
      }
      if (parcela.repasseCartao || !EM_ABERTO.includes(parcela.status)) {
        throw new Error(`O repasse ${parcela.numero} do PV-${pedido.numero} já foi confirmado ou não está em aberto`);
      }
      const contaBancariaId = pedido.operadoraCartao.contaBancariaId;

      const baixaRecebimento = await tx.baixa.create({
        data: {
          parcelaId: parcela.id,
          data,
          valorPago: parcela.valorAtualizado,
          contaBancariaId,
          usuarioId: sessao.usuarioId,
          statusAprovacao: "PENDENTE",
        },
      });
      await efetivarBaixa(tx, sessao, baixaRecebimento.id);

      const parcelaTaxa = pedido.tituloTaxa?.parcelas.find(
        (t) => t.numero === parcela.numero && EM_ABERTO.includes(t.status),
      );
      let baixaTaxaId: string | null = null;
      if (parcelaTaxa) {
        const baixaTaxa = await tx.baixa.create({
          data: {
            parcelaId: parcelaTaxa.id,
            data,
            valorPago: parcelaTaxa.valorAtualizado,
            contaBancariaId,
            usuarioId: sessao.usuarioId,
            statusAprovacao: "PENDENTE",
          },
        });
        await efetivarBaixa(tx, sessao, baixaTaxa.id);
        baixaTaxaId = baixaTaxa.id;
      }

      await tx.repasseCartaoConfirmado.create({
        data: {
          parcelaId: parcela.id,
          baixaRecebimentoId: baixaRecebimento.id,
          baixaTaxaId,
          data,
          usuarioId: sessao.usuarioId,
        },
      });
      await registrarAuditoria(
        {
          empresaId: sessao.empresaId,
          filialId: sessao.filialId,
          usuarioId: sessao.usuarioId,
          entidade: "Parcela",
          entidadeId: parcela.id,
          acao: "CONFIRMAR_REPASSE",
          anterior: { status: parcela.status },
          novo: { data, baixaRecebimentoId: baixaRecebimento.id, baixaTaxaId },
        },
        tx,
      );
    }
  });
}

/** Desfaz o que a confirmação criou, enquanto nenhum lançamento estiver conciliado. */
export async function desfazerRepasse(sessao: SessaoAtiva, parcelaId: string): Promise<void> {
  requirePermission(sessao.perfil, "titulo:baixar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await prisma.$transaction(async (tx) => {
    const repasse = await tx.repasseCartaoConfirmado.findFirst({
      where: { parcelaId, parcela: { titulo: { filialId: sessao.filialId } } },
    });
    if (!repasse) throw new Error("Este repasse não foi confirmado");
    const baixaIds = [repasse.baixaRecebimentoId, repasse.baixaTaxaId].filter((id): id is string => id !== null);
    const conciliados = await tx.lancamentoBancario.count({
      where: { baixaId: { in: baixaIds }, grupoConciliacaoId: { not: null } },
    });
    if (conciliados > 0) throw new Error("O repasse já foi conciliado. Desconcilie na Conciliação antes");

    const baixas = await tx.baixa.findMany({ where: { id: { in: baixaIds } }, select: { parcelaId: true } });
    await tx.repasseCartaoConfirmado.delete({ where: { id: repasse.id } });
    await tx.lancamentoBancario.deleteMany({ where: { baixaId: { in: baixaIds } } });
    await tx.baixa.deleteMany({ where: { id: { in: baixaIds } } });
    for (const baixa of baixas) await recalcularEPersistirStatusParcela(baixa.parcelaId, tx);

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Parcela",
        entidadeId: parcelaId,
        acao: "DESFAZER_REPASSE",
        anterior: { data: repasse.data, baixaRecebimentoId: repasse.baixaRecebimentoId, baixaTaxaId: repasse.baixaTaxaId },
        novo: null,
      },
      tx,
    );
  });
}
