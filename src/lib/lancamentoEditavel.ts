import { nomeDaContaBancaria } from "@/lib/contaBancaria";
import { formatarData, formatarMoeda } from "@/lib/formatacao";

/** O que a lista da Tesouraria já carrega de cada lançamento (`listarLancamentos`). */
export type LancamentoDaLista = {
  id: string;
  contaBancariaId: string;
  contaBancaria: Parameters<typeof nomeDaContaBancaria>[0];
  tipo: "ENTRADA" | "SAIDA";
  data: Date;
  valor: { toString(): string } | number | string;
  descricao: string;
  origem: "MANUAL" | "BAIXA" | "TRANSFERENCIA";
  transferenciaId: string | null;
  grupoConciliacaoId: string | null;
  categoriaFinanceiraId: string | null;
  centroCustoId: string | null;
  centroLucroId: string | null;
  safraId: string | null;
  projetoId: string | null;
  classificacaoFiscal: "FISCAL" | "GERENCIAL" | null;
  tipoComprovante: string | null;
  numeroComprovante: string | null;
};

export type LancamentoEditavel = {
  tipo: "manual";
  id: string;
  contaBancariaId: string;
  contaNome: string;
  tipoLancamento: "ENTRADA" | "SAIDA";
  data: string;
  valor: string;
  descricao: string;
  categoriaFinanceiraId: string | null;
  centroCustoId: string | null;
  centroLucroId: string | null;
  safraId: string | null;
  projetoId: string | null;
  classificacaoFiscal: "FISCAL" | "GERENCIAL";
  tipoComprovante: string | null;
  numeroComprovante: string | null;
  ligadoAoExtrato: boolean;
  /** "20/11/2026 · Conta · R$ 459,00", para a confirmação da exclusão. */
  resumo: string;
};

export type TransferenciaEditavel = {
  tipo: "transferencia";
  /** Um dos lados: o serviço exclui os dois a partir de qualquer um. */
  idParaExcluir: string;
  transferenciaId: string;
  contaOrigemId: string;
  contaOrigemNome: string;
  contaDestinoId: string;
  contaDestinoNome: string;
  data: string;
  valor: string;
  descricao: string;
  /** Nome da conta do lado ligado ao extrato, ou null. */
  ladoConciliado: string | null;
  resumo: string;
};

export type Editavel = LancamentoEditavel | TransferenciaEditavel;
export type Opcao = { id: string; nome: string };

/** Valor de um `<input type="date">`: o dia em UTC, como o formulário grava. */
export function paraCampoDeData(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function valorDoCampo(valor: LancamentoDaLista["valor"]): string {
  return Number(valor.toString()).toFixed(2);
}

/**
 * O que o diálogo de edição precisa, por id de lançamento. Baixa fica de fora
 * (corrige-se pelo estorno). Os dois lados de uma transferência apontam para o
 * mesmo objeto; se só um lado estiver na lista, ela fica sem ações.
 */
export function montarEditaveis(lancamentos: readonly LancamentoDaLista[]): Record<string, Editavel> {
  const resultado: Record<string, Editavel> = {};
  const porTransferencia = new Map<string, LancamentoDaLista[]>();

  for (const l of lancamentos) {
    if (l.origem === "MANUAL") {
      const contaNome = nomeDaContaBancaria(l.contaBancaria);
      resultado[l.id] = {
        tipo: "manual",
        id: l.id,
        contaBancariaId: l.contaBancariaId,
        contaNome,
        tipoLancamento: l.tipo,
        data: paraCampoDeData(l.data),
        valor: valorDoCampo(l.valor),
        descricao: l.descricao,
        categoriaFinanceiraId: l.categoriaFinanceiraId,
        centroCustoId: l.centroCustoId,
        centroLucroId: l.centroLucroId,
        safraId: l.safraId,
        projetoId: l.projetoId,
        classificacaoFiscal: l.classificacaoFiscal ?? "FISCAL",
        tipoComprovante: l.tipoComprovante,
        numeroComprovante: l.numeroComprovante,
        ligadoAoExtrato: l.grupoConciliacaoId !== null,
        resumo: `${formatarData(l.data)} · ${contaNome} · ${formatarMoeda(l.valor)}`,
      };
    } else if (l.origem === "TRANSFERENCIA" && l.transferenciaId) {
      porTransferencia.set(l.transferenciaId, [...(porTransferencia.get(l.transferenciaId) ?? []), l]);
    }
  }

  for (const [transferenciaId, lados] of porTransferencia) {
    const saida = lados.find((l) => l.tipo === "SAIDA");
    const entrada = lados.find((l) => l.tipo === "ENTRADA");
    if (lados.length !== 2 || !saida || !entrada) continue;
    const conciliado = lados.find((l) => l.grupoConciliacaoId !== null);
    const contaOrigemNome = nomeDaContaBancaria(saida.contaBancaria);
    const contaDestinoNome = nomeDaContaBancaria(entrada.contaBancaria);
    const editavel: TransferenciaEditavel = {
      tipo: "transferencia",
      idParaExcluir: saida.id,
      transferenciaId,
      contaOrigemId: saida.contaBancariaId,
      contaOrigemNome,
      contaDestinoId: entrada.contaBancariaId,
      contaDestinoNome,
      data: paraCampoDeData(saida.data),
      valor: valorDoCampo(saida.valor),
      descricao: saida.descricao,
      ladoConciliado: conciliado ? nomeDaContaBancaria(conciliado.contaBancaria) : null,
      resumo: `${formatarData(saida.data)} · ${contaOrigemNome} → ${contaDestinoNome} · ${formatarMoeda(saida.valor)}`,
    };
    resultado[saida.id] = editavel;
    resultado[entrada.id] = editavel;
  }

  return resultado;
}

/**
 * As opções ativas mais o cadastro já gravado no lançamento, se ele estiver
 * inativo. Sem isso o campo viria vazio e salvar apagaria a classificação.
 */
export function opcoesComAtual(opcoes: readonly Opcao[], atual: Opcao | null): Opcao[] {
  if (!atual || opcoes.some((o) => o.id === atual.id)) return [...opcoes];
  return [...opcoes, atual];
}

/** As listas do diálogo de edição. A página manda as ativas uma vez só; cada linha, só os extras. */
export type OpcoesDoLancamento = {
  contasBancarias: Opcao[];
  categorias: Opcao[];
  centrosCusto: Opcao[];
  centrosLucro: Opcao[];
  safras: Opcao[];
  projetos: Opcao[];
};

/** O que uma linha acrescenta às listas da página: os cadastros inativos que ela já usa. */
export type ExtrasDoLancamento = Partial<OpcoesDoLancamento>;

/** Os cadastros gravados na linha que não estão entre os ativos (sem repetir). */
export function foraDaBase(base: readonly Opcao[], atuais: readonly (Opcao | null)[]): Opcao[] {
  const extras: Opcao[] = [];
  for (const atual of atuais) {
    if (atual && !base.some((o) => o.id === atual.id) && !extras.some((o) => o.id === atual.id)) extras.push(atual);
  }
  return extras;
}

/** Listas da página mais os extras da linha, para o diálogo de edição. */
export function juntarOpcoes(base: OpcoesDoLancamento, extras: ExtrasDoLancamento): OpcoesDoLancamento {
  const juntar = (chave: keyof OpcoesDoLancamento) =>
    (extras[chave] ?? []).reduce<Opcao[]>((lista, extra) => opcoesComAtual(lista, extra), base[chave]);
  return {
    contasBancarias: juntar("contasBancarias"),
    categorias: juntar("categorias"),
    centrosCusto: juntar("centrosCusto"),
    centrosLucro: juntar("centrosLucro"),
    safras: juntar("safras"),
    projetos: juntar("projetos"),
  };
}
