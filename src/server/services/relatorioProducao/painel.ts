import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import {
  agregarEstoque,
  agregarOPs,
  agregarRecepcoes,
  agregarVendas,
  type ContagemKg,
  type TotaisOPs,
  type TotaisRecepcao,
  type TotaisVendas,
} from "@/lib/producao/painel";
import { listarOPs } from "../ordemProducao";
import { listarLotes } from "../estoque";
import { listarEntregas } from "../entrega";
import { somarSaldos } from "@/lib/producao/relatorios";
import { buscarItensVendidos, buscarSaldosAReceber, opDoPainel } from "./consultas";

export type Periodo = { inicio: Date; fim: Date };

export type LinhaFruta = {
  frutaId: string;
  fruta: string;
  recepcao: TotaisRecepcao | null;
  processamento: TotaisOPs | null;
  faturamentoPolpa: number;
};

export type PainelProducao = {
  periodo: Periodo;
  hoje: Date;
  porFruta: LinhaFruta[];
  recepcao: TotaisRecepcao;
  processamento: TotaisOPs;
  vendas: TotaisVendas & { aReceber: number };
  estoque: { polpaKg: number; frutoAguardandoKg: number; valor: number };
  alertas: {
    lotesVencendo: ContagemKg;
    lotesVencidos: ContagemKg;
    entregasAbertas: number;
    entregasAtrasadas: number;
    opsBalanco: number;
    opsBranqueamento: number;
  };
  estoquePorProduto: { produtoId: string; produto: string; saldoKg: number; valor: number }[];
  vendasPorProduto: { produtoId: string; produto: string; kg: number; faturamento: number }[];
};

/**
 * Indicadores do painel de produção (doc 07, D-26). Período pela data do
 * evento (RN-31); estoque, entregas e a receber na data de hoje. OPs, lotes e
 * entregas vêm das mesmas listagens das telas, para o alerta bater com a lista.
 */
export async function buscarPainelProducao(sessao: SessaoAtiva, periodo: Periodo, hoje: Date): Promise<PainelProducao> {
  requirePermission(sessao.perfil, "producao:ler");
  const { filialId, empresaId } = sessao;
  const noPeriodo = { gte: periodo.inicio, lte: periodo.fim };

  const [produtos, frutas, recepcoes, ops, itens, saldos, lotes, entregas] = await Promise.all([
    prisma.produto.findMany({
      where: { empresaId },
      select: { id: true, codigo: true, descricao: true, categoria: true, frutaId: true },
    }),
    prisma.fruta.findMany({ where: { empresaId }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.recepcaoFruto.groupBy({
      by: ["produtoId", "origem"],
      where: { filialId, status: "ATIVA", data: noPeriodo },
      _sum: { pesoBrutoKg: true, descarteKg: true },
    }),
    listarOPs(filialId, periodo),
    buscarItensVendidos(filialId, periodo),
    buscarSaldosAReceber(filialId),
    listarLotes(filialId, {}, hoje),
    listarEntregas(filialId, {}, hoje),
  ]);

  const produto = new Map(produtos.map((p) => [p.id, p]));
  const rotulo = (id: string) => {
    const p = produto.get(id);
    return p ? `${p.codigo} · ${p.descricao}` : id;
  };

  const rec = agregarRecepcoes(
    recepcoes.map((g) => ({
      frutaId: produto.get(g.produtoId)?.frutaId ?? "",
      origem: g.origem,
      brutoKg: Number(g._sum.pesoBrutoKg ?? 0),
      descarteKg: Number(g._sum.descarteKg ?? 0),
    })),
  );

  const proc = agregarOPs(ops.map(opDoPainel));
  const vendas = agregarVendas(itens);
  const aReceber = somarSaldos(saldos);

  const estoque = agregarEstoque(
    lotes
      .filter((lote) => lote.status !== "ZERADO")
      .map((lote) => ({
        produtoId: lote.produtoId,
        categoria: produto.get(lote.produtoId)!.categoria,
        status: lote.status,
        saldoKg: Number(lote.saldoKg),
        valor: lote.valor,
      })),
  );

  const porFruta = frutas.flatMap((f): LinhaFruta[] => {
    const recepcao = rec.porFruta.get(f.id) ?? null;
    const processamento = proc.porFruta.get(f.id) ?? null;
    const faturamentoPolpa = vendas.polpaPorFruta.get(f.id);
    if (!recepcao && !processamento && faturamentoPolpa === undefined) return [];
    return [{ frutaId: f.id, fruta: f.nome, recepcao, processamento, faturamentoPolpa: faturamentoPolpa ?? 0 }];
  });

  return {
    periodo,
    hoje,
    porFruta,
    recepcao: rec.total,
    processamento: proc.total,
    vendas: { ...vendas.total, aReceber },
    estoque: { polpaKg: estoque.polpaKg, frutoAguardandoKg: estoque.frutoAguardandoKg, valor: estoque.valor },
    alertas: {
      lotesVencendo: estoque.vencendo,
      lotesVencidos: estoque.vencidos,
      entregasAbertas: entregas.length,
      entregasAtrasadas: entregas.filter((e) => (e.atraso ?? 0) > 0).length,
      opsBalanco: proc.opsBalanco,
      opsBranqueamento: proc.opsBranqueamento,
    },
    estoquePorProduto: [...estoque.porProduto]
      .map(([produtoId, v]) => ({ produtoId, produto: rotulo(produtoId), ...v }))
      .sort((a, b) => a.produto.localeCompare(b.produto)),
    vendasPorProduto: [...vendas.porProduto]
      .map(([produtoId, v]) => ({ produtoId, produto: rotulo(produtoId), ...v }))
      .sort((a, b) => b.faturamento - a.faturamento || a.produto.localeCompare(b.produto)),
  };
}
