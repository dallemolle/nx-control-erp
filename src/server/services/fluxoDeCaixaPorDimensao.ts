import { prisma } from "@/server/db/client";
import { valoresDaBaixa } from "@/server/services/parcela";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { saldoRemanescenteParcela } from "./fluxoDeCaixaProjetado";
import {
  whereLancamentoPorClassificacao,
  whereTituloPorClassificacao,
  type FiltroClassificacao,
} from "./classificacaoFiscal";

export type TipoDimensao = "CENTRO_CUSTO" | "CENTRO_LUCRO" | "SAFRA" | "PROJETO";

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

const CAMPO_POR_DIMENSAO: Record<TipoDimensao, "centroCustoId" | "centroLucroId" | "safraId" | "projetoId"> = {
  CENTRO_CUSTO: "centroCustoId",
  CENTRO_LUCRO: "centroLucroId",
  SAFRA: "safraId",
  PROJETO: "projetoId",
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
 * Consulta e agregação do realizado por dimensão — campo direto primeiro,
 * fallback via baixa->parcela->titulo; sem os dois, chave `null`. `filtro`
 * restringe o que entra (período, safras) além do recorte fixo: filial,
 * conciliado, conta ativa e classificação.
 */
async function somarRealizadoPorDimensao(
  filialId: string,
  tipoDimensao: TipoDimensao,
  filtro: Prisma.LancamentoBancarioWhereInput,
  classificacao?: FiltroClassificacao,
): Promise<Map<string | null, TotaisPorDimensao>> {
  const campo = CAMPO_POR_DIMENSAO[tipoDimensao];

  const lancamentos = await prisma.lancamentoBancario.findMany({
    where: {
      AND: [
        { filialId, conciliado: true, contaBancaria: { ativo: true }, ...whereLancamentoPorClassificacao(classificacao) },
        filtro,
      ],
    },
    include: {
      baixa: {
        include: {
          parcela: {
            include: { titulo: { select: { centroCustoId: true, centroLucroId: true, safraId: true, projetoId: true } } },
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

export function buscarRealizadoPorDimensaoNoPeriodo(
  filialId: string,
  tipoDimensao: TipoDimensao,
  inicio: Date,
  fim: Date,
  classificacao?: FiltroClassificacao,
): Promise<Map<string | null, TotaisPorDimensao>> {
  return somarRealizadoPorDimensao(filialId, tipoDimensao, { data: { gte: inicio, lte: fim } }, classificacao);
}

/**
 * Realizado de cada safra pela marcação, sem corte de data (comparação entre
 * safras). Mesmo critério de `direto ?? viaBaixa`: o lançamento com safra
 * própria vale por ela; sem safra própria, vale a do título da baixa.
 */
export async function buscarRealizadoPorSafras(
  filialId: string,
  safraIds: string[],
  classificacao?: FiltroClassificacao,
): Promise<Map<string | null, TotaisPorDimensao>> {
  if (safraIds.length === 0) return new Map();
  return somarRealizadoPorDimensao(
    filialId,
    "SAFRA",
    {
      OR: [
        { safraId: { in: safraIds } },
        { safraId: null, baixa: { parcela: { titulo: { safraId: { in: safraIds } } } } },
      ],
    },
    classificacao,
  );
}

/**
 * Realizado por dimensão — campo direto primeiro (lançamentos criados após
 * a correção na origem), fallback via baixa->parcela->titulo pra dado
 * histórico. Sem os dois, cai em `null` ("Não classificado"). Wrapper fino
 * sobre a versão por intervalo — usado pelo relatório mensal (2a) e por
 * nada mais; a lógica de query vive só em `somarRealizadoPorDimensao`.
 */
export async function buscarRealizadoPorDimensao(
  filialId: string,
  tipoDimensao: TipoDimensao,
  ano: number,
  mes: number,
  classificacao?: FiltroClassificacao,
): Promise<Map<string | null, TotaisPorDimensao>> {
  return buscarRealizadoPorDimensaoNoPeriodo(
    filialId,
    tipoDimensao,
    inicioDoMes(ano, mes),
    fimDoMes(ano, mes),
    classificacao,
  );
}

/**
 * Consulta e agregação do projetado por dimensão — parcelas em aberto, pelo
 * saldo remanescente, na dimensão do título. `filtro` restringe o que entra
 * (período, safras) além do recorte fixo: filial, classificação e status.
 */
async function somarProjetadoPorDimensao(
  filialId: string,
  tipoDimensao: TipoDimensao,
  filtro: Prisma.ParcelaWhereInput,
  classificacao?: FiltroClassificacao,
): Promise<Map<string | null, TotaisPorDimensao>> {
  const campo = CAMPO_POR_DIMENSAO[tipoDimensao];

  const parcelas = await prisma.parcela.findMany({
    where: {
      AND: [
        {
          titulo: { filialId, ...whereTituloPorClassificacao(classificacao) },
          status: { in: ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"] },
        },
        filtro,
      ],
    },
    include: {
      titulo: { select: { tipo: true, centroCustoId: true, centroLucroId: true, safraId: true, projetoId: true } },
      baixas: { where: { statusAprovacao: "APROVADO" } },
    },
  });

  const totais = new Map<string | null, TotaisPorDimensao>();
  for (const parcela of parcelas) {
    const saldo = saldoRemanescenteParcela(
      Number(parcela.valorAtualizado),
      parcela.baixas.map(valoresDaBaixa),
    );
    const dimensaoId = parcela.titulo[campo];
    somar(totais, dimensaoId, parcela.titulo.tipo === "RECEBER" ? "entradas" : "saidas", saldo);
  }
  return totais;
}

export function buscarProjetadoPorDimensaoNoPeriodo(
  filialId: string,
  tipoDimensao: TipoDimensao,
  inicio: Date,
  fim: Date,
  classificacao?: FiltroClassificacao,
): Promise<Map<string | null, TotaisPorDimensao>> {
  return somarProjetadoPorDimensao(filialId, tipoDimensao, { dataVencimento: { gte: inicio, lte: fim } }, classificacao);
}

/** Projetado de cada safra pela marcação do título, sem corte de vencimento (comparação entre safras). */
export async function buscarProjetadoPorSafras(
  filialId: string,
  safraIds: string[],
  classificacao?: FiltroClassificacao,
): Promise<Map<string | null, TotaisPorDimensao>> {
  if (safraIds.length === 0) return new Map();
  return somarProjetadoPorDimensao(filialId, "SAFRA", { titulo: { safraId: { in: safraIds } } }, classificacao);
}

/**
 * Projetado por dimensão — sempre via `Titulo`, direto (não há fallback
 * necessário: a parcela projetada só existe através do título). Wrapper
 * fino sobre a versão por intervalo, mesmo motivo do realizado acima.
 */
export async function buscarProjetadoPorDimensao(
  filialId: string,
  tipoDimensao: TipoDimensao,
  ano: number,
  mes: number,
  classificacao?: FiltroClassificacao,
): Promise<Map<string | null, TotaisPorDimensao>> {
  return buscarProjetadoPorDimensaoNoPeriodo(
    filialId,
    tipoDimensao,
    inicioDoMes(ano, mes),
    fimDoMes(ano, mes),
    classificacao,
  );
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
  if (tipoDimensao === "PROJETO") {
    return prisma.projeto.findMany({
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

/**
 * Busca o nome de dimensões que já não estão mais ativas, mas que ainda
 * aparecem como chave (não-nula) em `realizado`/`projetado` — sem o filtro
 * `ativo: true` de `listarValoresDimensao`, propositalmente, pra não deixar
 * o valor desaparecer do relatório só porque foi desativado depois de
 * classificar algum lançamento/parcela.
 */
async function buscarNomesInativos(
  tipoDimensao: TipoDimensao,
  ids: string[],
): Promise<{ id: string; nome: string }[]> {
  if (ids.length === 0) return [];

  if (tipoDimensao === "CENTRO_CUSTO") {
    return prisma.centroCusto.findMany({
      where: { id: { in: ids } },
      select: { id: true, nome: true },
    });
  }
  if (tipoDimensao === "CENTRO_LUCRO") {
    return prisma.centroLucro.findMany({
      where: { id: { in: ids } },
      select: { id: true, nome: true },
    });
  }
  if (tipoDimensao === "PROJETO") {
    return prisma.projeto.findMany({
      where: { id: { in: ids } },
      select: { id: true, nome: true },
    });
  }
  return prisma.safra.findMany({
    where: { id: { in: ids } },
    select: { id: true, nome: true },
  });
}

export async function listarFluxoDeCaixaPorDimensao(
  sessao: SessaoAtiva,
  tipoDimensao: TipoDimensao,
  ano: number,
  mes: number,
  opcoes: { classificacao?: FiltroClassificacao } = {},
): Promise<LinhaFluxoPorDimensao[]> {
  requirePermission(sessao.perfil, "titulo:ler");

  const [valores, realizado, projetado] = await Promise.all([
    listarValoresDimensao(sessao.filialId, tipoDimensao),
    buscarRealizadoPorDimensao(sessao.filialId, tipoDimensao, ano, mes, opcoes.classificacao),
    buscarProjetadoPorDimensao(sessao.filialId, tipoDimensao, ano, mes, opcoes.classificacao),
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

  // Ids não-nulos presentes em realizado/projetado que não estão entre os
  // valores ativos: dimensões desativadas depois de classificar algum
  // lançamento/parcela. Sem isso, o valor some do relatório sem ir pra
  // nenhuma linha — nem a dele, nem "Não classificado" (que é só pra chave
  // null) — quebrando a reconciliação com as telas de realizado/projetado.
  const idsAtivos = new Set(valores.map((valor) => valor.id));
  const idsInativos = new Set<string>();
  for (const chave of realizado.keys()) {
    if (chave !== null && !idsAtivos.has(chave)) idsInativos.add(chave);
  }
  for (const chave of projetado.keys()) {
    if (chave !== null && !idsAtivos.has(chave)) idsInativos.add(chave);
  }

  if (idsInativos.size > 0) {
    const nomesInativos = await buscarNomesInativos(tipoDimensao, Array.from(idsInativos));
    const nomePorId = new Map(nomesInativos.map((valor) => [valor.id, valor.nome]));
    for (const id of idsInativos) {
      const r = realizado.get(id) ?? { entradas: 0, saidas: 0 };
      const p = projetado.get(id) ?? { entradas: 0, saidas: 0 };
      const nome = nomePorId.get(id);
      linhas.push({
        dimensaoId: id,
        dimensaoNome: nome ? `${nome} (inativo)` : "Desconhecido (inativo)",
        ano,
        mes,
        entradasRealizadas: r.entradas,
        saidasRealizadas: r.saidas,
        entradasProjetadas: p.entradas,
        saidasProjetadas: p.saidas,
      });
    }
  }

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
