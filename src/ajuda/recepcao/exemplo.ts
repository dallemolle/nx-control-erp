/**
 * O exemplo da Recepção de fruto: a mesma fazenda das outras ajudas, em 20/11/2026. O José da Silva (o fornecedor
 * sem nota do Fiscal × gerencial) entrega açaí em rasas de 14 kg, e a fazenda colhe açaí no próprio talhão. Fictício
 * e fixo. Os números do resumo e o número do lote seguem `calcularRecepcao` e `proximoCodigoDeLote`; o teste confere.
 */

export const RASA_KG = 14;
export const PRAZO_PRODUTOR_DIAS = 7;

export const PRODUTO = "FA · Fruto de açaí";
export const LOCAL = "Galpão de recepção";
export const SAFRA = "2026/27";

/** Compra de terceiro, digitada em rasas. */
export const COMPRA = {
  data: "20/11/2026",
  fornecedor: "José da Silva",
  brutoRasas: 50,
  descarteRasas: 2,
  precoRasa: 70,
  liquidoKg: "672 kg",
  percentualDescarte: "4%",
  precoKg: 5,
  valor: 3360,
  validade: "21/11/2026",
  vencimento: "27/11/2026",
  qualidade: "A",
  documento: "Romaneio 152",
  lote: "FA-261120-01",
} as const;

/** Colheita própria do mesmo dia, digitada em rasas, a custo-padrão. */
export const COLHEITA = {
  talhao: "Talhão 3 – Várzea",
  brutoRasas: 30,
  descarteRasas: 1,
  custoPadraoKg: 4,
  liquidoKg: "406 kg",
  percentualDescarte: "3,3%",
  valor: 1624,
  lote: "FA-261120-02",
} as const;

export type LinhaRecepcao = {
  data: string;
  lote: string;
  excluida?: boolean;
  produto: string;
  origem: "Própria" | "Terceiro";
  quem: string;
  brutoKg: string;
  descarte: string;
  liquidoKg: string;
  precoKg: number;
  valor: number;
  qualidade: string;
  /** Motivo do Excluir desabilitado (o `title` do botão na tela). */
  bloqueio?: string;
};

/** A lista de novembro, da mais recente para a mais antiga, como na tela. */
export const RECEPCOES: readonly LinhaRecepcao[] = [
  {
    data: COMPRA.data,
    lote: COLHEITA.lote,
    produto: "Fruto de açaí",
    origem: "Própria",
    quem: COLHEITA.talhao,
    brutoKg: "420",
    descarte: COLHEITA.percentualDescarte,
    liquidoKg: "406",
    precoKg: COLHEITA.custoPadraoKg,
    valor: COLHEITA.valor,
    qualidade: "—",
  },
  {
    data: COMPRA.data,
    lote: COMPRA.lote,
    produto: "Fruto de açaí",
    origem: "Terceiro",
    quem: COMPRA.fornecedor,
    brutoKg: "700",
    descarte: COMPRA.percentualDescarte,
    liquidoKg: "672",
    precoKg: COMPRA.precoKg,
    valor: COMPRA.valor,
    qualidade: COMPRA.qualidade,
  },
  {
    data: "19/11/2026",
    lote: "FC-261119-01",
    excluida: true,
    produto: "Fruto de acerola",
    origem: "Terceiro",
    quem: "Cooperativa Vale Verde",
    brutoKg: "300",
    descarte: "5%",
    liquidoKg: "285",
    precoKg: 3.5,
    valor: 997.5,
    qualidade: "B",
  },
  {
    data: "18/11/2026",
    lote: "FA-261118-01",
    produto: "Fruto de açaí",
    origem: "Terceiro",
    quem: COMPRA.fornecedor,
    brutoKg: "560",
    descarte: "2,5%",
    liquidoKg: "546",
    precoKg: 5,
    valor: 2730,
    qualidade: "A",
    bloqueio: "O lote já teve movimentação; não é possível excluir a recepção",
  },
];
