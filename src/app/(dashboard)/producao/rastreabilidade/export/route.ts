import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { rastrearLote } from "@/server/services/rastreabilidade";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import { COLUNAS_CLIENTES, nomeDoArquivo, secoesDoRastreio } from "@/server/export/rastreabilidade";
import { gerarPdfSecoes } from "@/lib/export/pdf";
import { responderArquivoPdf, responderExport } from "@/lib/export/responder";

/** PDF = relatório completo; CSV/Excel = clientes atingidos (uma linha por item vendido). */
export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const incluirCancelados = url.searchParams.get("cancelados") === "1";
  const rastreio = await rastrearLote(sessao, url.searchParams.get("lote") ?? "", { incluirCancelados });
  if (!rastreio) return new Response("Lote não encontrado", { status: 404 });

  const codigo = rastreio.lote.codigo;
  const cabecalho = () =>
    cabecalhoDoRelatorio(sessao, {
      titulo: `Rastreabilidade do lote ${codigo}`,
      filtros: [incluirCancelados ? "Inclui cancelados e removidos" : null],
    });
  const formato = url.searchParams.get("formato");

  if (formato === "pdf") {
    const bytes = await gerarPdfSecoes(secoesDoRastreio(rastreio), await cabecalho());
    return responderArquivoPdf(bytes, nomeDoArquivo(codigo));
  }

  return responderExport(rastreio.clientes, COLUNAS_CLIENTES, {
    nomeArquivo: nomeDoArquivo(codigo),
    nomeAba: "Clientes",
    formato,
    cabecalhoPdf: cabecalho,
  });
}
