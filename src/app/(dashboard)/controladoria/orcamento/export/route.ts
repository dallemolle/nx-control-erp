import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarComparativoOrcamento, type LinhaComparativoOrcamento } from "@/server/services/orcamento";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { classificacaoDaUrl } from "@/lib/classificacaoFiscal";
import { cabecalhoDoRelatorio, filtroDeClassificacao } from "@/server/export/cabecalhoDoRelatorio";

function anoValido(valor: string | null): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : new Date().getUTCFullYear();
}

/** O ano inteiro (12 meses × categorias), não só o mês da tela — mais útil numa planilha. */
const COLUNAS: ColunaExport<LinhaComparativoOrcamento>[] = [
  { rotulo: "Ano", valor: (l) => l.ano, tipo: "inteiro" },
  { rotulo: "Mês", valor: (l) => l.mes, tipo: "inteiro" },
  { rotulo: "Categoria", valor: (l) => l.categoriaNome },
  { rotulo: "Orçado", valor: (l) => l.orcado },
  { rotulo: "Realizado", valor: (l) => l.realizado },
  { rotulo: "Projetado", valor: (l) => l.projetado },
  { rotulo: "Variação", valor: (l) => l.variacaoAbsolutaRealizado },
  {
    rotulo: "Variação %",
    valor: (l) => (l.variacaoPercentualRealizado === null ? "" : l.variacaoPercentualRealizado * 100),
    tipo: "percentual",
  },
  { rotulo: "Estouro", valor: (l) => (l.alerta ? "Sim" : "Não") },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "orcamento:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const ano = anoValido(url.searchParams.get("ano"));
  const classificacao = classificacaoDaUrl(url.searchParams.get("classificacao") ?? undefined);

  const linhas = await listarComparativoOrcamento(sessao, ano, { classificacao });
  const ordenadas = [...linhas].sort((a, b) => a.mes - b.mes || a.categoriaNome.localeCompare(b.categoriaNome));

  return responderExport(ordenadas, COLUNAS, {
    nomeArquivo: classificacao ? `orcamento-${ano}-${classificacao.toLowerCase()}` : `orcamento-${ano}`,
    nomeAba: `Orçamento ${ano}`,
    formato: url.searchParams.get("formato"),
    cabecalhoPdf: () =>
      cabecalhoDoRelatorio(sessao, { titulo: `Orçamento ${ano}`, filtros: [filtroDeClassificacao(classificacao)] }),
  });
}
