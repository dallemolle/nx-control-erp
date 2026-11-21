import { CNPJ_MATRIZ, VOCE } from "@/ajuda/usuarios/exemplo";

/**
 * O exemplo de Empresas: o Paulo Andrade (Administrador, o mesmo da ajuda de Usuários) administra três empresas do
 * grupo. Está na Empresa Demonstração; cadastra a Agro Boa Vista (o sítio vizinho, comprado com CNPJ próprio) e
 * inativa a Polpas Rio Pará, encerrada. No Tema e marca, deixa a Empresa Demonstração com a cor do açaí.
 * Fictício e fixo.
 */
export const VOCE_NOME = VOCE.nome;

export type EmpresaExemplo = {
  chave: string;
  nomeFantasia: string;
  razaoSocial: string;
  cnpjCpf: string;
  moeda: string;
  exigirAprovacaoPorOutro: boolean;
};

/** A empresa em que você está. O CNPJ é o mesmo da Matriz (a Matriz nasce com o CNPJ da empresa). */
export const DEMONSTRACAO: EmpresaExemplo = {
  chave: "demonstracao",
  nomeFantasia: "Empresa Demonstração",
  razaoSocial: "Empresa Demonstração Ltda",
  cnpjCpf: CNPJ_MATRIZ,
  moeda: "BRL",
  exigirAprovacaoPorOutro: true,
};

export const RIO_PARA: EmpresaExemplo = {
  chave: "rio-para",
  nomeFantasia: "Polpas Rio Pará",
  razaoSocial: "Polpas Rio Pará Indústria Ltda",
  cnpjCpf: "34.567.890/0001-12",
  moeda: "BRL",
  exigirAprovacaoPorOutro: true,
};

/** A nova: só uma pessoa no financeiro, então a aprovação por outra pessoa é desmarcada depois. */
export const BOA_VISTA: EmpresaExemplo & { cnpjDigitado: string } = {
  chave: "boa-vista",
  nomeFantasia: "Agro Boa Vista",
  razaoSocial: "Agro Boa Vista Agropecuária Ltda",
  cnpjDigitado: "23456789000108",
  cnpjCpf: "23.456.789/0001-08",
  moeda: "BRL",
  exigirAprovacaoPorOutro: true,
};

export const EMPRESAS: readonly EmpresaExemplo[] = [DEMONSTRACAO, RIO_PARA];

/**
 * Tema da Empresa Demonstração: a primária vira roxo-açaí. Primeiro o Paulo tenta um lilás claro, que reprova no
 * contraste com o texto branco dos botões; o roxo escuro passa. Conferido no teste com `contraste`.
 */
export const TEMA = {
  nome: "Açaí da Demonstração",
  textoSobrePrimaria: "#ffffff",
  primariaReprovada: "#c9a3d6",
  primaria: "#4a1f5c",
  fundo: "#ffffff",
  texto: "#1a1a1a",
  sidebar: "#2e1238",
  textoSobreSidebar: "#ffffff",
} as const;

export const LIMITE_IMAGEM_MB = 1;
