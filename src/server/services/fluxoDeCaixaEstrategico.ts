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
