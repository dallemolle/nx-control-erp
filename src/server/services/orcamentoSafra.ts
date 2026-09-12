import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { buscarRealizadoPorDimensaoNoPeriodo, buscarProjetadoPorDimensaoNoPeriodo } from "./fluxoDeCaixaPorDimensao";
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
 * do período da safra — diferente do relatório de fluxo por dimensão
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

export async function listarComparativoSafras(sessao: SessaoAtiva): Promise<LinhaComparativoSafra[]> {
  requirePermission(sessao.perfil, "orcamento:ler");

  // Todos os status entram (PLANEJADO, EM_ANDAMENTO, ENCERRADO), sem
  // limite de quantidade. `ativo: true` segue o mesmo convention de
  // `listarValoresDimensao` (2a) — uma safra desativada não aparece como
  // item comparável nesta tela de gestão.
  const safras = await prisma.safra.findMany({
    where: { filialId: sessao.filialId, ativo: true },
    orderBy: { dataInicio: "desc" },
  });

  const orcamentos = await prisma.orcamentoSafra.findMany({ where: { filialId: sessao.filialId } });

  const linhas: LinhaComparativoSafra[] = [];
  for (const safra of safras) {
    const [realizadoPorSafra, projetadoPorSafra] = await Promise.all([
      buscarRealizadoPorDimensaoNoPeriodo(sessao.filialId, "SAFRA", safra.dataInicio, safra.dataFim),
      buscarProjetadoPorDimensaoNoPeriodo(sessao.filialId, "SAFRA", safra.dataInicio, safra.dataFim),
    ]);
    const orcamento = orcamentos.find((o) => o.safraId === safra.id);
    const r = realizadoPorSafra.get(safra.id) ?? { entradas: 0, saidas: 0 };
    const p = projetadoPorSafra.get(safra.id) ?? { entradas: 0, saidas: 0 };

    linhas.push(
      montarLinhaComparativoSafra(
        safra.id,
        safra.nome,
        safra.status,
        orcamento ? Number(orcamento.valor) : 0,
        r.entradas - r.saidas,
        p.entradas - p.saidas,
      ),
    );
  }
  return linhas;
}
