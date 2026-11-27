import { prisma } from "@/server/db/client";
import { valoresDaBaixa } from "@/server/services/parcela";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { saldoRemanescenteParcela } from "./fluxoDeCaixaProjetado";
import { valorNoSentidoDaCategoria } from "@/lib/financeiro/sentidoDaCategoria";
import {
  whereLancamentoPorClassificacao,
  whereTituloPorClassificacao,
  type FiltroClassificacao,
} from "./classificacaoFiscal";
import type { TipoCategoriaFinanceira } from "@prisma/client";

export type LinhaComparativoOrcamento = {
  categoriaFinanceiraId: string;
  categoriaNome: string;
  tipoCategoria: TipoCategoriaFinanceira;
  ano: number;
  mes: number;
  orcado: number;
  realizado: number;
  projetado: number;
  /** Realizado + projetado: como o mês vai fechar. */
  previsto: number;
  /** Previsto − orçado. */
  variacaoAbsoluta: number;
  variacaoPercentual: number | null;
  alerta: boolean;
};

/**
 * Monta uma linha do comparativo orçado x realizado x projetado — ver
 * "Comparativos" na spec. A variação é sobre o previsto (realizado +
 * projetado), a mesma base do alerta de Estouro: o número e o selo não se
 * contradizem (item 16 do backlog). Variação percentual é null quando o
 * orçado é zero (divisão por zero não faz sentido de negócio). Alerta só
 * existe pra categorias DESPESA: ultrapassar o orçado de uma categoria
 * RECEITA é notícia boa, não estouro.
 */
export function montarLinhaComparativo(
  categoriaFinanceiraId: string,
  categoriaNome: string,
  tipoCategoria: TipoCategoriaFinanceira,
  ano: number,
  mes: number,
  orcado: number,
  realizado: number,
  projetado: number,
): LinhaComparativoOrcamento {
  const previsto = (Math.round(realizado * 100) + Math.round(projetado * 100)) / 100;
  const variacaoAbsoluta = (Math.round(previsto * 100) - Math.round(orcado * 100)) / 100;
  const variacaoPercentual = orcado === 0 ? null : variacaoAbsoluta / orcado;
  const alerta = tipoCategoria === "DESPESA" && variacaoAbsoluta > 0;

  return {
    categoriaFinanceiraId,
    categoriaNome,
    tipoCategoria,
    ano,
    mes,
    orcado,
    realizado,
    projetado,
    previsto,
    variacaoAbsoluta,
    variacaoPercentual,
    alerta,
  };
}

function inicioDoMes(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 1));
}

function fimDoMes(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999));
}

export async function salvarValorOrcamento(
  sessao: SessaoAtiva,
  categoriaFinanceiraId: string,
  ano: number,
  mes: number,
  valor: number,
): Promise<void> {
  requirePermission(sessao.perfil, "orcamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const categoria = await prisma.categoriaFinanceira.findFirst({
    where: { id: categoriaFinanceiraId, filialId: sessao.filialId },
  });
  if (!categoria) {
    throw new Error("Categoria financeira não pertence à filial ativa");
  }

  const chave = { filialId_categoriaFinanceiraId_ano_mes: { filialId: sessao.filialId, categoriaFinanceiraId, ano, mes } };
  const anterior = await prisma.orcamento.findUnique({ where: chave });

  const orcamento = await prisma.orcamento.upsert({
    where: chave,
    create: { filialId: sessao.filialId, categoriaFinanceiraId, ano, mes, valor },
    update: { valor },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Orcamento",
    entidadeId: orcamento.id,
    acao: anterior ? "ATUALIZAR" : "CRIAR",
    anterior: anterior ? { valor: Number(anterior.valor) } : null,
    novo: { valor },
  });
}

/**
 * Persiste os 12 meses de orçamento de uma categoria em uma única transação
 * atômica — ou os 12 meses são salvos, ou nenhum é (ver Finding 1 da revisão
 * final: um loop chamando salvarValorOrcamento 12 vezes deixava o orçamento
 * meio-salvo se um erro transiente estourasse no meio do caminho). Checagem
 * de permissão e de posse da categoria acontece uma única vez aqui, não uma
 * vez por mês.
 */
export async function salvarValoresOrcamentoDoAno(
  sessao: SessaoAtiva,
  categoriaFinanceiraId: string,
  ano: number,
  valoresPorMes: { mes: number; valor: number }[],
): Promise<void> {
  requirePermission(sessao.perfil, "orcamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const categoria = await prisma.categoriaFinanceira.findFirst({
    where: { id: categoriaFinanceiraId, filialId: sessao.filialId },
  });
  if (!categoria) {
    throw new Error("Categoria financeira não pertence à filial ativa");
  }

  await prisma.$transaction(async (tx) => {
    for (const { mes, valor } of valoresPorMes) {
      const chave = {
        filialId_categoriaFinanceiraId_ano_mes: { filialId: sessao.filialId, categoriaFinanceiraId, ano, mes },
      };
      const anterior = await tx.orcamento.findUnique({ where: chave });

      const orcamento = await tx.orcamento.upsert({
        where: chave,
        create: { filialId: sessao.filialId, categoriaFinanceiraId, ano, mes, valor },
        update: { valor },
      });

      await registrarAuditoria(
        {
          empresaId: sessao.empresaId,
          filialId: sessao.filialId,
          usuarioId: sessao.usuarioId,
          entidade: "Orcamento",
          entidadeId: orcamento.id,
          acao: anterior ? "ATUALIZAR" : "CRIAR",
          anterior: anterior ? { valor: Number(anterior.valor) } : null,
          novo: { valor },
        },
        tx,
      );
    }
  });
}

export async function buscarRealizadoPorCategoria(
  filialId: string,
  ano: number,
  mes: number,
  classificacao?: FiltroClassificacao,
): Promise<Map<string, number>> {
  const lancamentos = await prisma.lancamentoBancario.findMany({
    where: {
      filialId,
      conciliado: true,
      contaBancaria: { ativo: true },
      data: { gte: inicioDoMes(ano, mes), lte: fimDoMes(ano, mes) },
      ...whereLancamentoPorClassificacao(classificacao),
    },
    include: {
      categoriaFinanceira: { select: CATEGORIA_COM_TIPO },
      baixa: { select: { parcela: { select: { titulo: { select: { categoriaFinanceira: { select: CATEGORIA_COM_TIPO } } } } } } },
    },
  });

  // Com sinal conforme o tipo da categoria: a devolução de uma compra abate a despesa em vez de somar.
  const totais = new Map<string, number>();
  for (const lancamento of lancamentos) {
    const categoria = lancamento.categoriaFinanceira ?? lancamento.baixa?.parcela.titulo.categoriaFinanceira ?? null;
    if (!categoria) continue;
    const valor = valorNoSentidoDaCategoria(categoria.tipo, lancamento.tipo, Number(lancamento.valor));
    totais.set(categoria.id, somarEmCentavos(totais.get(categoria.id) ?? 0, valor));
  }
  return totais;
}

const CATEGORIA_COM_TIPO = { id: true, tipo: true } as const;

/** Soma em centavos: com valores que abatem, somar em ponto flutuante deixaria resíduos como 799,9999. */
function somarEmCentavos(a: number, b: number): number {
  return (Math.round(a * 100) + Math.round(b * 100)) / 100;
}

export async function buscarProjetadoPorCategoria(
  filialId: string,
  ano: number,
  mes: number,
  classificacao?: FiltroClassificacao,
): Promise<Map<string, number>> {
  const parcelas = await prisma.parcela.findMany({
    where: {
      titulo: { filialId, ...whereTituloPorClassificacao(classificacao) },
      status: { in: ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"] },
      dataVencimento: { gte: inicioDoMes(ano, mes), lte: fimDoMes(ano, mes) },
    },
    include: {
      titulo: { select: { tipo: true, categoriaFinanceira: { select: CATEGORIA_COM_TIPO } } },
      baixas: { where: { statusAprovacao: "APROVADO" } },
    },
  });

  // Mesma regra do realizado: título a receber conta como entrada, a pagar como saída.
  const totais = new Map<string, number>();
  for (const parcela of parcelas) {
    const saldo = saldoRemanescenteParcela(
      Number(parcela.valorAtualizado),
      parcela.baixas.map(valoresDaBaixa),
    );
    const categoria = parcela.titulo.categoriaFinanceira;
    const sentido = parcela.titulo.tipo === "RECEBER" ? "ENTRADA" : "SAIDA";
    const valor = valorNoSentidoDaCategoria(categoria.tipo, sentido, saldo);
    totais.set(categoria.id, somarEmCentavos(totais.get(categoria.id) ?? 0, valor));
  }
  return totais;
}

export async function listarComparativoOrcamento(
  sessao: SessaoAtiva,
  ano: number,
  // Filtra só realizado e projetado; o orçado é um só (não é fiscal nem gerencial).
  opcoes: { classificacao?: FiltroClassificacao } = {},
): Promise<LinhaComparativoOrcamento[]> {
  requirePermission(sessao.perfil, "orcamento:ler");

  const [categorias, orcamentos] = await Promise.all([
    prisma.categoriaFinanceira.findMany({ where: { filialId: sessao.filialId, ativo: true }, orderBy: { nome: "asc" } }),
    prisma.orcamento.findMany({ where: { filialId: sessao.filialId, ano } }),
  ]);

  const linhas: LinhaComparativoOrcamento[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const [realizadoPorCategoria, projetadoPorCategoria] = await Promise.all([
      buscarRealizadoPorCategoria(sessao.filialId, ano, mes, opcoes.classificacao),
      buscarProjetadoPorCategoria(sessao.filialId, ano, mes, opcoes.classificacao),
    ]);

    for (const categoria of categorias) {
      const orcamento = orcamentos.find((o) => o.categoriaFinanceiraId === categoria.id && o.mes === mes);
      linhas.push(
        montarLinhaComparativo(
          categoria.id,
          categoria.nome,
          categoria.tipo,
          ano,
          mes,
          orcamento ? Number(orcamento.valor) : 0,
          realizadoPorCategoria.get(categoria.id) ?? 0,
          projetadoPorCategoria.get(categoria.id) ?? 0,
        ),
      );
    }
  }
  return linhas;
}
