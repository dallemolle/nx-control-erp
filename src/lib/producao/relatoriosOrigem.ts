import type { OrigemRecepcao } from "@prisma/client";
import { arredondar } from "./arredondar";
import { razao } from "./painel";
import { agruparPorMes } from "./relatorios";

/** Soma das recepções ativas de uma origem e um produto (groupBy do período). */
export type GrupoOrigem = {
  tipo: OrigemRecepcao;
  /** Talhão (própria) ou fornecedor (terceiro). */
  origemId: string;
  nome: string;
  frutaId: string;
  brutoKg: number;
  descarteKg: number;
  valorTotal: number;
  /** Nº de recepções. */
  cargas: number;
};

export type IndicadoresOrigem = {
  /** Peso líquido (bruto − descarte). */
  kg: number;
  /** Σ valor só de terceiros; `null` sem terceiro (fruto próprio vale o custo-padrão, D-32). */
  valor: number | null;
  /** Σ valor ÷ Σ kg líquido de terceiros. */
  precoMedio: number | null;
  /** Σ descarte ÷ Σ bruto. */
  percentualDescarte: number | null;
  cargas: number;
};

export type ComFrutas = IndicadoresOrigem & { porFruta: Record<string, IndicadoresOrigem> };
export type LinhaOrigem = ComFrutas & { tipo: OrigemRecepcao; origemId: string; nome: string };

function agrupar<T>(itens: T[], chave: (item: T) => string): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const item of itens) grupos.set(chave(item), [...(grupos.get(chave(item)) ?? []), item]);
  return grupos;
}

function indicadoresOrigem(grupos: GrupoOrigem[]): IndicadoresOrigem {
  let bruto = 0;
  let descarte = 0;
  let cargas = 0;
  let valorTerceiros = 0;
  let kgTerceiros = 0;
  let temTerceiro = false;
  for (const g of grupos) {
    bruto += g.brutoKg;
    descarte += g.descarteKg;
    cargas += g.cargas;
    if (g.tipo === "TERCEIRO") {
      temTerceiro = true;
      valorTerceiros += g.valorTotal;
      kgTerceiros += g.brutoKg - g.descarteKg;
    }
  }
  const valor = temTerceiro ? arredondar(valorTerceiros, 2) : null;
  return {
    kg: arredondar(bruto - descarte, 3),
    valor,
    precoMedio: valor === null ? null : razao(valor, kgTerceiros),
    percentualDescarte: razao(descarte, bruto),
    cargas,
  };
}

function comFrutas(grupos: GrupoOrigem[]): ComFrutas {
  return {
    ...indicadoresOrigem(grupos),
    porFruta: Object.fromEntries(
      [...agrupar(grupos, (g) => g.frutaId)].map(([frutaId, gs]) => [frutaId, indicadoresOrigem(gs)]),
    ),
  };
}

/** Uma linha por talhão e por fornecedor, maior kg líquido primeiro, e o total. */
export function agregarPorOrigem(grupos: GrupoOrigem[]): { linhas: LinhaOrigem[]; total: ComFrutas } {
  const linhas = [...agrupar(grupos, (g) => `${g.tipo}:${g.origemId}`).values()]
    .map((gs): LinhaOrigem => ({ ...comFrutas(gs), tipo: gs[0].tipo, origemId: gs[0].origemId, nome: gs[0].nome }))
    .sort((a, b) => b.kg - a.kg || a.nome.localeCompare(b.nome));
  return { linhas, total: comFrutas(grupos) };
}

// Produtividade dos talhões --------------------------------------------------

export type TalhaoDoRelatorio = { id: string; nome: string; fruta: string; areaHa: number; ativo: boolean };
/** Recepções próprias ativas de um talhão no ano. */
export type ColheitaNoAno = { talhaoId: string; brutoKg: number; descarteKg: number; colheitas: number };

export type LinhaProdutividade = {
  talhaoId: string;
  talhao: string;
  fruta: string;
  areaHa: number;
  kgPeriodo: number;
  kgAno: number;
  /** RN-30: kg líquidos do ano ÷ 1000 ÷ área. */
  toneladasHa: number | null;
  colheitas: number;
};
export type TotalProdutividade = { areaHa: number; kgPeriodo: number; kgAno: number; colheitas: number };

/** Talhões ativos e os inativos com colheita, por nome; o total não tem t/ha (mistura frutas). */
export function produtividadeTalhoes(
  talhoes: TalhaoDoRelatorio[],
  kgPeriodo: Map<string, number>,
  noAno: ColheitaNoAno[],
): { linhas: LinhaProdutividade[]; total: TotalProdutividade } {
  const ano = new Map(noAno.map((c) => [c.talhaoId, c]));
  const linhas = talhoes
    .filter((t) => t.ativo || ano.has(t.id) || kgPeriodo.has(t.id))
    .map((t): LinhaProdutividade => {
      const c = ano.get(t.id);
      const kgAno = c ? arredondar(c.brutoKg - c.descarteKg, 3) : 0;
      return {
        talhaoId: t.id,
        talhao: t.nome,
        fruta: t.fruta,
        areaHa: t.areaHa,
        kgPeriodo: kgPeriodo.get(t.id) ?? 0,
        kgAno,
        toneladasHa: razao(kgAno / 1000, t.areaHa),
        colheitas: c?.colheitas ?? 0,
      };
    })
    .sort((a, b) => a.talhao.localeCompare(b.talhao));
  const soma = (valor: (l: LinhaProdutividade) => number, casas: number) =>
    arredondar(
      linhas.reduce((s, l) => s + valor(l), 0),
      casas,
    );
  return {
    linhas,
    total: {
      areaHa: soma((l) => l.areaHa, 2),
      kgPeriodo: soma((l) => l.kgPeriodo, 3),
      kgAno: soma((l) => l.kgAno, 3),
      colheitas: soma((l) => l.colheitas, 0),
    },
  };
}

// Preço pago a terceiros por mês ----------------------------------------------

export type CompraDeTerceiro = { frutaId: string; data: Date; brutoKg: number; descarteKg: number; valorTotal: number };

function precoMedio(compras: CompraDeTerceiro[]): number | null {
  const valor = compras.reduce((s, c) => s + c.valorTotal, 0);
  const kg = compras.reduce((s, c) => s + c.brutoKg - c.descarteKg, 0);
  return razao(valor, kg);
}

/** Por fruta: Jan–Dez (0–11) e o ano (12); mês sem compra = null. */
export function precoTerceirosPorMes(compras: CompraDeTerceiro[]): Record<string, (number | null)[]> {
  return Object.fromEntries(
    [...agrupar(compras, (c) => c.frutaId)].map(([frutaId, cs]) => [
      frutaId,
      [...agruparPorMes(cs, (c) => c.data).map(precoMedio), precoMedio(cs)],
    ]),
  );
}
