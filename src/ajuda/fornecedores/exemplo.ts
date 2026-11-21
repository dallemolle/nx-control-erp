/**
 * Exemplo fixo da ajuda de Fornecedores. Hoje é 19/11/2026: a Maria, do Financeiro, cadastra a Embalagens Norte (sacos
 * de polpa, com nota, paga por depósito) e o Raimundo Ferreira, produtor de açaí sem nota, pago por Pix. Os demais
 * são os fornecedores das outras ajudas (adubo da Agro Insumos, repasses da Cartões Rurais, fruto do José da Silva,
 * da Cooperativa Vale Verde e do Sítio Boa Esperança, que parou de vender). Documentos fictícios.
 */
export const HOJE = "19/11/2026";

export type FornecedorDaLista = {
  chave: "agro" | "cartoes" | "cooperativa" | "embalagens" | "jose" | "raimundo" | "sitio";
  nome: string;
  /** Já formatado, como a lista mostra. */
  cnpjCpf: string;
  /** A coluna Contato mostra o email ou, sem email, o telefone. */
  contato: string | null;
};

/** O que a Maria digita para a Embalagens Norte (o CNPJ sem pontuação). */
export const EMBALAGENS = {
  nome: "Embalagens Norte Ltda",
  cnpjDigitado: "08347261000154",
  contato: "Cláudia",
  telefone: "(91) 3244-8100",
  municipio: "Ananindeua",
  classificacao: "Fiscal (com documento)",
  banco: "001 · Banco do Brasil",
  agencia: "1234-5",
  conta: "56789-0",
  tipoConta: "Corrente",
} as const;

/** O produtor sem nota: CPF sem pontuação e chave Pix pelo CPF. */
export const RAIMUNDO = {
  nome: "Raimundo Ferreira",
  cpfDigitado: "52814736091",
  telefone: "(91) 99134-2210",
  municipio: "Igarapé-Miri",
  classificacao: "Gerencial (sem nota)",
  tipoChave: "CPF/CNPJ",
} as const;

export const SITIO = "Sítio Boa Esperança";

/** Os fornecedores já cadastrados antes de hoje (a Embalagens Norte e o Raimundo entram pelos roteiros). */
export const FORNECEDORES: readonly FornecedorDaLista[] = [
  { chave: "agro", nome: "Agro Insumos Ltda", cnpjCpf: "12.408.375/0001-62", contato: "vendas@agroinsumos.com.br" },
  { chave: "cartoes", nome: "Cartões Rurais S.A.", cnpjCpf: "61.205.774/0001-30", contato: null },
  { chave: "cooperativa", nome: "Cooperativa Vale Verde", cnpjCpf: "40.118.926/0001-07", contato: "(91) 3711-2040" },
  { chave: "jose", nome: "José da Silva", cnpjCpf: "317.642.508-14", contato: "(91) 98402-7731" },
  { chave: "sitio", nome: SITIO, cnpjCpf: "605.219.384-70", contato: "(91) 99277-1450" },
];
