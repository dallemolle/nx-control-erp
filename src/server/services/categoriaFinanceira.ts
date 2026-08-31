import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import { assertSemCiclo } from "@/server/services/hierarquia";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { CategoriaFinanceiraFormValues } from "@/lib/schemas/categoriaFinanceira";

export async function listarCategoriasFinanceiras(filialId: string) {
  return prisma.categoriaFinanceira.findMany({ where: { filialId }, orderBy: { nome: "asc" } });
}

const SEM_PAI = "__raiz__";

function normalizarParentId(parentId: string | undefined): string | null {
  return parentId && parentId.length > 0 && parentId !== SEM_PAI ? parentId : null;
}

async function validarParentMesmaFilial(filialId: string, parentId: string | null) {
  if (!parentId) return;
  const parent = await prisma.categoriaFinanceira.findUnique({ where: { id: parentId } });
  if (!parent || parent.filialId !== filialId) {
    throw new Error("Categoria financeira pai inválida");
  }
}

export async function criarCategoriaFinanceira(
  sessao: SessaoAtiva,
  dados: CategoriaFinanceiraFormValues,
) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const parentId = normalizarParentId(dados.parentId);
  await validarParentMesmaFilial(sessao.filialId, parentId);

  const categoria = await prisma.categoriaFinanceira.create({
    data: { nome: dados.nome, tipo: dados.tipo, parentId, filialId: sessao.filialId },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "CategoriaFinanceira",
    entidadeId: categoria.id,
    acao: "CRIAR",
    anterior: null,
    novo: { nome: dados.nome, tipo: dados.tipo, parentId },
  });

  return categoria;
}

export async function atualizarCategoriaFinanceira(
  sessao: SessaoAtiva,
  id: string,
  dados: CategoriaFinanceiraFormValues,
) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const parentId = normalizarParentId(dados.parentId);
  await validarParentMesmaFilial(sessao.filialId, parentId);

  const itens = await prisma.categoriaFinanceira.findMany({
    where: { filialId: sessao.filialId },
    select: { id: true, parentId: true },
  });
  assertSemCiclo(itens, id, parentId);

  const anterior = await prisma.categoriaFinanceira.findUniqueOrThrow({
    where: { id, filialId: sessao.filialId },
  });
  const categoria = await prisma.categoriaFinanceira.update({
    where: { id },
    data: { nome: dados.nome, tipo: dados.tipo, parentId },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "CategoriaFinanceira",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: { nome: anterior.nome, tipo: anterior.tipo, parentId: anterior.parentId },
    novo: { nome: dados.nome, tipo: dados.tipo, parentId },
  });

  return categoria;
}

export async function definirAtivoCategoriaFinanceira(
  sessao: SessaoAtiva,
  id: string,
  ativo: boolean,
) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id, filialId: sessao.filialId } });
  const categoria = await prisma.categoriaFinanceira.update({ where: { id }, data: { ativo } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "CategoriaFinanceira",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });

  return categoria;
}
