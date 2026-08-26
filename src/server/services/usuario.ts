import type { Perfil } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import { hashSenha } from "@/server/auth/senha";
import type { SessaoAtiva } from "@/server/auth/sessao";

export async function listarUsuariosDaEmpresa(empresaId: string) {
  return prisma.usuarioEmpresa.findMany({
    where: { empresaId },
    include: { usuario: true },
    orderBy: { usuario: { nome: "asc" } },
  });
}

export async function criarUsuarioEVincular(
  sessao: SessaoAtiva,
  dados: { nome: string; email: string; senha: string; perfil: Perfil },
) {
  requirePermission(sessao.perfil, "usuario:gerenciar");

  const resultado = await prisma.$transaction(async (tx) => {
    let usuario = await tx.usuario.findUnique({ where: { email: dados.email } });

    if (!usuario) {
      usuario = await tx.usuario.create({
        data: { nome: dados.nome, email: dados.email, senhaHash: await hashSenha(dados.senha) },
      });
    }

    const vinculoExistente = await tx.usuarioEmpresa.findUnique({
      where: { usuarioId_empresaId: { usuarioId: usuario.id, empresaId: sessao.empresaId } },
    });

    if (vinculoExistente) {
      throw new Error("Este usuário já tem acesso a esta empresa");
    }

    const vinculo = await tx.usuarioEmpresa.create({
      data: { usuarioId: usuario.id, empresaId: sessao.empresaId, perfil: dados.perfil },
    });

    return { usuario, vinculo };
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    usuarioId: sessao.usuarioId,
    entidade: "UsuarioEmpresa",
    entidadeId: resultado.vinculo.id,
    acao: "CRIAR",
    anterior: null,
    novo: { usuarioId: resultado.usuario.id, email: dados.email, perfil: dados.perfil },
  });

  return resultado;
}

export async function atualizarPerfilVinculo(
  sessao: SessaoAtiva,
  usuarioId: string,
  perfil: Perfil,
) {
  requirePermission(sessao.perfil, "usuario:gerenciar");

  const anterior = await prisma.usuarioEmpresa.findUniqueOrThrow({
    where: { usuarioId_empresaId: { usuarioId, empresaId: sessao.empresaId } },
  });

  const vinculo = await prisma.usuarioEmpresa.update({
    where: { id: anterior.id },
    data: { perfil },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    usuarioId: sessao.usuarioId,
    entidade: "UsuarioEmpresa",
    entidadeId: vinculo.id,
    acao: "ATUALIZAR",
    anterior: { perfil: anterior.perfil },
    novo: { perfil },
  });

  return vinculo;
}

export async function definirAtivoVinculo(sessao: SessaoAtiva, usuarioId: string, ativo: boolean) {
  requirePermission(sessao.perfil, "usuario:gerenciar");

  if (usuarioId === sessao.usuarioId && !ativo) {
    throw new Error("Você não pode desativar seu próprio acesso");
  }

  const anterior = await prisma.usuarioEmpresa.findUniqueOrThrow({
    where: { usuarioId_empresaId: { usuarioId, empresaId: sessao.empresaId } },
  });

  const vinculo = await prisma.usuarioEmpresa.update({
    where: { id: anterior.id },
    data: { ativo },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    usuarioId: sessao.usuarioId,
    entidade: "UsuarioEmpresa",
    entidadeId: vinculo.id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });

  return vinculo;
}
