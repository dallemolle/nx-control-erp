/**
 * O exemplo do Processamento: a OP de 20/11/2026 que processa o açaí da Recepção (o lote comprado do José da Silva e
 * o colhido no Talhão 3) em polpa grossa e média congeladas. Fictício e fixo. Os totais, o balanço, o custo e o rateio
 * são escritos à mão; o teste confere com `resumirOP` e `ratearCustoOP`.
 */

export const OP = {
  numero: "OP-261120-01",
  data: "20/11/2026",
  fruta: "Açaí",
  responsavel: "Maria",
  usuario: "Administrador",
} as const;

export const CONFIGURACAO = {
  toleranciaBalancoMassa: 0.03,
  branqueamentoTemperaturaMinC: 80,
  branqueamentoTempoMinS: 10,
} as const;

/** Lotes de fruto disponíveis na data da OP, em ordem de validade (como no seletor da tela). */
export const LOTES_DISPONIVEIS = [
  { codigo: "FA-261120-01", saldoKg: 672, custoKg: 5, validade: "21/11/2026" },
  { codigo: "FA-261120-02", saldoKg: 406, custoKg: 4, validade: "21/11/2026" },
] as const;

export const CONSUMOS = [
  { lote: "FA-261120-01", produto: "Fruto de açaí", validade: "21/11/2026", kg: 672, custoKg: 5 },
  { lote: "FA-261120-02", produto: "Fruto de açaí", validade: "21/11/2026", kg: 406, custoKg: 4 },
] as const;

export const POLPAS = [
  {
    lote: "AGC-261120-01",
    produtoId: "agc",
    codigo: "AGC",
    descricao: "Polpa de açaí grosso/especial – congelada",
    kg: 300,
    embalagens: 300,
    precoReferenciaKg: 18,
    custoKg: 7.5157,
  },
  {
    lote: "AMC-261120-01",
    produtoId: "amc",
    codigo: "AMC",
    descricao: "Polpa de açaí médio/regular – congelada",
    kg: 700,
    embalagens: 700,
    precoReferenciaKg: 12,
    custoKg: 5.0104,
  },
] as const;

export const LOCAL_POLPA = "Câmara fria";
export const VALIDADE_POLPA = "20/11/2027";

export const INSUMOS = [
  { nome: "Embalagem 1 kg", unidade: "un", quantidade: 1000, custoUnitario: 0.35 },
  { nome: "Energia elétrica", unidade: "kWh", quantidade: 120, custoUnitario: 0.9 },
  { nome: "Mão de obra", unidade: "h", quantidade: 16, custoUnitario: 20 },
] as const;

export const PROCESSO = {
  temperaturaC: 85,
  tempoS: 10,
  aguaLitros: 400,
  carocoResiduoKg: 450,
  perdaKg: 20,
  observacao: "Despolpadeira 2",
} as const;

/** O quadro de resumo da OP completa, como a tela formata. */
export const RESUMO = {
  frutoKg: "1.078 kg",
  polpaKg: "1.000 kg",
  rendimento: "92,8%",
  balancoKg: "8 kg",
  balancoPercentual: "0,5%",
  custoFruto: 4984,
  custoInsumos: 778,
  custoTotal: 5762,
  custoKgPolpa: 5.762,
} as const;

export type LinhaOP = {
  numero: string;
  data: string;
  fruta: string;
  responsavel: string;
  frutoKg: string;
  polpaKg: string;
  rendimento: string;
  balanco: "OK" | "Verificar";
  branqueamento: "OK" | "Verificar" | "Não se aplica";
  custoKg: number;
  status: "Aberta" | "Encerrada" | "Cancelada";
};

/** A lista de novembro, da mais recente para a mais antiga. */
export const OPS: readonly LinhaOP[] = [
  {
    numero: OP.numero,
    data: OP.data,
    fruta: OP.fruta,
    responsavel: OP.responsavel,
    frutoKg: "1.078",
    polpaKg: "1.000",
    rendimento: RESUMO.rendimento,
    balanco: "OK",
    branqueamento: "OK",
    custoKg: RESUMO.custoKgPolpa,
    status: "Aberta",
  },
  {
    numero: "OP-261119-01",
    data: "19/11/2026",
    fruta: "Acerola",
    responsavel: "João",
    frutoKg: "250",
    polpaKg: "190",
    rendimento: "76%",
    balanco: "Verificar",
    branqueamento: "Não se aplica",
    custoKg: 5.2,
    status: "Encerrada",
  },
  {
    numero: "OP-261118-01",
    data: "18/11/2026",
    fruta: OP.fruta,
    responsavel: OP.responsavel,
    frutoKg: "546",
    polpaKg: "500",
    rendimento: "91,6%",
    balanco: "OK",
    branqueamento: "OK",
    custoKg: 6.1,
    status: "Encerrada",
  },
];
