import type { Prisma, TipoMovimentoEstoque } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireAlteracaoFilial, requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { arredondar } from "@/lib/producao/arredondar";
import { diasParaVencer, statusDoLote, type StatusLote } from "@/lib/producao/statusLote";
import { obterConfiguracaoProducao } from "./configuracaoProducao";

/**
 * Único caminho que altera `Lote.saldoKg`. A saída só é gravada se o saldo
 * continuar ≥ 0 (condição no próprio UPDATE): duas transações simultâneas no
 * mesmo lote não conseguem tirar o mesmo saldo (RN-19).
 */
export async function movimentarSaldo(tx: Prisma.TransactionClient, loteId: string, deltaKg: number): Promise<void> {
  const { count } = await tx.lote.updateMany({
    where: deltaKg < 0 ? { id: loteId, saldoKg: { gte: -deltaKg } } : { id: loteId },
    data: { saldoKg: { increment: deltaKg } },
  });
  if (count === 0) {
    const lote = await tx.lote.findUnique({ where: { id: loteId }, select: { codigo: true } });
    throw new Error(lote ? `Saldo insuficiente no lote ${lote.codigo}` : "Lote não encontrado");
  }
}

export type NovoMovimento = {
  filialId: string;
  loteId: string;
  data: Date;
  tipo: TipoMovimentoEstoque;
  /** + entra, − sai. */
  quantidadeKg: number;
  usuarioId: string;
  ajusteId?: string;
  itemPedidoId?: string;
};

/** Grava o movimento e atualiza o saldo do lote, na transação de quem chama. */
export async function registrarMovimento(tx: Prisma.TransactionClient, movimento: NovoMovimento) {
  await movimentarSaldo(tx, movimento.loteId, movimento.quantidadeKg);
  return tx.movimentoEstoque.create({ data: movimento });
}

export type FiltroLotes = {
  produtoId?: string;
  localId?: string;
  status?: StatusLote;
  incluirZerados?: boolean;
};

/** Lotes da filial com dias, status e valor a custo, na ordem de saída (FEFO, RN-27). */
export async function listarLotes(filialId: string, filtros: FiltroLotes, referencia: Date) {
  const configuracao = await obterConfiguracaoProducao(filialId);
  const mostrarZerados = filtros.incluirZerados || filtros.status === "ZERADO";

  const lotes = await prisma.lote.findMany({
    where: {
      filialId,
      ...(filtros.produtoId ? { produtoId: filtros.produtoId } : {}),
      ...(filtros.localId ? { localId: filtros.localId } : {}),
      ...(mostrarZerados ? {} : { saldoKg: { gt: 0 } }),
    },
    include: {
      produto: { select: { codigo: true, descricao: true, conservacao: true } },
      local: { select: { nome: true } },
      recepcao: { select: { status: true } },
    },
    orderBy: [{ validade: "asc" }, { codigo: "asc" }],
  });

  const listados = lotes.map((lote) => {
    const saldoKg = Number(lote.saldoKg);
    return {
      ...lote,
      dias: diasParaVencer(lote.validade, referencia),
      status: statusDoLote(
        { saldoKg, validade: lote.validade, conservacao: lote.produto.conservacao },
        referencia,
        configuracao,
      ),
      valor: arredondar(Math.max(0, saldoKg) * Number(lote.custoKg), 2),
    };
  });

  return filtros.status ? listados.filter((lote) => lote.status === filtros.status) : listados;
}

export type LoteListado = Awaited<ReturnType<typeof listarLotes>>[number];

/** Saldo e valor por produto × local, mais a ocupação de cada local com capacidade. */
export async function resumoProdutoLocal(filialId: string) {
  const [lotes, locais] = await Promise.all([
    prisma.lote.findMany({
      where: { filialId, saldoKg: { gt: 0 } },
      select: {
        produtoId: true,
        localId: true,
        saldoKg: true,
        custoKg: true,
        produto: { select: { codigo: true, descricao: true } },
        local: { select: { nome: true } },
      },
    }),
    prisma.localArmazenamento.findMany({
      where: { filialId, ativo: true },
      select: { id: true, nome: true, capacidadeKg: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  // Valor = Σ saldo × custo de cada lote: não dá para agregar no banco com groupBy.
  const porChave = new Map<
    string,
    { produtoId: string; produto: string; localId: string; local: string; saldoKg: number; valor: number }
  >();
  for (const lote of lotes) {
    const chave = `${lote.produtoId}|${lote.localId}`;
    const linha = porChave.get(chave) ?? {
      produtoId: lote.produtoId,
      produto: `${lote.produto.codigo} · ${lote.produto.descricao}`,
      localId: lote.localId,
      local: lote.local.nome,
      saldoKg: 0,
      valor: 0,
    };
    linha.saldoKg += Number(lote.saldoKg);
    linha.valor += Number(lote.saldoKg) * Number(lote.custoKg);
    porChave.set(chave, linha);
  }
  const linhas = [...porChave.values()]
    .map((l) => ({ ...l, saldoKg: arredondar(l.saldoKg, 3), valor: arredondar(l.valor, 2) }))
    .sort((a, b) => a.produto.localeCompare(b.produto) || a.local.localeCompare(b.local));

  const saldoPorLocal = new Map<string, number>();
  for (const linha of linhas) saldoPorLocal.set(linha.localId, (saldoPorLocal.get(linha.localId) ?? 0) + linha.saldoKg);

  return {
    linhas,
    locais: locais.map((local) => {
      const capacidadeKg = local.capacidadeKg === null ? null : Number(local.capacidadeKg);
      const saldoKg = arredondar(saldoPorLocal.get(local.id) ?? 0, 3);
      return {
        localId: local.id,
        nome: local.nome,
        capacidadeKg,
        saldoKg,
        ocupacao: capacidadeKg ? saldoKg / capacidadeKg : null,
      };
    }),
  };
}

/** Troca o local do lote inteiro (D-15), auditado. */
export async function moverLote(sessao: SessaoAtiva, loteId: string, localId: string): Promise<void> {
  requirePermission(sessao.perfil, "producao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const lote = await prisma.lote.findFirstOrThrow({ where: { id: loteId, filialId: sessao.filialId } });
  const local = await prisma.localArmazenamento.findFirst({
    where: { id: localId, filialId: sessao.filialId, ativo: true },
    select: { id: true },
  });
  if (!local) throw new Error("Local de armazenamento não encontrado ou inativo");

  await prisma.lote.update({ where: { id: loteId }, data: { localId } });
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Lote",
    entidadeId: loteId,
    acao: "MOVER",
    anterior: { localId: lote.localId },
    novo: { localId },
  });
}
