import { prisma } from "@/server/db/client";
import type { StatusParcela } from "@prisma/client";

export type ParcelaParaStatus = {
  valorAtualizado: number;
  dataVencimento: Date;
  status: StatusParcela;
};

export type BaixaAprovadaParaStatus = {
  valorPago: number;
};

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

export function calcularStatusParcela(
  parcela: ParcelaParaStatus,
  baixasAprovadas: BaixaAprovadaParaStatus[],
  hoje: Date,
): StatusParcela {
  if (parcela.status === "CANCELADO" || parcela.status === "RENEGOCIADO") {
    return parcela.status;
  }

  const totalPago = baixasAprovadas.reduce((soma, baixa) => soma + baixa.valorPago, 0);
  const saldo = parcela.valorAtualizado - totalPago;

  if (saldo <= 0) return "PAGO";
  if (saldo < parcela.valorAtualizado) return "PARCIALMENTE_PAGO";

  const msAteVencimento = parcela.dataVencimento.getTime() - hoje.getTime();
  if (msAteVencimento < 0) return "VENCIDO";
  if (msAteVencimento <= SETE_DIAS_MS) return "A_VENCER";
  return "EM_ABERTO";
}

export async function recalcularEPersistirStatusParcela(parcelaId: string): Promise<StatusParcela> {
  const parcela = await prisma.parcela.findUniqueOrThrow({
    where: { id: parcelaId },
    include: { baixas: true },
  });

  const baixasAprovadas = parcela.baixas
    .filter((baixa) => baixa.statusAprovacao === "APROVADO")
    .map((baixa) => ({ valorPago: Number(baixa.valorPago) }));

  const statusCalculado = calcularStatusParcela(
    {
      valorAtualizado: Number(parcela.valorAtualizado),
      dataVencimento: parcela.dataVencimento,
      status: parcela.status,
    },
    baixasAprovadas,
    new Date(),
  );

  if (statusCalculado === parcela.status) {
    return parcela.status;
  }

  await prisma.parcela.update({ where: { id: parcelaId }, data: { status: statusCalculado } });
  return statusCalculado;
}
