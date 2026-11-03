import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { ClassificacaoFiscal, StatusParcela, TipoLancamento, TipoTitulo } from "@prisma/client";
import { saldoRemanescenteParcela } from "./fluxoDeCaixaProjetado";
import { pendenciasFiscaisDoTitulo, type PendenciaFiscal } from "./classificacaoFiscal";

const STATUS_ABERTO: StatusParcela[] = ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"];
/** Parcelas que não representam mais valor devido (renegociada vira novas parcelas). */
const STATUS_SEM_VALOR: StatusParcela[] = ["CANCELADO", "RENEGOCIADO"];

export type LinhaComparativoMensal = {
  mes: number;
  entradasFiscal: number;
  entradasGerencial: number;
  saidasFiscal: number;
  saidasGerencial: number;
  percentualGerencialEntradas: number | null;
  percentualGerencialSaidas: number | null;
};

/** Percentual (0–100) da parte gerencial no total; `null` quando não há movimento. */
export function percentualGerencial(fiscal: number, gerencial: number): number | null {
  const total = fiscal + gerencial;
  return total === 0 ? null : (gerencial / total) * 100;
}

/** Agrega lançamentos classificados por mês (1–12). Transferências (sem classificação) não entram. */
export function agregarComparativoMensal(
  lancamentos: { data: Date; tipo: TipoLancamento; valor: number; classificacaoFiscal: ClassificacaoFiscal | null }[],
): LinhaComparativoMensal[] {
  const meses = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    entradasFiscal: 0,
    entradasGerencial: 0,
    saidasFiscal: 0,
    saidasGerencial: 0,
  }));

  for (const lancamento of lancamentos) {
    if (!lancamento.classificacaoFiscal) continue;
    const linha = meses[lancamento.data.getUTCMonth()];
    const gerencial = lancamento.classificacaoFiscal === "GERENCIAL";
    if (lancamento.tipo === "ENTRADA") {
      if (gerencial) linha.entradasGerencial += lancamento.valor;
      else linha.entradasFiscal += lancamento.valor;
    } else if (gerencial) linha.saidasGerencial += lancamento.valor;
    else linha.saidasFiscal += lancamento.valor;
  }

  return meses.map((linha) => ({
    ...linha,
    percentualGerencialEntradas: percentualGerencial(linha.entradasFiscal, linha.entradasGerencial),
    percentualGerencialSaidas: percentualGerencial(linha.saidasFiscal, linha.saidasGerencial),
  }));
}

function exigirLeitura(sessao: SessaoAtiva) {
  // Mesma permissão de quem já vê os dados de origem (títulos e lançamentos).
  requirePermission(sessao.perfil, "titulo:ler");
  requirePermission(sessao.perfil, "lancamento:ler");
}

/** Realizado (lançamentos conciliados) do ano, mês a mês, separado por classificação. */
export async function obterComparativoMensal(sessao: SessaoAtiva, ano: number): Promise<LinhaComparativoMensal[]> {
  exigirLeitura(sessao);

  const lancamentos = await prisma.lancamentoBancario.findMany({
    where: {
      filialId: sessao.filialId,
      conciliado: true,
      contaBancaria: { ativo: true },
      classificacaoFiscal: { not: null },
      data: { gte: new Date(Date.UTC(ano, 0, 1)), lte: new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999)) },
    },
    select: { data: true, tipo: true, valor: true, classificacaoFiscal: true },
  });

  return agregarComparativoMensal(lancamentos.map((l) => ({ ...l, valor: Number(l.valor) })));
}

export type EmAbertoPorClassificacao = {
  receberFiscal: number;
  receberGerencial: number;
  pagarFiscal: number;
  pagarGerencial: number;
};

/** Saldo das parcelas em aberto (descontadas as baixas aprovadas), por tipo e classificação. */
export async function obterEmAbertoPorClassificacao(sessao: SessaoAtiva): Promise<EmAbertoPorClassificacao> {
  exigirLeitura(sessao);

  const parcelas = await prisma.parcela.findMany({
    where: { titulo: { filialId: sessao.filialId, ativo: true }, status: { in: STATUS_ABERTO } },
    include: {
      titulo: { select: { tipo: true, classificacaoFiscal: true } },
      baixas: { where: { statusAprovacao: "APROVADO" }, select: { valorPago: true } },
    },
  });

  const resultado: EmAbertoPorClassificacao = { receberFiscal: 0, receberGerencial: 0, pagarFiscal: 0, pagarGerencial: 0 };
  for (const parcela of parcelas) {
    const saldo = saldoRemanescenteParcela(
      Number(parcela.valorAtualizado),
      parcela.baixas.map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
    );
    const gerencial = parcela.titulo.classificacaoFiscal === "GERENCIAL";
    if (parcela.titulo.tipo === "RECEBER") {
      if (gerencial) resultado.receberGerencial += saldo;
      else resultado.receberFiscal += saldo;
    } else if (gerencial) resultado.pagarGerencial += saldo;
    else resultado.pagarFiscal += saldo;
  }
  return resultado;
}

export type ContraparteGerencial = {
  contraparteId: string;
  nome: string;
  tipo: "CLIENTE" | "FORNECEDOR";
  quantidadeTitulos: number;
  valorTotal: number;
};

/** Maiores contrapartes em títulos GERENCIAIS emitidos no período (valor das parcelas vigentes). */
export async function obterTopContrapartesGerenciais(
  sessao: SessaoAtiva,
  de: Date,
  ate: Date,
  limite = 10,
): Promise<ContraparteGerencial[]> {
  exigirLeitura(sessao);

  const titulos = await prisma.titulo.findMany({
    where: {
      filialId: sessao.filialId,
      ativo: true,
      classificacaoFiscal: "GERENCIAL",
      dataEmissao: { gte: de, lte: ate },
    },
    select: {
      fornecedor: { select: { id: true, nome: true } },
      cliente: { select: { id: true, nome: true } },
      parcelas: { where: { status: { notIn: STATUS_SEM_VALOR } }, select: { valorAtualizado: true } },
    },
  });

  const porContraparte = new Map<string, ContraparteGerencial>();
  for (const titulo of titulos) {
    const contraparte = titulo.fornecedor ?? titulo.cliente;
    if (!contraparte) continue;
    const atual = porContraparte.get(contraparte.id) ?? {
      contraparteId: contraparte.id,
      nome: contraparte.nome,
      tipo: titulo.fornecedor ? ("FORNECEDOR" as const) : ("CLIENTE" as const),
      quantidadeTitulos: 0,
      valorTotal: 0,
    };
    atual.quantidadeTitulos += 1;
    atual.valorTotal += titulo.parcelas.reduce((soma, parcela) => soma + Number(parcela.valorAtualizado), 0);
    porContraparte.set(contraparte.id, atual);
  }

  return Array.from(porContraparte.values())
    .sort((a, b) => b.valorTotal - a.valorTotal)
    .slice(0, limite);
}

export type PendenciaFiscalTitulo = {
  tituloId: string;
  documento: string;
  contraparte: string;
  tipo: TipoTitulo;
  dataEmissao: Date;
  valor: number;
  pendencias: PendenciaFiscal[];
};

/** Títulos FISCAIS ativos de uma filial com alguma pendência (sem tipo, número, chave ou anexo). */
export async function buscarPendenciasFiscaisDaFilial(
  filialId: string,
  filtros: { pendencia?: PendenciaFiscal; tipo?: TipoTitulo } = {},
): Promise<PendenciaFiscalTitulo[]> {
  const titulos = await prisma.titulo.findMany({
    where: { filialId, ativo: true, classificacaoFiscal: "FISCAL", ...(filtros.tipo && { tipo: filtros.tipo }) },
    select: {
      id: true,
      documento: true,
      tipo: true,
      dataEmissao: true,
      classificacaoFiscal: true,
      tipoComprovante: true,
      numeroDocumentoFiscal: true,
      chaveAcesso: true,
      fornecedor: { select: { nome: true } },
      cliente: { select: { nome: true } },
      parcelas: { where: { status: { notIn: STATUS_SEM_VALOR } }, select: { valorAtualizado: true } },
      _count: { select: { anexos: true } },
    },
    orderBy: { dataEmissao: "desc" },
  });

  const resultado: PendenciaFiscalTitulo[] = [];
  for (const titulo of titulos) {
    const pendencias = pendenciasFiscaisDoTitulo(titulo, titulo._count.anexos);
    if (pendencias.length === 0) continue;
    if (filtros.pendencia && !pendencias.includes(filtros.pendencia)) continue;
    resultado.push({
      tituloId: titulo.id,
      documento: titulo.documento,
      contraparte: titulo.fornecedor?.nome ?? titulo.cliente?.nome ?? "",
      tipo: titulo.tipo,
      dataEmissao: titulo.dataEmissao,
      valor: titulo.parcelas.reduce((soma, parcela) => soma + Number(parcela.valorAtualizado), 0),
      pendencias,
    });
  }
  return resultado;
}

export async function listarPendenciasFiscais(
  sessao: SessaoAtiva,
  filtros: { pendencia?: PendenciaFiscal; tipo?: TipoTitulo } = {},
): Promise<PendenciaFiscalTitulo[]> {
  exigirLeitura(sessao);
  return buscarPendenciasFiscaisDaFilial(sessao.filialId, filtros);
}
