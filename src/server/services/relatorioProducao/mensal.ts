import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import {
  frutasComMovimento,
  montarColunasMensais,
  polpaPorProdutoMes,
  type ColunaMensal,
} from "@/lib/producao/relatorios";
import { listarOPs } from "../ordemProducao";
import { buscarItensVendidos, opDoPainel } from "./consultas";

export type RelatorioMensal = {
  ano: number;
  frutas: { id: string; nome: string }[];
  /** 13 colunas: Jan–Dez (índices 0–11) e o total (índice 12). */
  colunas: ColunaMensal[];
  polpaPorProduto: { produtoId: string; produto: string; meses: number[]; total: number }[];
};

/**
 * Relatório mensal (doc 07, REL_MENSAL): uma consulta por fonte para o ano
 * inteiro, separada por mês e agregada pelas mesmas funções do painel (D-29).
 */
export async function buscarRelatorioMensal(sessao: SessaoAtiva, ano: number): Promise<RelatorioMensal> {
  requirePermission(sessao.perfil, "producao:ler");
  const { filialId, empresaId } = sessao;
  const periodo = { inicio: new Date(Date.UTC(ano, 0, 1)), fim: new Date(Date.UTC(ano, 11, 31)) };
  const noAno = { gte: periodo.inicio, lte: periodo.fim };

  const [produtos, frutas, recepcoes, ops, itens, producoes] = await Promise.all([
    prisma.produto.findMany({
      where: { empresaId },
      select: { id: true, codigo: true, descricao: true, frutaId: true },
    }),
    prisma.fruta.findMany({ where: { empresaId }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.recepcaoFruto.groupBy({
      by: ["produtoId", "origem", "data"],
      where: { filialId, status: "ATIVA", data: noAno },
      _sum: { pesoBrutoKg: true, descarteKg: true, valorTotal: true },
    }),
    listarOPs(filialId, periodo),
    buscarItensVendidos(filialId, periodo),
    prisma.producaoOP.findMany({
      where: { removidoEm: null, ordemProducao: { filialId, status: { not: "CANCELADA" }, data: noAno } },
      select: { produtoId: true, quantidadeKg: true, ordemProducao: { select: { data: true } } },
    }),
  ]);

  const produto = new Map(produtos.map((p) => [p.id, p]));
  const colunas = montarColunasMensais(
    recepcoes.map((g) => ({
      frutaId: produto.get(g.produtoId)?.frutaId ?? "",
      origem: g.origem,
      brutoKg: Number(g._sum.pesoBrutoKg ?? 0),
      descarteKg: Number(g._sum.descarteKg ?? 0),
      valorTotal: Number(g._sum.valorTotal ?? 0),
      data: g.data,
    })),
    ops.map(opDoPainel),
    itens,
  );

  const polpa = polpaPorProdutoMes(
    producoes.map((p) => ({ produtoId: p.produtoId, data: p.ordemProducao.data, kg: Number(p.quantidadeKg) })),
  );
  const rotulo = (id: string) => {
    const p = produto.get(id);
    return p ? `${p.codigo} · ${p.descricao}` : id;
  };

  return {
    ano,
    frutas: frutasComMovimento(colunas[12], frutas),
    colunas,
    polpaPorProduto: [...polpa]
      .map(([produtoId, v]) => ({ produtoId, produto: rotulo(produtoId), ...v }))
      .sort((a, b) => a.produto.localeCompare(b.produto)),
  };
}
