import type { Prisma, StatusOrdemProducao, TipoMovimentoEstoque } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireAlteracaoFilial, requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { arredondar } from "@/lib/producao/arredondar";
import { diasParaVencer, statusDoLote, type StatusLote } from "@/lib/producao/statusLote";
import { liberacaoCobre, MSG_SEM_PRAZO_LIBERACAO, situacaoLiberacao } from "@/lib/producao/liberacaoVencido";
import { loteVencidoNaData } from "@/lib/producao/venda";
import { hojeDeCalendario } from "@/lib/producao/periodo";
import { formatarData } from "@/lib/formatacao";
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
  consumoOpId?: string;
  producaoOpId?: string;
};

/** Grava o movimento e atualiza o saldo do lote, na transação de quem chama. */
export async function registrarMovimento(tx: Prisma.TransactionClient, movimento: NovoMovimento) {
  await movimentarSaldo(tx, movimento.loteId, movimento.quantidadeKg);
  return tx.movimentoEstoque.create({ data: movimento });
}

/** Lote que pode sair por venda ou ajuste: recepção não excluída, ou polpa de OP encerrada (D-07). */
export const LOTE_LIBERADO: Prisma.LoteWhereInput = {
  OR: [
    { origem: "RECEPCAO", OR: [{ recepcao: { is: null } }, { recepcao: { is: { status: "ATIVA" } } }] },
    { origem: "PRODUCAO", producaoOP: { is: { removidoEm: null, ordemProducao: { status: "ENCERRADA" } } } },
  ],
};

export const SELECT_BLOQUEIO_PRODUCAO = {
  producaoOP: { select: { removidoEm: true, ordemProducao: { select: { status: true } } } },
} satisfies Prisma.LoteSelect;

/** Mensagem do bloqueio de um lote de polpa, ou null se ele pode sair. */
export function bloqueioDaProducao(lote: {
  codigo: string;
  producaoOP: { removidoEm: Date | null; ordemProducao: { status: StatusOrdemProducao } } | null;
}): string | null {
  const producao = lote.producaoOP;
  if (!producao) return null;
  if (producao.removidoEm) return `O lote ${lote.codigo} foi removido da OP`;
  if (producao.ordemProducao.status === "CANCELADA") return `O lote ${lote.codigo} é de uma OP cancelada`;
  if (producao.ordemProducao.status === "ABERTA") return `O lote ${lote.codigo} está numa OP aberta`;
  return null;
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
      produto: { select: { codigo: true, descricao: true, conservacao: true, diasLiberacaoVencido: true } },
      local: { select: { nome: true } },
      recepcao: { select: { status: true } },
      liberadoPor: { select: { nome: true } },
      ...SELECT_BLOQUEIO_PRODUCAO,
    },
    orderBy: [{ validade: "asc" }, { codigo: "asc" }],
  });

  const listados = lotes.map((lote) => {
    const saldoKg = Number(lote.saldoKg);
    return {
      ...lote,
      emProducao: lote.producaoOP?.removidoEm === null && lote.producaoOP.ordemProducao.status === "ABERTA",
      bloqueio: bloqueioDaProducao(lote),
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

export type StatusResumido = Exclude<StatusLote, "ZERADO">;
export const STATUS_RESUMIDOS: StatusResumido[] = ["OK", "VENCENDO", "VENCIDO"];
export type ResumoStatus = Record<StatusResumido, { quantidade: number; kg: number }>;

/** Nº de lotes e kg por status de validade (RN-16), só lotes com saldo; ignora o filtro de status. */
export async function resumoPorStatus(
  filialId: string,
  filtros: Pick<FiltroLotes, "produtoId" | "localId">,
  referencia: Date,
): Promise<ResumoStatus> {
  const lotes = await listarLotes(filialId, { produtoId: filtros.produtoId, localId: filtros.localId }, referencia);
  const resumo: ResumoStatus = {
    OK: { quantidade: 0, kg: 0 },
    VENCENDO: { quantidade: 0, kg: 0 },
    VENCIDO: { quantidade: 0, kg: 0 },
  };
  for (const lote of lotes) {
    if (lote.status === "ZERADO") continue;
    resumo[lote.status].quantidade += 1;
    resumo[lote.status].kg = arredondar(resumo[lote.status].kg + Number(lote.saldoKg), 3);
  }
  return resumo;
}

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

/**
 * Lote vencido na data da operação (pedido ou OP) só sai com liberação que
 * cubra essa data (D-35); o perfil de quem lança não importa.
 */
export function exigirLiberacao(lote: { codigo: string; validade: Date; liberadoAte: Date | null }, data: Date): void {
  if (liberacaoCobre(lote.liberadoAte, data)) return;
  const venceu = `O lote ${lote.codigo} venceu em ${formatarData(lote.validade)}`;
  throw new Error(lote.liberadoAte ? `${venceu}; a liberação vale até ${formatarData(lote.liberadoAte)}` : venceu);
}

function autorizarLiberacao(sessao: SessaoAtiva) {
  requirePermission(sessao.perfil, "estoque:liberarVencido");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
}

/**
 * Libera o lote vencido para sair em pedido e OP até validade + N dias do
 * produto (D-35). A data fica gravada no lote; liberar de novo substitui.
 */
export async function liberarLoteVencido(
  sessao: SessaoAtiva,
  loteId: string,
  motivo: string,
  hoje: Date = hojeDeCalendario(),
): Promise<{ liberadoAte: Date }> {
  autorizarLiberacao(sessao);

  const lote = await prisma.lote.findFirst({
    where: { id: loteId, filialId: sessao.filialId },
    include: {
      produto: { select: { diasLiberacaoVencido: true } },
      recepcao: { select: { status: true } },
      ...SELECT_BLOQUEIO_PRODUCAO,
    },
  });
  if (!lote) throw new Error("Lote não encontrado");
  if (lote.recepcao?.status === "CANCELADA") throw new Error(`O lote ${lote.codigo} é de uma recepção excluída`);
  const bloqueio = bloqueioDaProducao(lote);
  if (bloqueio) throw new Error(bloqueio);
  if (Number(lote.saldoKg) <= 0) throw new Error(`O lote ${lote.codigo} está zerado`);
  if (!loteVencidoNaData(lote.validade, hoje)) throw new Error(`O lote ${lote.codigo} ainda não venceu`);

  const situacao = situacaoLiberacao(lote.validade, lote.produto.diasLiberacaoVencido, hoje);
  if (situacao.tipo === "SEM_PRAZO") throw new Error(MSG_SEM_PRAZO_LIBERACAO);
  if (situacao.tipo === "PRAZO_ENCERRADO") {
    throw new Error(`O prazo máximo de liberação deste lote terminou em ${formatarData(situacao.limite)}`);
  }
  const motivoLimpo = motivo.trim();
  if (!motivoLimpo) throw new Error("Informe o motivo da liberação");

  await prisma.lote.update({
    where: { id: lote.id },
    data: {
      liberadoAte: situacao.liberadoAte,
      liberadoEm: new Date(),
      liberadoPorId: sessao.usuarioId,
      motivoLiberacao: motivoLimpo,
    },
  });
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Lote",
    entidadeId: lote.id,
    acao: "LIBERAR_VENCIDO",
    anterior: lote.liberadoAte ? { liberadoAte: lote.liberadoAte, motivo: lote.motivoLiberacao } : null,
    novo: { liberadoAte: situacao.liberadoAte, motivo: motivoLimpo },
  });
  return { liberadoAte: situacao.liberadoAte };
}

/** Desfaz a liberação: o lote volta a ser bloqueado em pedido e OP. */
export async function revogarLiberacaoLote(sessao: SessaoAtiva, loteId: string): Promise<void> {
  autorizarLiberacao(sessao);
  const lote = await prisma.lote.findFirst({ where: { id: loteId, filialId: sessao.filialId } });
  if (!lote) throw new Error("Lote não encontrado");
  if (!lote.liberadoAte) throw new Error(`O lote ${lote.codigo} não está liberado`);

  await prisma.lote.update({
    where: { id: lote.id },
    data: { liberadoAte: null, liberadoEm: null, liberadoPorId: null, motivoLiberacao: null },
  });
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Lote",
    entidadeId: lote.id,
    acao: "REVOGAR_LIBERACAO",
    anterior: { liberadoAte: lote.liberadoAte, motivo: lote.motivoLiberacao },
    novo: null,
  });
}
