import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarLancamentos } from "@/server/services/lancamentoBancario";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { classificacaoDaUrl } from "@/lib/classificacaoFiscal";
import { cabecalhoDoRelatorio, filtroDeClassificacao } from "@/server/export/cabecalhoDoRelatorio";
import { ROTULOS_CLASSIFICACAO_FISCAL, ROTULOS_TIPO_COMPROVANTE } from "@/lib/schemas/enums";

type Lancamento = Awaited<ReturnType<typeof listarLancamentos>>[number];

const ORIGEM_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  BAIXA: "Baixa",
  TRANSFERENCIA: "Transferência",
};

/** Movimentação bancária — as mesmas linhas da tela de Tesouraria. */
const COLUNAS: ColunaExport<Lancamento>[] = [
  { rotulo: "Data", valor: (l) => l.data },
  { rotulo: "Banco", valor: (l) => l.contaBancaria.banco.nome },
  { rotulo: "Agência", valor: (l) => l.contaBancaria.agencia },
  { rotulo: "Conta", valor: (l) => l.contaBancaria.conta },
  { rotulo: "Tipo", valor: (l) => (l.tipo === "ENTRADA" ? "Entrada" : "Saída") },
  { rotulo: "Valor", valor: (l) => Number(l.valor) },
  { rotulo: "Origem", valor: (l) => ORIGEM_LABEL[l.origem] ?? l.origem },
  { rotulo: "Conciliado", valor: (l) => (l.conciliado ? "Sim" : "Não") },
  {
    rotulo: "Classificação",
    valor: (l) => (l.classificacaoFiscal ? ROTULOS_CLASSIFICACAO_FISCAL[l.classificacaoFiscal] : ""),
  },
  { rotulo: "Tipo de comprovante", valor: (l) => (l.tipoComprovante ? ROTULOS_TIPO_COMPROVANTE[l.tipoComprovante] : "") },
  { rotulo: "Nº do comprovante", valor: (l) => l.numeroComprovante ?? "" },
  { rotulo: "Descrição", valor: (l) => l.descricao },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "lancamento:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const classificacao = classificacaoDaUrl(url.searchParams.get("classificacao") ?? undefined);
  const lancamentos = await listarLancamentos(sessao.filialId, { classificacao });

  return responderExport(lancamentos, COLUNAS, {
    nomeArquivo: classificacao ? `movimentacao-bancaria-${classificacao.toLowerCase()}` : "movimentacao-bancaria",
    nomeAba: "Movimentação bancária",
    formato: url.searchParams.get("formato"),
    cabecalhoPdf: () =>
      cabecalhoDoRelatorio(sessao, { titulo: "Movimentação bancária", filtros: [filtroDeClassificacao(classificacao)] }),
  });
}
