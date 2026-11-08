import { prisma } from "@/server/db/client";
import type { StatusParcela } from "@prisma/client";
import { buscarSaldoEmCaixaAteDasFiliais } from "./fluxoDeCaixa";
import { saldoRemanescenteParcela } from "./fluxoDeCaixaProjetado";

/**
 * Regra única dos números consolidados da empresa (dashboard executivo,
 * fluxo de caixa estratégico): só filiais ativas entram na soma — o
 * consolidado mostra a empresa em operação (decisão do usuário, 2026-11-08).
 *
 * Para não esconder dinheiro, `filiaisDesativadasComPendencia` lista as
 * desativadas que ainda têm parcela em aberto ou saldo em caixa, e as telas
 * consolidadas mostram um aviso com elas.
 */
export async function idsDasFiliaisAtivas(empresaId: string): Promise<string[]> {
  const filiais = await prisma.filial.findMany({ where: { empresaId, ativo: true }, select: { id: true } });
  return filiais.map((filial) => filial.id);
}

export type FilialDesativadaComPendencia = {
  id: string;
  nome: string;
  parcelasEmAberto: number;
  valorEmAberto: number;
  saldoEmCaixa: number;
};

const STATUS_ABERTO: StatusParcela[] = ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"];

export async function filiaisDesativadasComPendencia(empresaId: string): Promise<FilialDesativadaComPendencia[]> {
  const desativadas = await prisma.filial.findMany({
    where: { empresaId, ativo: false },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });
  if (desativadas.length === 0) return [];

  const hoje = new Date();
  const comPendencia = await Promise.all(
    desativadas.map(async (filial) => {
      const [parcelas, saldoEmCaixa] = await Promise.all([
        prisma.parcela.findMany({
          where: { titulo: { filialId: filial.id }, status: { in: STATUS_ABERTO } },
          select: {
            valorAtualizado: true,
            baixas: { where: { statusAprovacao: "APROVADO" }, select: { valorPago: true } },
          },
        }),
        buscarSaldoEmCaixaAteDasFiliais([filial.id], hoje),
      ]);
      const valorEmAberto = parcelas.reduce(
        (soma, parcela) =>
          soma +
          saldoRemanescenteParcela(
            Number(parcela.valorAtualizado),
            parcela.baixas.map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
          ),
        0,
      );
      return { ...filial, parcelasEmAberto: parcelas.length, valorEmAberto, saldoEmCaixa };
    }),
  );

  return comPendencia.filter(
    (filial) => filial.parcelasEmAberto > 0 || Math.abs(filial.saldoEmCaixa) >= 0.005,
  );
}
