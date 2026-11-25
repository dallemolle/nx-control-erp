import { nomeDaContaBancaria } from "@/lib/contaBancaria";

type ValorDecimal = number | string | { toString(): string };

type ContaDoServico = { tipo: string; agencia: string; conta: string; banco: { nome: string } };

type BaixaDoServico = {
  id: string;
  data: Date;
  criadoEm: Date;
  statusAprovacao: string;
  valorPago: ValorDecimal;
  valorJuros: ValorDecimal;
  valorMulta: ValorDecimal;
  valorDesconto: ValorDecimal;
  contaBancaria: ContaDoServico;
  usuario: { nome: string };
  avaliadoPor: { nome: string } | null;
  estornadoPor: { nome: string } | null;
  estornadoEm: Date | null;
  motivoEstorno: string | null;
  lancamentos: { grupoConciliacaoId: string | null }[];
  repasseRecebimento: { id: string } | null;
  repasseTaxa: { id: string } | null;
};

type TituloDoServico = {
  contaBancaria: ContaDoServico | null;
  parcelas: {
    id: string;
    numero: number;
    dataVencimento: Date;
    valorAtualizado: ValorDecimal;
    status: string;
    baixas: BaixaDoServico[];
  }[];
};

export type BaixaDaParcela = {
  id: string;
  data: Date;
  /** Quando a baixa foi registrada (a tela mostra na pendente). */
  registradaEm: Date;
  status: "PENDENTE" | "APROVADO" | "ESTORNADO";
  valorPago: number;
  valorJuros: number;
  valorMulta: number;
  valorDesconto: number;
  /** Nome pronto (`nomeDaContaBancaria`). */
  conta: string;
  registradaPor: string;
  aprovadaPor: string | null;
  estornadaPor: string | null;
  estornadaEm: Date | null;
  motivoEstorno: string | null;
  /** Algum lançamento da baixa está num grupo de conciliação. */
  conciliada: boolean;
  /** Baixa criada pela confirmação de um repasse de cartão. */
  deRepasse: boolean;
};

const numero = (valor: ValorDecimal) => Number(valor.toString());

/** As que esperam aprovação ou mexeram no saldo: pendentes, aprovadas e estornadas (rejeitadas são o item 5 do backlog). */
function baixasParaCliente(baixas: BaixaDoServico[]): BaixaDaParcela[] {
  return baixas
    .filter((b) => b.statusAprovacao === "PENDENTE" || b.statusAprovacao === "APROVADO" || b.statusAprovacao === "ESTORNADO")
    .sort((a, b) => a.data.getTime() - b.data.getTime() || a.criadoEm.getTime() - b.criadoEm.getTime())
    .map((b) => ({
      id: b.id,
      data: b.data,
      registradaEm: b.criadoEm,
      status: b.statusAprovacao as BaixaDaParcela["status"],
      valorPago: numero(b.valorPago),
      valorJuros: numero(b.valorJuros),
      valorMulta: numero(b.valorMulta),
      valorDesconto: numero(b.valorDesconto),
      conta: nomeDaContaBancaria(b.contaBancaria),
      registradaPor: b.usuario.nome,
      aprovadaPor: b.avaliadoPor?.nome ?? null,
      estornadaPor: b.estornadoPor?.nome ?? null,
      estornadaEm: b.estornadoEm,
      motivoEstorno: b.motivoEstorno,
      conciliada: b.lancamentos.some((l) => l.grupoConciliacaoId !== null),
      deRepasse: b.repasseRecebimento !== null || b.repasseTaxa !== null,
    }));
}

/**
 * Prepara o retorno de `listarTitulos` para a tabela (Client Component): o
 * `Decimal` do Prisma não é um "plain object" e gera aviso na serialização.
 * Converte os valores para `number` e descarta o que a tela não usa
 * (colunas da conta bancária como `saldoInicial`, baixas rejeitadas).
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
      valorAtualizado: numero(parcela.valorAtualizado),
      status: parcela.status,
      baixas: baixasParaCliente(parcela.baixas),
      temBaixaPendente: parcela.baixas.some((b) => b.statusAprovacao === "PENDENTE"),
    })),
  }));
}
