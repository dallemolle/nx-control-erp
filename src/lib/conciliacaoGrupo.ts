/**
 * Conta da conciliação em grupo, sem I/O — usada pelo serviço (que confere)
 * e pelo dialog (que mostra os totais enquanto o usuário marca os itens).
 * Tudo em centavos inteiros para não acumular erro de ponto flutuante.
 */
export type ItemComSinal = { valor: number; tipo: "ENTRADA" | "SAIDA" };

export function somaEmCentavos(itens: ItemComSinal[]): number {
  return itens.reduce((total, item) => {
    const centavos = Math.round(item.valor * 100);
    return item.tipo === "ENTRADA" ? total + centavos : total - centavos;
  }, 0);
}

/** Σ linhas − Σ lançamentos. Zero = o grupo fecha; positivo = falta uma ENTRADA; negativo = falta uma SAIDA. */
export function diferencaDoGrupo(linhas: ItemComSinal[], lancamentos: ItemComSinal[]): number {
  return somaEmCentavos(linhas) - somaEmCentavos(lancamentos);
}
