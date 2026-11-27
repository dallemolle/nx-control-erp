import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { FilialFormValues } from "@/lib/schemas/filial";
import { comMensagemDeDuplicidade } from "./duplicidade";

const MSG_CNPJ_DUPLICADO = "Já existe uma filial com este CNPJ/CPF";

export async function listarFiliais(empresaId: string) {
  return prisma.filial.findMany({ where: { empresaId }, orderBy: { nome: "asc" } });
}

export async function criarFilial(sessao: SessaoAtiva, dados: FilialFormValues) {
  requirePermission(sessao.perfil, "filial:gerenciar");

  // Quem cria já sai com Leitura e Alteração, como na Matriz da empresa nova: sem isso a filial não aparece em
  // "Trocar filial" de ninguém até alguém marcar o acesso em Usuários.
  const filial = await comMensagemDeDuplicidade(
    () =>
      prisma.$transaction(async (tx) => {
        const nova = await tx.filial.create({ data: { ...dados, empresaId: sessao.empresaId } });
        const vinculo = await tx.usuarioEmpresa.findUniqueOrThrow({
          where: { usuarioId_empresaId: { usuarioId: sessao.usuarioId, empresaId: sessao.empresaId } },
          select: { id: true },
        });
        await tx.usuarioEmpresaFilial.create({
          data: { usuarioEmpresaId: vinculo.id, filialId: nova.id, podeAlterar: true, ativo: true },
        });
        return nova;
      }),
    MSG_CNPJ_DUPLICADO,
  );

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: filial.id,
    usuarioId: sessao.usuarioId,
    entidade: "Filial",
    entidadeId: filial.id,
    acao: "CRIAR",
    anterior: null,
    novo: dados,
  });

  return filial;
}

export async function atualizarFilial(sessao: SessaoAtiva, id: string, dados: FilialFormValues) {
  requirePermission(sessao.perfil, "filial:gerenciar");

  const anterior = await prisma.filial.findUniqueOrThrow({
    where: { id, empresaId: sessao.empresaId },
  });
  const filial = await comMensagemDeDuplicidade(
    () => prisma.filial.update({ where: { id }, data: dados }),
    MSG_CNPJ_DUPLICADO,
  );

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: id,
    usuarioId: sessao.usuarioId,
    entidade: "Filial",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: { nome: anterior.nome, cnpjCpf: anterior.cnpjCpf },
    novo: dados,
  });

  return filial;
}

export async function definirAtivoFilial(sessao: SessaoAtiva, id: string, ativo: boolean) {
  requirePermission(sessao.perfil, "filial:gerenciar");

  // Inativa, a filial não abre sessão: quem está nela seria jogado para "Selecionar filial".
  if (!ativo && id === sessao.filialId) {
    throw new Error("Troque de filial antes de inativar esta");
  }

  await prisma.filial.findUniqueOrThrow({
    where: { id, empresaId: sessao.empresaId },
  });
  const filial = await prisma.filial.update({ where: { id }, data: { ativo } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: id,
    usuarioId: sessao.usuarioId,
    entidade: "Filial",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });

  return filial;
}
