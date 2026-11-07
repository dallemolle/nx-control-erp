import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";

const TAMANHO_PAGINA = 50;

export type FiltroAuditoria = {
  entidade?: string;
  acao?: string;
  usuarioId?: string;
  filialId?: string;
  dataDe?: Date;
  dataAte?: Date;
};

export type OpcoesFiltroAuditoria = {
  entidades: string[];
  acoes: string[];
  usuarios: { id: string; nome: string }[];
  filiais: { id: string; nome: string }[];
};

/** Teto do export: um filtro vazio numa empresa antiga não pode gerar um arquivo sem fim. */
export const LIMITE_EXPORT_AUDITORIA = 10_000;

/**
 * Teto menor para o PDF: com o JSON de anterior/novo, 10.000 registros viram
 * centenas de páginas que ninguém lê. Para o histórico longo, CSV/Excel.
 */
export const LIMITE_PDF_AUDITORIA = 2_000;

function whereDaAuditoria(sessao: SessaoAtiva, filtro: FiltroAuditoria) {
  return {
    empresaId: sessao.empresaId,
    ...(filtro.entidade && { entidade: filtro.entidade }),
    ...(filtro.acao && { acao: filtro.acao }),
    ...(filtro.usuarioId && { usuarioId: filtro.usuarioId }),
    ...(filtro.filialId && { filialId: filtro.filialId }),
    ...((filtro.dataDe || filtro.dataAte) && {
      criadoEm: {
        ...(filtro.dataDe && { gte: filtro.dataDe }),
        ...(filtro.dataAte && { lte: filtro.dataAte }),
      },
    }),
  };
}

const INCLUDE_AUDITORIA = {
  usuario: { select: { id: true, nome: true } },
  filial: { select: { id: true, nome: true } },
} as const;

const ORDEM_AUDITORIA = [{ criadoEm: "desc" as const }, { id: "desc" as const }];

export async function listarAuditoria(sessao: SessaoAtiva, filtro: FiltroAuditoria, pagina: number) {
  requirePermission(sessao.perfil, "auditoria:ler");

  const where = whereDaAuditoria(sessao, filtro);
  const paginaSegura = Math.max(pagina, 1);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: INCLUDE_AUDITORIA,
      orderBy: ORDEM_AUDITORIA,
      skip: (paginaSegura - 1) * TAMANHO_PAGINA,
      take: TAMANHO_PAGINA,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, totalPaginas: Math.max(Math.ceil(total / TAMANHO_PAGINA), 1) };
}

/**
 * Mesmo filtro da tela, sem paginação: até `limite` registros, os mais
 * recentes. `total` é quantos o filtro casa no banco — quando passa do
 * limite, o arquivo saiu cortado e quem exporta pode avisar.
 */
export async function listarAuditoriaParaExport(
  sessao: SessaoAtiva,
  filtro: FiltroAuditoria,
  limite: number = LIMITE_EXPORT_AUDITORIA,
) {
  requirePermission(sessao.perfil, "auditoria:ler");

  const where = whereDaAuditoria(sessao, filtro);
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, include: INCLUDE_AUDITORIA, orderBy: ORDEM_AUDITORIA, take: limite }),
    prisma.auditLog.count({ where }),
  ]);
  return { logs, total };
}

export async function buscarOpcoesFiltroAuditoria(sessao: SessaoAtiva): Promise<OpcoesFiltroAuditoria> {
  requirePermission(sessao.perfil, "auditoria:ler");

  const [entidadesRows, acoesRows, usuarioIdsRows, filiais] = await Promise.all([
    prisma.auditLog.groupBy({
      by: ["entidade"],
      where: { empresaId: sessao.empresaId },
      orderBy: { entidade: "asc" },
    }),
    prisma.auditLog.groupBy({
      by: ["acao"],
      where: { empresaId: sessao.empresaId },
      orderBy: { acao: "asc" },
    }),
    prisma.auditLog.groupBy({
      by: ["usuarioId"],
      where: { empresaId: sessao.empresaId, usuarioId: { not: null } },
    }),
    prisma.filial.findMany({
      where: { empresaId: sessao.empresaId },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
  ]);

  const usuarioIds = usuarioIdsRows.map((linha) => linha.usuarioId).filter((id): id is string => id !== null);

  const usuarios =
    usuarioIds.length > 0
      ? await prisma.usuario.findMany({
          where: { id: { in: usuarioIds } },
          orderBy: { nome: "asc" },
          select: { id: true, nome: true },
        })
      : [];

  return {
    entidades: entidadesRows.map((linha) => linha.entidade),
    acoes: acoesRows.map((linha) => linha.acao),
    usuarios,
    filiais,
  };
}
