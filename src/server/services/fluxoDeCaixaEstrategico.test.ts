import { describe, expect, test } from "vitest";
import { calcularProjecaoEstrategica, type PremissasCenario } from "./fluxoDeCaixaEstrategico";

describe("calcularProjecaoEstrategica", () => {
  const premissasZeradas: PremissasCenario = {
    crescimentoReceita: 0,
    crescimentoCustos: 0,
    capexPercentualReceita: 0,
    novoEndividamentoAnual: 0,
    taxaJurosAnual: 0,
  };

  test("devolve exatamente 5 anos, numerados 1 a 5", () => {
    const resultado = calcularProjecaoEstrategica(premissasZeradas, 1000, 600, 200);
    expect(resultado).toHaveLength(5);
    expect(resultado.map((a) => a.ano)).toEqual([1, 2, 3, 4, 5]);
  });

  test("premissas todas zeradas reproduz o ano base nos 5 anos, sem crescimento", () => {
    const resultado = calcularProjecaoEstrategica(premissasZeradas, 1000, 600, 200);
    for (const ano of resultado) {
      expect(ano.receita).toBe(1000);
      expect(ano.custoOperacional).toBe(600);
      expect(ano.capex).toBe(0);
      expect(ano.jurosSobreDivida).toBe(0);
      expect(ano.geracaoOperacional).toBe(400);
      expect(ano.geracaoLiquida).toBe(400);
    }
    expect(resultado[0].saldoCaixa).toBe(600); // 200 + 400
    expect(resultado[4].saldoCaixa).toBe(200 + 400 * 5);
  });

  test("encadeia receita/custo/saldo de caixa ano a ano com crescimento", () => {
    const premissas: PremissasCenario = { ...premissasZeradas, crescimentoReceita: 0.1, crescimentoCustos: 0.05 };
    const resultado = calcularProjecaoEstrategica(premissas, 1000, 600, 0);
    expect(resultado[0].receita).toBeCloseTo(1100, 6);
    expect(resultado[0].custoOperacional).toBeCloseTo(630, 6);
    expect(resultado[1].receita).toBeCloseTo(1210, 6);
    expect(resultado[1].custoOperacional).toBeCloseTo(661.5, 6);
  });

  test("CAPEX é percentual da receita do próprio ano, não do ano base", () => {
    const premissas: PremissasCenario = { ...premissasZeradas, crescimentoReceita: 1, capexPercentualReceita: 0.1 };
    const resultado = calcularProjecaoEstrategica(premissas, 1000, 0, 0);
    expect(resultado[0].receita).toBe(2000);
    expect(resultado[0].capex).toBeCloseTo(200, 6); // 10% de 2000, não de 1000
  });

  test("saldo devedor acumula novoEndividamentoAnual todo ano, sem amortização", () => {
    const premissas: PremissasCenario = { ...premissasZeradas, novoEndividamentoAnual: 500 };
    const resultado = calcularProjecaoEstrategica(premissas, 1000, 600, 0);
    // geracaoLiquida[N] = geracaoOperacional (400) + novoEndividamentoAnual (500) - juros (0, sem taxa)
    for (const ano of resultado) {
      expect(ano.geracaoLiquida).toBe(900);
    }
  });

  test("juros incidem sobre o saldo devedor do ANO ANTERIOR, não o do próprio ano", () => {
    const premissas: PremissasCenario = { ...premissasZeradas, novoEndividamentoAnual: 1000, taxaJurosAnual: 0.1 };
    const resultado = calcularProjecaoEstrategica(premissas, 1000, 600, 0);
    // Ano 1: saldo devedor anterior = 0 -> juros = 0
    expect(resultado[0].jurosSobreDivida).toBe(0);
    // Ano 2: saldo devedor no fim do ano 1 = 1000 -> juros do ano 2 = 100
    expect(resultado[1].jurosSobreDivida).toBeCloseTo(100, 6);
    // Ano 3: saldo devedor no fim do ano 2 = 2000 -> juros do ano 3 = 200
    expect(resultado[2].jurosSobreDivida).toBeCloseTo(200, 6);
  });

  test("margemLiquida é geracaoOperacional/receita, e não lança erro quando receita é 0", () => {
    const resultado = calcularProjecaoEstrategica(premissasZeradas, 1000, 600, 0);
    expect(resultado[0].margemLiquida).toBeCloseTo(0.4, 6);

    const resultadoZerado = calcularProjecaoEstrategica(premissasZeradas, 0, 0, 0);
    expect(resultadoZerado[0].margemLiquida).toBe(0);
    expect(Number.isFinite(resultadoZerado[0].margemLiquida)).toBe(true);
  });
});
