import { prisma } from "@/server/db/client";
import { SELECT_VALORES_BAIXA, valoresDaBaixa } from "@/server/services/parcela";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { StatusParcela } from "@prisma/client";
import {
  buscarAguardandoConciliacaoDasFiliais,
  buscarSaldoEmCaixaAteDasFiliais,
  fimDoDiaUTC,
  saldoComAguardando,
  type AguardandoConciliacao,
} from "./fluxoDeCaixa";
import { saldoRemanescenteParcela } from "./fluxoDeCaixaProjetado";
import { buscarPendenciasFiscaisDaFilial, percentualGerencial } from "./relatorioFiscalGerencial";
import { idsDasFiliaisAtivas } from "./filiaisConsolidadas";
import { hojeDeCalendario } from "@/lib/producao/periodo";

export type IndicadoresExecutivos = {
  caixaDisponivel: number;
  aguardandoConciliacao: number;
  contasAPagarEmAberto: number;
  contasAReceberEmAberto: number;
  inadimplencia: number;
  geracaoDeCaixaMesAtual: number;
  obrigacoes7Dias: number;
  obrigacoes30Dias: number;
  recebimentosEsperados30Dias: number;
  saldoProjetado30Dias: number;
};

const STATUS_ABERTO: StatusParcela[] = ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"];

/** Parcelas em aberto das filiais, só com os campos que o dashboard usa. */
function buscarParcelasEmAbertoDasFiliais(filialIds: string[], venceAntesDe?: Date) {
  return prisma.parcela.findMany({
    where: {
      titulo: { filialId: { in: filialIds } },
      status: { in: STATUS_ABERTO },
      ...(venceAntesDe && { dataVencimento: { lt: venceAntesDe } }),
    },
    select: {
      valorAtualizado: true,
      dataVencimento: true,
      titulo: { select: { tipo: true } },
      baixas: { where: { statusAprovacao: "APROVADO" }, select: SELECT_VALORES_BAIXA },
    },
  });
}

function somasConciliadasNoPeriodo(filialIds: string[], inicio: Date, fim: Date) {
  return prisma.lancamentoBancario.groupBy({
    by: ["tipo", "origem"],
    where: {
      filialId: { in: filialIds },
      conciliado: true,
      data: { gte: inicio, lte: fim },
      contaBancaria: { ativo: true },
    },
    _sum: { valor: true },
  });
}

/** Entradas e saídas sem transferências entre contas; o líquido das transferências à parte (só move saldo). */
function totaisDoPeriodo(somas: { tipo: string; origem: string; _sum: { valor: unknown } }[]) {
  const somar = (filtro: (s: { tipo: string; origem: string }) => boolean) =>
    somas.filter(filtro).reduce((total, s) => total + Number(s._sum.valor ?? 0), 0);
  const transferencia = (s: { origem: string }) => s.origem === "TRANSFERENCIA";
  return {
    entradas: somar((s) => s.tipo === "ENTRADA" && !transferencia(s)),
    saidas: somar((s) => s.tipo === "SAIDA" && !transferencia(s)),
    transferencias: somar((s) => s.tipo === "ENTRADA" && transferencia(s)) - somar((s) => s.tipo === "SAIDA" && transferencia(s)),
  };
}

/**
 * O "hoje" do dashboard é o dia de Brasília, como data de calendário (meia-noite UTC, igual a vencimentos e datas
 * de lançamento). Antes era o dia UTC: depois das 21h, a parcela que vence hoje já contava como atrasada.
 */
export function diaDeHoje(agora: Date = new Date()) {
  const hoje = hojeDeCalendario(agora);
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth();
  const dia = hoje.getUTCDate();
  return { hoje, fimDeHoje: fimDoDiaUTC(ano, mes, dia), inicioMesAtual: new Date(Date.UTC(ano, mes, 1)) };
}

/** Uma parcela em aberto já reduzida ao que falta pagar ou receber. */
export type ParcelaParaIndicadores = { tipo: "PAGAR" | "RECEBER"; dataVencimento: Date; saldo: number };

/**
 * Os cards do dashboard a partir do caixa, das parcelas em aberto e do movimento conciliado do mês (sem transferências entre contas). `hoje` é a data
 * de calendário (meia-noite UTC). Inadimplência = a receber com vencimento antes de hoje, pela data (o `status`
 * gravado só é recalculado quando alguém abre a lista de títulos, e a parcela vencida paga em parte também conta).
 *
 * Caixa disponível é o saldo contábil (conciliado + o que aguarda conciliação), como na Tesouraria. O saldo projetado
 * em 30 dias é a mesma conta do Fluxo de caixa projetado: caixa disponível + atrasados (a receber − a pagar) + o que
 * vence nos próximos 30 dias (a receber − a pagar).
 */
export function calcularIndicadoresExecutivos(dados: {
  hoje: Date;
  caixaConciliado: number;
  aguardandoConciliacao: AguardandoConciliacao;
  parcelas: readonly ParcelaParaIndicadores[];
  entradasMes: number;
  saidasMes: number;
}): IndicadoresExecutivos {
  const { hoje } = dados;
  const em7Dias = fimDoDiaUTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + 7);
  const em30Dias = fimDoDiaUTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + 30);

  let contasAPagarEmAberto = 0;
  let contasAReceberEmAberto = 0;
  let inadimplencia = 0;
  let aPagarVencido = 0;
  let obrigacoes7Dias = 0;
  let obrigacoes30Dias = 0;
  let recebimentosEsperados30Dias = 0;

  for (const { tipo, dataVencimento, saldo } of dados.parcelas) {
    if (saldo <= 0) continue;
    const vencida = dataVencimento < hoje;
    const dentroDe7Dias = !vencida && dataVencimento <= em7Dias;
    const dentroDe30Dias = !vencida && dataVencimento <= em30Dias;

    if (tipo === "PAGAR") {
      contasAPagarEmAberto += saldo;
      if (vencida) aPagarVencido += saldo;
      if (dentroDe7Dias) obrigacoes7Dias += saldo;
      if (dentroDe30Dias) obrigacoes30Dias += saldo;
    } else {
      contasAReceberEmAberto += saldo;
      if (vencida) inadimplencia += saldo;
      if (dentroDe30Dias) recebimentosEsperados30Dias += saldo;
    }
  }

  const caixaDisponivel = saldoComAguardando(dados.caixaConciliado, dados.aguardandoConciliacao);
  return {
    caixaDisponivel,
    aguardandoConciliacao: dados.aguardandoConciliacao.entradas - dados.aguardandoConciliacao.saidas,
    contasAPagarEmAberto,
    contasAReceberEmAberto,
    inadimplencia,
    geracaoDeCaixaMesAtual: dados.entradasMes - dados.saidasMes,
    obrigacoes7Dias,
    obrigacoes30Dias,
    recebimentosEsperados30Dias,
    saldoProjetado30Dias:
      caixaDisponivel + inadimplencia - aPagarVencido + recebimentosEsperados30Dias - obrigacoes30Dias,
  };
}

function paraIndicadores(
  parcelas: Awaited<ReturnType<typeof buscarParcelasEmAbertoDasFiliais>>,
): ParcelaParaIndicadores[] {
  return parcelas.map((parcela) => ({
    tipo: parcela.titulo.tipo,
    dataVencimento: parcela.dataVencimento,
    saldo: saldoRemanescenteParcela(
      Number(parcela.valorAtualizado),
      parcela.baixas.map(valoresDaBaixa),
    ),
  }));
}

/**
 * Consolida por empresa (soma todas as filiais). Todas as somas são aditivas,
 * então cada indicador é uma query só com `filialId: { in: [...] }` — não um
 * loop por filial — e as queries independentes rodam em paralelo.
 */
export async function buscarIndicadoresExecutivos(sessao: SessaoAtiva): Promise<IndicadoresExecutivos> {
  requirePermission(sessao.perfil, "dashboardExecutivo:ler");

  const filialIds = await idsDasFiliaisAtivas(sessao.empresaId);
  const { hoje, fimDeHoje, inicioMesAtual } = diaDeHoje();

  const [caixaConciliado, aguardandoConciliacao, parcelasEmAberto, somasMes] = await Promise.all([
    buscarSaldoEmCaixaAteDasFiliais(filialIds, fimDeHoje),
    buscarAguardandoConciliacaoDasFiliais(filialIds),
    buscarParcelasEmAbertoDasFiliais(filialIds),
    somasConciliadasNoPeriodo(filialIds, inicioMesAtual, fimDeHoje),
  ]);

  const { entradas, saidas } = totaisDoPeriodo(somasMes);
  return calcularIndicadoresExecutivos({
    hoje,
    caixaConciliado,
    aguardandoConciliacao,
    parcelas: paraIndicadores(parcelasEmAberto),
    entradasMes: entradas,
    saidasMes: saidas,
  });
}

export type FaixaAging = "0-30" | "31-60" | "61-90" | "90+";
export type PontoEntradasSaidas = { mes: string; entradas: number; saidas: number };
export type PontoEvolucaoSaldo = { mes: string; saldo: number };
export type PontoAging = { faixa: FaixaAging; contasAPagar: number; contasAReceber: number };

export type GraficosExecutivos = {
  entradasSaidas: PontoEntradasSaidas[];
  evolucaoSaldo: PontoEvolucaoSaldo[];
  aging: PontoAging[];
};

function fimDoMes(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999));
}

function rotuloMes(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(data);
}

/**
 * Dias de atraso a partir de `dataVencimento` — não depende do campo
 * `status` estar recalculado (mesma convenção já aceita em
 * `fluxoDeCaixaProjetado.ts`/`fluxoDeCaixaPorDimensao.ts`: `status` só é
 * recalculado quando `listarTitulos` é chamado).
 *
 * Usa `hoje` (a data de calendário de Brasília, ver `diaDeHoje`) como
 * referência, e não o instante exato: uma parcela vencendo hoje não pode ser
 * "já vencida" no aging enquanto ainda conta como obrigação futura nos
 * cards de 7/30 dias do mesmo dashboard. A faixa "0-30" vai de 1 a 30 dias
 * de atraso.
 */
function faixaAging(hoje: Date, dataVencimento: Date): FaixaAging {
  const diasAtraso = Math.floor((hoje.getTime() - dataVencimento.getTime()) / (24 * 60 * 60 * 1000));
  if (diasAtraso <= 30) return "0-30";
  if (diasAtraso <= 60) return "31-60";
  if (diasAtraso <= 90) return "61-90";
  return "90+";
}

/** O aging a partir das parcelas em aberto: só as vencidas antes de `hoje` (data de calendário), por dias de atraso. */
export function calcularAging(parcelas: readonly ParcelaParaIndicadores[], hoje: Date): PontoAging[] {
  const buckets: Record<FaixaAging, { contasAPagar: number; contasAReceber: number }> = {
    "0-30": { contasAPagar: 0, contasAReceber: 0 },
    "31-60": { contasAPagar: 0, contasAReceber: 0 },
    "61-90": { contasAPagar: 0, contasAReceber: 0 },
    "90+": { contasAPagar: 0, contasAReceber: 0 },
  };

  for (const { tipo, dataVencimento, saldo } of parcelas) {
    if (saldo <= 0 || dataVencimento >= hoje) continue;
    const faixa = faixaAging(hoje, dataVencimento);
    if (tipo === "PAGAR") buckets[faixa].contasAPagar += saldo;
    else buckets[faixa].contasAReceber += saldo;
  }

  return (["0-30", "31-60", "61-90", "90+"] as const).map((faixa) => ({ faixa, ...buckets[faixa] }));
}

async function buscarAgingConsolidado(filialIds: string[], hoje: Date): Promise<PontoAging[]> {
  const parcelasVencidas = await buscarParcelasEmAbertoDasFiliais(filialIds, hoje);
  return calcularAging(paraIndicadores(parcelasVencidas), hoje);
}

/**
 * Últimos 6 meses (o atual incluído, por último no array), consolidado por
 * empresa. O saldo de fim de mês é encadeado: um único saldo histórico até
 * antes do 1º mês, somado mês a mês ao movimento líquido (as barras de entradas e saídas não trazem transferências
 * entre contas, mas o saldo conta com elas). É exato porque os
 * meses são contíguos (fim de um mês + 1ms = início do seguinte, data
 * TIMESTAMP(3)) e usam o mesmo filtro de `buscarSaldoEmCaixaAteDasFiliais`.
 */
export async function buscarGraficosExecutivos(sessao: SessaoAtiva): Promise<GraficosExecutivos> {
  requirePermission(sessao.perfil, "dashboardExecutivo:ler");

  const filialIds = await idsDasFiliaisAtivas(sessao.empresaId);
  const { hoje } = diaDeHoje();

  const meses = [5, 4, 3, 2, 1, 0].map((mesesAtras) => {
    const ano = hoje.getUTCFullYear();
    const mesAbsoluto = hoje.getUTCMonth() - mesesAtras;
    const inicio = new Date(Date.UTC(ano, mesAbsoluto, 1));
    return { inicio, fim: fimDoMes(ano, mesAbsoluto + 1), mes: rotuloMes(inicio) };
  });

  const [saldoAntesDaJanela, somasPorMes, aging] = await Promise.all([
    buscarSaldoEmCaixaAteDasFiliais(filialIds, new Date(meses[0].inicio.getTime() - 1)),
    Promise.all(meses.map(({ inicio, fim }) => somasConciliadasNoPeriodo(filialIds, inicio, fim))),
    buscarAgingConsolidado(filialIds, hoje),
  ]);

  const entradasSaidas: PontoEntradasSaidas[] = [];
  const evolucaoSaldo: PontoEvolucaoSaldo[] = [];
  let saldo = saldoAntesDaJanela;
  meses.forEach(({ mes }, indice) => {
    const { entradas, saidas, transferencias } = totaisDoPeriodo(somasPorMes[indice]);
    saldo += entradas - saidas + transferencias;
    entradasSaidas.push({ mes, entradas, saidas });
    evolucaoSaldo.push({ mes, saldo });
  });

  return { entradasSaidas, evolucaoSaldo, aging };
}

export type ResumoFiscalGerencial = {
  entradasFiscal: number;
  entradasGerencial: number;
  saidasFiscal: number;
  saidasGerencial: number;
  percentualGerencialEntradas: number | null;
  pendenciasFiscais: number;
};

/**
 * Bloco "Fiscal × gerencial" do mês corrente, consolidado por empresa — mesmo
 * escopo e permissão dos demais indicadores. Transferências (sem
 * classificação) não entram.
 */
export async function buscarResumoFiscalGerencial(sessao: SessaoAtiva): Promise<ResumoFiscalGerencial> {
  requirePermission(sessao.perfil, "dashboardExecutivo:ler");

  const filialIds = await idsDasFiliaisAtivas(sessao.empresaId);
  const { fimDeHoje, inicioMesAtual } = diaDeHoje();

  const [somas, pendenciasPorFilial] = await Promise.all([
    prisma.lancamentoBancario.groupBy({
      by: ["tipo", "classificacaoFiscal"],
      where: {
        filialId: { in: filialIds },
        conciliado: true,
        classificacaoFiscal: { not: null },
        data: { gte: inicioMesAtual, lte: fimDeHoje },
        contaBancaria: { ativo: true },
      },
      _sum: { valor: true },
    }),
    Promise.all(filialIds.map((filialId) => buscarPendenciasFiscaisDaFilial(filialId))),
  ]);

  const resumo = {
    entradasFiscal: 0,
    entradasGerencial: 0,
    saidasFiscal: 0,
    saidasGerencial: 0,
    pendenciasFiscais: pendenciasPorFilial.reduce((total, pendencias) => total + pendencias.length, 0),
  };
  for (const soma of somas) {
    const valor = Number(soma._sum.valor ?? 0);
    const gerencial = soma.classificacaoFiscal === "GERENCIAL";
    if (soma.tipo === "ENTRADA") {
      if (gerencial) resumo.entradasGerencial += valor;
      else resumo.entradasFiscal += valor;
    } else if (gerencial) resumo.saidasGerencial += valor;
    else resumo.saidasFiscal += valor;
  }

  return {
    ...resumo,
    percentualGerencialEntradas: percentualGerencial(resumo.entradasFiscal, resumo.entradasGerencial),
  };
}
