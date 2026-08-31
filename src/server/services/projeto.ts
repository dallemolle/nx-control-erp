import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { ProjetoFormValues } from "@/lib/schemas/projeto";

export async function listarProjetos(filialId: string) {
  return prisma.projeto.findMany({ where: { filialId }, orderBy: { codigo: "asc" } });
}

export async function criarProjeto(sessao: SessaoAtiva, dados: ProjetoFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const projeto = await prisma.projeto.create({
    data: { ...dados, filialId: sessao.filialId },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Projeto",
    entidadeId: projeto.id,
    acao: "CRIAR",
    anterior: null,
    novo: dados,
  });

  return projeto;
}

export async function atualizarProjeto(
  sessao: SessaoAtiva,
  id: string,
  dados: ProjetoFormValues,
) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.projeto.findUniqueOrThrow({
    where: { id, filialId: sessao.filialId },
  });
  const projeto = await prisma.projeto.update({ where: { id }, data: dados });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Projeto",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: {
      nome: anterior.nome,
      codigo: anterior.codigo,
      status: anterior.status,
    },
    novo: dados,
  });

  return projeto;
}

export async function definirAtivoProjeto(sessao: SessaoAtiva, id: string, ativo: boolean) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await prisma.projeto.findUniqueOrThrow({ where: { id, filialId: sessao.filialId } });
  const projeto = await prisma.projeto.update({ where: { id }, data: { ativo } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Projeto",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });

  return projeto;
}
