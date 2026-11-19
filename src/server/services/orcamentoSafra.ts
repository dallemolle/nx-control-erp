import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { buscarRealizadoPorSafras, buscarProjetadoPorSafras } from "./fluxoDeCaixaPorDimensao";
import type { FiltroClassificacao } from "./classificacaoFiscal";
import type { StatusSafraProjeto } from "@prisma/client";

export type LinhaComparativoSafra = {
  safraId: string;
  safraNome: string;
  status: StatusSafraProjeto;
  orcado: number;
  realizado: number;
  projetado: number;
  variacaoAbsolutaRealizado: number;
  variacaoPercentualRealizado: number | null;
};

/**
 * Monta uma linha do comparativo orçado x realizado x projetado por safra.
 * `realizado`/`projetado` já chegam como saldo líquido (entradas - saídas)
 * de tudo o que está marcado com a safra — diferente do relatório de fluxo por dimensão
 * (2a), que separa entradas e saídas em colunas próprias.
 */
export function montarLinhaComparativoSafra(
  safraId: string,
  safraNome: string,
  status: StatusSafraProjeto,
  orcado: number,
  realizado: number,
  projetado: number,
): LinhaComparativoSafra {
  const variacaoAbsolutaRealizado = realizado - orcado;
  const variacaoPercentualRealizado = orcado === 0 ? null : variacaoAbsolutaRealizado / orcado;

  return {
    safraId,
    safraNome,
    status,
    orcado,
    realizado,
    projetado,
    variacaoAbsolutaRealizado,
    variacaoPercentualRealizado,
  };
}

export async function salvarValorOrcamentoSafra(
  sessao: SessaoAtiva,
  safraId: string,
  valor: number,
): Promise<void> {
  requirePermission(sessao.perfil, "orcamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const safra = await prisma.safra.findFirst({ where: { id: safraId, filialId: sessao.filialId } });
  if (!safra) {
    throw new Error("Safra não pertence à filial ativa");
  }

  const chave = { filialId_safraId: { filialId: sessao.filialId, safraId } };
  const anterior = await prisma.orcamentoSafra.findUnique({ where: chave });

  const orcamentoSafra = await prisma.orcamentoSafra.upsert({
    where: chave,
    create: { filialId: sessao.filialId, safraId, valor },
    update: { valor },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "OrcamentoSafra",
    entidadeId: orcamentoSafra.id,
    acao: anterior ? "ATUALIZAR" : "CRIAR",
    anterior: anterior ? { valor: Number(anterior.valor) } : null,
    novo: { valor },
  });
}

/**
 * Realizado e projetado de cada safra somam tudo o que está marcado com ela,
 * em qualquer data: as datas da safra não cortam os valores (compras de
 * pré-safra e vendas pós-colheita entram). Uma consulta de cada para todas
 * as safras.
 */
export async function listarComparativoSafras(
  sessao: SessaoAtiva,
  // Filtra só realizado e projetado; o orçado da safra é um só.
  opcoes: { classificacao?: FiltroClassificacao } = {},
): Promise<LinhaComparativoSafra[]> {
  requirePermission(sessao.perfil, "orcamento:ler");

  // Todos os status entram (PLANEJADO, EM_ANDAMENTO, ENCERRADO), sem
  // limite de quantidade. `ativo: true` segue o mesmo convention de
  // `listarValoresDimensao` (2a) — uma safra desativada não aparece como
  // item comparável nesta tela de gestão.
  const safras = await prisma.safra.findMany({
    where: { filialId: sessao.filialId, ativo: true },
    orderBy: { dataInicio: "desc" },
  });

  const safraIds = safras.map((safra) => safra.id);

  const [orcamentos, realizadoPorSafra, projetadoPorSafra] = await Promise.all([
    prisma.orcamentoSafra.findMany({ where: { filialId: sessao.filialId } }),
    buscarRealizadoPorSafras(sessao.filialId, safraIds, opcoes.classificacao),
    buscarProjetadoPorSafras(sessao.filialId, safraIds, opcoes.classificacao),
  ]);

  return safras.map((safra) => {
    const orcamento = orcamentos.find((o) => o.safraId === safra.id);
    const r = realizadoPorSafra.get(safra.id) ?? { entradas: 0, saidas: 0 };
    const p = projetadoPorSafra.get(safra.id) ?? { entradas: 0, saidas: 0 };
    return montarLinhaComparativoSafra(
      safra.id,
      safra.nome,
      safra.status,
      orcamento ? Number(orcamento.valor) : 0,
      r.entradas - r.saidas,
      p.entradas - p.saidas,
    );
  });
}
