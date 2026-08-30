import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { FornecedorFormValues } from "@/lib/schemas/fornecedor";

export async function listarFornecedores(empresaId: string) {
  return prisma.fornecedor.findMany({ where: { empresaId }, orderBy: { nome: "asc" } });
}

export async function criarFornecedor(sessao: SessaoAtiva, dados: FornecedorFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const fornecedor = await prisma.fornecedor.create({
    data: { ...dados, empresaId: sessao.empresaId },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Fornecedor",
    entidadeId: fornecedor.id,
    acao: "CRIAR",
    anterior: null,
    novo: dados,
  });

  return fornecedor;
}

export async function atualizarFornecedor(
  sessao: SessaoAtiva,
  id: string,
  dados: FornecedorFormValues,
) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.fornecedor.findUniqueOrThrow({
    where: { id, empresaId: sessao.empresaId },
  });
  const fornecedor = await prisma.fornecedor.update({ where: { id }, data: dados });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Fornecedor",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: {
      nome: anterior.nome,
      cnpjCpf: anterior.cnpjCpf,
      contato: anterior.contato,
      email: anterior.email,
      telefone: anterior.telefone,
    },
    novo: dados,
  });

  return fornecedor;
}

export async function definirAtivoFornecedor(sessao: SessaoAtiva, id: string, ativo: boolean) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await prisma.fornecedor.findUniqueOrThrow({ where: { id, empresaId: sessao.empresaId } });
  const fornecedor = await prisma.fornecedor.update({ where: { id }, data: { ativo } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Fornecedor",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });

  return fornecedor;
}
