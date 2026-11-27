import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { nomeDaContaBancaria } from "@/lib/contaBancaria";

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

type CampoDeReferencia = "categoriaCompraFrutoId" | "categoriaVendaId" | "contaRecebimentoPadraoId" | "contaCaixaPadraoId";

/** Nome do campo nas mensagens ("a categoria de venda") e o que deixa de funcionar com o cadastro inativo. */
const REFERENCIAS: Record<CampoDeReferencia, { nome: string; rotulo: string; efeito: string }> = {
  categoriaCompraFrutoId: {
    nome: "categoria de compra de fruto",
    rotulo: "Categoria de compra de fruto",
    efeito: "a recepção de fruto de terceiro com valor é recusada",
  },
  categoriaVendaId: {
    nome: "categoria de venda",
    rotulo: "Categoria de venda",
    efeito: "o pedido de venda é recusado",
  },
  contaRecebimentoPadraoId: {
    nome: "conta de recebimento",
    rotulo: "Conta de recebimento padrão",
    efeito: "o pedido à vista em Pix ou transferência não vem com a conta preenchida",
  },
  contaCaixaPadraoId: {
    nome: "conta Caixa",
    rotulo: "Conta Caixa padrão",
    efeito: "o pedido em dinheiro não vem com a conta Caixa preenchida",
  },
};

/** Recusa da recepção e do pedido quando o cadastro escolhido na configuração foi inativado. */
export function msgReferenciaInativaDaConfiguracao(campo: CampoDeReferencia): string {
  return (
    `A ${REFERENCIAS[campo].nome} da Configuração de produção está inativa: escolha outra lá ou reative o ` +
    "cadastro"
  );
}

export async function categoriaAtiva(id: string): Promise<boolean> {
  const categoria = await prisma.categoriaFinanceira.findUnique({ where: { id }, select: { ativo: true } });
  return categoria?.ativo ?? false;
}

async function buscarReferencias(filialId: string, valores: ConfiguracaoProducaoValores) {
  const categorias = [valores.categoriaCompraFrutoId, valores.categoriaVendaId].filter((id) => id !== null);
  const contas = [valores.contaRecebimentoPadraoId, valores.contaCaixaPadraoId].filter((id) => id !== null);
  const [cats, cts] = await Promise.all([
    prisma.categoriaFinanceira.findMany({
      where: { id: { in: categorias }, filialId },
      select: { id: true, nome: true, tipo: true, ativo: true },
    }),
    prisma.contaBancaria.findMany({
      where: { id: { in: contas }, filialId },
      include: { banco: { select: { nome: true } } },
    }),
  ]);
  return { categorias: new Map(cats.map((c) => [c.id, c])), contas: new Map(cts.map((c) => [c.id, c])) };
}

/**
 * Cadastros escolhidos na configuração que foram inativados depois, com o aviso para o topo da tela (nome e o
 * que deixa de funcionar).
 */
export async function referenciasInativasDaConfiguracao(filialId: string, valores: ConfiguracaoProducaoValores) {
  const { categorias, contas } = await buscarReferencias(filialId, valores);
  const inativas: { campo: CampoDeReferencia; aviso: string }[] = [];
  for (const campo of Object.keys(REFERENCIAS) as CampoDeReferencia[]) {
    const id = valores[campo];
    if (id === null) continue;
    const categoria = categorias.get(id);
    const conta = contas.get(id);
    const nome = categoria?.nome ?? (conta ? nomeDaContaBancaria(conta) : null);
    if (nome === null || (categoria ?? conta)?.ativo) continue;
    const { nome: rotulo, efeito } = REFERENCIAS[campo];
    inativas.push({ campo, aviso: `A ${rotulo} “${nome}” está inativa: ${efeito}.` });
  }
  return inativas;
}

export async function salvarConfiguracaoProducao(sessao: SessaoAtiva, dados: ConfiguracaoProducaoValores) {
  requirePermission(sessao.perfil, "producao:configurar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await obterConfiguracaoProducao(sessao.filialId);
  const { categorias, contas } = await buscarReferencias(sessao.filialId, dados);
  // Como no título (item 35): inativo não entra como escolha nova, mas o que a configuração já tem pode ficar,
  // para não travar o Salvar de outro campo.
  const conferir = (campo: CampoDeReferencia, valido: boolean, ativo: boolean) => {
    if (!valido) throw new Error(`${REFERENCIAS[campo].rotulo} inválida`);
    if (!ativo && dados[campo] !== anterior[campo]) {
      throw new Error(`${REFERENCIAS[campo].rotulo} inativa: escolha outra ou reative o cadastro`);
    }
  };
  for (const [campo, tipo] of [
    ["categoriaCompraFrutoId", "DESPESA"],
    ["categoriaVendaId", "RECEITA"],
  ] as const) {
    const id = dados[campo];
    if (id === null) continue;
    const categoria = categorias.get(id);
    conferir(campo, categoria?.tipo === tipo, categoria?.ativo ?? false);
  }
  for (const [campo, caixa] of [
    ["contaRecebimentoPadraoId", false],
    ["contaCaixaPadraoId", true],
  ] as const) {
    const id = dados[campo];
    if (id === null) continue;
    const conta = contas.get(id);
    conferir(campo, conta !== undefined && (conta.tipo === "CAIXA") === caixa, conta?.ativo ?? false);
  }

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
