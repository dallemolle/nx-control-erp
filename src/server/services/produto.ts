import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { ProdutoFormValues } from "@/lib/schemas/produto";
import { comMensagemDeDuplicidade } from "./duplicidade";
import { requireFrutaAtiva } from "./fruta";

const MSG_DUPLICADO = "Já existe um produto com este código";

export async function listarProdutos(empresaId: string) {
  return prisma.produto.findMany({
    where: { empresaId },
    include: { fruta: { select: { nome: true } } },
    orderBy: { codigo: "asc" },
  });
}

function autorizar(sessao: SessaoAtiva) {
  requirePermission(sessao.perfil, "cadastroProducao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
}

/** Campos opcionais vazios gravados como nulo (inclusive ao remover a unidade comercial). */
function paraBanco(dados: ProdutoFormValues) {
  return {
    ...dados,
    precoReferenciaKg: dados.precoReferenciaKg ?? null,
    armazenamento: dados.armazenamento ?? null,
    unidadeComercial: dados.unidadeComercial ?? null,
    fatorUnidadeKg: dados.fatorUnidadeKg ?? null,
  };
}

export async function criarProduto(sessao: SessaoAtiva, dados: ProdutoFormValues) {
  autorizar(sessao);
  await requireFrutaAtiva(sessao.empresaId, dados.frutaId);
  const novo = paraBanco(dados);
  const produto = await comMensagemDeDuplicidade(
    () => prisma.produto.create({ data: { ...novo, empresaId: sessao.empresaId } }),
    MSG_DUPLICADO,
  );
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Produto",
    entidadeId: produto.id,
    acao: "CRIAR",
    anterior: null,
    novo,
  });
  return produto;
}

export async function atualizarProduto(sessao: SessaoAtiva, id: string, dados: ProdutoFormValues) {
  autorizar(sessao);
  const anterior = await prisma.produto.findUniqueOrThrow({ where: { id, empresaId: sessao.empresaId } });
  await requireFrutaAtiva(sessao.empresaId, dados.frutaId);
  const novo = paraBanco(dados);
  const produto = await comMensagemDeDuplicidade(
    () => prisma.produto.update({ where: { id }, data: novo }),
    MSG_DUPLICADO,
  );
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Produto",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: {
      codigo: anterior.codigo,
      descricao: anterior.descricao,
      categoria: anterior.categoria,
      frutaId: anterior.frutaId,
      conservacao: anterior.conservacao,
      validadeDias: anterior.validadeDias,
      precoReferenciaKg: anterior.precoReferenciaKg === null ? null : Number(anterior.precoReferenciaKg),
      armazenamento: anterior.armazenamento,
      unidadeComercial: anterior.unidadeComercial,
      fatorUnidadeKg: anterior.fatorUnidadeKg === null ? null : Number(anterior.fatorUnidadeKg),
    },
    novo,
  });
  return produto;
}

export async function definirAtivoProduto(sessao: SessaoAtiva, id: string, ativo: boolean) {
  autorizar(sessao);
  await prisma.produto.findUniqueOrThrow({ where: { id, empresaId: sessao.empresaId } });
  const produto = await prisma.produto.update({ where: { id }, data: { ativo } });
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Produto",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });
  return produto;
}
