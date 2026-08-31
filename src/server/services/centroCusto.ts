import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import { assertSemCiclo } from "@/server/services/hierarquia";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { CentroCustoFormValues } from "@/lib/schemas/centroCusto";

export async function listarCentrosCusto(filialId: string) {
  return prisma.centroCusto.findMany({ where: { filialId }, orderBy: { codigo: "asc" } });
}

const SEM_PAI = "__raiz__";

function normalizarParentId(parentId: string | undefined): string | null {
  return parentId && parentId.length > 0 && parentId !== SEM_PAI ? parentId : null;
}

async function validarParentMesmaFilial(filialId: string, parentId: string | null) {
  if (!parentId) return;
  const parent = await prisma.centroCusto.findUnique({ where: { id: parentId } });
  if (!parent || parent.filialId !== filialId) {
    throw new Error("Centro de custo pai inválido");
  }
}

export async function criarCentroCusto(sessao: SessaoAtiva, dados: CentroCustoFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const parentId = normalizarParentId(dados.parentId);
  await validarParentMesmaFilial(sessao.filialId, parentId);

  const centro = await prisma.centroCusto.create({
    data: { nome: dados.nome, codigo: dados.codigo, parentId, filialId: sessao.filialId },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "CentroCusto",
    entidadeId: centro.id,
    acao: "CRIAR",
    anterior: null,
    novo: { nome: dados.nome, codigo: dados.codigo, parentId },
  });

  return centro;
}

export async function atualizarCentroCusto(
  sessao: SessaoAtiva,
  id: string,
  dados: CentroCustoFormValues,
) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const parentId = normalizarParentId(dados.parentId);
  await validarParentMesmaFilial(sessao.filialId, parentId);

  const itens = await prisma.centroCusto.findMany({
    where: { filialId: sessao.filialId },
    select: { id: true, parentId: true },
  });
  assertSemCiclo(itens, id, parentId);

  const anterior = await prisma.centroCusto.findUniqueOrThrow({
    where: { id, filialId: sessao.filialId },
  });
  const centro = await prisma.centroCusto.update({
    where: { id },
    data: { nome: dados.nome, codigo: dados.codigo, parentId },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "CentroCusto",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: { nome: anterior.nome, codigo: anterior.codigo, parentId: anterior.parentId },
    novo: { nome: dados.nome, codigo: dados.codigo, parentId },
  });

  return centro;
}

export async function definirAtivoCentroCusto(sessao: SessaoAtiva, id: string, ativo: boolean) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await prisma.centroCusto.findUniqueOrThrow({ where: { id, filialId: sessao.filialId } });
  const centro = await prisma.centroCusto.update({ where: { id }, data: { ativo } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "CentroCusto",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });

  return centro;
}
