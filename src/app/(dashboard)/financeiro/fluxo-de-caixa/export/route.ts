import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarFluxoDeCaixaRealizado, type Granularidade } from "@/server/services/fluxoDeCaixa";
import { formatarRotuloPeriodo } from "../../_fluxo-de-caixa/formatar-rotulo-periodo";
import { dataValida } from "../../_fluxo-de-caixa/data-valida";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { classificacaoDaUrl } from "@/lib/classificacaoFiscal";

const GRANULARIDADES_VALIDAS: Granularidade[] = ["DIA", "SEMANA", "MES", "ANO"];

function granularidadeValida(valor: string | null): Granularidade {
  return GRANULARIDADES_VALIDAS.includes(valor as Granularidade) ? (valor as Granularidade) : "MES";
}

type LinhaExport = {
  periodo: string;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  geracaoLiquida: number;
  saldoFinal: number;
};

/** Na visão filtrada por classificação o saldo vira "acumulado" (o saldo bancário não se divide). */
function colunas(filtrado: boolean): ColunaExport<LinhaExport>[] {
  return [
    { rotulo: "Período", valor: (l) => l.periodo },
    { rotulo: filtrado ? "Acumulado inicial" : "Saldo inicial", valor: (l) => l.saldoInicial },
    { rotulo: "Entradas", valor: (l) => l.entradas },
    { rotulo: "Saídas", valor: (l) => l.saidas },
    { rotulo: "Geração líquida", valor: (l) => l.geracaoLiquida },
    { rotulo: filtrado ? "Acumulado final" : "Saldo final", valor: (l) => l.saldoFinal },
  ];
}

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "lancamento:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const granularidade = granularidadeValida(url.searchParams.get("granularidade"));
  const dataReferencia = dataValida(url.searchParams.get("data") ?? undefined);

  const classificacao = classificacaoDaUrl(url.searchParams.get("classificacao") ?? undefined);

  const periodos = await listarFluxoDeCaixaRealizado(sessao, granularidade, dataReferencia, { classificacao });
  const linhas: LinhaExport[] = periodos.map((periodo) => ({
    periodo: formatarRotuloPeriodo(granularidade, periodo.inicio, periodo.fim),
    saldoInicial: periodo.saldoInicial,
    entradas: periodo.entradas,
    saidas: periodo.saidas,
    geracaoLiquida: periodo.geracaoLiquida,
    saldoFinal: periodo.saldoFinal,
  }));

  const formato = url.searchParams.get("formato");
  return responderExport(linhas, colunas(classificacao !== undefined), {
    nomeArquivo: classificacao ? `fluxo-de-caixa-${classificacao.toLowerCase()}` : "fluxo-de-caixa",
    nomeAba: "Fluxo de caixa",
    formato,
  });
}
