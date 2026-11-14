import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import {
  agregarPorOrigem,
  precoTerceirosPorMes,
  produtividadeTalhoes,
  type ComFrutas,
  type LinhaOrigem,
  type LinhaProdutividade,
  type TotalProdutividade,
} from "@/lib/producao/relatoriosOrigem";

export type RelatorioOrigem = {
  periodo: { inicio: Date; fim: Date };
  /** Ano da data "Até" (D-32): produtividade e preço por mês. */
  ano: number;
  /** Frutas com recepção no período, por nome. */
  frutas: { id: string; nome: string }[];
  porOrigem: LinhaOrigem[];
  total: ComFrutas;
  produtividade: LinhaProdutividade[];
  totalProdutividade: TotalProdutividade;
  /** Frutas compradas de terceiros no ano, por nome. */
  frutasTerceiros: { id: string; nome: string }[];
  /** frutaId → Jan–Dez e o ano. */
  precoPorMes: Record<string, (number | null)[]>;
};

const n = (v: unknown) => Number(v ?? 0);

/**
 * Relatório de origem da matéria-prima (doc 07, REL_ORIGEM): recepções ativas
 * do período por talhão e fornecedor; produtividade dos talhões e preço pago a
 * terceiros no ano da data "Até" (D-32).
 */
export async function buscarRelatorioOrigem(
  sessao: SessaoAtiva,
  periodo: { inicio: Date; fim: Date },
): Promise<RelatorioOrigem> {
  requirePermission(sessao.perfil, "producao:ler");
  const { filialId, empresaId } = sessao;
  const ano = periodo.fim.getUTCFullYear();
  const noAno = { gte: new Date(Date.UTC(ano, 0, 1)), lte: new Date(Date.UTC(ano, 11, 31)) };
  const ativa = { filialId, status: "ATIVA" as const };

  const [produtos, frutas, talhoes, fornecedores, doPeriodo, talhoesNoAno, compras] = await Promise.all([
    prisma.produto.findMany({ where: { empresaId }, select: { id: true, frutaId: true } }),
    prisma.fruta.findMany({ where: { empresaId }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.talhao.findMany({
      where: { filialId },
      select: { id: true, nome: true, areaHa: true, ativo: true, fruta: { select: { nome: true } } },
    }),
    prisma.fornecedor.findMany({
      where: { empresaId, recepcoesFruto: { some: { filialId } } },
      select: { id: true, nome: true },
    }),
    prisma.recepcaoFruto.groupBy({
      by: ["origem", "talhaoId", "fornecedorId", "produtoId"],
      where: { ...ativa, data: { gte: periodo.inicio, lte: periodo.fim } },
      _sum: { pesoBrutoKg: true, descarteKg: true, valorTotal: true },
      _count: { _all: true },
    }),
    prisma.recepcaoFruto.groupBy({
      by: ["talhaoId"],
      where: { ...ativa, origem: "PROPRIA", data: noAno },
      _sum: { pesoBrutoKg: true, descarteKg: true },
      _count: { _all: true },
    }),
    prisma.recepcaoFruto.groupBy({
      by: ["produtoId", "data"],
      where: { ...ativa, origem: "TERCEIRO", data: noAno },
      _sum: { pesoBrutoKg: true, descarteKg: true, valorTotal: true },
    }),
  ]);

  const frutaDo = new Map(produtos.map((p) => [p.id, p.frutaId]));
  const nomeTalhao = new Map(talhoes.map((t) => [t.id, t.nome]));
  const nomeFornecedor = new Map(fornecedores.map((f) => [f.id, f.nome]));

  const { linhas, total } = agregarPorOrigem(
    doPeriodo.map((g) => {
      const propria = g.origem === "PROPRIA";
      const origemId = (propria ? g.talhaoId : g.fornecedorId) ?? "";
      return {
        tipo: g.origem,
        origemId,
        nome: (propria ? nomeTalhao : nomeFornecedor).get(origemId) ?? "—",
        frutaId: frutaDo.get(g.produtoId) ?? "",
        brutoKg: n(g._sum.pesoBrutoKg),
        descarteKg: n(g._sum.descarteKg),
        valorTotal: n(g._sum.valorTotal),
        cargas: g._count._all,
      };
    }),
  );

  const produtividade = produtividadeTalhoes(
    talhoes.map((t) => ({ id: t.id, nome: t.nome, fruta: t.fruta.nome, areaHa: n(t.areaHa), ativo: t.ativo })),
    new Map(linhas.filter((l) => l.tipo === "PROPRIA").map((l) => [l.origemId, l.kg])),
    talhoesNoAno.flatMap((g) =>
      g.talhaoId
        ? [
            {
              talhaoId: g.talhaoId,
              brutoKg: n(g._sum.pesoBrutoKg),
              descarteKg: n(g._sum.descarteKg),
              colheitas: g._count._all,
            },
          ]
        : [],
    ),
  );

  const precoPorMes = precoTerceirosPorMes(
    compras.map((c) => ({
      frutaId: frutaDo.get(c.produtoId) ?? "",
      data: c.data,
      brutoKg: n(c._sum.pesoBrutoKg),
      descarteKg: n(c._sum.descarteKg),
      valorTotal: n(c._sum.valorTotal),
    })),
  );

  return {
    periodo,
    ano,
    frutas: frutas.filter((f) => f.id in total.porFruta),
    porOrigem: linhas,
    total,
    produtividade: produtividade.linhas,
    totalProdutividade: produtividade.total,
    frutasTerceiros: frutas.filter((f) => f.id in precoPorMes),
    precoPorMes,
  };
}
