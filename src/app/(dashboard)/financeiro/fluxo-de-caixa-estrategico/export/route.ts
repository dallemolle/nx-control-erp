import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import {
  listarProjecaoEstrategica,
  TIPOS_CENARIO,
  type AnoProjetadoEstrategico,
} from "@/server/services/fluxoDeCaixaEstrategico";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { classificacaoDaUrl } from "@/lib/classificacaoFiscal";
import { cabecalhoDoRelatorio, filtroDeClassificacao } from "@/server/export/cabecalhoDoRelatorio";

const LABEL_CENARIO: Record<(typeof TIPOS_CENARIO)[number], string> = {
  BASE: "Base",
  OTIMISTA: "Otimista",
  PESSIMISTA: "Pessimista",
};

type LinhaExport = AnoProjetadoEstrategico & { cenario: string };

/**
 * Uma linha por cenário × ano (a tela mostra uma matriz por cenário; em
 * planilha, formato longo filtra melhor). Na visão filtrada por classificação
 * o saldo vira "acumulado" (parte de zero — decisão FG5).
 */
function colunas(filtrado: boolean): ColunaExport<LinhaExport>[] {
  return [
    { rotulo: "Cenário", valor: (l) => l.cenario },
    { rotulo: "Ano", valor: (l) => l.ano, tipo: "inteiro" },
    { rotulo: "Receita", valor: (l) => l.receita },
    { rotulo: "Custo operacional", valor: (l) => l.custoOperacional },
    { rotulo: "CAPEX", valor: (l) => l.capex },
    { rotulo: "Juros", valor: (l) => l.jurosSobreDivida },
    { rotulo: "Geração líquida", valor: (l) => l.geracaoLiquida },
    { rotulo: filtrado ? "Acumulado de caixa" : "Saldo de caixa", valor: (l) => l.saldoCaixa },
    { rotulo: "Margem líquida %", valor: (l) => l.margemLiquida * 100, tipo: "percentual" },
  ];
}

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "planejamentoEstrategico:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const classificacao = classificacaoDaUrl(url.searchParams.get("classificacao") ?? undefined);
  const { projecoes } = await listarProjecaoEstrategica(sessao, { classificacao });
  const linhas: LinhaExport[] = TIPOS_CENARIO.flatMap((tipo) =>
    projecoes[tipo].map((ano) => ({ ...ano, cenario: LABEL_CENARIO[tipo] })),
  );

  return responderExport(linhas, colunas(classificacao !== undefined), {
    nomeArquivo: classificacao
      ? `fluxo-de-caixa-estrategico-${classificacao.toLowerCase()}`
      : "fluxo-de-caixa-estrategico",
    nomeAba: "Fluxo estratégico",
    formato: url.searchParams.get("formato"),
    cabecalhoPdf: () =>
      cabecalhoDoRelatorio(sessao, {
        titulo: "Fluxo de caixa estratégico (5 anos)",
        consolidado: true,
        filtros: [filtroDeClassificacao(classificacao)],
      }),
  });
}
