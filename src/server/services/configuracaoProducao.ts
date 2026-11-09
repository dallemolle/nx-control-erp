import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";

export type ConfiguracaoProducaoValores = {
  registroAdepara: string | null;
  alertaVencimentoCongeladoDias: number;
  alertaVencimentoResfriadoDias: number;
  branqueamentoTemperaturaMinC: number;
  branqueamentoTempoMinS: number;
  /** Fração: 0,03 = 3%. */
  toleranciaBalancoMassa: number;
  /** Categoria (DESPESA) dos títulos a pagar gerados pela compra de fruto. */
  categoriaCompraFrutoId: string | null;
  /** Vencimento padrão da compra de fruto, em dias após a recepção. */
  prazoPagamentoProdutorDias: number;
};

export const CONFIGURACAO_PRODUCAO_PADRAO: ConfiguracaoProducaoValores = {
  registroAdepara: null,
  alertaVencimentoCongeladoDias: 30,
  alertaVencimentoResfriadoDias: 1,
  branqueamentoTemperaturaMinC: 80,
  branqueamentoTempoMinS: 10,
  toleranciaBalancoMassa: 0.03,
  categoriaCompraFrutoId: null,
  prazoPagamentoProdutorDias: 0,
};

/** Configuração gravada da filial, ou os padrões se ainda não foi salva (sem gravar). */
export async function obterConfiguracaoProducao(filialId: string): Promise<ConfiguracaoProducaoValores> {
  const c = await prisma.configuracaoProducao.findUnique({ where: { filialId } });
  if (!c) return { ...CONFIGURACAO_PRODUCAO_PADRAO };
  return {
    registroAdepara: c.registroAdepara,
    alertaVencimentoCongeladoDias: c.alertaVencimentoCongeladoDias,
    alertaVencimentoResfriadoDias: c.alertaVencimentoResfriadoDias,
    branqueamentoTemperaturaMinC: Number(c.branqueamentoTemperaturaMinC),
    branqueamentoTempoMinS: c.branqueamentoTempoMinS,
    toleranciaBalancoMassa: Number(c.toleranciaBalancoMassa),
    categoriaCompraFrutoId: c.categoriaCompraFrutoId,
    prazoPagamentoProdutorDias: c.prazoPagamentoProdutorDias,
  };
}

export async function salvarConfiguracaoProducao(sessao: SessaoAtiva, dados: ConfiguracaoProducaoValores) {
  requirePermission(sessao.perfil, "producao:configurar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  if (dados.categoriaCompraFrutoId) {
    const categoria = await prisma.categoriaFinanceira.findFirst({
      where: { id: dados.categoriaCompraFrutoId, filialId: sessao.filialId, tipo: "DESPESA" },
      select: { id: true },
    });
    if (!categoria) throw new Error("Categoria de compra de fruto inválida");
  }

  const anterior = await obterConfiguracaoProducao(sessao.filialId);
  await prisma.configuracaoProducao.upsert({
    where: { filialId: sessao.filialId },
    create: { ...dados, filialId: sessao.filialId },
    update: dados,
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "ConfiguracaoProducao",
    entidadeId: sessao.filialId,
    acao: "ATUALIZAR",
    anterior,
    novo: dados,
  });
}
