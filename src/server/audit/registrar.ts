import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { buildAuditDiff } from "./diff";

export type RegistrarAuditoriaParams = {
  empresaId: string | null;
  filialId: string | null;
  usuarioId: string | null;
  entidade: string;
  entidadeId: string;
  acao: string;
  anterior: Record<string, unknown> | null;
  novo: Record<string, unknown> | null;
};

export async function registrarAuditoria(params: RegistrarAuditoriaParams): Promise<void> {
  const { valorAnterior, valorNovo } = buildAuditDiff(params.anterior, params.novo);

  await prisma.auditLog.create({
    data: {
      empresaId: params.empresaId,
      filialId: params.filialId,
      usuarioId: params.usuarioId,
      entidade: params.entidade,
      entidadeId: params.entidadeId,
      acao: params.acao,
      valorAnterior: (valorAnterior ?? undefined) as Prisma.InputJsonValue | undefined,
      valorNovo: (valorNovo ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
