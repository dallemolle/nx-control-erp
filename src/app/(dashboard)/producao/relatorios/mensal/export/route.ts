import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { buscarRelatorioMensal } from "@/server/services/relatorioProducao/mensal";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import { COLUNAS_MENSAL, linhasDoMensal, secoesDoMensal } from "@/server/export/relatorioMensal";
import { gerarPdfSecoes } from "@/lib/export/pdf";
import { responderArquivoPdf, responderExport } from "@/lib/export/responder";
import { anoDaUrl, hojeDeCalendario } from "@/lib/producao/periodo";

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const ano = anoDaUrl(url.searchParams.get("ano") ?? undefined, hojeDeCalendario());
  const relatorio = await buscarRelatorioMensal(sessao, ano);
  // O responder acrescenta a data de hoje ao nome.
  const nome = "relatorio-mensal";
  const cabecalho = () =>
    cabecalhoDoRelatorio(sessao, {
      titulo: "Relatório mensal de produção",
      filtros: [`Ano: ${ano}`],
      avisos: ["Cancelados ficam fora; OP aberta conta no volume; custo da polpa só de OPs encerradas."],
    });
  const formato = url.searchParams.get("formato");

  if (formato === "pdf") {
    return responderArquivoPdf(await gerarPdfSecoes(secoesDoMensal(relatorio), await cabecalho()), nome);
  }
  return responderExport(linhasDoMensal(relatorio), COLUNAS_MENSAL, {
    nomeArquivo: nome,
    nomeAba: "Mensal",
    formato,
    cabecalhoPdf: cabecalho,
  });
}
