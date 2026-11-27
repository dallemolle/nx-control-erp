import { nomeDaContaBancaria } from "@/lib/contaBancaria";
import { rejeicaoEmAberto } from "@/lib/financeiro/rejeicaoEmAberto";
import { totalAbatido } from "@/lib/financeiro/valorAbatido";
import { dadosBancariosDaContraparte, type DadosBancariosDoCadastro } from "@/lib/financeiro/dadosBancarios";

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
  avaliadoEm: Date | null;
  motivoRejeicao: string | null;
  dispensadaEm: Date | null;
  motivoDispensa: string | null;
  dispensadaPor: { nome: string } | null;
  lancamentos: { grupoConciliacaoId: string | null }[];
  repasseRecebimento: { id: string } | null;
  repasseTaxa: { id: string } | null;
};

type TituloDoServico = {
  contaBancaria: ContaDoServico | null;
  /** Com o banco do cadastro (consulta da tela); sem ele, não há dados bancários a mostrar. */
  fornecedor?: (DadosBancariosDoCadastro & { nome: string }) | null;
  cliente?: (DadosBancariosDoCadastro & { nome: string }) | null;
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
  status: "PENDENTE" | "APROVADO" | "REJEITADO" | "ESTORNADO";
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
  rejeitadaPor: string | null;
  rejeitadaEm: Date | null;
  motivoRejeicao: string | null;
  /** Rejeitada que ainda pede ação: aparece em destaque, com Dispensar, e conta no aviso. */
  rejeicaoEmAberto: boolean;
  dispensadaPor: string | null;
  dispensadaEm: Date | null;
  motivoDispensa: string | null;
  /** Algum lançamento da baixa está num grupo de conciliação. */
  conciliada: boolean;
  /** Baixa criada pela confirmação de um repasse de cartão. */
  deRepasse: boolean;
};

const numero = (valor: ValorDecimal) => Number(valor.toString());

/** a − b em centavos: evita o resto de ponto flutuante (150.25 − 100.1). */
const subtrairEmCentavos = (a: number, b: number) => (Math.round(a * 100) - Math.round(b * 100)) / 100;

/** Todas as baixas da parcela: pendentes, aprovadas, rejeitadas e estornadas. */
function baixasParaCliente(parcela: { status: string; baixas: BaixaDoServico[] }): BaixaDaParcela[] {
  return [...parcela.baixas]
    .sort((a, b) => a.data.getTime() - b.data.getTime() || a.criadoEm.getTime() - b.criadoEm.getTime())
    .map((b) => {
      const rejeitada = b.statusAprovacao === "REJEITADO";
      return {
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
        aprovadaPor: rejeitada ? null : (b.avaliadoPor?.nome ?? null),
        estornadaPor: b.estornadoPor?.nome ?? null,
        estornadaEm: b.estornadoEm,
        motivoEstorno: b.motivoEstorno,
        rejeitadaPor: rejeitada ? (b.avaliadoPor?.nome ?? null) : null,
        rejeitadaEm: rejeitada ? b.avaliadoEm : null,
        motivoRejeicao: rejeitada ? b.motivoRejeicao : null,
        rejeicaoEmAberto: rejeicaoEmAberto(
          {
            id: b.id,
            statusAprovacao: b.statusAprovacao,
            criadoEm: b.criadoEm,
            avaliadoEm: b.avaliadoEm,
            dispensadaEm: b.dispensadaEm,
          },
          parcela.baixas,
          parcela.status,
        ),
        dispensadaPor: b.dispensadaPor?.nome ?? null,
        dispensadaEm: b.dispensadaEm,
        motivoDispensa: b.motivoDispensa,
        conciliada: b.lancamentos.some((l) => l.grupoConciliacaoId !== null),
        deRepasse: b.repasseRecebimento !== null || b.repasseTaxa !== null,
      };
    });
}

function dadosBancariosDoTitulo(titulo: Pick<TituloDoServico, "fornecedor" | "cliente">): string | null {
  const contraparte = titulo.fornecedor ?? titulo.cliente;
  return contraparte ? dadosBancariosDaContraparte(contraparte) : null;
}

/**
 * Prepara o retorno de `listarTitulos` para a tabela (Client Component): o
 * `Decimal` do Prisma não é um "plain object" e gera aviso na serialização.
 * Converte os valores para `number` e descarta o que a tela não usa
 * (colunas da conta bancária como `saldoInicial`).
 */
export function titulosParaCliente<T extends TituloDoServico>(titulos: T[]) {
  return titulos.map(({ contaBancaria, parcelas, ...titulo }) => ({
    ...titulo,
    /** Pix ou depósito do fornecedor/cliente, numa linha (`dadosBancariosDaContraparte`). */
    dadosBancarios: dadosBancariosDoTitulo(titulo),
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
      saldoEmAberto: subtrairEmCentavos(
        numero(parcela.valorAtualizado),
        totalAbatido(
          parcela.baixas
            .filter((b) => b.statusAprovacao === "APROVADO")
            .map((b) => ({
              valorPago: numero(b.valorPago),
              valorJuros: numero(b.valorJuros),
              valorMulta: numero(b.valorMulta),
              valorDesconto: numero(b.valorDesconto),
            })),
        ),
      ),
      status: parcela.status,
      baixas: baixasParaCliente(parcela),
      temBaixaPendente: parcela.baixas.some((b) => b.statusAprovacao === "PENDENTE"),
    })),
  }));
}
