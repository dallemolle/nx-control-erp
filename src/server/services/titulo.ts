import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria, type ClientePrisma } from "@/server/audit/registrar";
import { recalcularEPersistirStatusParcela } from "@/server/services/parcela";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { TipoTitulo } from "@prisma/client";
import type { TituloFormValues, TituloHeaderFormValues } from "@/lib/schemas/titulo";

function contraparteCampo(tipo: TipoTitulo, contraparteId: string) {
  return tipo === "PAGAR"
    ? { fornecedorId: contraparteId, clienteId: null }
    : { fornecedorId: null, clienteId: contraparteId };
}

function normalizarOpcional(valor: string | undefined): string | null {
  return valor && valor.length > 0 ? valor : null;
}

export async function listarTitulos(filialId: string, tipo: TipoTitulo) {
  const titulos = await prisma.titulo.findMany({
    where: { filialId, tipo },
    include: {
      fornecedor: true,
      cliente: true,
      categoriaFinanceira: true,
      parcelas: { include: { baixas: true }, orderBy: { numero: "asc" } },
    },
    orderBy: { criadoEm: "desc" },
  });

  for (const titulo of titulos) {
    for (const parcela of titulo.parcelas) {
      parcela.status = await recalcularEPersistirStatusParcela(parcela.id);
    }
  }

  return titulos;
}

export async function criarTitulo(
  sessao: SessaoAtiva,
  tipo: TipoTitulo,
  dados: TituloFormValues,
  db: ClientePrisma = prisma,
) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const titulo = await db.titulo.create({
    data: {
      filialId: sessao.filialId,
      tipo,
      ...contraparteCampo(tipo, dados.contraparteId),
      documento: dados.documento,
      dataEmissao: dados.dataEmissao,
      dataCompetencia: dados.dataCompetencia,
      categoriaFinanceiraId: dados.categoriaFinanceiraId,
      centroCustoId: normalizarOpcional(dados.centroCustoId),
      centroLucroId: normalizarOpcional(dados.centroLucroId),
      safraId: normalizarOpcional(dados.safraId),
      projetoId: normalizarOpcional(dados.projetoId),
      contaBancariaId: normalizarOpcional(dados.contaBancariaId),
      formaPagamento: normalizarOpcional(dados.formaPagamento),
      parcelas: {
        create: dados.parcelas.map((parcela) => ({
          numero: parcela.numero,
          dataVencimento: parcela.dataVencimento,
          valorOriginal: parcela.valorOriginal,
          valorAtualizado: parcela.valorOriginal,
        })),
      },
    },
    include: { parcelas: true },
  });

  await registrarAuditoria(
    {
      empresaId: sessao.empresaId,
      filialId: sessao.filialId,
      usuarioId: sessao.usuarioId,
      entidade: "Titulo",
      entidadeId: titulo.id,
      acao: "CRIAR",
      anterior: null,
      novo: { tipo, documento: dados.documento, parcelas: titulo.parcelas.length },
    },
    db,
  );

  return titulo;
}

export async function atualizarTitulo(sessao: SessaoAtiva, id: string, dados: TituloHeaderFormValues) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.titulo.findUniqueOrThrow({ where: { id, filialId: sessao.filialId } });

  const titulo = await prisma.titulo.update({
    where: { id },
    data: {
      ...contraparteCampo(anterior.tipo, dados.contraparteId),
      documento: dados.documento,
      dataEmissao: dados.dataEmissao,
      dataCompetencia: dados.dataCompetencia,
      categoriaFinanceiraId: dados.categoriaFinanceiraId,
      centroCustoId: normalizarOpcional(dados.centroCustoId),
      centroLucroId: normalizarOpcional(dados.centroLucroId),
      safraId: normalizarOpcional(dados.safraId),
      projetoId: normalizarOpcional(dados.projetoId),
      contaBancariaId: normalizarOpcional(dados.contaBancariaId),
      formaPagamento: normalizarOpcional(dados.formaPagamento),
    },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Titulo",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: {
      documento: anterior.documento,
      dataEmissao: anterior.dataEmissao,
      dataCompetencia: anterior.dataCompetencia,
      categoriaFinanceiraId: anterior.categoriaFinanceiraId,
      centroCustoId: anterior.centroCustoId,
      centroLucroId: anterior.centroLucroId,
      safraId: anterior.safraId,
      projetoId: anterior.projetoId,
      contaBancariaId: anterior.contaBancariaId,
      formaPagamento: anterior.formaPagamento,
    },
    novo: dados,
  });

  return titulo;
}

export async function alterarVencimentoParcela(sessao: SessaoAtiva, parcelaId: string, novoVencimento: Date) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.parcela.findFirstOrThrow({
    where: { id: parcelaId, titulo: { filialId: sessao.filialId } },
  });

  await prisma.parcela.update({ where: { id: parcelaId }, data: { dataVencimento: novoVencimento } });
  await recalcularEPersistirStatusParcela(parcelaId);

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Parcela",
    entidadeId: parcelaId,
    acao: "ATUALIZAR",
    anterior: { dataVencimento: anterior.dataVencimento },
    novo: { dataVencimento: novoVencimento },
  });
}

export async function cancelarParcela(sessao: SessaoAtiva, parcelaId: string) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.parcela.findFirstOrThrow({
    where: { id: parcelaId, titulo: { filialId: sessao.filialId } },
  });
  const parcela = await prisma.parcela.update({ where: { id: parcelaId }, data: { status: "CANCELADO" } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Parcela",
    entidadeId: parcelaId,
    acao: "CANCELAR",
    anterior: { status: anterior.status },
    novo: { status: "CANCELADO" },
  });

  return parcela;
}
