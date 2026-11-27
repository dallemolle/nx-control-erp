import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import { assertSemCiclo } from "@/server/services/hierarquia";
import type { TipoCategoriaFinanceira } from "@prisma/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { CategoriaFinanceiraDados } from "@/lib/schemas/categoriaFinanceira";

export async function listarCategoriasFinanceiras(filialId: string) {
  return prisma.categoriaFinanceira.findMany({ where: { filialId }, orderBy: { nome: "asc" } });
}

const SEM_PAI = "__raiz__";

function normalizarParentId(parentId: string | undefined): string | null {
  return parentId && parentId.length > 0 && parentId !== SEM_PAI ? parentId : null;
}

const MSG_TIPO_DO_PAI = "A categoria pai precisa ser do mesmo tipo (Despesa ou Receita)";

/** O pai é da mesma filial e do mesmo tipo: Receita dentro de Despesa não soma em nenhum relatório. */
async function validarPai(filialId: string, parentId: string | null, tipo: TipoCategoriaFinanceira) {
  if (!parentId) return;
  const parent = await prisma.categoriaFinanceira.findUnique({ where: { id: parentId } });
  if (!parent || parent.filialId !== filialId) {
    throw new Error("Categoria financeira pai inválida");
  }
  if (parent.tipo !== tipo) throw new Error(MSG_TIPO_DO_PAI);
}

export async function criarCategoriaFinanceira(
  sessao: SessaoAtiva,
  dados: CategoriaFinanceiraDados,
) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const parentId = normalizarParentId(dados.parentId);
  await validarPai(sessao.filialId, parentId, dados.tipo);
  const naoOperacional = dados.naoOperacional ?? false;

  const categoria = await prisma.categoriaFinanceira.create({
    data: { nome: dados.nome, tipo: dados.tipo, parentId, naoOperacional, filialId: sessao.filialId },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "CategoriaFinanceira",
    entidadeId: categoria.id,
    acao: "CRIAR",
    anterior: null,
    novo: { nome: dados.nome, tipo: dados.tipo, parentId, naoOperacional },
  });

  return categoria;
}

export async function atualizarCategoriaFinanceira(
  sessao: SessaoAtiva,
  id: string,
  dados: CategoriaFinanceiraDados,
) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const parentId = normalizarParentId(dados.parentId);
  await validarPai(sessao.filialId, parentId, dados.tipo);
  const naoOperacional = dados.naoOperacional ?? false;

  const itens = await prisma.categoriaFinanceira.findMany({
    where: { filialId: sessao.filialId },
    select: { id: true, parentId: true },
  });
  assertSemCiclo(itens, id, parentId);

  const anterior = await prisma.categoriaFinanceira.findUniqueOrThrow({
    where: { id, filialId: sessao.filialId },
  });
  if (anterior.tipo !== dados.tipo) {
    const filhasDoOutroTipo = await prisma.categoriaFinanceira.findMany({
      where: { parentId: id, tipo: { not: dados.tipo } },
      select: { nome: true },
      orderBy: { nome: "asc" },
    });
    if (filhasDoOutroTipo.length > 0) {
      throw new Error(`${MSG_TIPO_DO_PAI}: mude também ${filhasDoOutroTipo.map((f) => f.nome).join(", ")}`);
    }
  }
  const categoria = await prisma.categoriaFinanceira.update({
    where: { id },
    data: { nome: dados.nome, tipo: dados.tipo, parentId, naoOperacional },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "CategoriaFinanceira",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: {
      nome: anterior.nome,
      tipo: anterior.tipo,
      parentId: anterior.parentId,
      naoOperacional: anterior.naoOperacional,
    },
    novo: { nome: dados.nome, tipo: dados.tipo, parentId, naoOperacional },
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
