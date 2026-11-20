/**
 * Os repasses do exemplo. Dados fictícios e fixos. A história: a Cartões Rurais depositou R$ 1.462,50 em
 * 19/11/2026, que cobrem os repasses dos pedidos PV-41 (débito) e PV-42 (crédito à vista).
 */
export type Repasse = {
  /** Chave do alvo da linha (`l1`, `l2`...). */
  id: string;
  previsto: string;
  operadora: string;
  pedido: string;
  bruto: string;
  taxa: string;
  liquido: string;
  /** Líquido em centavos, para a soma da barra. */
  liquidoCentavos: number;
  situacao: "A_RECEBER" | "ATRASADO" | "RECEBIDO";
  recebidoEm?: string;
};

export const OPERADORA = "Cartões Rurais S.A.";
export const DATA_DO_DEPOSITO = "19/11/2026";
export const HOJE = "20/11/2026";

export const REPASSES: readonly Repasse[] = [
  {
    id: "l1",
    previsto: "18/11/2026",
    operadora: OPERADORA,
    pedido: "PV-41",
    bruto: "R$ 500,00",
    taxa: "R$ 7,50",
    liquido: "R$ 492,50",
    liquidoCentavos: 49250,
    situacao: "ATRASADO",
  },
  {
    id: "l2",
    previsto: "19/11/2026",
    operadora: OPERADORA,
    pedido: "PV-42",
    bruto: "R$ 1.000,00",
    taxa: "R$ 30,00",
    liquido: "R$ 970,00",
    liquidoCentavos: 97000,
    situacao: "ATRASADO",
  },
  {
    id: "l3",
    previsto: "20/12/2026",
    operadora: OPERADORA,
    pedido: "PV-43 · 2/3",
    bruto: "R$ 300,00",
    taxa: "R$ 12,00",
    liquido: "R$ 288,00",
    liquidoCentavos: 28800,
    situacao: "A_RECEBER",
  },
  {
    id: "l4",
    previsto: "25/11/2026",
    operadora: "Maquininha Sul Ltda",
    pedido: "PV-44",
    bruto: "R$ 250,00",
    taxa: "R$ 5,00",
    liquido: "R$ 245,00",
    liquidoCentavos: 24500,
    situacao: "A_RECEBER",
  },
  {
    id: "rec",
    previsto: "10/11/2026",
    operadora: "Maquininha Sul Ltda",
    pedido: "PV-39",
    bruto: "R$ 800,00",
    taxa: "R$ 16,00",
    liquido: "R$ 784,00",
    liquidoCentavos: 78400,
    situacao: "RECEBIDO",
    recebidoEm: "10/11/2026",
  },
];
