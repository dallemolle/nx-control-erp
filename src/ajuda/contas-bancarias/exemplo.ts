/**
 * Exemplo fixo da ajuda de Contas bancárias. Hoje é 21/11/2026. A filial começou 2026 com o Banco do Brasil, o
 * Caixa · Fazenda e uma conta no Santander; os saldos iniciais somam os R$ 40.000 do Fluxo de caixa (o teste
 * confere). O Santander foi encerrado em outubro, com o dinheiro transferido para o Banco do Brasil. A Maria cadastra
 * uma conta nova no Sicredi e um segundo caixa, o Escritório, os dois com saldo inicial 0. Dados fictícios.
 */
export const HOJE = "21/11/2026";

export type ContaDaLista = {
  chave: "bb" | "fazenda" | "santander" | "sicredi" | "escritorio";
  /** Como a coluna Banco mostra: "código · nome"; no Caixa, só o nome do banco interno. */
  banco: string;
  agencia: string;
  conta: string;
  tipo: string;
  saldoInicial: number;
};

export const BANCO_CAIXA = "Caixa interno (dinheiro em espécie)";
export const TIPO_CORRENTE = "Conta corrente";
export const TIPO_CAIXA = "Caixa (dinheiro em espécie)";

/** As contas já cadastradas, na ordem de cadastro (a lista segue essa ordem). */
export const CONTAS: readonly ContaDaLista[] = [
  { chave: "bb", banco: "001 · Banco do Brasil", agencia: "1234", conta: "12345-6", tipo: TIPO_CORRENTE, saldoInicial: 38_000 },
  { chave: "fazenda", banco: BANCO_CAIXA, agencia: "—", conta: "Fazenda", tipo: TIPO_CAIXA, saldoInicial: 500 },
  { chave: "santander", banco: "033 · Santander", agencia: "0456", conta: "13000789-1", tipo: TIPO_CORRENTE, saldoInicial: 1_500 },
];

export const SICREDI = {
  chave: "sicredi",
  banco: "748 · Sicredi",
  agencia: "0812",
  conta: "40123-7",
  tipo: TIPO_CORRENTE,
  saldoInicial: 0,
} as const satisfies ContaDaLista;

export const ESCRITORIO = {
  chave: "escritorio",
  banco: BANCO_CAIXA,
  agencia: "—",
  conta: "Escritório",
  tipo: TIPO_CAIXA,
  saldoInicial: 0,
} as const satisfies ContaDaLista;

/** O troco do Escritório, que sai do Caixa · Fazenda por transferência. */
export const TROCO = "R$ 300,00";

export const MSG_TIPO_CAIXA = "Não é possível mudar de ou para o tipo Caixa uma conta que já tem lançamentos";
