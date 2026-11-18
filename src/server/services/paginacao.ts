export const LIMITE_PADRAO_PAGINA = 100;
export const LIMITE_MAXIMO_PAGINA = 500;

export type Paginacao = { limite: number; cursor?: string };
export type Pagina<T> = { itens: T[]; proximoCursor: string | null };

/** O cursor não é um registro da listagem pedida (outra filial, outro tipo ou inexistente). */
export class CursorInvalidoError extends Error {
  constructor() {
    super("Cursor inválido para esta listagem");
    this.name = "CursorInvalidoError";
  }
}

/** Argumentos do `findMany`: busca uma linha a mais para saber se existe próxima página. */
export function argumentosDeCursor(paginacao: Paginacao) {
  return {
    take: paginacao.limite + 1,
    ...(paginacao.cursor && { cursor: { id: paginacao.cursor }, skip: 1 }),
  };
}

/** Recebe até `limite + 1` linhas; a linha extra só indica que há próxima página. */
export function montarPagina<T extends { id: string }>(linhas: T[], limite: number): Pagina<T> {
  const temMais = linhas.length > limite;
  const itens = temMais ? linhas.slice(0, limite) : linhas;
  return { itens, proximoCursor: temMais ? itens[itens.length - 1].id : null };
}
