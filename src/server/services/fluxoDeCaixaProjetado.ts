import { prisma } from "@/server/db/client";
import { valoresDaBaixa } from "@/server/services/parcela";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { TipoTitulo } from "@prisma/client";
import { buscarAguardandoConciliacao, buscarSaldoConciliado, calcularJanela, fimDoDiaUTC, type AguardandoConciliacao, type SubPeriodo } from "./fluxoDeCaixa";
import { totalAbatido, type ValoresDaBaixa } from "@/lib/financeiro/valorAbatido";
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
  /** Último instante do atraso (véspera do corte) — para o rótulo "venc. até". */
  venceuAte: Date;
  saldoInicial: number;
  entradasProjetadas: number;
  saidasProjetadas: number;
  geracaoLiquida: number;
  saldoFinal: number;
  alerta: boolean;
};

/** Parcelas em aberto que vencem entre hoje e a véspera de uma janela futura. */
export type LinhaAVencerAntes = Omit<LinhaEmAtraso, "venceuAte"> & {
  /** Véspera da janela, para o rótulo "A vencer até". */
  venceAte: Date;
};

/** Lançamentos ainda não conciliados: liga o saldo conciliado (saldo inicial) ao saldo contábil (saldo final). */
export type LinhaAguardandoConciliacao = Omit<LinhaEmAtraso, "venceuAte">;

export type FluxoDeCaixaProjetado = {
  aguardandoConciliacao: LinhaAguardandoConciliacao | null;
  emAtraso: LinhaEmAtraso | null;
  aVencerAntes: LinhaAVencerAntes | null;
  periodos: PeriodoFluxoDeCaixaProjetado[];
};

/** Parcelas que vencem antes da janela, cada grupo na sua linha (presente = linha existe, mesmo vazia). */
export type ParcelasAntesDaJanela = {
  /** Lançado e não conciliado; presente = linha existe, mesmo zerada. */
  aguardandoConciliacao?: AguardandoConciliacao;
  atrasadas?: { parcelas: ParcelaParaProjecao[]; venceuAte: Date };
  aVencerAntes?: ParcelaParaProjecao[];
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
  baixasAprovadas: readonly ValoresDaBaixa[],
): number {
  return valorAtualizado - totalAbatido(baixasAprovadas);
}

/** Uma linha da projeção a partir das entradas e saídas, encadeando de `saldoInicial`. */
function linha(entradasProjetadas: number, saidasProjetadas: number, saldoInicial: number) {
  const geracaoLiquida = entradasProjetadas - saidasProjetadas;
  const saldoFinal = saldoInicial + geracaoLiquida;
  return { saldoInicial, entradasProjetadas, saidasProjetadas, geracaoLiquida, saldoFinal, alerta: saldoFinal < 0 };
}

/** Soma as parcelas por tipo e encadeia o saldo a partir de `saldoInicial`. */
function agregar(parcelas: ParcelaParaProjecao[], saldoInicial: number) {
  const entradas = parcelas.filter((p) => p.tipo === "RECEBER").reduce((soma, p) => soma + p.saldo, 0);
  const saidas = parcelas.filter((p) => p.tipo === "PAGAR").reduce((soma, p) => soma + p.saldo, 0);
  return linha(entradas, saidas, saldoInicial);
}

/**
 * Agrega as parcelas em aberto (já filtradas por status e escopadas por
 * filial pelo chamador) em cada sub-período, encadeando o saldo final de
 * um como saldo inicial do próximo — mesmo princípio de
 * `calcularPeriodosFluxoDeCaixa` no fluxo realizado, mas agrupando por
 * `tipo` de título (RECEBER/PAGAR) em vez de tipo de lançamento.
 *
 * Antes dos meses, na ordem: "Aguardando conciliação" (se
 * `anteriores.aguardandoConciliacao` vier), "Em atraso" (se
 * `anteriores.atrasadas` vier) e "A vencer até" (se `anteriores.aVencerAntes`
 * vier). Cada uma parte do saldo final da anterior, e os meses partem da última.
 */
export function calcularPeriodosFluxoDeCaixaProjetado(
  periodos: SubPeriodo[],
  parcelas: ParcelaParaProjecao[],
  saldoInicialAbsoluto: number,
  anteriores: ParcelasAntesDaJanela = {},
): FluxoDeCaixaProjetado {
  const aguardandoConciliacao = anteriores.aguardandoConciliacao
    ? linha(anteriores.aguardandoConciliacao.entradas, anteriores.aguardandoConciliacao.saidas, saldoInicialAbsoluto)
    : null;
  const saldoDePartida = aguardandoConciliacao?.saldoFinal ?? saldoInicialAbsoluto;
  const emAtraso = anteriores.atrasadas
    ? { venceuAte: anteriores.atrasadas.venceuAte, ...agregar(anteriores.atrasadas.parcelas, saldoDePartida) }
    : null;
  const aVencerAntes = anteriores.aVencerAntes
    ? {
        venceAte: new Date(periodos[0].inicio.getTime() - 1),
        ...agregar(anteriores.aVencerAntes, emAtraso ? emAtraso.saldoFinal : saldoDePartida),
      }
    : null;
  let saldoCorrente = aVencerAntes?.saldoFinal ?? emAtraso?.saldoFinal ?? saldoDePartida;

  const meses = periodos.map(({ inicio, fim }) => {
    const doPeriodo = parcelas.filter((p) => p.dataVencimento >= inicio && p.dataVencimento <= fim);
    const agregado = agregar(doPeriodo, saldoCorrente);
    saldoCorrente = agregado.saldoFinal;
    return { inicio, fim, ...agregado };
  });

  return { aguardandoConciliacao, emAtraso, aVencerAntes, periodos: meses };
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
      parcela.baixas.map(valoresDaBaixa),
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

/** Parcelas em aberto com vencimento em `[de, ate)` — a linha "A vencer até" de uma janela futura. */
export function buscarParcelasEmAbertoVencendoEntre(
  filialId: string,
  de: Date,
  ate: Date,
  classificacao?: FiltroClassificacao,
): Promise<ParcelaParaProjecao[]> {
  return buscarParcelasEmAberto(filialId, { gte: de, lt: ate }, classificacao);
}

/**
 * Com `opcoes.classificacao`: só parcelas de títulos daquela classificação,
 * partindo de 0 (acumulado — o saldo bancário não se divide) e sem alerta de
 * saldo negativo, que não faz sentido sobre um acumulado parcial.
 *
 * Tudo parte do saldo em caixa conciliado de hoje; a linha "Aguardando
 * conciliação" soma o que foi lançado e o extrato ainda não confirmou e chega
 * ao saldo contábil, de onde partem as demais. O corte do atraso é o menor entre o
 * início da janela e o início de hoje: "Em atraso" (sempre presente) soma as
 * parcelas em aberto vencidas antes dele. Numa janela que começa depois de
 * hoje, "A vencer até" soma as que vencem de hoje até a véspera da janela.
 * Os três intervalos (atraso, a vencer, meses) não se sobrepõem.
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
  const inicioDeHoje = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
  const corte = inicioDaJanela < inicioDeHoje ? inicioDaJanela : inicioDeHoje;
  const janelaFutura = inicioDaJanela > inicioDeHoje;

  const [saldoInicialAbsoluto, aguardandoConciliacao, parcelas, atrasadas, aVencerAntes] = await Promise.all([
    opcoes.classificacao ? Promise.resolve(0) : buscarSaldoConciliado(sessao.filialId),
    opcoes.classificacao ? Promise.resolve(undefined) : buscarAguardandoConciliacao(sessao.filialId),
    buscarParcelasEmAbertoNoPeriodo(sessao.filialId, inicioDaJanela, fimDaJanela, opcoes.classificacao),
    buscarParcelasEmAbertoVencidasAntes(sessao.filialId, corte, opcoes.classificacao),
    janelaFutura
      ? buscarParcelasEmAbertoVencendoEntre(sessao.filialId, inicioDeHoje, inicioDaJanela, opcoes.classificacao)
      : Promise.resolve(undefined),
  ]);

  const resultado = calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, saldoInicialAbsoluto, {
    aguardandoConciliacao,
    atrasadas: { parcelas: atrasadas, venceuAte: new Date(corte.getTime() - 1) },
    aVencerAntes,
  });
  if (!opcoes.classificacao) return resultado;
  return {
    aguardandoConciliacao: null,
    emAtraso: resultado.emAtraso && { ...resultado.emAtraso, alerta: false },
    aVencerAntes: resultado.aVencerAntes && { ...resultado.aVencerAntes, alerta: false },
    periodos: resultado.periodos.map((periodo) => ({ ...periodo, alerta: false })),
  };
}
