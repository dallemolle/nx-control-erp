import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { buscarPainelProducao } from "@/server/services/relatorioProducao/painel";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import { COLUNAS_INDICADORES, linhasDoPainel, secoesDoPainel } from "@/server/export/painelProducao";
import { gerarPdfSecoes } from "@/lib/export/pdf";
import { responderArquivoPdf, responderExport } from "@/lib/export/responder";
import { formatarData } from "@/lib/formatacao";
import { hojeDeCalendario, periodoDaUrl } from "@/lib/producao/periodo";

const NOME = "painel-producao";

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const periodo = periodoDaUrl(Object.fromEntries(url.searchParams));
  const painel = await buscarPainelProducao(sessao, periodo, hojeDeCalendario());
  const cabecalho = () =>
    cabecalhoDoRelatorio(sessao, {
      titulo: "Painel de produção",
      filtros: [`Período: ${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`],
      avisos: ["Estoque, entregas e a receber na data de hoje; custo médio só de OPs encerradas."],
    });
  const formato = url.searchParams.get("formato");

  if (formato === "pdf") {
    return responderArquivoPdf(await gerarPdfSecoes(secoesDoPainel(painel), await cabecalho()), NOME);
  }
  return responderExport(linhasDoPainel(painel), COLUNAS_INDICADORES, {
    nomeArquivo: NOME,
    nomeAba: "Painel",
    formato,
    cabecalhoPdf: cabecalho,
  });
}
