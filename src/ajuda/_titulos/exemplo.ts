import type { StatusParcela } from "@prisma/client";

/**
 * A história fixa que as cenas de títulos mostram. Cada tela (Contas a pagar, Contas a receber) tem a sua;
 * as cenas são as mesmas (`criarCenas`).
 */
export type ExemploTitulos = {
  /** Fornecedor ou cliente. */
  contraparte: string;
  documento: string;
  emissao: string;
  competencia: string;
  categoria: string;
  centroCusto?: string;
  centroLucro?: string;
  safra?: string;
  conta: string;
  formaPagamento: string;
  classificacao: string;
  tipoComprovante: string;
  numeroNota: string;
  serie: string;
  chave: string;
  /** Três parcelas: as cenas de cadastro desenham até três linhas. */
  parcelas: readonly [ParcelaExemplo, ParcelaExemplo, ParcelaExemplo];
  /** As duas parcelas novas da renegociação. */
  renegociacao: readonly [ParcelaNova, ParcelaNova];
  /** Outros títulos da lista, para a réplica não parecer vazia. */
  outrosTitulos: readonly OutroTitulo[];
};

type ParcelaExemplo = {
  numero: number;
  vencimento: string;
  /** Como se digita no formulário: "1000,00". */
  valor: string;
  /** Como a lista mostra: "R$ 1.000,00". */
  valorFormatado: string;
  status: StatusParcela;
};

type ParcelaNova = { vencimento: string; valor: string };

type OutroTitulo = {
  documento: string;
  classificacao: "Fiscal" | "Gerencial";
  contraparte: string;
  categoria: string;
  parcelas: number;
};
