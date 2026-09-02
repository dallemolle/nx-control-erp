import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { FornecedorFormValues } from "@/lib/schemas/fornecedor";
import { SEM_VALOR } from "@/lib/schemas/enums";

function normalizarOpcional<T extends string>(valor: T | typeof SEM_VALOR | undefined): T | null {
  return valor && valor.length > 0 && valor !== SEM_VALOR ? valor : null;
}

/**
 * Zera os campos do meio de pagamento não selecionado — sem isso, trocar de
 * PIX para depósito (ou vice-versa) deixaria os campos do meio anterior
 * "presos" no banco em vez de refletir a escolha atual.
 */
function camposBancariosNormalizados(dados: FornecedorFormValues) {
  const meioPagamento =
    dados.meioPagamento && dados.meioPagamento !== SEM_VALOR ? dados.meioPagamento : null;

  return {
    meioPagamento,
    tipoChavePix: meioPagamento === "PIX" ? normalizarOpcional(dados.tipoChavePix) : null,
    chavePix: meioPagamento === "PIX" ? normalizarOpcional(dados.chavePix) : null,
    bancoId: meioPagamento === "DEPOSITO_BANCARIO" ? normalizarOpcional(dados.bancoId) : null,
    agencia: meioPagamento === "DEPOSITO_BANCARIO" ? normalizarOpcional(dados.agencia) : null,
    conta: meioPagamento === "DEPOSITO_BANCARIO" ? normalizarOpcional(dados.conta) : null,
    tipoContaTerceiro:
      meioPagamento === "DEPOSITO_BANCARIO" ? normalizarOpcional(dados.tipoContaTerceiro) : null,
    titularConta: meioPagamento === "DEPOSITO_BANCARIO" ? normalizarOpcional(dados.titularConta) : null,
  };
}

export async function listarFornecedores(empresaId: string) {
  return prisma.fornecedor.findMany({ where: { empresaId }, orderBy: { nome: "asc" } });
}

export async function criarFornecedor(sessao: SessaoAtiva, dados: FornecedorFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const dadosNormalizados = { ...dados, ...camposBancariosNormalizados(dados) };
  const fornecedor = await prisma.fornecedor.create({
    data: { ...dadosNormalizados, empresaId: sessao.empresaId },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Fornecedor",
    entidadeId: fornecedor.id,
    acao: "CRIAR",
    anterior: null,
    novo: dadosNormalizados,
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
  const dadosNormalizados = { ...dados, ...camposBancariosNormalizados(dados) };
  const fornecedor = await prisma.fornecedor.update({ where: { id }, data: dadosNormalizados });

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
      meioPagamento: anterior.meioPagamento,
      tipoChavePix: anterior.tipoChavePix,
      chavePix: anterior.chavePix,
      bancoId: anterior.bancoId,
      agencia: anterior.agencia,
      conta: anterior.conta,
      tipoContaTerceiro: anterior.tipoContaTerceiro,
      titularConta: anterior.titularConta,
    },
    novo: dadosNormalizados,
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
