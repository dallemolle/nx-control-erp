type ContaParaExibir = {
  tipo?: string | null;
  agencia: string;
  conta: string;
  banco: { nome: string };
};

/** Nome de uma conta nas listas e seletores. Conta Caixa não tem banco nem agência. */
export function nomeDaContaBancaria(conta: ContaParaExibir): string {
  if (conta.tipo === "CAIXA") return `Caixa · ${conta.conta}`;
  return `${conta.banco.nome} - Ag ${conta.agencia}/CC ${conta.conta}`;
}
