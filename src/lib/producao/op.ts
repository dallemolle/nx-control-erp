import { arredondar } from "./arredondar";

export type StatusVerificacao = "OK" | "VERIFICAR";
export type StatusBranqueamento = "OK" | "VERIFICAR" | "NAO_SE_APLICA";

export const ROTULOS_STATUS_VERIFICACAO: Record<StatusVerificacao, string> = { OK: "OK", VERIFICAR: "Verificar" };
export const ROTULOS_STATUS_BRANQUEAMENTO: Record<StatusBranqueamento, string> = {
  OK: "OK",
  VERIFICAR: "Verificar",
  NAO_SE_APLICA: "Não se aplica",
};

/** RN-10: polpa ÷ fruto; sem fruto não há rendimento. */
export function rendimento(frutoKg: number, polpaKg: number): number | null {
  return frutoKg > 0 ? arredondar(polpaKg / frutoKg, 4) : null;
}

/** RN-11: fruto + água − polpa − caroço − perda; 1 L de água = 1 kg (D-20). */
export function balancoMassa(
  e: { frutoKg: number; aguaLitros: number; polpaKg: number; carocoResiduoKg: number; perdaKg: number },
  tolerancia: number,
): { diferencaKg: number; percentual: number | null; status: StatusVerificacao } {
  const entrada = e.frutoKg + e.aguaLitros;
  const diferencaKg = arredondar(entrada - e.polpaKg - e.carocoResiduoKg - e.perdaKg, 3);
  if (entrada <= 0) return { diferencaKg, percentual: null, status: "VERIFICAR" };
  const percentual = diferencaKg / entrada;
  // Folga mínima para o ponto flutuante não reprovar quem está exatamente no limite.
  return { diferencaKg, percentual, status: Math.abs(percentual) <= tolerancia + 1e-9 ? "OK" : "VERIFICAR" };
}

/** RN-12: só para fruta que exige (D-08); valor faltando é "Verificar". */
export function statusBranqueamento(
  e: { exige: boolean; temperaturaC: number | null; tempoS: number | null },
  minimos: { temperaturaMinC: number; tempoMinS: number },
): StatusBranqueamento {
  if (!e.exige) return "NAO_SE_APLICA";
  if (e.temperaturaC === null || e.tempoS === null) return "VERIFICAR";
  return e.temperaturaC >= minimos.temperaturaMinC && e.tempoS >= minimos.tempoMinS ? "OK" : "VERIFICAR";
}

/** RN-13: o mesmo custo/kg para todas as polpas da OP (D-06). */
export function custoOP(e: {
  consumos: { quantidadeKg: number; custoKg: number }[];
  insumos: { quantidade: number; custoUnitario: number }[];
  polpaKg: number;
}) {
  const fruto = e.consumos.reduce((s, c) => s + c.quantidadeKg * c.custoKg, 0);
  const insumos = e.insumos.reduce((s, i) => s + i.quantidade * i.custoUnitario, 0);
  const total = fruto + insumos;
  return {
    custoFrutoTotal: arredondar(fruto, 2),
    custoInsumosTotal: arredondar(insumos, 2),
    custoTotal: arredondar(total, 2),
    custoKgPolpa: e.polpaKg > 0 ? arredondar(total / e.polpaKg, 4) : 0,
  };
}

export type CustoOP = ReturnType<typeof custoOP>;

export type LinhasOP = {
  consumos: { quantidadeKg: number; custoKg: number }[];
  producoes: { quantidadeKg: number }[];
  insumos: { quantidade: number; custoUnitario: number }[];
};

export type ConfiguracaoResumo = {
  toleranciaBalancoMassa: number;
  branqueamentoTemperaturaMinC: number;
  branqueamentoTempoMinS: number;
};

export type DadosResumoOP = {
  exigeBranqueamento: boolean;
  branqueamentoTemperaturaC: number | null;
  branqueamentoTempoS: number | null;
  aguaLitros: number;
  carocoResiduoKg: number;
  perdaKg: number;
} & LinhasOP;

/** Resumo ao vivo da OP: totais, rendimento, balanço, branqueamento, custo e o que está a verificar. */
export function resumirOP(op: DadosResumoOP, config: ConfiguracaoResumo) {
  const frutoKg = arredondar(
    op.consumos.reduce((s, c) => s + c.quantidadeKg, 0),
    3,
  );
  const polpaKg = arredondar(
    op.producoes.reduce((s, p) => s + p.quantidadeKg, 0),
    3,
  );
  const balanco = balancoMassa(
    { frutoKg, aguaLitros: op.aguaLitros, polpaKg, carocoResiduoKg: op.carocoResiduoKg, perdaKg: op.perdaKg },
    config.toleranciaBalancoMassa,
  );
  const branqueamento = statusBranqueamento(
    { exige: op.exigeBranqueamento, temperaturaC: op.branqueamentoTemperaturaC, tempoS: op.branqueamentoTempoS },
    { temperaturaMinC: config.branqueamentoTemperaturaMinC, tempoMinS: config.branqueamentoTempoMinS },
  );
  const aVerificar = [
    ...(balanco.status === "VERIFICAR" ? ["Balanço de massa"] : []),
    ...(branqueamento === "VERIFICAR" ? ["Branqueamento"] : []),
  ];
  return {
    frutoKg,
    polpaKg,
    rendimento: rendimento(frutoKg, polpaKg),
    balanco,
    branqueamento,
    custo: custoOP({ consumos: op.consumos, insumos: op.insumos, polpaKg }),
    aVerificar,
  };
}

export type ResumoOP = ReturnType<typeof resumirOP>;

/** `OP-261110` (RN-02); a sequência do dia vem de `proximoCodigoDeLote`. */
export function prefixoDaOP(data: Date): string {
  return `OP-${data.toISOString().slice(2, 10).replaceAll("-", "")}`;
}
