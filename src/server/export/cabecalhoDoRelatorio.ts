import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { CabecalhoPdf } from "@/lib/export/pdf";
import type { FiltroClassificacao } from "@/lib/classificacaoFiscal";

/**
 * Cabeçalho do PDF exportado: título, "Empresa — Filial" (ou "todas as
 * filiais" nos relatórios consolidados), os filtros aplicados e quem gerou.
 * Só é chamado quando o formato pedido é PDF — as rotas passam
 * `() => cabecalhoDoRelatorio(...)` para não consultar o banco no CSV/Excel.
 */
export async function cabecalhoDoRelatorio(
  sessao: SessaoAtiva,
  opcoes: {
    titulo: string;
    filtros?: (string | null | undefined | false)[];
    consolidado?: boolean;
    /** Linhas extras abaixo dos filtros (ex.: "arquivo cortado nos N mais recentes"). */
    avisos?: string[];
  },
): Promise<CabecalhoPdf> {
  const [empresa, filial] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: sessao.empresaId }, select: { nomeFantasia: true } }),
    opcoes.consolidado
      ? Promise.resolve(null)
      : prisma.filial.findUnique({ where: { id: sessao.filialId }, select: { nome: true } }),
  ]);

  const nomeEmpresa = empresa?.nomeFantasia ?? "";
  const escopo = opcoes.consolidado ? `${nomeEmpresa} — todas as filiais` : `${nomeEmpresa} — ${filial?.nome ?? ""}`;
  const filtros = (opcoes.filtros ?? []).filter((filtro): filtro is string => typeof filtro === "string" && filtro !== "");

  return {
    titulo: opcoes.titulo,
    linhas: [
      escopo,
      ...(filtros.length > 0 ? [`Filtros: ${filtros.join(" · ")}`] : []),
      ...(opcoes.avisos ?? []),
      `Gerado por ${sessao.nome}`,
    ],
  };
}

export function filtroDeClassificacao(classificacao: FiltroClassificacao): string | null {
  if (!classificacao) return null;
  return `Classificação: ${classificacao === "FISCAL" ? "Fiscal" : "Gerencial"}`;
}
