import { randomBytes, createHash } from "crypto";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";

export function hashChaveApi(chave: string): string {
  return createHash("sha256").update(chave).digest("hex");
}

export async function gerarChave(
  sessao: SessaoAtiva,
  usuarioId: string,
  nome: string,
): Promise<{ id: string; chaveCompleta: string; prefixo: string }> {
  requirePermission(sessao.perfil, "usuario:gerenciar");

  const chaveCompleta = `sk_${randomBytes(32).toString("base64url")}`;
  const prefixo = chaveCompleta.slice(0, 11);
  const chaveHash = hashChaveApi(chaveCompleta);

  const apiKey = await prisma.apiKey.create({
    data: { usuarioId, nome, prefixo, chaveHash },
  });

  return { id: apiKey.id, chaveCompleta, prefixo };
}

export async function revogarChave(sessao: SessaoAtiva, chaveId: string): Promise<void> {
  requirePermission(sessao.perfil, "usuario:gerenciar");
  await prisma.apiKey.update({ where: { id: chaveId }, data: { revogadaEm: new Date() } });
}

export async function listarChaves(sessao: SessaoAtiva, usuarioId: string) {
  requirePermission(sessao.perfil, "usuario:gerenciar");
  return prisma.apiKey.findMany({
    where: { usuarioId },
    select: { id: true, nome: true, prefixo: true, ultimoUsoEm: true, revogadaEm: true, criadoEm: true },
    orderBy: { criadoEm: "desc" },
  });
}
