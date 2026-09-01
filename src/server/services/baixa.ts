import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import { recalcularEPersistirStatusParcela } from "@/server/services/parcela";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { BaixaFormValues } from "@/lib/schemas/baixa";

async function buscarParcelaDaFilial(filialId: string, parcelaId: string) {
  return prisma.parcela.findFirstOrThrow({ where: { id: parcelaId, titulo: { filialId } } });
}

async function buscarBaixaDaFilial(filialId: string, baixaId: string) {
  return prisma.baixa.findFirstOrThrow({ where: { id: baixaId, parcela: { titulo: { filialId } } } });
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

  const baixa = await prisma.baixa.update({
    where: { id: baixaId },
    data: { statusAprovacao: "APROVADO", avaliadoPorId: sessao.usuarioId, avaliadoEm: new Date() },
  });
  await recalcularEPersistirStatusParcela(anterior.parcelaId);

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Baixa",
    entidadeId: baixaId,
    acao: "APROVAR",
    anterior: { statusAprovacao: anterior.statusAprovacao },
    novo: { statusAprovacao: "APROVADO" },
  });

  return baixa;
}

export async function rejeitarBaixa(sessao: SessaoAtiva, baixaId: string, motivo: string) {
  requirePermission(sessao.perfil, "titulo:aprovar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await buscarBaixaDaFilial(sessao.filialId, baixaId);

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
