import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import {
  agregarVendasDetalhadas,
  type IndicadoresVenda,
  type LinhaCanal,
  type LinhaCliente,
  type LinhaForma,
  type LinhaProdutoVenda,
} from "@/lib/producao/relatorios";
import { buscarItensVendidos, buscarSaldosAReceber } from "./consultas";

export type RelatorioVendas = {
  periodo: { inicio: Date; fim: Date };
  hoje: Date;
  total: IndicadoresVenda & { aReceber: number };
  porCliente: LinhaCliente[];
  porProduto: (LinhaProdutoVenda & { produto: string })[];
  porCanal: LinhaCanal[];
  porForma: LinhaForma[];
};

/**
 * Relatório de vendas (doc 07, REL_VENDAS): itens de pedidos confirmados do
 * período (RN-31) e saldo a receber de hoje, de qualquer data (D-29).
 */
export async function buscarRelatorioVendas(
  sessao: SessaoAtiva,
  periodo: { inicio: Date; fim: Date },
  hoje: Date,
): Promise<RelatorioVendas> {
  requirePermission(sessao.perfil, "producao:ler");
  const { filialId, empresaId } = sessao;

  const [produtos, itens, saldos] = await Promise.all([
    prisma.produto.findMany({ where: { empresaId }, select: { id: true, codigo: true, descricao: true } }),
    buscarItensVendidos(filialId, periodo),
    buscarSaldosAReceber(filialId),
  ]);

  const produto = new Map(produtos.map((p) => [p.id, `${p.codigo} · ${p.descricao}`]));
  const r = agregarVendasDetalhadas(itens, saldos);
  return {
    periodo,
    hoje,
    ...r,
    porProduto: r.porProduto.map((p) => ({ ...p, produto: produto.get(p.produtoId) ?? p.produtoId })),
  };
}
