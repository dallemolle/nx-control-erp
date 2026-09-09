import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { registrarAuditoria, type ClientePrisma } from "@/server/audit/registrar";
import type { TipoCenarioEstrategico } from "@prisma/client";
import { buscarSaldoEmCaixaAte } from "./fluxoDeCaixa";

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
  margemLiquida: number;
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
    const margemLiquida = receita === 0 ? 0 : geracaoOperacional / receita;

    anos.push({ ano, receita, custoOperacional, capex, jurosSobreDivida, geracaoOperacional, geracaoLiquida, saldoCaixa, margemLiquida });

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
  await Promise.all(
    TIPOS_CENARIO.map((tipo) =>
      db.cenarioEstrategico.upsert({
        where: { empresaId_tipo: { empresaId, tipo } },
        create: { empresaId, tipo, ...PREMISSAS_ZERADAS },
        update: {},
      }),
    ),
  );
}

export async function buscarAnoBaseConsolidado(
  empresaId: string,
): Promise<{ receitaBase: number; custoBase: number; saldoCaixaBase: number }> {
  const filiais = await prisma.filial.findMany({ where: { empresaId }, select: { id: true } });
  const hoje = new Date();
  const inicioJanela = new Date(hoje);
  inicioJanela.setUTCFullYear(inicioJanela.getUTCFullYear() - 1);

  let receitaBase = 0;
  let custoBase = 0;
  let saldoCaixaBase = 0;

  for (const filial of filiais) {
    saldoCaixaBase += await buscarSaldoEmCaixaAte(filial.id, hoje);

    const somas = await prisma.lancamentoBancario.groupBy({
      by: ["tipo"],
      where: {
        filialId: filial.id,
        conciliado: true,
        data: { gte: inicioJanela, lte: hoje },
        contaBancaria: { ativo: true },
      },
      _sum: { valor: true },
    });

    receitaBase += Number(somas.find((s) => s.tipo === "ENTRADA")?._sum.valor ?? 0);
    custoBase += Number(somas.find((s) => s.tipo === "SAIDA")?._sum.valor ?? 0);
  }

  return { receitaBase, custoBase, saldoCaixaBase };
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
): Promise<Record<TipoCenarioEstrategico, AnoProjetadoEstrategico[]>> {
  requirePermission(sessao.perfil, "planejamentoEstrategico:ler");

  const [anoBase, cenarios] = await Promise.all([
    buscarAnoBaseConsolidado(sessao.empresaId),
    listarCenariosEstrategicos(sessao),
  ]);

  const resultado = {} as Record<TipoCenarioEstrategico, AnoProjetadoEstrategico[]>;
  for (const tipo of TIPOS_CENARIO) {
    resultado[tipo] = calcularProjecaoEstrategica(cenarios[tipo], anoBase.receitaBase, anoBase.custoBase, anoBase.saldoCaixaBase);
  }
  return resultado;
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
