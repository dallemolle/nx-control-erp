import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import { recalcularEPersistirStatusParcela } from "@/server/services/parcela";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { StatusAprovacaoBaixa } from "@prisma/client";
import type { BaixaFormValues } from "@/lib/schemas/baixa";

async function buscarParcelaDaFilial(filialId: string, parcelaId: string) {
  return prisma.parcela.findFirstOrThrow({ where: { id: parcelaId, titulo: { filialId } } });
}

async function buscarBaixaDaFilial(filialId: string, baixaId: string) {
  return prisma.baixa.findFirstOrThrow({ where: { id: baixaId, parcela: { titulo: { filialId } } } });
}

/**
 * APROVADO e REJEITADO são estados finais. Sem esta trava, reenviar o formulário de
 * aprovação (o `baixaId` vem de um input escondido) reabriria uma baixa já rejeitada
 * e ela voltaria a abater o saldo da parcela.
 */
function garantirBaixaPendente(statusAtual: StatusAprovacaoBaixa): void {
  if (statusAtual !== "PENDENTE") {
    throw new Error("Esta baixa já foi avaliada");
  }
}

export async function listarBaixasPendentes(filialId: string) {
  return prisma.baixa.findMany({
    where: { statusAprovacao: "PENDENTE", parcela: { titulo: { filialId } } },
    include: {
      parcela: { include: { titulo: { include: { fornecedor: true, cliente: true } } } },
      contaBancaria: true,
      usuario: true,
    },
    orderBy: { criadoEm: "asc" },
  });
}

export async function registrarBaixa(sessao: SessaoAtiva, parcelaId: string, dados: BaixaFormValues) {
  requirePermission(sessao.perfil, "titulo:baixar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await buscarParcelaDaFilial(sessao.filialId, parcelaId);

  // A FK só prova que a conta existe em alguma filial — sem este escopo uma baixa
  // poderia ser lançada contra a conta bancária de outro tenant.
  const contaBancaria = await prisma.contaBancaria.findFirst({
    where: { id: dados.contaBancariaId, filialId: sessao.filialId },
  });
  if (!contaBancaria) {
    throw new Error("Conta bancária não pertence à filial ativa");
  }

  const baixa = await prisma.baixa.create({
    data: {
      parcelaId,
      data: dados.data,
      valorPago: dados.valorPago,
      valorJuros: dados.valorJuros,
      valorMulta: dados.valorMulta,
      valorDesconto: dados.valorDesconto,
      contaBancariaId: dados.contaBancariaId,
      usuarioId: sessao.usuarioId,
      statusAprovacao: "PENDENTE",
    },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Baixa",
    entidadeId: baixa.id,
    acao: "CRIAR",
    anterior: null,
    novo: { parcelaId, valorPago: dados.valorPago, statusAprovacao: "PENDENTE" },
  });

  return baixa;
}

export async function aprovarBaixa(sessao: SessaoAtiva, baixaId: string) {
  requirePermission(sessao.perfil, "titulo:aprovar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await buscarBaixaDaFilial(sessao.filialId, baixaId);
  garantirBaixaPendente(anterior.statusAprovacao);

  const baixa = await prisma.$transaction(async (tx) => {
    const parcela = await tx.parcela.findUniqueOrThrow({
      where: { id: anterior.parcelaId },
      include: { titulo: true },
    });

    const baixaAtualizada = await tx.baixa.update({
      where: { id: baixaId },
      data: { statusAprovacao: "APROVADO", avaliadoPorId: sessao.usuarioId, avaliadoEm: new Date() },
    });
    await recalcularEPersistirStatusParcela(anterior.parcelaId, tx);

    const lancamento = await tx.lancamentoBancario.create({
      data: {
        filialId: sessao.filialId,
        contaBancariaId: anterior.contaBancariaId,
        data: anterior.data,
        tipo: parcela.titulo.tipo === "RECEBER" ? "ENTRADA" : "SAIDA",
        valor: anterior.valorPago,
        descricao: `Baixa aprovada — parcela nº ${parcela.numero}`,
        origem: "BAIXA",
        baixaId: baixaAtualizada.id,
        usuarioId: sessao.usuarioId,
      },
    });

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Baixa",
        entidadeId: baixaId,
        acao: "APROVAR",
        anterior: { statusAprovacao: anterior.statusAprovacao },
        novo: { statusAprovacao: "APROVADO", lancamentoBancarioId: lancamento.id },
      },
      tx,
    );

    return baixaAtualizada;
  });

  return baixa;
}

export async function rejeitarBaixa(sessao: SessaoAtiva, baixaId: string, motivo: string) {
  requirePermission(sessao.perfil, "titulo:aprovar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await buscarBaixaDaFilial(sessao.filialId, baixaId);
  garantirBaixaPendente(anterior.statusAprovacao);

  const baixa = await prisma.baixa.update({
    where: { id: baixaId },
    data: {
      statusAprovacao: "REJEITADO",
      avaliadoPorId: sessao.usuarioId,
      avaliadoEm: new Date(),
      motivoRejeicao: motivo,
    },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Baixa",
    entidadeId: baixaId,
    acao: "REJEITAR",
    anterior: { statusAprovacao: anterior.statusAprovacao },
    novo: { statusAprovacao: "REJEITADO", motivoRejeicao: motivo },
  });

  return baixa;
}
