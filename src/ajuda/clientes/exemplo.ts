/**
 * Exemplo fixo da ajuda de Clientes. Hoje é 21/11/2026, véspera do pedido 131: a Rita cadastra a Sorveteria Polar
 * (que recebe a entrega do 131 pelo Rui) e o “Clientes diversos” (das vendas de balcão e da maquininha). Os demais
 * são os clientes de novembro da ajuda de Vendas e do Relatório de vendas, mais a Lanchonete Tucumã, que parou de
 * comprar. Documentos fictícios.
 */
export const HOJE = "21/11/2026";
export const VENDEDORA = "Rita";

export type ClienteDaLista = {
  chave: "acaiDaVila" | "verOPeso" | "diversos" | "tucuma" | "mercadinho" | "polar";
  nome: string;
  /** Já formatado, como a lista mostra. */
  cnpjCpf: string | null;
  canal: string;
  /** A coluna Contato mostra o email ou, sem email, o telefone. */
  contato: string | null;
};

/** O que a Rita digita para a Sorveteria Polar (o CNPJ sem pontuação). */
export const POLAR = {
  nome: "Sorveteria Polar",
  cnpjDigitado: "45218903000127",
  contato: "Rui",
  telefone: "(91) 98765-4321",
  classificacao: "Nenhuma",
  canal: "Varejo / mercado",
  municipio: "Belém",
  endereco: "Av. Nazaré, 900 · Belém",
} as const;

export const DIVERSOS = { nome: "Clientes diversos", canal: "Consumidor final" } as const;

/** O cadastro que o roteiro de edição abre: o Batedor do Ver-o-Peso, que passa a ter uma chave Pix. */
export const VER_O_PESO = {
  nome: "Batedor do Ver-o-Peso",
  cnpjCpf: "482.193.650-21",
  contato: "Seu Bené",
  telefone: "(91) 99812-3344",
  classificacao: "Gerencial (sem nota)",
  canal: "Batedor / ponto de açaí",
  municipio: "Belém",
  tipoChave: "Celular",
} as const;

export const TUCUMA = "Lanchonete Tucumã";

/** Os clientes já cadastrados antes de hoje (a Polar e o “Clientes diversos” entram pelos roteiros). */
export const CLIENTES: readonly ClienteDaLista[] = [
  {
    chave: "acaiDaVila",
    nome: "Açaí da Vila",
    cnpjCpf: "33.610.274/0001-89",
    canal: "Batedor / ponto de açaí",
    contato: "compras@acaidavila.com.br",
  },
  {
    chave: "verOPeso",
    nome: VER_O_PESO.nome,
    cnpjCpf: VER_O_PESO.cnpjCpf,
    canal: VER_O_PESO.canal,
    contato: VER_O_PESO.telefone,
  },
  {
    chave: "tucuma",
    nome: TUCUMA,
    cnpjCpf: "19.884.302/0001-46",
    canal: "Restaurante / lanchonete",
    contato: "(91) 98123-0077",
  },
  {
    chave: "mercadinho",
    nome: "Mercadinho São João",
    cnpjCpf: "27.905.118/0001-60",
    canal: "Varejo / mercado",
    contato: "(91) 3222-4455",
  },
];
