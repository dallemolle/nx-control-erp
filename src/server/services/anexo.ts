import { put, del } from "@vercel/blob";
import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";

export async function listarAnexos(tituloId: string) {
  return prisma.anexo.findMany({ where: { tituloId }, orderBy: { criadoEm: "desc" } });
}

export async function adicionarAnexo(sessao: SessaoAtiva, tituloId: string, arquivo: File) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await prisma.titulo.findFirstOrThrow({ where: { id: tituloId, filialId: sessao.filialId } });

  const blob = await put(`titulos/${tituloId}/${arquivo.name}`, arquivo, { access: "public" });

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
