import { randomUUID } from "crypto";
import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type {
  LancamentoManualFormValues,
  TransferenciaFormValues,
  SaldoBancarioFormValues,
} from "@/lib/schemas/lancamentoBancario";
import { SEM_VALOR } from "@/lib/schemas/enums";

function normalizarOpcional<T extends string>(valor: T | typeof SEM_VALOR | undefined): T | null {
  return valor && valor.length > 0 && valor !== SEM_VALOR ? valor : null;
}

/**
 * A FK só prova que a conta existe em alguma filial — sem este escopo um
 * lançamento poderia ser criado contra a conta bancária de outro tenant.
 */
async function buscarContaDaFilial(filialId: string, contaBancariaId: string) {
  const conta = await prisma.contaBancaria.findFirst({ where: { id: contaBancariaId, filialId } });
  if (!conta) {
    throw new Error("Conta bancária não pertence à filial ativa");
  }
  return conta;
}

export async function listarLancamentos(filialId: string) {
  return prisma.lancamentoBancario.findMany({
    where: { filialId },
    include: { contaBancaria: { include: { banco: true } } },
    orderBy: { data: "desc" },
  });
}

export async function calcularSaldoContabil(contaBancariaId: string): Promise<number> {
  const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: contaBancariaId } });

  const somas = await prisma.lancamentoBancario.groupBy({
    by: ["tipo"],
    where: { contaBancariaId },
    _sum: { valor: true },
  });

  const entrada = Number(somas.find((s) => s.tipo === "ENTRADA")?._sum.valor ?? 0);
  const saida = Number(somas.find((s) => s.tipo === "SAIDA")?._sum.valor ?? 0);

  return Number(conta.saldoInicial) + entrada - saida;
}

export async function buscarUltimoSaldoInformado(contaBancariaId: string) {
  return prisma.saldoBancarioInformado.findFirst({
    where: { contaBancariaId },
    orderBy: { data: "desc" },
  });
}

export async function listarResumoContas(filialId: string) {
  const contas = await prisma.contaBancaria.findMany({
    where: { filialId, ativo: true },
    include: { banco: true },
    orderBy: { criadoEm: "asc" },
  });

  return Promise.all(
    contas.map(async (conta) => ({
      conta,
      saldoContabil: await calcularSaldoContabil(conta.id),
      ultimoSaldoInformado: await buscarUltimoSaldoInformado(conta.id),
    })),
  );
}

export async function criarLancamentoManual(sessao: SessaoAtiva, dados: LancamentoManualFormValues) {
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await buscarContaDaFilial(sessao.filialId, dados.contaBancariaId);

  const dadosNormalizados = {
    filialId: sessao.filialId,
    contaBancariaId: dados.contaBancariaId,
    data: dados.data,
    tipo: dados.tipo,
    valor: dados.valor,
    descricao: dados.descricao,
    origem: "MANUAL" as const,
    categoriaFinanceiraId: normalizarOpcional(dados.categoriaFinanceiraId),
    usuarioId: sessao.usuarioId,
  };

  const lancamento = await prisma.lancamentoBancario.create({ data: dadosNormalizados });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "LancamentoBancario",
    entidadeId: lancamento.id,
    acao: "CRIAR",
    anterior: null,
    novo: dadosNormalizados,
  });

  return lancamento;
}

export async function criarTransferencia(sessao: SessaoAtiva, dados: TransferenciaFormValues) {
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await buscarContaDaFilial(sessao.filialId, dados.contaOrigemId);
  await buscarContaDaFilial(sessao.filialId, dados.contaDestinoId);

  const transferenciaId = randomUUID();

  const [saida, entrada] = await prisma.$transaction([
    prisma.lancamentoBancario.create({
      data: {
        filialId: sessao.filialId,
        contaBancariaId: dados.contaOrigemId,
        data: dados.data,
        tipo: "SAIDA",
        valor: dados.valor,
        descricao: dados.descricao,
        origem: "TRANSFERENCIA",
        transferenciaId,
        usuarioId: sessao.usuarioId,
      },
    }),
    prisma.lancamentoBancario.create({
      data: {
        filialId: sessao.filialId,
        contaBancariaId: dados.contaDestinoId,
        data: dados.data,
        tipo: "ENTRADA",
        valor: dados.valor,
        descricao: dados.descricao,
        origem: "TRANSFERENCIA",
        transferenciaId,
        usuarioId: sessao.usuarioId,
      },
    }),
  ]);

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "LancamentoBancario",
    entidadeId: saida.id,
    acao: "TRANSFERIR",
    anterior: null,
    novo: {
      transferenciaId,
      contaOrigemId: dados.contaOrigemId,
      contaDestinoId: dados.contaDestinoId,
      valor: dados.valor,
      descricao: dados.descricao,
    },
  });

  return { saida, entrada };
}

export async function informarSaldoBancario(sessao: SessaoAtiva, dados: SaldoBancarioFormValues) {
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await buscarContaDaFilial(sessao.filialId, dados.contaBancariaId);

  const registro = await prisma.saldoBancarioInformado.create({
    data: {
      contaBancariaId: dados.contaBancariaId,
      data: dados.data,
      saldo: dados.saldo,
      usuarioId: sessao.usuarioId,
    },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "SaldoBancarioInformado",
    entidadeId: registro.id,
    acao: "CRIAR",
    anterior: null,
    novo: { contaBancariaId: dados.contaBancariaId, data: dados.data, saldo: dados.saldo },
  });

  return registro;
}
