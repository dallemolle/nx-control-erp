import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { saldoRemanescenteParcela } from "./fluxoDeCaixaProjetado";
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
  variacaoAbsolutaRealizado: number;
  variacaoPercentualRealizado: number | null;
  alerta: boolean;
};

/**
 * Monta uma linha do comparativo orçado x realizado x projetado — ver
 * "Comparativos" na spec. Variação percentual é null quando o orçado é
 * zero (divisão por zero não faz sentido de negócio). Alerta só existe
 * pra categorias DESPESA: ultrapassar o orçado de uma categoria RECEITA
 * é notícia boa, não estouro.
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
  const variacaoAbsolutaRealizado = realizado - orcado;
  const variacaoPercentualRealizado = orcado === 0 ? null : variacaoAbsolutaRealizado / orcado;
  const alerta = tipoCategoria === "DESPESA" && realizado + projetado > orcado;

  return {
    categoriaFinanceiraId,
    categoriaNome,
    tipoCategoria,
    ano,
    mes,
    orcado,
    realizado,
    projetado,
    variacaoAbsolutaRealizado,
    variacaoPercentualRealizado,
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
): Promise<Map<string, number>> {
  const lancamentos = await prisma.lancamentoBancario.findMany({
    where: {
      filialId,
      conciliado: true,
      contaBancaria: { ativo: true },
      data: { gte: inicioDoMes(ano, mes), lte: fimDoMes(ano, mes) },
    },
    include: {
      baixa: { include: { parcela: { include: { titulo: { select: { categoriaFinanceiraId: true } } } } } },
    },
  });

  const totais = new Map<string, number>();
  for (const lancamento of lancamentos) {
    const categoriaId = lancamento.categoriaFinanceiraId ?? lancamento.baixa?.parcela.titulo.categoriaFinanceiraId ?? null;
    if (!categoriaId) continue;
    totais.set(categoriaId, (totais.get(categoriaId) ?? 0) + Number(lancamento.valor));
  }
  return totais;
}

export async function buscarProjetadoPorCategoria(
  filialId: string,
  ano: number,
  mes: number,
): Promise<Map<string, number>> {
  const parcelas = await prisma.parcela.findMany({
    where: {
      titulo: { filialId },
      status: { in: ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"] },
      dataVencimento: { gte: inicioDoMes(ano, mes), lte: fimDoMes(ano, mes) },
    },
    include: {
      titulo: { select: { categoriaFinanceiraId: true } },
      baixas: { where: { statusAprovacao: "APROVADO" } },
    },
  });

  const totais = new Map<string, number>();
  for (const parcela of parcelas) {
    const saldo = saldoRemanescenteParcela(
      Number(parcela.valorAtualizado),
      parcela.baixas.map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
    );
    const categoriaId = parcela.titulo.categoriaFinanceiraId;
    totais.set(categoriaId, (totais.get(categoriaId) ?? 0) + saldo);
  }
  return totais;
}

export async function listarComparativoOrcamento(
  sessao: SessaoAtiva,
  ano: number,
): Promise<LinhaComparativoOrcamento[]> {
  requirePermission(sessao.perfil, "orcamento:ler");

  const [categorias, orcamentos] = await Promise.all([
    prisma.categoriaFinanceira.findMany({ where: { filialId: sessao.filialId, ativo: true }, orderBy: { nome: "asc" } }),
    prisma.orcamento.findMany({ where: { filialId: sessao.filialId, ano } }),
  ]);

  const linhas: LinhaComparativoOrcamento[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const [realizadoPorCategoria, projetadoPorCategoria] = await Promise.all([
      buscarRealizadoPorCategoria(sessao.filialId, ano, mes),
      buscarProjetadoPorCategoria(sessao.filialId, ano, mes),
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
