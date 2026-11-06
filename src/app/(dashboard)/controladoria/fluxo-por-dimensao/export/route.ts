import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import {
  listarFluxoDeCaixaPorDimensao,
  type LinhaFluxoPorDimensao,
  type TipoDimensao,
} from "@/server/services/fluxoDeCaixaPorDimensao";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { classificacaoDaUrl } from "@/lib/classificacaoFiscal";
import { cabecalhoDoRelatorio, filtroDeClassificacao } from "@/server/export/cabecalhoDoRelatorio";

const ROTULOS_DIMENSAO: Record<TipoDimensao, string> = {
  CENTRO_CUSTO: "Centro de custo",
  CENTRO_LUCRO: "Centro de lucro",
  SAFRA: "Safra",
  PROJETO: "Projeto",
};

function dimensaoValida(valor: string | null): TipoDimensao {
  return valor !== null && valor in ROTULOS_DIMENSAO ? (valor as TipoDimensao) : "CENTRO_CUSTO";
}

function anoValido(valor: string | null): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : new Date().getUTCFullYear();
}

function mesValido(valor: string | null): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 1 && numero <= 12 ? numero : new Date().getUTCMonth() + 1;
}

function colunas(dimensao: TipoDimensao): ColunaExport<LinhaFluxoPorDimensao>[] {
  return [
    { rotulo: ROTULOS_DIMENSAO[dimensao], valor: (l) => l.dimensaoNome },
    { rotulo: "Entradas realizadas", valor: (l) => l.entradasRealizadas },
    { rotulo: "Saídas realizadas", valor: (l) => l.saidasRealizadas },
    { rotulo: "Entradas projetadas", valor: (l) => l.entradasProjetadas },
    { rotulo: "Saídas projetadas", valor: (l) => l.saidasProjetadas },
    {
      rotulo: "Saldo",
      valor: (l) => l.entradasRealizadas - l.saidasRealizadas + l.entradasProjetadas - l.saidasProjetadas,
    },
  ];
}

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "titulo:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const dimensao = dimensaoValida(url.searchParams.get("dimensao"));
  const ano = anoValido(url.searchParams.get("ano"));
  const mes = mesValido(url.searchParams.get("mes"));
  const classificacao = classificacaoDaUrl(url.searchParams.get("classificacao") ?? undefined);

  const linhas = await listarFluxoDeCaixaPorDimensao(sessao, dimensao, ano, mes, { classificacao });
  const periodo = `${ano}-${String(mes).padStart(2, "0")}`;

  return responderExport(linhas, colunas(dimensao), {
    nomeArquivo: `fluxo-por-${dimensao.toLowerCase().replace("_", "-")}-${periodo}${
      classificacao ? `-${classificacao.toLowerCase()}` : ""
    }`,
    nomeAba: ROTULOS_DIMENSAO[dimensao],
    formato: url.searchParams.get("formato"),
    cabecalhoPdf: () =>
      cabecalhoDoRelatorio(sessao, {
        titulo: `Fluxo de caixa por ${ROTULOS_DIMENSAO[dimensao].toLowerCase()}`,
        filtros: [`Período: ${String(mes).padStart(2, "0")}/${ano}`, filtroDeClassificacao(classificacao)],
      }),
  });
}
