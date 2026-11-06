import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarFluxoDeCaixaProjetado, type ModoJanelaProjetado } from "@/server/services/fluxoDeCaixaProjetado";
import { formatarRotuloPeriodo } from "../../_fluxo-de-caixa/formatar-rotulo-periodo";
import { dataValida } from "../../_fluxo-de-caixa/data-valida";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { classificacaoDaUrl } from "@/lib/classificacaoFiscal";
import { cabecalhoDoRelatorio, filtroDeClassificacao } from "@/server/export/cabecalhoDoRelatorio";

const MODOS_VALIDOS: ModoJanelaProjetado[] = ["MOVEL", "ANO_CIVIL"];

const ROTULOS_MODO: Record<ModoJanelaProjetado, string> = { MOVEL: "Móvel (12 meses)", ANO_CIVIL: "Ano civil" };

function modoValido(valor: string | null): ModoJanelaProjetado {
  return MODOS_VALIDOS.includes(valor as ModoJanelaProjetado) ? (valor as ModoJanelaProjetado) : "MOVEL";
}

type LinhaExport = {
  mes: string;
  saldoInicial: number;
  entradasProjetadas: number;
  saidasProjetadas: number;
  geracaoLiquida: number;
  saldoFinal: number;
  alerta: boolean;
};

/** Na visão filtrada por classificação o saldo vira "acumulado" (o saldo bancário não se divide). */
function colunas(filtrado: boolean): ColunaExport<LinhaExport>[] {
  return [
    { rotulo: "Mês", valor: (l) => l.mes },
    { rotulo: filtrado ? "Acumulado inicial" : "Saldo inicial", valor: (l) => l.saldoInicial },
    { rotulo: "Entradas projetadas", valor: (l) => l.entradasProjetadas },
    { rotulo: "Saídas projetadas", valor: (l) => l.saidasProjetadas },
    { rotulo: "Geração líquida", valor: (l) => l.geracaoLiquida },
    { rotulo: filtrado ? "Acumulado final" : "Saldo final", valor: (l) => l.saldoFinal },
    { rotulo: "Saldo negativo", valor: (l) => (l.alerta ? "Sim" : "Não") },
  ];
}

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "titulo:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const modo = modoValido(url.searchParams.get("modo"));
  const dataReferencia = dataValida(url.searchParams.get("data") ?? undefined);
  const classificacao = classificacaoDaUrl(url.searchParams.get("classificacao") ?? undefined);

  const periodos = await listarFluxoDeCaixaProjetado(sessao, modo, dataReferencia, { classificacao });
  const linhas: LinhaExport[] = periodos.map((periodo) => ({
    mes: formatarRotuloPeriodo("MES", periodo.inicio, periodo.fim),
    saldoInicial: periodo.saldoInicial,
    entradasProjetadas: periodo.entradasProjetadas,
    saidasProjetadas: periodo.saidasProjetadas,
    geracaoLiquida: periodo.geracaoLiquida,
    saldoFinal: periodo.saldoFinal,
    alerta: periodo.alerta,
  }));

  return responderExport(linhas, colunas(classificacao !== undefined), {
    nomeArquivo: classificacao ? `fluxo-de-caixa-projetado-${classificacao.toLowerCase()}` : "fluxo-de-caixa-projetado",
    nomeAba: "Fluxo projetado",
    formato: url.searchParams.get("formato"),
    cabecalhoPdf: () =>
      cabecalhoDoRelatorio(sessao, {
        titulo: "Fluxo de caixa projetado",
        filtros: [`Janela: ${ROTULOS_MODO[modo]}`, filtroDeClassificacao(classificacao)],
      }),
  });
}
