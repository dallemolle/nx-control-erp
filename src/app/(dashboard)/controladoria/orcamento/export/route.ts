import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { comparativoEmArvore, listarComparativoOrcamento, type ItemComparativo } from "@/server/services/orcamento";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { classificacaoDaUrl } from "@/lib/classificacaoFiscal";
import { cabecalhoDoRelatorio, filtroDeClassificacao } from "@/server/export/cabecalhoDoRelatorio";

function anoValido(valor: string | null): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : new Date().getUTCFullYear();
}

/** O ano inteiro (12 meses × categorias), não só o mês da tela — mais útil numa planilha. */
const COLUNAS: ColunaExport<ItemComparativo>[] = [
  { rotulo: "Ano", valor: (l) => l.ano, tipo: "inteiro" },
  { rotulo: "Mês", valor: (l) => l.mes, tipo: "inteiro" },
  { rotulo: "Nível", valor: (l) => l.nivel, tipo: "inteiro" },
  { rotulo: "Categoria", valor: (l) => `${"  ".repeat(l.nivel - 1)}${l.categoriaNome}` },
  { rotulo: "Orçado", valor: (l) => l.orcado },
  { rotulo: "Realizado", valor: (l) => l.realizado },
  { rotulo: "Projetado", valor: (l) => l.projetado },
  { rotulo: "Previsto", valor: (l) => l.previsto },
  { rotulo: "Variação", valor: (l) => l.variacaoAbsoluta },
  {
    rotulo: "Variação %",
    valor: (l) => (l.variacaoPercentual === null ? "" : l.variacaoPercentual * 100),
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
  // Mês a mês, cada um em árvore de categorias (o pai com o total do grupo, como na tela).
  const ordenadas = Array.from({ length: 12 }, (_, i) => comparativoEmArvore(linhas.filter((l) => l.mes === i + 1))).flat();

  return responderExport(ordenadas, COLUNAS, {
    nomeArquivo: classificacao ? `orcamento-${ano}-${classificacao.toLowerCase()}` : `orcamento-${ano}`,
    nomeAba: `Orçamento ${ano}`,
    formato: url.searchParams.get("formato"),
    cabecalhoPdf: () =>
      cabecalhoDoRelatorio(sessao, { titulo: `Orçamento ${ano}`, filtros: [filtroDeClassificacao(classificacao)] }),
  });
}
