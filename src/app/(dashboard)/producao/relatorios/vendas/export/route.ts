import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { buscarRelatorioVendas } from "@/server/services/relatorioProducao/vendas";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import { COLUNAS_VENDAS, linhasDeVendas, secoesDeVendas } from "@/server/export/relatorioVendas";
import { gerarPdfSecoes } from "@/lib/export/pdf";
import { responderArquivoPdf, responderExport } from "@/lib/export/responder";
import { formatarData } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso, periodoDaUrl } from "@/lib/producao/periodo";

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const periodo = periodoDaUrl(Object.fromEntries(url.searchParams));
  const relatorio = await buscarRelatorioVendas(sessao, periodo, hojeDeCalendario());
  const nome = `relatorio-vendas-${paraDataIso(periodo.inicio)}`;
  const cabecalho = () =>
    cabecalhoDoRelatorio(sessao, {
      titulo: "Relatório de vendas",
      filtros: [`Período: ${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`],
      avisos: ["Pedidos cancelados ficam fora; a receber na data de hoje, de qualquer data de venda."],
    });
  const formato = url.searchParams.get("formato");

  if (formato === "pdf") {
    return responderArquivoPdf(await gerarPdfSecoes(secoesDeVendas(relatorio), await cabecalho()), nome);
  }
  return responderExport(linhasDeVendas(relatorio), COLUNAS_VENDAS, {
    nomeArquivo: nome,
    nomeAba: "Vendas",
    formato,
    cabecalhoPdf: cabecalho,
  });
}
