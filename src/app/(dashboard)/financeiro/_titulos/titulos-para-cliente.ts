type ValorDecimal = number | string | { toString(): string };

type TituloDoServico = {
  contaBancaria: { tipo: string; agencia: string; conta: string; banco: { nome: string } } | null;
  parcelas: { id: string; numero: number; dataVencimento: Date; valorAtualizado: ValorDecimal; status: string }[];
};

/**
 * Prepara o retorno de `listarTitulos` para a tabela (Client Component): o
 * `Decimal` do Prisma não é um "plain object" e gera aviso na serialização.
 * Converte `valorAtualizado` para `number` e descarta o que a tela não usa
 * (baixas das parcelas, colunas da conta bancária como `saldoInicial`).
 */
export function titulosParaCliente<T extends TituloDoServico>(titulos: T[]) {
  return titulos.map(({ contaBancaria, parcelas, ...titulo }) => ({
    ...titulo,
    contaBancaria: contaBancaria
      ? {
          tipo: contaBancaria.tipo,
          agencia: contaBancaria.agencia, conta: contaBancaria.conta, banco: { nome: contaBancaria.banco.nome } }
      : null,
    parcelas: parcelas.map((parcela) => ({
      id: parcela.id,
      numero: parcela.numero,
      dataVencimento: parcela.dataVencimento,
      valorAtualizado: Number(parcela.valorAtualizado.toString()),
      status: parcela.status,
    })),
  }));
}
