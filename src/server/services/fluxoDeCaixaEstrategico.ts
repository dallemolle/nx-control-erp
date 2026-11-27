import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { registrarAuditoria, type ClientePrisma } from "@/server/audit/registrar";
import type { TipoCenarioEstrategico } from "@prisma/client";
import {
  buscarAguardandoConciliacaoDasFiliais,
  buscarSaldoConciliadoDasFiliais,
  saldoComAguardando,
  SEM_TRANSFERENCIA,
} from "./fluxoDeCaixa";
import { idsDasFiliaisAtivas } from "./filiaisConsolidadas";
import { whereLancamentoPorClassificacao, type FiltroClassificacao } from "./classificacaoFiscal";
import { somarAnoBase, type ForaDaBase, type LancamentoDoAnoBase } from "@/lib/financeiro/anoBaseEstrategico";

export type PremissasCenario = {
  crescimentoReceita: number;
  crescimentoCustos: number;
  capexPercentualReceita: number;
  novoEndividamentoAnual: number;
  taxaJurosAnual: number;
};

export type AnoProjetadoEstrategico = {
  ano: number;
  receita: number;
  custoOperacional: number;
  capex: number;
  jurosSobreDivida: number;
  geracaoOperacional: number;
  geracaoLiquida: number;
  saldoCaixa: number;
  margemOperacional: number;
};

const ANOS_DE_PROJECAO = 5;

/**
 * Roda os 5 anos da fórmula do fluxo de caixa estratégico — ver "Modelo
 * de cálculo" na spec. Juros incidem sobre o saldo devedor ANTES de
 * somar o novo endividamento do próprio ano (empréstimo tomado em
 * janeiro do ano N só gera juros a partir do ano N+1). Sem amortização:
 * o saldo devedor só cresce.
 */
export function calcularProjecaoEstrategica(
  premissas: PremissasCenario,
  receitaBase: number,
  custoBase: number,
  saldoCaixaBase: number,
): AnoProjetadoEstrategico[] {
  const anos: AnoProjetadoEstrategico[] = [];

  let receitaAnterior = receitaBase;
  let custoAnterior = custoBase;
  let saldoCaixaAnterior = saldoCaixaBase;
  let saldoDevedorAnterior = 0;

  for (let ano = 1; ano <= ANOS_DE_PROJECAO; ano++) {
    const receita = receitaAnterior * (1 + premissas.crescimentoReceita);
    const custoOperacional = custoAnterior * (1 + premissas.crescimentoCustos);
    const capex = receita * premissas.capexPercentualReceita;
    const jurosSobreDivida = saldoDevedorAnterior * premissas.taxaJurosAnual;
    const saldoDevedor = saldoDevedorAnterior + premissas.novoEndividamentoAnual;

    const geracaoOperacional = receita - custoOperacional;
    const geracaoLiquida = geracaoOperacional - capex + premissas.novoEndividamentoAnual - jurosSobreDivida;
    const saldoCaixa = saldoCaixaAnterior + geracaoLiquida;
    const margemOperacional = receita === 0 ? 0 : geracaoOperacional / receita;

    anos.push({ ano, receita, custoOperacional, capex, jurosSobreDivida, geracaoOperacional, geracaoLiquida, saldoCaixa, margemOperacional });

    receitaAnterior = receita;
    custoAnterior = custoOperacional;
    saldoCaixaAnterior = saldoCaixa;
    saldoDevedorAnterior = saldoDevedor;
  }

  return anos;
}

export const TIPOS_CENARIO: readonly TipoCenarioEstrategico[] = ["BASE", "OTIMISTA", "PESSIMISTA"];

const PREMISSAS_ZERADAS = {
  crescimentoReceita: 0,
  crescimentoCustos: 0,
  capexPercentualReceita: 0,
  novoEndividamentoAnual: 0,
  taxaJurosAnual: 0,
};

export async function garantirCenariosEstrategicos(empresaId: string, db: ClientePrisma = prisma): Promise<void> {
  await db.cenarioEstrategico.createMany({
    data: TIPOS_CENARIO.map((tipo) => ({ empresaId, tipo, ...PREMISSAS_ZERADAS })),
    skipDuplicates: true,
  });
}

const CATEGORIA_DO_ANO_BASE = { select: { tipo: true, naoOperacional: true } } as const;

/**
 * Ano-base da projeção: realizado conciliado dos últimos 12 meses, somando
 * as filiais ativas da empresa (ver `idsDasFiliaisAtivas`). Com `opcoes.classificacao`, receita e custo usam só
 * o movimento daquela classificação e o saldo de partida é 0 — a projeção
 * vira o *acumulado* que aquela classificação gera, porque o saldo bancário
 * é único e não se divide entre fiscal e gerencial (decisão FG5, igual ao
 * fluxo realizado filtrado).
 *
 * Receita e custo saem da categoria do lançamento (ou, na falta, da do título
 * da baixa), não do sentido da movimentação: categorias não operacionais
 * (empréstimos, aportes) e lançamentos sem categoria ficam de fora e voltam
 * em `foraDaBase`, para a tela avisar.
 *
 * Transferências entre contas não entram na receita nem no custo (só movem saldo).
 *
 * O saldo de partida é o saldo contábil de hoje (conciliado + o que aguarda conciliação), o mesmo de onde parte o Fluxo de caixa projetado; o ano-base continua só com conciliados.
 */
export async function buscarAnoBaseConsolidado(
  empresaId: string,
  opcoes: { classificacao?: FiltroClassificacao } = {},
): Promise<{ receitaBase: number; custoBase: number; saldoCaixaBase: number; foraDaBase: ForaDaBase }> {
  const filialIds = await idsDasFiliaisAtivas(empresaId);
  const hoje = new Date();
  const inicioJanela = new Date(hoje);
  inicioJanela.setUTCFullYear(inicioJanela.getUTCFullYear() - 1);

  const [saldoCaixaBase, lancamentos] = await Promise.all([
    opcoes.classificacao
      ? Promise.resolve(0)
      : Promise.all([
          buscarSaldoConciliadoDasFiliais(filialIds),
          buscarAguardandoConciliacaoDasFiliais(filialIds),
        ]).then(([conciliado, aguardando]) => saldoComAguardando(conciliado, aguardando)),
    prisma.lancamentoBancario.findMany({
      where: {
        filialId: { in: filialIds },
        conciliado: true,
        ...SEM_TRANSFERENCIA,
        data: { gte: inicioJanela, lte: hoje },
        contaBancaria: { ativo: true },
        ...whereLancamentoPorClassificacao(opcoes.classificacao),
      },
      select: {
        tipo: true,
        valor: true,
        categoriaFinanceira: CATEGORIA_DO_ANO_BASE,
        baixa: { select: { parcela: { select: { titulo: { select: { categoriaFinanceira: CATEGORIA_DO_ANO_BASE } } } } } },
      },
    }),
  ]);

  const paraSomar: LancamentoDoAnoBase[] = lancamentos.map((l) => ({
    tipo: l.tipo,
    valor: Number(l.valor),
    categoria: l.categoriaFinanceira ?? l.baixa?.parcela.titulo.categoriaFinanceira ?? null,
  }));
  return { ...somarAnoBase(paraSomar), saldoCaixaBase };
}

export async function listarCenariosEstrategicos(
  sessao: SessaoAtiva,
): Promise<Record<TipoCenarioEstrategico, PremissasCenario & { id: string }>> {
  requirePermission(sessao.perfil, "planejamentoEstrategico:ler");

  await garantirCenariosEstrategicos(sessao.empresaId);
  const cenarios = await prisma.cenarioEstrategico.findMany({ where: { empresaId: sessao.empresaId } });

  const resultado = {} as Record<TipoCenarioEstrategico, PremissasCenario & { id: string }>;
  for (const cenario of cenarios) {
    resultado[cenario.tipo] = {
      id: cenario.id,
      crescimentoReceita: Number(cenario.crescimentoReceita),
      crescimentoCustos: Number(cenario.crescimentoCustos),
      capexPercentualReceita: Number(cenario.capexPercentualReceita),
      novoEndividamentoAnual: Number(cenario.novoEndividamentoAnual),
      taxaJurosAnual: Number(cenario.taxaJurosAnual),
    };
  }
  return resultado;
}

export async function listarProjecaoEstrategica(
  sessao: SessaoAtiva,
  opcoes: { classificacao?: FiltroClassificacao } = {},
): Promise<{
  cenarios: Record<TipoCenarioEstrategico, PremissasCenario & { id: string }>;
  projecoes: Record<TipoCenarioEstrategico, AnoProjetadoEstrategico[]>;
  foraDaBase: ForaDaBase;
}> {
  requirePermission(sessao.perfil, "planejamentoEstrategico:ler");

  const [anoBase, cenarios] = await Promise.all([
    buscarAnoBaseConsolidado(sessao.empresaId, opcoes),
    listarCenariosEstrategicos(sessao),
  ]);

  const projecoes = {} as Record<TipoCenarioEstrategico, AnoProjetadoEstrategico[]>;
  for (const tipo of TIPOS_CENARIO) {
    projecoes[tipo] = calcularProjecaoEstrategica(cenarios[tipo], anoBase.receitaBase, anoBase.custoBase, anoBase.saldoCaixaBase);
  }
  return { cenarios, projecoes, foraDaBase: anoBase.foraDaBase };
}

export async function atualizarPremissasCenario(
  sessao: SessaoAtiva,
  tipo: TipoCenarioEstrategico,
  premissas: PremissasCenario,
): Promise<void> {
  requirePermission(sessao.perfil, "planejamentoEstrategico:escrever");

  const anterior = await prisma.cenarioEstrategico.findUnique({
    where: { empresaId_tipo: { empresaId: sessao.empresaId, tipo } },
  });

  const cenario = await prisma.cenarioEstrategico.upsert({
    where: { empresaId_tipo: { empresaId: sessao.empresaId, tipo } },
    create: { empresaId: sessao.empresaId, tipo, ...premissas },
    update: { ...premissas },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: null,
    usuarioId: sessao.usuarioId,
    entidade: "CenarioEstrategico",
    entidadeId: cenario.id,
    acao: anterior ? "ATUALIZAR" : "CRIAR",
    anterior: anterior
      ? {
          crescimentoReceita: Number(anterior.crescimentoReceita),
          crescimentoCustos: Number(anterior.crescimentoCustos),
          capexPercentualReceita: Number(anterior.capexPercentualReceita),
          novoEndividamentoAnual: Number(anterior.novoEndividamentoAnual),
          taxaJurosAnual: Number(anterior.taxaJurosAnual),
        }
      : null,
    novo: premissas,
  });
}
