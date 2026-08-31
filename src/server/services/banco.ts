import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { BancoFormValues } from "@/lib/schemas/banco";

// Banco é um catálogo global (sem filialId/empresaId, sem ativo). Não chamar
// requireAlteracaoFilial aqui: esse guard trava alteração de dado
// filial-scoped, e Banco não pertence a filial nenhuma — travar atrás do
// `podeAlterarFilial` da filial ativa seria semanticamente errado.

export async function listarBancos() {
  return prisma.banco.findMany({ orderBy: { nome: "asc" } });
}

export async function criarBanco(sessao: SessaoAtiva, dados: BancoFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");

  const banco = await prisma.banco.create({ data: dados });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Banco",
    entidadeId: banco.id,
    acao: "CRIAR",
    anterior: null,
    novo: dados,
  });

  return banco;
}

export async function atualizarBanco(sessao: SessaoAtiva, id: string, dados: BancoFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");

  const anterior = await prisma.banco.findUniqueOrThrow({ where: { id } });
  const banco = await prisma.banco.update({ where: { id }, data: dados });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Banco",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: {
      codigo: anterior.codigo,
      nome: anterior.nome,
    },
    novo: dados,
  });

  return banco;
}
