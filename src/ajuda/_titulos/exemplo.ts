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
  /** Baixa da parcela 1: pendente no roteiro de pagamento; aprovada na conta errada no de estorno; rejeitada no de rejeição. */
  baixa: BaixaExemplo;
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

type BaixaExemplo = {
  data: string;
  /** A conta errada, onde a baixa foi lançada. */
  conta: string;
  valorFormatado: string;
  /** Como a tela mostra os ajustes: "+ juros R$ 12,00". */
  ajuste: string;
  registradaPor: string;
  /** Data e hora do registro no horário de Brasília: "15/10/2026 10:20". */
  registradaEm: string;
  aprovadaPor: string;
  estornadaPor: string;
  /** Data e hora no horário de Brasília: "16/10/2026 09:40". */
  estornadaEm: string;
  motivoEstorno: string;
  rejeitadaPor: string;
  /** Data e hora no horário de Brasília: "15/10/2026 16:05". */
  rejeitadaEm: string;
  motivoRejeicao: string;
  motivoDispensa: string;
};

type OutroTitulo = {
  documento: string;
  classificacao: "Fiscal" | "Gerencial";
  contraparte: string;
  categoria: string;
  parcelas: number;
};
