import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { StatusParcela } from "@prisma/client";
import { buscarSaldoEmCaixaAteDasFiliais, fimDoDiaUTC } from "./fluxoDeCaixa";
import { saldoRemanescenteParcela } from "./fluxoDeCaixaProjetado";
import { buscarPendenciasFiscaisDaFilial, percentualGerencial } from "./relatorioFiscalGerencial";

export type IndicadoresExecutivos = {
  caixaDisponivel: number;
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

function inicioDoMes(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 1));
}

async function idsDasFiliais(empresaId: string): Promise<string[]> {
  const filiais = await prisma.filial.findMany({ where: { empresaId }, select: { id: true } });
  return filiais.map((filial) => filial.id);
}

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
      status: true,
      titulo: { select: { tipo: true } },
      baixas: { where: { statusAprovacao: "APROVADO" }, select: { valorPago: true } },
    },
  });
}

function somasConciliadasNoPeriodo(filialIds: string[], inicio: Date, fim: Date) {
  return prisma.lancamentoBancario.groupBy({
    by: ["tipo"],
    where: {
      filialId: { in: filialIds },
      conciliado: true,
      data: { gte: inicio, lte: fim },
      contaBancaria: { ativo: true },
    },
    _sum: { valor: true },
  });
}

function totalDoTipo(somas: { tipo: string; _sum: { valor: unknown } }[], tipo: "ENTRADA" | "SAIDA"): number {
  return Number(somas.find((s) => s.tipo === tipo)?._sum.valor ?? 0);
}

/**
 * Consolida por empresa (soma todas as filiais). Todas as somas são aditivas,
 * então cada indicador é uma query só com `filialId: { in: [...] }` — não um
 * loop por filial — e as queries independentes rodam em paralelo.
 */
export async function buscarIndicadoresExecutivos(sessao: SessaoAtiva): Promise<IndicadoresExecutivos> {
  requirePermission(sessao.perfil, "dashboardExecutivo:ler");

  const filialIds = await idsDasFiliais(sessao.empresaId);
  const hoje = new Date();
  const inicioDeHoje = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  const em7Dias = fimDoDiaUTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + 7);
  const em30Dias = fimDoDiaUTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + 30);
  const inicioMesAtual = inicioDoMes(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1);

  const [caixaDisponivel, parcelasEmAberto, somasMes] = await Promise.all([
    buscarSaldoEmCaixaAteDasFiliais(filialIds, hoje),
    buscarParcelasEmAbertoDasFiliais(filialIds),
    somasConciliadasNoPeriodo(filialIds, inicioMesAtual, hoje),
  ]);

  let contasAPagarEmAberto = 0;
  let contasAReceberEmAberto = 0;
  let inadimplencia = 0;
  let obrigacoes7Dias = 0;
  let obrigacoes30Dias = 0;
  let recebimentosEsperados30Dias = 0;

  for (const parcela of parcelasEmAberto) {
    const saldo = saldoRemanescenteParcela(
      Number(parcela.valorAtualizado),
      parcela.baixas.map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
    );
    const dentroDe7Dias = parcela.dataVencimento >= inicioDeHoje && parcela.dataVencimento <= em7Dias;
    const dentroDe30Dias = parcela.dataVencimento >= inicioDeHoje && parcela.dataVencimento <= em30Dias;

    if (parcela.titulo.tipo === "PAGAR") {
      contasAPagarEmAberto += saldo;
      if (dentroDe7Dias) obrigacoes7Dias += saldo;
      if (dentroDe30Dias) obrigacoes30Dias += saldo;
    } else {
      contasAReceberEmAberto += saldo;
      if (parcela.status === "VENCIDO") inadimplencia += saldo;
      if (dentroDe30Dias) recebimentosEsperados30Dias += saldo;
    }
  }

  const geracaoDeCaixaMesAtual = totalDoTipo(somasMes, "ENTRADA") - totalDoTipo(somasMes, "SAIDA");

  const saldoProjetado30Dias = caixaDisponivel + recebimentosEsperados30Dias - obrigacoes30Dias;

  return {
    caixaDisponivel,
    contasAPagarEmAberto,
    contasAReceberEmAberto,
    inadimplencia,
    geracaoDeCaixaMesAtual,
    obrigacoes7Dias,
    obrigacoes30Dias,
    recebimentosEsperados30Dias,
    saldoProjetado30Dias,
  };
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
 * Usa `inicioDeHoje` (início do dia em UTC) como referência, e não o
 * instante exato — mesmo motivo do `inicioDeHoje` de
 * `buscarIndicadoresExecutivos`: uma parcela vencendo hoje não pode ser
 * "já vencida" no aging enquanto ainda conta como obrigação futura nos
 * cards de 7/30 dias do mesmo dashboard.
 */
function faixaAging(inicioDeHoje: Date, dataVencimento: Date): FaixaAging {
  const diasAtraso = Math.floor((inicioDeHoje.getTime() - dataVencimento.getTime()) / (24 * 60 * 60 * 1000));
  if (diasAtraso <= 30) return "0-30";
  if (diasAtraso <= 60) return "31-60";
  if (diasAtraso <= 90) return "61-90";
  return "90+";
}

async function buscarAgingConsolidado(filialIds: string[], inicioDeHoje: Date): Promise<PontoAging[]> {
  const buckets: Record<FaixaAging, { contasAPagar: number; contasAReceber: number }> = {
    "0-30": { contasAPagar: 0, contasAReceber: 0 },
    "31-60": { contasAPagar: 0, contasAReceber: 0 },
    "61-90": { contasAPagar: 0, contasAReceber: 0 },
    "90+": { contasAPagar: 0, contasAReceber: 0 },
  };

  const parcelasVencidas = await buscarParcelasEmAbertoDasFiliais(filialIds, inicioDeHoje);
  for (const parcela of parcelasVencidas) {
    const saldo = saldoRemanescenteParcela(
      Number(parcela.valorAtualizado),
      parcela.baixas.map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
    );
    if (saldo <= 0) continue;

    const faixa = faixaAging(inicioDeHoje, parcela.dataVencimento);
    if (parcela.titulo.tipo === "PAGAR") buckets[faixa].contasAPagar += saldo;
    else buckets[faixa].contasAReceber += saldo;
  }

  return (["0-30", "31-60", "61-90", "90+"] as const).map((faixa) => ({ faixa, ...buckets[faixa] }));
}

/**
 * Últimos 6 meses (o atual incluído, por último no array), consolidado por
 * empresa. O saldo de fim de mês é encadeado: um único saldo histórico até
 * antes do 1º mês, somado mês a mês ao movimento líquido. É exato porque os
 * meses são contíguos (fim de um mês + 1ms = início do seguinte, data
 * TIMESTAMP(3)) e usam o mesmo filtro de `buscarSaldoEmCaixaAteDasFiliais`.
 */
export async function buscarGraficosExecutivos(sessao: SessaoAtiva): Promise<GraficosExecutivos> {
  requirePermission(sessao.perfil, "dashboardExecutivo:ler");

  const filialIds = await idsDasFiliais(sessao.empresaId);
  const hoje = new Date();
  const inicioDeHoje = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));

  const meses = [5, 4, 3, 2, 1, 0].map((mesesAtras) => {
    const ano = hoje.getUTCFullYear();
    const mesAbsoluto = hoje.getUTCMonth() - mesesAtras;
    const inicio = new Date(Date.UTC(ano, mesAbsoluto, 1));
    return { inicio, fim: fimDoMes(ano, mesAbsoluto + 1), mes: rotuloMes(inicio) };
  });

  const [saldoAntesDaJanela, somasPorMes, aging] = await Promise.all([
    buscarSaldoEmCaixaAteDasFiliais(filialIds, new Date(meses[0].inicio.getTime() - 1)),
    Promise.all(meses.map(({ inicio, fim }) => somasConciliadasNoPeriodo(filialIds, inicio, fim))),
    buscarAgingConsolidado(filialIds, inicioDeHoje),
  ]);

  const entradasSaidas: PontoEntradasSaidas[] = [];
  const evolucaoSaldo: PontoEvolucaoSaldo[] = [];
  let saldo = saldoAntesDaJanela;
  meses.forEach(({ mes }, indice) => {
    const entradas = totalDoTipo(somasPorMes[indice], "ENTRADA");
    const saidas = totalDoTipo(somasPorMes[indice], "SAIDA");
    saldo += entradas - saidas;
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

  const filialIds = await idsDasFiliais(sessao.empresaId);
  const hoje = new Date();
  const inicioMesAtual = inicioDoMes(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1);

  const [somas, pendenciasPorFilial] = await Promise.all([
    prisma.lancamentoBancario.groupBy({
      by: ["tipo", "classificacaoFiscal"],
      where: {
        filialId: { in: filialIds },
        conciliado: true,
        classificacaoFiscal: { not: null },
        data: { gte: inicioMesAtual, lte: hoje },
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
