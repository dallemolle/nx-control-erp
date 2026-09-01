import { put, del } from "@vercel/blob";
import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";

/** Limite de tamanho por anexo. Documentos fiscais/boletos ficam muito abaixo disso. */
export const TAMANHO_MAXIMO_ANEXO_BYTES = 10 * 1024 * 1024;

export async function listarAnexos(filialId: string, tituloId: string) {
  return prisma.anexo.findMany({
    where: { tituloId, titulo: { filialId } },
    orderBy: { criadoEm: "desc" },
  });
}

export async function buscarAnexoDaFilial(filialId: string, anexoId: string) {
  return prisma.anexo.findFirst({ where: { id: anexoId, titulo: { filialId } } });
}

export async function adicionarAnexo(sessao: SessaoAtiva, tituloId: string, arquivo: File) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  if (arquivo.size > TAMANHO_MAXIMO_ANEXO_BYTES) {
    throw new Error(
      `Arquivo maior que o limite de ${TAMANHO_MAXIMO_ANEXO_BYTES / (1024 * 1024)} MB por anexo`,
    );
  }

  await prisma.titulo.findFirstOrThrow({ where: { id: tituloId, filialId: sessao.filialId } });

  // `allowOverwrite`: sem ele o `put()` do @vercel/blob v2 estoura quando o pathname
  // já existe (addRandomSuffix é false por padrão). O spec pede que reenviar o mesmo
  // arquivo substitua a versão anterior em vez de empilhar versões.
  const blob = await put(`titulos/${tituloId}/${arquivo.name}`, arquivo, {
    access: "private",
    allowOverwrite: true,
  });

  const anexo = await prisma.anexo.create({
    data: {
      tituloId,
      url: blob.url,
      nomeArquivo: arquivo.name,
      tamanhoBytes: arquivo.size,
      usuarioId: sessao.usuarioId,
    },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Anexo",
    entidadeId: anexo.id,
    acao: "CRIAR",
    anterior: null,
    novo: { tituloId, nomeArquivo: arquivo.name },
  });

  return anexo;
}

export async function removerAnexo(sessao: SessaoAtiva, anexoId: string) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.anexo.findFirstOrThrow({
    where: { id: anexoId, titulo: { filialId: sessao.filialId } },
  });

  await del(anterior.url);
  await prisma.anexo.delete({ where: { id: anexoId } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Anexo",
    entidadeId: anexoId,
    acao: "REMOVER",
    anterior: { nomeArquivo: anterior.nomeArquivo },
    novo: null,
  });
}
