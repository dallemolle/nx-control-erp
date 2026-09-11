import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { saldoRemanescenteParcela } from "./fluxoDeCaixaProjetado";

export type TipoDimensao = "CENTRO_CUSTO" | "CENTRO_LUCRO" | "SAFRA";

export type LinhaFluxoPorDimensao = {
  dimensaoId: string | null;
  dimensaoNome: string;
  ano: number;
  mes: number;
  entradasRealizadas: number;
  saidasRealizadas: number;
  entradasProjetadas: number;
  saidasProjetadas: number;
};

type TotaisPorDimensao = { entradas: number; saidas: number };

const CAMPO_POR_DIMENSAO: Record<TipoDimensao, "centroCustoId" | "centroLucroId" | "safraId"> = {
  CENTRO_CUSTO: "centroCustoId",
  CENTRO_LUCRO: "centroLucroId",
  SAFRA: "safraId",
};

function inicioDoMes(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 1));
}

function fimDoMes(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999));
}

function somar(totais: Map<string | null, TotaisPorDimensao>, chave: string | null, campo: "entradas" | "saidas", valor: number) {
  const atual = totais.get(chave) ?? { entradas: 0, saidas: 0 };
  atual[campo] += valor;
  totais.set(chave, atual);
}

/**
 * Realizado por dimensão — campo direto primeiro (lançamentos criados após
 * a correção na origem), fallback via baixa->parcela->titulo pra dado
 * histórico. Sem os dois, cai em `null` ("Não classificado").
 */
export async function buscarRealizadoPorDimensao(
  filialId: string,
  tipoDimensao: TipoDimensao,
  ano: number,
  mes: number,
): Promise<Map<string | null, TotaisPorDimensao>> {
  const campo = CAMPO_POR_DIMENSAO[tipoDimensao];

  const lancamentos = await prisma.lancamentoBancario.findMany({
    where: {
      filialId,
      conciliado: true,
      contaBancaria: { ativo: true },
      data: { gte: inicioDoMes(ano, mes), lte: fimDoMes(ano, mes) },
    },
    include: {
      baixa: {
        include: {
          parcela: {
            include: { titulo: { select: { centroCustoId: true, centroLucroId: true, safraId: true } } },
          },
        },
      },
    },
  });

  const totais = new Map<string | null, TotaisPorDimensao>();
  for (const lancamento of lancamentos) {
    const direto = lancamento[campo];
    const viaBaixa = lancamento.baixa?.parcela.titulo[campo] ?? null;
    const dimensaoId = direto ?? viaBaixa;

    somar(totais, dimensaoId, lancamento.tipo === "ENTRADA" ? "entradas" : "saidas", Number(lancamento.valor));
  }
  return totais;
}

/**
 * Projetado por dimensão — sempre via `Titulo`, direto (não há fallback
 * necessário: a parcela projetada só existe através do título).
 */
export async function buscarProjetadoPorDimensao(
  filialId: string,
  tipoDimensao: TipoDimensao,
  ano: number,
  mes: number,
): Promise<Map<string | null, TotaisPorDimensao>> {
  const campo = CAMPO_POR_DIMENSAO[tipoDimensao];

  const parcelas = await prisma.parcela.findMany({
    where: {
      titulo: { filialId },
      status: { in: ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"] },
      dataVencimento: { gte: inicioDoMes(ano, mes), lte: fimDoMes(ano, mes) },
    },
    include: {
      titulo: { select: { tipo: true, centroCustoId: true, centroLucroId: true, safraId: true } },
      baixas: { where: { statusAprovacao: "APROVADO" } },
    },
  });

  const totais = new Map<string | null, TotaisPorDimensao>();
  for (const parcela of parcelas) {
    const saldo = saldoRemanescenteParcela(
      Number(parcela.valorAtualizado),
      parcela.baixas.map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
    );
    const dimensaoId = parcela.titulo[campo];
    somar(totais, dimensaoId, parcela.titulo.tipo === "RECEBER" ? "entradas" : "saidas", saldo);
  }
  return totais;
}

export async function listarValoresDimensao(
  filialId: string,
  tipoDimensao: TipoDimensao,
): Promise<{ id: string; nome: string }[]> {
  if (tipoDimensao === "CENTRO_CUSTO") {
    return prisma.centroCusto.findMany({
      where: { filialId, ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    });
  }
  if (tipoDimensao === "CENTRO_LUCRO") {
    return prisma.centroLucro.findMany({
      where: { filialId, ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    });
  }
  return prisma.safra.findMany({
    where: { filialId, ativo: true },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });
}

export async function listarFluxoDeCaixaPorDimensao(
  sessao: SessaoAtiva,
  tipoDimensao: TipoDimensao,
  ano: number,
  mes: number,
): Promise<LinhaFluxoPorDimensao[]> {
  requirePermission(sessao.perfil, "titulo:ler");

  const [valores, realizado, projetado] = await Promise.all([
    listarValoresDimensao(sessao.filialId, tipoDimensao),
    buscarRealizadoPorDimensao(sessao.filialId, tipoDimensao, ano, mes),
    buscarProjetadoPorDimensao(sessao.filialId, tipoDimensao, ano, mes),
  ]);

  const linhas: LinhaFluxoPorDimensao[] = valores.map((valor) => {
    const r = realizado.get(valor.id) ?? { entradas: 0, saidas: 0 };
    const p = projetado.get(valor.id) ?? { entradas: 0, saidas: 0 };
    return {
      dimensaoId: valor.id,
      dimensaoNome: valor.nome,
      ano,
      mes,
      entradasRealizadas: r.entradas,
      saidasRealizadas: r.saidas,
      entradasProjetadas: p.entradas,
      saidasProjetadas: p.saidas,
    };
  });

  const rNulo = realizado.get(null) ?? { entradas: 0, saidas: 0 };
  const pNulo = projetado.get(null) ?? { entradas: 0, saidas: 0 };
  linhas.push({
    dimensaoId: null,
    dimensaoNome: "Não classificado",
    ano,
    mes,
    entradasRealizadas: rNulo.entradas,
    saidasRealizadas: rNulo.saidas,
    entradasProjetadas: pNulo.entradas,
    saidasProjetadas: pNulo.saidas,
  });

  return linhas;
}
