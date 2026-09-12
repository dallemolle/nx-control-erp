import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { StatusParcela } from "@prisma/client";
import { buscarSaldoEmCaixaAte, fimDoDiaUTC } from "./fluxoDeCaixa";
import { saldoRemanescenteParcela } from "./fluxoDeCaixaProjetado";

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

/**
 * Consolida por empresa (soma todas as filiais) — mesmo padrão de
 * `buscarAnoBaseConsolidado` em `fluxoDeCaixaEstrategico.ts`: busca as
 * filiais da empresa e faz um loop reaproveitando funções já existentes,
 * sem duplicar query.
 */
export async function buscarIndicadoresExecutivos(sessao: SessaoAtiva): Promise<IndicadoresExecutivos> {
  requirePermission(sessao.perfil, "dashboardExecutivo:ler");

  const filiais = await prisma.filial.findMany({ where: { empresaId: sessao.empresaId }, select: { id: true } });
  const hoje = new Date();
  const inicioDeHoje = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  const em7Dias = fimDoDiaUTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + 7);
  const em30Dias = fimDoDiaUTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + 30);
  const inicioMesAtual = inicioDoMes(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1);

  let caixaDisponivel = 0;
  let contasAPagarEmAberto = 0;
  let contasAReceberEmAberto = 0;
  let inadimplencia = 0;
  let geracaoDeCaixaMesAtual = 0;
  let obrigacoes7Dias = 0;
  let obrigacoes30Dias = 0;
  let recebimentosEsperados30Dias = 0;

  for (const filial of filiais) {
    caixaDisponivel += await buscarSaldoEmCaixaAte(filial.id, hoje);

    const parcelasEmAberto = await prisma.parcela.findMany({
      where: {
        titulo: { filialId: filial.id },
        status: { in: STATUS_ABERTO },
      },
      include: {
        titulo: { select: { tipo: true } },
        baixas: { where: { statusAprovacao: "APROVADO" } },
      },
    });

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

    const somasMes = await prisma.lancamentoBancario.groupBy({
      by: ["tipo"],
      where: {
        filialId: filial.id,
        conciliado: true,
        data: { gte: inicioMesAtual, lte: hoje },
        contaBancaria: { ativo: true },
      },
      _sum: { valor: true },
    });
    const entradasMes = Number(somasMes.find((s) => s.tipo === "ENTRADA")?._sum.valor ?? 0);
    const saidasMes = Number(somasMes.find((s) => s.tipo === "SAIDA")?._sum.valor ?? 0);
    geracaoDeCaixaMesAtual += entradasMes - saidasMes;
  }

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
 */
function faixaAging(hoje: Date, dataVencimento: Date): FaixaAging {
  const diasAtraso = Math.floor((hoje.getTime() - dataVencimento.getTime()) / (24 * 60 * 60 * 1000));
  if (diasAtraso <= 30) return "0-30";
  if (diasAtraso <= 60) return "31-60";
  if (diasAtraso <= 90) return "61-90";
  return "90+";
}

async function buscarAgingConsolidado(filiais: { id: string }[], hoje: Date): Promise<PontoAging[]> {
  const buckets: Record<FaixaAging, { contasAPagar: number; contasAReceber: number }> = {
    "0-30": { contasAPagar: 0, contasAReceber: 0 },
    "31-60": { contasAPagar: 0, contasAReceber: 0 },
    "61-90": { contasAPagar: 0, contasAReceber: 0 },
    "90+": { contasAPagar: 0, contasAReceber: 0 },
  };

  for (const filial of filiais) {
    const parcelasVencidas = await prisma.parcela.findMany({
      where: {
        titulo: { filialId: filial.id },
        status: { in: STATUS_ABERTO },
        dataVencimento: { lt: hoje },
      },
      include: {
        titulo: { select: { tipo: true } },
        baixas: { where: { statusAprovacao: "APROVADO" } },
      },
    });

    for (const parcela of parcelasVencidas) {
      const saldo = saldoRemanescenteParcela(
        Number(parcela.valorAtualizado),
        parcela.baixas.map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
      );
      if (saldo <= 0) continue;

      const faixa = faixaAging(hoje, parcela.dataVencimento);
      if (parcela.titulo.tipo === "PAGAR") buckets[faixa].contasAPagar += saldo;
      else buckets[faixa].contasAReceber += saldo;
    }
  }

  return (["0-30", "31-60", "61-90", "90+"] as const).map((faixa) => ({ faixa, ...buckets[faixa] }));
}

/**
 * Últimos 6 meses (o atual incluído, por último no array), consolidado por
 * empresa. `buscarSaldoEmCaixaAte` é reaproveitada tal como está — como
 * ela recalcula o saldo conciliado até uma data qualquer, não precisa de
 * encadeamento mês a mês (diferente do fluxo de caixa projetado, que
 * projeta o futuro a partir de um saldo âncora).
 */
export async function buscarGraficosExecutivos(sessao: SessaoAtiva): Promise<GraficosExecutivos> {
  requirePermission(sessao.perfil, "dashboardExecutivo:ler");

  const filiais = await prisma.filial.findMany({ where: { empresaId: sessao.empresaId }, select: { id: true } });
  const hoje = new Date();

  const entradasSaidas: PontoEntradasSaidas[] = [];
  const evolucaoSaldo: PontoEvolucaoSaldo[] = [];

  for (let i = 5; i >= 0; i--) {
    const ano = hoje.getUTCFullYear();
    const mesAbsoluto = hoje.getUTCMonth() - i;
    const inicio = new Date(Date.UTC(ano, mesAbsoluto, 1));
    const fim = fimDoMes(ano, mesAbsoluto + 1);
    const mes = rotuloMes(inicio);

    let entradas = 0;
    let saidas = 0;
    let saldo = 0;
    for (const filial of filiais) {
      const somas = await prisma.lancamentoBancario.groupBy({
        by: ["tipo"],
        where: {
          filialId: filial.id,
          conciliado: true,
          data: { gte: inicio, lte: fim },
          contaBancaria: { ativo: true },
        },
        _sum: { valor: true },
      });
      entradas += Number(somas.find((s) => s.tipo === "ENTRADA")?._sum.valor ?? 0);
      saidas += Number(somas.find((s) => s.tipo === "SAIDA")?._sum.valor ?? 0);
      saldo += await buscarSaldoEmCaixaAte(filial.id, fim);
    }

    entradasSaidas.push({ mes, entradas, saidas });
    evolucaoSaldo.push({ mes, saldo });
  }

  const aging = await buscarAgingConsolidado(filiais, hoje);

  return { entradasSaidas, evolucaoSaldo, aging };
}
