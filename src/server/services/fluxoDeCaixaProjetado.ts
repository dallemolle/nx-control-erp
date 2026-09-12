import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { TipoTitulo } from "@prisma/client";
import { buscarSaldoEmCaixaAte, calcularJanela, fimDoDiaUTC, type SubPeriodo } from "./fluxoDeCaixa";

export type ModoJanelaProjetado = "MOVEL" | "ANO_CIVIL";

export type ParcelaParaProjecao = { dataVencimento: Date; saldo: number; tipo: TipoTitulo };

export type PeriodoFluxoDeCaixaProjetado = SubPeriodo & {
  saldoInicial: number;
  entradasProjetadas: number;
  saidasProjetadas: number;
  geracaoLiquida: number;
  saldoFinal: number;
  alerta: boolean;
};

/**
 * Recorta a janela de 12 meses do modo escolhido. MOVEL desliza a partir do
 * mês de `dataReferencia`; ANO_CIVIL é jan-dez do ano de `dataReferencia`
 * (idêntico a `calcularJanela("MES", ...)` do fluxo realizado — reusado
 * diretamente em vez de duplicado).
 */
export function calcularJanelaProjetada(modo: ModoJanelaProjetado, dataReferencia: Date): SubPeriodo[] {
  if (modo === "ANO_CIVIL") {
    return calcularJanela("MES", dataReferencia);
  }

  const ano = dataReferencia.getUTCFullYear();
  const mes = dataReferencia.getUTCMonth();

  return Array.from({ length: 12 }, (_, i) => {
    const mesAbsoluto = mes + i;
    return {
      inicio: new Date(Date.UTC(ano, mesAbsoluto, 1)),
      fim: fimDoDiaUTC(ano, mesAbsoluto + 1, 0),
    };
  });
}

export function saldoRemanescenteParcela(
  valorAtualizado: number,
  baixasAprovadas: { valorPago: number }[],
): number {
  const totalPago = baixasAprovadas.reduce((soma, baixa) => soma + baixa.valorPago, 0);
  return valorAtualizado - totalPago;
}

/**
 * Agrega as parcelas em aberto (já filtradas por status e escopadas por
 * filial pelo chamador) em cada sub-período, encadeando o saldo final de
 * um como saldo inicial do próximo — mesmo princípio de
 * `calcularPeriodosFluxoDeCaixa` no fluxo realizado, mas agrupando por
 * `tipo` de título (RECEBER/PAGAR) em vez de tipo de lançamento.
 */
export function calcularPeriodosFluxoDeCaixaProjetado(
  periodos: SubPeriodo[],
  parcelas: ParcelaParaProjecao[],
  saldoInicialAbsoluto: number,
): PeriodoFluxoDeCaixaProjetado[] {
  let saldoCorrente = saldoInicialAbsoluto;

  return periodos.map(({ inicio, fim }) => {
    const doPeriodo = parcelas.filter((p) => p.dataVencimento >= inicio && p.dataVencimento <= fim);
    const entradasProjetadas = doPeriodo.filter((p) => p.tipo === "RECEBER").reduce((soma, p) => soma + p.saldo, 0);
    const saidasProjetadas = doPeriodo.filter((p) => p.tipo === "PAGAR").reduce((soma, p) => soma + p.saldo, 0);
    const geracaoLiquida = entradasProjetadas - saidasProjetadas;
    const saldoInicial = saldoCorrente;
    const saldoFinal = saldoInicial + geracaoLiquida;
    saldoCorrente = saldoFinal;

    return { inicio, fim, saldoInicial, entradasProjetadas, saidasProjetadas, geracaoLiquida, saldoFinal, alerta: saldoFinal < 0 };
  });
}

export async function buscarParcelasEmAbertoNoPeriodo(
  filialId: string,
  inicio: Date,
  fim: Date,
): Promise<ParcelaParaProjecao[]> {
  const parcelas = await prisma.parcela.findMany({
    where: {
      titulo: { filialId },
      status: { in: ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"] },
      dataVencimento: { gte: inicio, lte: fim },
    },
    include: {
      titulo: { select: { tipo: true } },
      baixas: { where: { statusAprovacao: "APROVADO" } },
    },
  });

  return parcelas.map((parcela) => ({
    dataVencimento: parcela.dataVencimento,
    tipo: parcela.titulo.tipo,
    saldo: saldoRemanescenteParcela(
      Number(parcela.valorAtualizado),
      parcela.baixas.map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
    ),
  }));
}

export async function listarFluxoDeCaixaProjetado(
  sessao: SessaoAtiva,
  modo: ModoJanelaProjetado,
  dataReferencia: Date,
): Promise<PeriodoFluxoDeCaixaProjetado[]> {
  requirePermission(sessao.perfil, "titulo:ler");

  const periodos = calcularJanelaProjetada(modo, dataReferencia);
  const inicioDaJanela = periodos[0].inicio;
  const fimDaJanela = periodos[periodos.length - 1].fim;
  const agora = new Date();

  const [saldoInicialAbsoluto, parcelas] = await Promise.all([
    buscarSaldoEmCaixaAte(sessao.filialId, agora),
    buscarParcelasEmAbertoNoPeriodo(sessao.filialId, inicioDaJanela, fimDaJanela),
  ]);

  return calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, saldoInicialAbsoluto);
}
