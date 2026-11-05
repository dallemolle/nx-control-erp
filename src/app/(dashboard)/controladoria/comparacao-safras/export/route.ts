import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarComparativoSafras, type LinhaComparativoSafra } from "@/server/services/orcamentoSafra";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { classificacaoDaUrl } from "@/lib/classificacaoFiscal";

const STATUS_LABEL: Record<LinhaComparativoSafra["status"], string> = {
  PLANEJADO: "Planejado",
  EM_ANDAMENTO: "Em andamento",
  ENCERRADO: "Encerrado",
};

const COLUNAS: ColunaExport<LinhaComparativoSafra>[] = [
  { rotulo: "Safra", valor: (l) => l.safraNome },
  { rotulo: "Status", valor: (l) => STATUS_LABEL[l.status] ?? l.status },
  { rotulo: "Orçado", valor: (l) => l.orcado },
  { rotulo: "Realizado", valor: (l) => l.realizado },
  { rotulo: "Projetado", valor: (l) => l.projetado },
  { rotulo: "Variação", valor: (l) => l.variacaoAbsolutaRealizado },
  {
    rotulo: "Variação %",
    valor: (l) => (l.variacaoPercentualRealizado === null ? "" : l.variacaoPercentualRealizado * 100),
  },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "orcamento:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const classificacao = classificacaoDaUrl(url.searchParams.get("classificacao") ?? undefined);
  const linhas = await listarComparativoSafras(sessao, { classificacao });

  return responderExport(linhas, COLUNAS, {
    nomeArquivo: classificacao ? `comparacao-safras-${classificacao.toLowerCase()}` : "comparacao-safras",
    nomeAba: "Comparação entre safras",
    formato: url.searchParams.get("formato"),
  });
}
