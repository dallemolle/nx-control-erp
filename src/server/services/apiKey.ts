import { randomBytes, createHash } from "crypto";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { ValidadeChaveDias } from "@/lib/validadeChaveApi";

export function hashChaveApi(chave: string): string {
  return createHash("sha256").update(chave).digest("hex");
}

export async function gerarChave(
  sessao: SessaoAtiva,
  usuarioId: string,
  nome: string,
  validadeDias: ValidadeChaveDias | null = null,
): Promise<{ id: string; chaveCompleta: string; prefixo: string }> {
  requirePermission(sessao.perfil, "usuario:gerenciar");
  // Sem este escopo, um admin da empresa A emitiria uma chave valida para um
  // usuario da empresa B — credencial permanente cross-tenant.
  await prisma.usuarioEmpresa.findUniqueOrThrow({
    where: { usuarioId_empresaId: { usuarioId, empresaId: sessao.empresaId } },
  });

  const chaveCompleta = `sk_${randomBytes(32).toString("base64url")}`;
  const prefixo = chaveCompleta.slice(0, 11);
  const chaveHash = hashChaveApi(chaveCompleta);

  const expiraEm = validadeDias === null ? null : new Date(Date.now() + validadeDias * 24 * 60 * 60 * 1000);

  const apiKey = await prisma.apiKey.create({
    data: { usuarioId, nome, prefixo, chaveHash, expiraEm },
  });

  // Nunca a chave completa nem o hash: só o que identifica a chave.
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: null,
    usuarioId: sessao.usuarioId,
    entidade: "ApiKey",
    entidadeId: apiKey.id,
    acao: "CRIAR",
    anterior: null,
    novo: { usuarioId, nome, prefixo, expiraEm },
  });

  return { id: apiKey.id, chaveCompleta, prefixo };
}

export async function revogarChave(sessao: SessaoAtiva, chaveId: string): Promise<void> {
  requirePermission(sessao.perfil, "usuario:gerenciar");
  const revogadaEm = new Date();
  const resultado = await prisma.apiKey.updateMany({
    where: { id: chaveId, usuario: { empresas: { some: { empresaId: sessao.empresaId } } } },
    data: { revogadaEm },
  });
  if (resultado.count === 0) {
    throw new Error("Chave não encontrada nesta empresa");
  }

  const chave = await prisma.apiKey.findUniqueOrThrow({
    where: { id: chaveId },
    select: { usuarioId: true, nome: true, prefixo: true },
  });
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: null,
    usuarioId: sessao.usuarioId,
    entidade: "ApiKey",
    entidadeId: chaveId,
    acao: "REVOGAR",
    anterior: { revogadaEm: null },
    novo: { ...chave, revogadaEm },
  });
}

export async function listarChaves(sessao: SessaoAtiva, usuarioId: string) {
  requirePermission(sessao.perfil, "usuario:gerenciar");
  await prisma.usuarioEmpresa.findUniqueOrThrow({
    where: { usuarioId_empresaId: { usuarioId, empresaId: sessao.empresaId } },
  });
  return prisma.apiKey.findMany({
    where: { usuarioId },
    select: { id: true, nome: true, prefixo: true, ultimoUsoEm: true, revogadaEm: true, expiraEm: true, criadoEm: true },
    orderBy: { criadoEm: "desc" },
  });
}
