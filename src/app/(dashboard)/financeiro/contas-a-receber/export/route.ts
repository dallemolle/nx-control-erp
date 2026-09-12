import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarTitulos } from "@/server/services/titulo";
import { gerarCsv, type ColunaExport } from "@/lib/export/csv";
import { gerarExcel } from "@/lib/export/excel";

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

  const titulos = await listarTitulos(sessao.filialId, "RECEBER");
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

  const formato = new URL(request.url).searchParams.get("formato");
  const dataDeHoje = new Date().toISOString().slice(0, 10);

  if (formato === "xlsx") {
    const buffer = await gerarExcel(linhas, COLUNAS, "Contas a receber");
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="contas-a-receber-${dataDeHoje}.xlsx"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const csv = gerarCsv(linhas, COLUNAS);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contas-a-receber-${dataDeHoje}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
