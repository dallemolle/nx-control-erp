import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { buscarRelatorioProcessamento } from "@/server/services/relatorioProducao/processamento";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import {
  COLUNAS_PROCESSAMENTO,
  linhasDeProcessamento,
  secoesDeProcessamento,
} from "@/server/export/relatorioProcessamento";
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
  const relatorio = await buscarRelatorioProcessamento(sessao, periodo);
  // O responder acrescenta a data de hoje ao nome.
  const nome = "relatorio-processamento";
  const cabecalho = () =>
    cabecalhoDoRelatorio(sessao, {
      titulo: "Relatório de processamento",
      filtros: [`Período: ${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`],
      avisos: [
        "OPs canceladas ficam fora. Volumes com OPs abertas e encerradas; mínimo, máximo, balanço e custo só com encerradas.",
      ],
    });
  const formato = url.searchParams.get("formato");

  if (formato === "pdf") {
    return responderArquivoPdf(await gerarPdfSecoes(secoesDeProcessamento(relatorio), await cabecalho()), nome);
  }
  return responderExport(linhasDeProcessamento(relatorio), COLUNAS_PROCESSAMENTO, {
    nomeArquivo: nome,
    nomeAba: "Processamento",
    formato,
    cabecalhoPdf: cabecalho,
  });
}
