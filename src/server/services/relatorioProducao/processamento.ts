import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { agregarProcessamento, type LinhaProcessamento } from "@/lib/producao/relatoriosProcessamento";
import { listarOPs } from "../ordemProducao";
import { opDoProcessamento } from "./consultas";

export type LinhaProcessamentoFruta = LinhaProcessamento & { frutaId: string; fruta: string };

export type RelatorioProcessamento = {
  periodo: { inicio: Date; fim: Date };
  /** Frutas com OP (não cancelada) no período, por nome. */
  porFruta: LinhaProcessamentoFruta[];
  total: LinhaProcessamento;
};

/**
 * Relatório de processamento (doc 07, REL_PROCESSAMENTO): OPs do período pela
 * mesma listagem da tela Processamento; volume com abertas (D-29), mínimo,
 * máximo, balanço e custo só com encerradas (D-31).
 */
export async function buscarRelatorioProcessamento(
  sessao: SessaoAtiva,
  periodo: { inicio: Date; fim: Date },
): Promise<RelatorioProcessamento> {
  requirePermission(sessao.perfil, "producao:ler");
  const { filialId, empresaId } = sessao;
  const [frutas, ops] = await Promise.all([
    prisma.fruta.findMany({ where: { empresaId }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    listarOPs(filialId, periodo),
  ]);
  const { porFruta, total } = agregarProcessamento(ops.map(opDoProcessamento));
  return {
    periodo,
    porFruta: frutas.flatMap((f) => {
      const linha = porFruta.get(f.id);
      return linha ? [{ ...linha, frutaId: f.id, fruta: f.nome }] : [];
    }),
    total,
  };
}
