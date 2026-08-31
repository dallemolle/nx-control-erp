import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { SafraFormValues } from "@/lib/schemas/safra";

export async function listarSafras(filialId: string) {
  return prisma.safra.findMany({ where: { filialId }, orderBy: { nome: "asc" } });
}

export async function criarSafra(sessao: SessaoAtiva, dados: SafraFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const safra = await prisma.safra.create({
    data: { ...dados, filialId: sessao.filialId },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Safra",
    entidadeId: safra.id,
    acao: "CRIAR",
    anterior: null,
    novo: { ...dados, dataInicio: dados.dataInicio.toISOString(), dataFim: dados.dataFim.toISOString() },
  });

  return safra;
}

export async function atualizarSafra(sessao: SessaoAtiva, id: string, dados: SafraFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.safra.findUniqueOrThrow({
    where: { id, filialId: sessao.filialId },
  });
  const safra = await prisma.safra.update({ where: { id }, data: dados });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Safra",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: {
      nome: anterior.nome,
      dataInicio: anterior.dataInicio.toISOString(),
      dataFim: anterior.dataFim.toISOString(),
      status: anterior.status,
    },
    novo: { ...dados, dataInicio: dados.dataInicio.toISOString(), dataFim: dados.dataFim.toISOString() },
  });

  return safra;
}

export async function definirAtivoSafra(sessao: SessaoAtiva, id: string, ativo: boolean) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await prisma.safra.findUniqueOrThrow({ where: { id, filialId: sessao.filialId } });
  const safra = await prisma.safra.update({ where: { id }, data: { ativo } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Safra",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });

  return safra;
}
