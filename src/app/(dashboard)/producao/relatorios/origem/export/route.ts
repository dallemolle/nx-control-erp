import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { buscarRelatorioOrigem } from "@/server/services/relatorioProducao/origem";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import { COLUNAS_ORIGEM, linhasDeOrigem, secoesDeOrigem } from "@/server/export/relatorioOrigem";
import { gerarPdfSecoes } from "@/lib/export/pdf";
import { responderArquivoPdf, responderExport } from "@/lib/export/responder";
import { formatarData } from "@/lib/formatacao";
import { periodoDaUrl } from "@/lib/producao/periodo";

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const periodo = periodoDaUrl(Object.fromEntries(url.searchParams));
  const relatorio = await buscarRelatorioOrigem(sessao, periodo);
  // O responder acrescenta a data de hoje ao nome.
  const nome = "relatorio-origem";
  const cabecalho = () =>
    cabecalhoDoRelatorio(sessao, {
      titulo: "Relatório de origem da matéria-prima",
      filtros: [
        `Período: ${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`,
        `Produtividade e preço por mês: ${relatorio.ano}`,
      ],
      avisos: ["Recepções canceladas ficam fora; peso líquido (bruto − descarte). Valor pago só de terceiros."],
    });
  const formato = url.searchParams.get("formato");

  if (formato === "pdf") {
    return responderArquivoPdf(await gerarPdfSecoes(secoesDeOrigem(relatorio), await cabecalho()), nome);
  }
  return responderExport(linhasDeOrigem(relatorio), COLUNAS_ORIGEM, {
    nomeArquivo: nome,
    nomeAba: "Origem",
    formato,
    cabecalhoPdf: cabecalho,
  });
}
