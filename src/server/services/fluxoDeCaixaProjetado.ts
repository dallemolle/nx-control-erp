import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { TipoTitulo } from "@prisma/client";
import { buscarSaldoEmCaixaAte, calcularJanela, fimDoDiaUTC, type SubPeriodo } from "./fluxoDeCaixa";
import { whereTituloPorClassificacao, type FiltroClassificacao } from "./classificacaoFiscal";

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

/** Parcelas em aberto vencidas antes da janela, numa linha própria antes do primeiro mês. */
export type LinhaEmAtraso = {
  /** Último instante antes da janela — para o rótulo "venc. até". */
  venceuAte: Date;
  saldoInicial: number;
  entradasProjetadas: number;
  saidasProjetadas: number;
  geracaoLiquida: number;
  saldoFinal: number;
  alerta: boolean;
};

export type FluxoDeCaixaProjetado = { emAtraso: LinhaEmAtraso | null; periodos: PeriodoFluxoDeCaixaProjetado[] };

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

/** Soma as parcelas por tipo e encadeia o saldo a partir de `saldoInicial`. */
function agregar(parcelas: ParcelaParaProjecao[], saldoInicial: number) {
  const entradasProjetadas = parcelas.filter((p) => p.tipo === "RECEBER").reduce((soma, p) => soma + p.saldo, 0);
  const saidasProjetadas = parcelas.filter((p) => p.tipo === "PAGAR").reduce((soma, p) => soma + p.saldo, 0);
  const geracaoLiquida = entradasProjetadas - saidasProjetadas;
  const saldoFinal = saldoInicial + geracaoLiquida;
  return { saldoInicial, entradasProjetadas, saidasProjetadas, geracaoLiquida, saldoFinal, alerta: saldoFinal < 0 };
}

/**
 * Agrega as parcelas em aberto (já filtradas por status e escopadas por
 * filial pelo chamador) em cada sub-período, encadeando o saldo final de
 * um como saldo inicial do próximo — mesmo princípio de
 * `calcularPeriodosFluxoDeCaixa` no fluxo realizado, mas agrupando por
 * `tipo` de título (RECEBER/PAGAR) em vez de tipo de lançamento.
 *
 * Com `atrasadas` (parcelas vencidas antes da janela, mesmo vazia), monta
 * antes a linha "Em atraso" e os meses partem do saldo final dela; sem
 * `atrasadas`, `emAtraso` é `null`.
 */
export function calcularPeriodosFluxoDeCaixaProjetado(
  periodos: SubPeriodo[],
  parcelas: ParcelaParaProjecao[],
  saldoInicialAbsoluto: number,
  atrasadas?: ParcelaParaProjecao[],
): FluxoDeCaixaProjetado {
  const emAtraso = atrasadas
    ? { venceuAte: new Date(periodos[0].inicio.getTime() - 1), ...agregar(atrasadas, saldoInicialAbsoluto) }
    : null;
  let saldoCorrente = emAtraso ? emAtraso.saldoFinal : saldoInicialAbsoluto;

  const meses = periodos.map(({ inicio, fim }) => {
    const doPeriodo = parcelas.filter((p) => p.dataVencimento >= inicio && p.dataVencimento <= fim);
    const linha = agregar(doPeriodo, saldoCorrente);
    saldoCorrente = linha.saldoFinal;
    return { inicio, fim, ...linha };
  });

  return { emAtraso, periodos: meses };
}

const STATUS_EM_ABERTO = ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"] as const;

async function buscarParcelasEmAberto(
  filialId: string,
  dataVencimento: { gte?: Date; lte?: Date; lt?: Date },
  classificacao?: FiltroClassificacao,
): Promise<ParcelaParaProjecao[]> {
  const parcelas = await prisma.parcela.findMany({
    where: {
      titulo: { filialId, ...whereTituloPorClassificacao(classificacao) },
      status: { in: [...STATUS_EM_ABERTO] },
      dataVencimento,
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

export function buscarParcelasEmAbertoNoPeriodo(
  filialId: string,
  inicio: Date,
  fim: Date,
  classificacao?: FiltroClassificacao,
): Promise<ParcelaParaProjecao[]> {
  return buscarParcelasEmAberto(filialId, { gte: inicio, lte: fim }, classificacao);
}

/** Parcelas em aberto com vencimento anterior a `inicio` — a linha "Em atraso". */
export function buscarParcelasEmAbertoVencidasAntes(
  filialId: string,
  inicio: Date,
  classificacao?: FiltroClassificacao,
): Promise<ParcelaParaProjecao[]> {
  return buscarParcelasEmAberto(filialId, { lt: inicio }, classificacao);
}

/**
 * Com `opcoes.classificacao`: só parcelas de títulos daquela classificação,
 * partindo de 0 (acumulado — o saldo bancário não se divide) e sem alerta de
 * saldo negativo, que não faz sentido sobre um acumulado parcial.
 *
 * A linha "Em atraso" só existe quando a janela contém hoje: numa janela
 * inteira no futuro ou no passado, "antes da janela" misturaria parcelas que
 * ainda nem venceram.
 */
export async function listarFluxoDeCaixaProjetado(
  sessao: SessaoAtiva,
  modo: ModoJanelaProjetado,
  dataReferencia: Date,
  opcoes: { classificacao?: FiltroClassificacao } = {},
): Promise<FluxoDeCaixaProjetado> {
  requirePermission(sessao.perfil, "titulo:ler");

  const periodos = calcularJanelaProjetada(modo, dataReferencia);
  const inicioDaJanela = periodos[0].inicio;
  const fimDaJanela = periodos[periodos.length - 1].fim;
  const agora = new Date();
  const contemHoje = inicioDaJanela <= agora && agora <= fimDaJanela;

  const [saldoInicialAbsoluto, parcelas, atrasadas] = await Promise.all([
    opcoes.classificacao ? Promise.resolve(0) : buscarSaldoEmCaixaAte(sessao.filialId, agora),
    buscarParcelasEmAbertoNoPeriodo(sessao.filialId, inicioDaJanela, fimDaJanela, opcoes.classificacao),
    contemHoje
      ? buscarParcelasEmAbertoVencidasAntes(sessao.filialId, inicioDaJanela, opcoes.classificacao)
      : Promise.resolve(undefined),
  ]);

  const resultado = calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, saldoInicialAbsoluto, atrasadas);
  if (!opcoes.classificacao) return resultado;
  return {
    emAtraso: resultado.emAtraso && { ...resultado.emAtraso, alerta: false },
    periodos: resultado.periodos.map((periodo) => ({ ...periodo, alerta: false })),
  };
}
