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

export async function buscarUsuarioPorEmail(
  sessao: SessaoAtiva,
  email: string,
): Promise<{ id: string; nome: string } | null> {
  requirePermission(sessao.perfil, "usuario:gerenciar");

  const usuario = await prisma.usuario.findUnique({ where: { email }, select: { id: true, nome: true } });
  return usuario;
}

export async function criarUsuarioEVincular(
  sessao: SessaoAtiva,
  dados: {
    nome?: string;
    email: string;
    senha?: string;
    perfil: Perfil;
    concederAcessoFilialAtiva: boolean;
    podeAlterarFilialAtiva: boolean;
  },
) {
  requirePermission(sessao.perfil, "usuario:gerenciar");

  const resultado = await prisma.$transaction(async (tx) => {
    let usuario = await tx.usuario.findUnique({ where: { email: dados.email } });

    if (!usuario) {
      if (!dados.nome || !dados.senha) {
        throw new Error("Nome e senha são obrigatórios para criar um novo usuário");
      }
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

    if (dados.concederAcessoFilialAtiva) {
      await tx.usuarioEmpresaFilial.create({
        data: {
          usuarioEmpresaId: vinculo.id,
          filialId: sessao.filialId,
          ativo: true,
          podeAlterar: dados.podeAlterarFilialAtiva,
        },
      });
    }

    return { usuario, vinculo };
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: null,
    usuarioId: sessao.usuarioId,
    entidade: "UsuarioEmpresa",
    entidadeId: resultado.vinculo.id,
    acao: "CRIAR",
    anterior: null,
    novo: { usuarioId: resultado.usuario.id, email: dados.email, perfil: dados.perfil },
  });

  if (dados.concederAcessoFilialAtiva) {
    await registrarAuditoria({
      empresaId: sessao.empresaId,
      filialId: sessao.filialId,
      usuarioId: sessao.usuarioId,
      entidade: "UsuarioEmpresaFilial",
      entidadeId: resultado.vinculo.id,
      acao: "CRIAR",
      anterior: null,
      novo: { filialId: sessao.filialId, podeAlterar: dados.podeAlterarFilialAtiva },
    });
  }

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
    filialId: null,
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
    filialId: null,
    usuarioId: sessao.usuarioId,
    entidade: "UsuarioEmpresa",
    entidadeId: vinculo.id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });

  return vinculo;
}
