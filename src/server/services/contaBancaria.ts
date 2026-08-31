import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { ContaBancariaFormValues } from "@/lib/schemas/contaBancaria";

export async function listarContasBancarias(filialId: string) {
  return prisma.contaBancaria.findMany({
    where: { filialId },
    include: { banco: true },
    orderBy: { criadoEm: "asc" },
  });
}

export async function criarContaBancaria(sessao: SessaoAtiva, dados: ContaBancariaFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

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
    novo: { ...dados, saldoInicial: String(dados.saldoInicial) },
  });

  return conta;
}

export async function atualizarContaBancaria(
  sessao: SessaoAtiva,
  id: string,
  dados: ContaBancariaFormValues,
) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.contaBancaria.findUniqueOrThrow({
    where: { id, filialId: sessao.filialId },
  });
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
      saldoInicial: anterior.saldoInicial.toString(),
    },
    novo: { ...dados, saldoInicial: String(dados.saldoInicial) },
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
