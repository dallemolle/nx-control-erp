import { prisma } from "@/server/db/client";
import type { ClientePrisma } from "@/server/audit/registrar";
import type { StatusParcela } from "@prisma/client";
import { totalAbatido, type ValoresDaBaixa } from "@/lib/financeiro/valorAbatido";

export type ParcelaParaStatus = {
  valorAtualizado: number;
  dataVencimento: Date;
  status: StatusParcela;
};

export type BaixaAprovadaParaStatus = ValoresDaBaixa;

type Decimalish = { toString(): string } | number;

export const SELECT_VALORES_BAIXA = { valorPago: true, valorJuros: true, valorMulta: true, valorDesconto: true } as const;

export function valoresDaBaixa(b: {
  valorPago: Decimalish;
  valorJuros: Decimalish;
  valorMulta: Decimalish;
  valorDesconto: Decimalish;
}): ValoresDaBaixa {
  return {
    valorPago: Number(b.valorPago),
    valorJuros: Number(b.valorJuros),
    valorMulta: Number(b.valorMulta),
    valorDesconto: Number(b.valorDesconto),
  };
}

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

export function calcularStatusParcela(
  parcela: ParcelaParaStatus,
  baixasAprovadas: BaixaAprovadaParaStatus[],
  hoje: Date,
): StatusParcela {
  if (parcela.status === "CANCELADO" || parcela.status === "RENEGOCIADO") {
    return parcela.status;
  }

  const saldo = parcela.valorAtualizado - totalAbatido(baixasAprovadas);

  if (saldo <= 0) return "PAGO";
  if (saldo < parcela.valorAtualizado) return "PARCIALMENTE_PAGO";

  const msAteVencimento = parcela.dataVencimento.getTime() - hoje.getTime();
  if (msAteVencimento < 0) return "VENCIDO";
  if (msAteVencimento <= SETE_DIAS_MS) return "A_VENCER";
  return "EM_ABERTO";
}

export async function recalcularEPersistirStatusParcela(
  parcelaId: string,
  db: ClientePrisma = prisma,
): Promise<StatusParcela> {
  const parcela = await db.parcela.findUniqueOrThrow({
    where: { id: parcelaId },
    include: { baixas: true },
  });

  const baixasAprovadas = parcela.baixas
    .filter((baixa) => baixa.statusAprovacao === "APROVADO")
    .map(valoresDaBaixa);

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

  await db.parcela.update({ where: { id: parcelaId }, data: { status: statusCalculado } });
  return statusCalculado;
}
