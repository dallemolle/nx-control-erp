import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import {
  AGENCIA_CONTA_CAIXA,
  CODIGO_BANCO_CAIXA,
  type ContaBancariaFormValues,
} from "@/lib/schemas/contaBancaria";
import { obterBancoCaixa } from "./banco";

/**
 * Conta Caixa (dinheiro em espécie) sempre usa o banco CX e a agência "-";
 * nenhuma outra conta pode usar o banco CX.
 */
async function normalizarDadosConta(dados: ContaBancariaFormValues) {
  if (dados.tipo === "CAIXA") {
    const bancoCaixa = await obterBancoCaixa();
    return { ...dados, bancoId: bancoCaixa.id, agencia: AGENCIA_CONTA_CAIXA };
  }
  const banco = await prisma.banco.findUnique({ where: { id: dados.bancoId }, select: { codigo: true } });
  if (!banco) throw new Error("Banco não encontrado");
  if (banco.codigo === CODIGO_BANCO_CAIXA) throw new Error("O banco CX é reservado às contas Caixa");
  return dados;
}

export async function listarContasBancarias(filialId: string) {
  return prisma.contaBancaria.findMany({
    where: { filialId },
    include: { banco: true },
    orderBy: { criadoEm: "asc" },
  });
}

export async function criarContaBancaria(sessao: SessaoAtiva, dadosFormulario: ContaBancariaFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  const dados = await normalizarDadosConta(dadosFormulario);

  const conta = await prisma.contaBancaria.create({
    data: { ...dados, filialId: sessao.filialId },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "ContaBancaria",
    entidadeId: conta.id,
    acao: "CRIAR",
    anterior: null,
    novo: dados,
  });

  return conta;
}

export async function atualizarContaBancaria(
  sessao: SessaoAtiva,
  id: string,
  dadosFormulario: ContaBancariaFormValues,
) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.contaBancaria.findUniqueOrThrow({
    where: { id, filialId: sessao.filialId },
  });
  const dados = await normalizarDadosConta(dadosFormulario);
  // Lançamentos de conta Caixa nascem conciliados; os das outras esperam o extrato.
  // Trocar o tipo depois de haver lançamentos deixaria os antigos na regra errada.
  const mudaRegraDeConciliacao = (anterior.tipo === "CAIXA") !== (dados.tipo === "CAIXA");
  if (mudaRegraDeConciliacao && (await prisma.lancamentoBancario.count({ where: { contaBancariaId: id } })) > 0) {
    throw new Error("Não é possível mudar de ou para o tipo Caixa uma conta que já tem lançamentos");
  }
  const conta = await prisma.contaBancaria.update({ where: { id }, data: dados });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "ContaBancaria",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: {
      bancoId: anterior.bancoId,
      agencia: anterior.agencia,
      conta: anterior.conta,
      tipo: anterior.tipo,
      moeda: anterior.moeda,
      saldoInicial: anterior.saldoInicial,
    },
    novo: dados,
  });

  return conta;
}

export async function definirAtivoContaBancaria(sessao: SessaoAtiva, id: string, ativo: boolean) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await prisma.contaBancaria.findUniqueOrThrow({ where: { id, filialId: sessao.filialId } });
  const conta = await prisma.contaBancaria.update({ where: { id }, data: { ativo } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "ContaBancaria",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });

  return conta;
}
