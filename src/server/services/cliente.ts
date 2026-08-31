import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { ClienteFormValues } from "@/lib/schemas/cliente";

export async function listarClientes(empresaId: string) {
  return prisma.cliente.findMany({ where: { empresaId }, orderBy: { nome: "asc" } });
}

export async function criarCliente(sessao: SessaoAtiva, dados: ClienteFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const cliente = await prisma.cliente.create({ data: { ...dados, empresaId: sessao.empresaId } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Cliente",
    entidadeId: cliente.id,
    acao: "CRIAR",
    anterior: null,
    novo: dados,
  });

  return cliente;
}

export async function atualizarCliente(
  sessao: SessaoAtiva,
  id: string,
  dados: ClienteFormValues,
) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.cliente.findUniqueOrThrow({
    where: { id, empresaId: sessao.empresaId },
  });
  const cliente = await prisma.cliente.update({ where: { id }, data: dados });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Cliente",
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

  return cliente;
}

export async function definirAtivoCliente(sessao: SessaoAtiva, id: string, ativo: boolean) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await prisma.cliente.findUniqueOrThrow({ where: { id, empresaId: sessao.empresaId } });
  const cliente = await prisma.cliente.update({ where: { id }, data: { ativo } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Cliente",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });

  return cliente;
}
