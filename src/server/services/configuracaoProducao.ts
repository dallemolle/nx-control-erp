import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";

export type ConfiguracaoProducaoValores = {
  registroAdepara: string | null;
  /** Endereço impresso na etiqueta do lote (D-10). */
  enderecoEtiqueta: string | null;
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
  /** Categoria (RECEITA) dos títulos a receber gerados pela venda. */
  categoriaVendaId: string | null;
  /** Conta (não Caixa) do recebimento à vista em Pix, transferência e cartão. */
  contaRecebimentoPadraoId: string | null;
  /** Conta Caixa do recebimento à vista em dinheiro. */
  contaCaixaPadraoId: string | null;
};

export const CONFIGURACAO_PRODUCAO_PADRAO: ConfiguracaoProducaoValores = {
  registroAdepara: null,
  enderecoEtiqueta: null,
  alertaVencimentoCongeladoDias: 30,
  alertaVencimentoResfriadoDias: 1,
  branqueamentoTemperaturaMinC: 80,
  branqueamentoTempoMinS: 10,
  toleranciaBalancoMassa: 0.03,
  categoriaCompraFrutoId: null,
  prazoPagamentoProdutorDias: 0,
  categoriaVendaId: null,
  contaRecebimentoPadraoId: null,
  contaCaixaPadraoId: null,
};

/** Configuração gravada da filial, ou os padrões se ainda não foi salva (sem gravar). */
export async function obterConfiguracaoProducao(filialId: string): Promise<ConfiguracaoProducaoValores> {
  const c = await prisma.configuracaoProducao.findUnique({ where: { filialId } });
  if (!c) return { ...CONFIGURACAO_PRODUCAO_PADRAO };
  return {
    registroAdepara: c.registroAdepara,
    enderecoEtiqueta: c.enderecoEtiqueta,
    alertaVencimentoCongeladoDias: c.alertaVencimentoCongeladoDias,
    alertaVencimentoResfriadoDias: c.alertaVencimentoResfriadoDias,
    branqueamentoTemperaturaMinC: Number(c.branqueamentoTemperaturaMinC),
    branqueamentoTempoMinS: c.branqueamentoTempoMinS,
    toleranciaBalancoMassa: Number(c.toleranciaBalancoMassa),
    categoriaCompraFrutoId: c.categoriaCompraFrutoId,
    prazoPagamentoProdutorDias: c.prazoPagamentoProdutorDias,
    categoriaVendaId: c.categoriaVendaId,
    contaRecebimentoPadraoId: c.contaRecebimentoPadraoId,
    contaCaixaPadraoId: c.contaCaixaPadraoId,
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
  if (dados.categoriaVendaId) {
    const categoria = await prisma.categoriaFinanceira.findFirst({
      where: { id: dados.categoriaVendaId, filialId: sessao.filialId, tipo: "RECEITA" },
      select: { id: true },
    });
    if (!categoria) throw new Error("Categoria de venda inválida");
  }
  if (dados.contaRecebimentoPadraoId) {
    const conta = await prisma.contaBancaria.findFirst({
      where: { id: dados.contaRecebimentoPadraoId, filialId: sessao.filialId, ativo: true, tipo: { not: "CAIXA" } },
      select: { id: true },
    });
    if (!conta) throw new Error("Conta de recebimento padrão inválida");
  }
  if (dados.contaCaixaPadraoId) {
    const conta = await prisma.contaBancaria.findFirst({
      where: { id: dados.contaCaixaPadraoId, filialId: sessao.filialId, ativo: true, tipo: "CAIXA" },
      select: { id: true },
    });
    if (!conta) throw new Error("Conta Caixa padrão inválida");
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
