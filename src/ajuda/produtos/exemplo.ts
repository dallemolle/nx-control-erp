/**
 * Exemplo fixo da ajuda de Produtos. Hoje é 21/11/2026. A lista tem os produtos das ajudas da Produção e de Vendas
 * (os lotes do Estoque e o rateio da OP batem com eles; o teste confere) e a ACR, polpa de acerola resfriada que a
 * fazenda deixou de fazer. A Maria, da Produção, cadastra a AGR, açaí grosso resfriado. Fictício.
 */
export const HOJE = "21/11/2026";

export type ProdutoDaLista = {
  codigo: string;
  descricao: string;
  fruta: string;
  categoria: "Fruto" | "Polpa";
  conservacao: "In natura" | "Resfriado" | "Congelado";
  validadeDias: number;
  precoReferenciaKg: number | null;
  /** "rasa = 14 kg", como a lista mostra; null = sem unidade comercial. */
  unidade: { nome: string; kg: number } | null;
  diasLiberacao: number | null;
};

/** Já cadastrados, em ordem de código (a lista segue essa ordem). */
export const PRODUTOS: readonly ProdutoDaLista[] = [
  {
    codigo: "ACC",
    descricao: "Polpa de acerola – congelada",
    fruta: "Acerola",
    categoria: "Polpa",
    conservacao: "Congelado",
    validadeDias: 365,
    precoReferenciaKg: 10,
    unidade: null,
    diasLiberacao: null,
  },
  {
    codigo: "ACR",
    descricao: "Polpa de acerola – resfriada",
    fruta: "Acerola",
    categoria: "Polpa",
    conservacao: "Resfriado",
    validadeDias: 3,
    precoReferenciaKg: 9,
    unidade: null,
    diasLiberacao: null,
  },
  {
    codigo: "AGC",
    descricao: "Polpa de açaí grosso/especial – congelada",
    fruta: "Açaí",
    categoria: "Polpa",
    conservacao: "Congelado",
    validadeDias: 365,
    precoReferenciaKg: 18,
    unidade: null,
    diasLiberacao: null,
  },
  {
    codigo: "AMC",
    descricao: "Polpa de açaí médio/regular – congelada",
    fruta: "Açaí",
    categoria: "Polpa",
    conservacao: "Congelado",
    validadeDias: 365,
    precoReferenciaKg: 12,
    unidade: null,
    diasLiberacao: null,
  },
  {
    codigo: "AMR",
    descricao: "Açaí médio/regular – resfriado",
    fruta: "Açaí",
    categoria: "Polpa",
    conservacao: "Resfriado",
    validadeDias: 2,
    precoReferenciaKg: 11.8,
    unidade: null,
    diasLiberacao: null,
  },
  {
    codigo: "FA",
    descricao: "Fruto de açaí",
    fruta: "Açaí",
    categoria: "Fruto",
    conservacao: "In natura",
    validadeDias: 1,
    precoReferenciaKg: null,
    unidade: { nome: "rasa", kg: 14 },
    diasLiberacao: null,
  },
  {
    codigo: "FC",
    descricao: "Fruto de acerola",
    fruta: "Acerola",
    categoria: "Fruto",
    conservacao: "In natura",
    validadeDias: 2,
    precoReferenciaKg: null,
    unidade: null,
    diasLiberacao: 2,
  },
];

/** O que a Maria cadastra. */
export const AGR = {
  codigo: "AGR",
  descricao: "Açaí grosso/especial – resfriado",
  fruta: "Açaí",
  categoria: "Polpa",
  conservacao: "Resfriado",
  validadeDias: 2,
  precoReferenciaKg: 16,
  armazenamento: "0 a 5 °C",
  textoEtiqueta: "Ingredientes: polpa de açaí e água. Manter refrigerado. Depois de aberto, consumir em 24 horas.",
} as const;

/** O primeiro lote de AGR numa OP de hoje e a validade dele (o teste confere com calcularValidade). */
export const PRIMEIRO_LOTE_AGR = "AGR-261121-01";
export const VALIDADE_AGR = "23/11/2026";

/** O FA na Recepção de fruto: 50 rasas de 14 kg. */
export const RASAS = 50;

/** O FC-261117-01 da ajuda do Estoque: venceu em 19/11; com 2 dias de liberação, pode sair até 21/11. */
export const LOTE_VENCIDO = { codigo: "FC-261117-01", validade: "19/11/2026", liberadoAte: "21/11/2026" } as const;
