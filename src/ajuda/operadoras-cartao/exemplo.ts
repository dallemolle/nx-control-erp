import type { CondicaoCartao } from "@/lib/producao/cartao";
import { OPERADORA as RURAIS } from "@/ajuda/pedidos/exemplo";

/**
 * Exemplo fixo da ajuda de Operadoras de cartão. Hoje é 21/11/2026. A filial tem a Cartões Rurais S.A. (as mesmas
 * condições das ajudas de Pedidos e Repasses de cartão) e a Maquininha do Porto, que deixou de ser usada. A Maria
 * cadastra a Pague Norte S.A., uma segunda maquininha para a loja, que deposita no Sicredi (a conta nova da ajuda de
 * Contas bancárias). Nomes e CNPJ fictícios.
 */
export const HOJE = "21/11/2026";

export const CONTA_BB = "Banco do Brasil - Ag 1234/CC 12345-6";
export const CONTA_SICREDI = "Sicredi - Ag 0812/CC 40123-7";
export const CATEGORIA_TAXA = "Taxas de cartão";

const condicao = (
  modalidade: CondicaoCartao["modalidade"],
  taxaPercentual: number,
  prazoDias: number,
  faixa: { de: number; ate: number; antecipado?: boolean } = { de: 1, ate: 1 },
): CondicaoCartao => ({
  modalidade,
  parcelasDe: faixa.de,
  parcelasAte: faixa.ate,
  taxaPercentual,
  prazoDias,
  antecipado: faixa.antecipado ?? false,
});

export type OperadoraDaLista = {
  chave: "rurais" | "porto" | "pague";
  nome: string;
  conta: string;
  condicoes: CondicaoCartao[];
};

export const CARTOES_RURAIS: OperadoraDaLista = {
  chave: "rurais",
  nome: RURAIS.nome,
  conta: CONTA_BB,
  condicoes: [...RURAIS.condicoes],
};

export const PORTO: OperadoraDaLista = {
  chave: "porto",
  nome: "Maquininha do Porto",
  conta: CONTA_BB,
  condicoes: [condicao("DEBITO", 2, 1), condicao("CREDITO_VISTA", 3.5, 30)],
};

/** O que a Maria digita para a Pague Norte (o CNPJ sem pontuação). */
export const PAGUE = {
  nome: "Pague Norte S.A.",
  cnpjDigitado: "27561904000133",
  condicoes: [condicao("DEBITO", 1.2, 1), condicao("CREDITO_VISTA", 2.9, 30), condicao("PIX_MAQUININHA", 0.8, 0)],
  /** As duas faixas do parcelado, incluídas no segundo roteiro. */
  parcelado: [
    condicao("CREDITO_PARCELADO", 3.9, 30, { de: 2, ate: 6 }),
    condicao("CREDITO_PARCELADO", 5.5, 30, { de: 7, ate: 12, antecipado: true }),
  ],
} as const;

/** As vendas usadas para explicar o parcelado (o teste confere com calcularRepasses). */
export const VENDA_3X = { valor: 600, parcelas: 3, liquidoPorRepasse: "R$ 192,20", datas: ["21/12/2026", "20/01/2027", "19/02/2027"] } as const;
export const VENDA_10X = { valor: 1200, parcelas: 10, liquido: "R$ 1.134,00", data: "21/12/2026" } as const;

/** A taxa nova do débito da Cartões Rurais. */
export const TAXA_DEBITO_NOVA = 1.4;
