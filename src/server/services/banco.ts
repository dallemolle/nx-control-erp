import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { Prisma } from "@prisma/client";
import type { BancoFormValues } from "@/lib/schemas/banco";
import { CODIGO_BANCO_CAIXA } from "@/lib/schemas/contaBancaria";

// Banco é um catálogo global (sem filialId/empresaId, sem ativo). Não chamar
// requireAlteracaoFilial aqui: esse guard trava alteração de dado
// filial-scoped, e Banco não pertence a filial nenhuma — travar atrás do
// `podeAlterarFilial` da filial ativa seria semanticamente errado.

/** Bancos para escolher em cadastros. O banco CX (contas Caixa) fica de fora: é escolhido sozinho. */
export async function listarBancos() {
  return prisma.banco.findMany({ where: { codigo: { not: CODIGO_BANCO_CAIXA } }, orderBy: { nome: "asc" } });
}

/** Banco sentinela das contas Caixa. A migration já o cria; o upsert cobre um banco recriado sem ela. */
export async function obterBancoCaixa(db: Prisma.TransactionClient = prisma) {
  return db.banco.upsert({
    where: { codigo: CODIGO_BANCO_CAIXA },
    update: {},
    create: { codigo: CODIGO_BANCO_CAIXA, nome: "Caixa interno (dinheiro em espécie)" },
  });
}

function garantirCodigoNaoReservado(codigo: string) {
  if (codigo.trim().toUpperCase() === CODIGO_BANCO_CAIXA) {
    throw new Error("O código CX é reservado às contas Caixa");
  }
}

export async function criarBanco(sessao: SessaoAtiva, dados: BancoFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  garantirCodigoNaoReservado(dados.codigo);

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

  garantirCodigoNaoReservado(dados.codigo);
  const anterior = await prisma.banco.findUniqueOrThrow({ where: { id } });
  garantirCodigoNaoReservado(anterior.codigo);
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
