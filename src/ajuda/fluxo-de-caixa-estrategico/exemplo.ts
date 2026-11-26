/**
 * O exemplo do Fluxo de caixa estratégico. Fictício e fixo. A fórmula é a mesma de `calcularProjecaoEstrategica`
 * (src/server/services/fluxoDeCaixaEstrategico.ts), repetida aqui porque a réplica roda no navegador e o
 * serviço importa o banco; o teste da ajuda confere que as duas dão o mesmo resultado.
 */
export type Cenario = "BASE" | "OTIMISTA" | "PESSIMISTA";

export type Premissas = {
  crescimentoReceita: number;
  crescimentoCustos: number;
  capexPercentualReceita: number;
  novoEndividamentoAnual: number;
  taxaJurosAnual: number;
};

/** Ano-base: realizado conciliado dos últimos 12 meses; saldo em caixa de hoje (conciliado + aguardando conciliação, o mesmo de onde parte o Fluxo de caixa projetado). */
export const ANO_BASE = { receita: 220_000, custo: 205_000, saldoCaixa: 47_850 } as const;

export const PREMISSAS: Readonly<Record<Cenario, Premissas>> = {
  BASE: {
    crescimentoReceita: 0.05,
    crescimentoCustos: 0.06,
    capexPercentualReceita: 0.03,
    novoEndividamentoAnual: 0,
    taxaJurosAnual: 0,
  },
  OTIMISTA: {
    crescimentoReceita: 0.1,
    crescimentoCustos: 0.06,
    capexPercentualReceita: 0.04,
    novoEndividamentoAnual: 0,
    taxaJurosAnual: 0,
  },
  PESSIMISTA: {
    crescimentoReceita: -0.05,
    crescimentoCustos: 0.08,
    capexPercentualReceita: 0.02,
    novoEndividamentoAnual: 30_000,
    taxaJurosAnual: 0.18,
  },
};

export type AnoProjetado = {
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

export function projetar(p: Premissas, receitaBase: number, custoBase: number, saldoBase: number): AnoProjetado[] {
  const anos: AnoProjetado[] = [];
  let receitaAnterior = receitaBase;
  let custoAnterior = custoBase;
  let saldoAnterior = saldoBase;
  let devedorAnterior = 0;
  for (let ano = 1; ano <= 5; ano++) {
    const receita = receitaAnterior * (1 + p.crescimentoReceita);
    const custoOperacional = custoAnterior * (1 + p.crescimentoCustos);
    const capex = receita * p.capexPercentualReceita;
    const jurosSobreDivida = devedorAnterior * p.taxaJurosAnual;
    const devedor = devedorAnterior + p.novoEndividamentoAnual;
    const geracaoOperacional = receita - custoOperacional;
    const geracaoLiquida = geracaoOperacional - capex + p.novoEndividamentoAnual - jurosSobreDivida;
    const saldoCaixa = saldoAnterior + geracaoLiquida;
    const margemLiquida = receita === 0 ? 0 : geracaoOperacional / receita;
    anos.push({ ano, receita, custoOperacional, capex, jurosSobreDivida, geracaoOperacional, geracaoLiquida, saldoCaixa, margemLiquida });
    receitaAnterior = receita;
    custoAnterior = custoOperacional;
    saldoAnterior = saldoCaixa;
    devedorAnterior = devedor;
  }
  return anos;
}

/** Visão Fiscal: só o movimento fiscal do ano-base, partindo de zero. */
export const ANO_BASE_FISCAL = { receita: 176_000, custo: 168_000, saldoCaixa: 0 } as const;
