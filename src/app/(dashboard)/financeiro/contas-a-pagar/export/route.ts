import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarTitulos } from "@/server/services/titulo";
import { filtroTitulosDaUrl } from "../../_titulos/filtro-titulos-url";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { camposFiscaisDoTitulo, COLUNAS_FISCAIS, type CamposFiscaisExport } from "../../_titulos/colunas-fiscais-export";
import { descreverFiltroTitulos } from "../../_titulos/descrever-filtro-titulos";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";

type LinhaExport = CamposFiscaisExport & {
  documento: string;
  contraparte: string;
  categoria: string;
  numeroParcela: number;
  vencimento: Date;
  valorAtualizado: number;
  status: string;
};

const COLUNAS: ColunaExport<LinhaExport>[] = [
  { rotulo: "Documento", valor: (l) => l.documento },
  { rotulo: "Fornecedor", valor: (l) => l.contraparte },
  { rotulo: "Categoria", valor: (l) => l.categoria },
  { rotulo: "Nº parcela", valor: (l) => l.numeroParcela, tipo: "inteiro" },
  { rotulo: "Vencimento", valor: (l) => l.vencimento },
  { rotulo: "Valor atualizado", valor: (l) => l.valorAtualizado },
  { rotulo: "Status", valor: (l) => l.status },
  ...COLUNAS_FISCAIS,
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "titulo:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const filtros = filtroTitulosDaUrl((campo) => url.searchParams.get(campo) ?? undefined);

  const titulos = await listarTitulos(sessao.filialId, "PAGAR", filtros);
  const linhas: LinhaExport[] = titulos.flatMap((titulo) => {
    const fiscais = camposFiscaisDoTitulo(titulo);
    return titulo.parcelas.map((parcela) => ({
      documento: titulo.documento,
      contraparte: titulo.fornecedor?.nome ?? titulo.cliente?.nome ?? "",
      categoria: titulo.categoriaFinanceira.nome,
      numeroParcela: parcela.numero,
      vencimento: parcela.dataVencimento,
      valorAtualizado: Number(parcela.valorAtualizado),
      status: parcela.status,
      ...fiscais,
    }));
  });

  const formato = url.searchParams.get("formato");
  return responderExport(linhas, COLUNAS, {
    nomeArquivo: "contas-a-pagar",
    nomeAba: "Contas a pagar",
    formato,
    cabecalhoPdf: () =>
      cabecalhoDoRelatorio(sessao, { titulo: "Contas a pagar", filtros: descreverFiltroTitulos(filtros) }),
  });
}
