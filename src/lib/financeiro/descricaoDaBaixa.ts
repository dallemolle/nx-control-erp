/**
 * Descrição do lançamento bancário gerado ao aprovar uma baixa: diz de qual título ele é, para a Tesouraria e a
 * Conciliação não mostrarem várias baixas iguais. A migration `20261127120000_descricao_lancamento_baixa` reescreve
 * os lançamentos antigos no mesmo formato: mudou aqui, mude lá.
 */
export function descricaoDoLancamentoDaBaixa(dados: {
  documento: string;
  contraparte: string | null;
  parcela: number;
  totalParcelas: number;
}): string {
  const contraparte = dados.contraparte?.trim();
  return [dados.documento.trim(), contraparte, `parcela ${dados.parcela}/${dados.totalParcelas}`]
    .filter(Boolean)
    .join(" · ");
}
