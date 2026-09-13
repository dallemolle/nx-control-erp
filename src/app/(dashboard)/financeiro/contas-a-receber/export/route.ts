import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarTitulos } from "@/server/services/titulo";
import { filtroTitulosDaUrl } from "../../_titulos/filtro-titulos-url";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";

type LinhaExport = {
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
  { rotulo: "Cliente", valor: (l) => l.contraparte },
  { rotulo: "Categoria", valor: (l) => l.categoria },
  { rotulo: "Nº parcela", valor: (l) => l.numeroParcela },
  { rotulo: "Vencimento", valor: (l) => l.vencimento },
  { rotulo: "Valor atualizado", valor: (l) => l.valorAtualizado },
  { rotulo: "Status", valor: (l) => l.status },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "titulo:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const filtros = filtroTitulosDaUrl((campo) => url.searchParams.get(campo) ?? undefined);

  const titulos = await listarTitulos(sessao.filialId, "RECEBER", filtros);
  const linhas: LinhaExport[] = titulos.flatMap((titulo) =>
    titulo.parcelas.map((parcela) => ({
      documento: titulo.documento,
      contraparte: titulo.cliente?.nome ?? titulo.fornecedor?.nome ?? "",
      categoria: titulo.categoriaFinanceira.nome,
      numeroParcela: parcela.numero,
      vencimento: parcela.dataVencimento,
      valorAtualizado: Number(parcela.valorAtualizado),
      status: parcela.status,
    })),
  );

  const formato = url.searchParams.get("formato");
  return responderExport(linhas, COLUNAS, { nomeArquivo: "contas-a-receber", nomeAba: "Contas a receber", formato });
}
