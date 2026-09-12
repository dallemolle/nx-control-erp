import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarFluxoDeCaixaRealizado, type Granularidade } from "@/server/services/fluxoDeCaixa";
import { formatarRotuloPeriodo } from "../../_fluxo-de-caixa/formatar-rotulo-periodo";
import { dataValida } from "../../_fluxo-de-caixa/data-valida";
import { gerarCsv, type ColunaExport } from "@/lib/export/csv";
import { gerarExcel } from "@/lib/export/excel";

const GRANULARIDADES_VALIDAS: Granularidade[] = ["DIA", "SEMANA", "MES", "ANO"];

function granularidadeValida(valor: string | null): Granularidade {
  return GRANULARIDADES_VALIDAS.includes(valor as Granularidade) ? (valor as Granularidade) : "MES";
}

type LinhaExport = {
  periodo: string;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  geracaoLiquida: number;
  saldoFinal: number;
};

const COLUNAS: ColunaExport<LinhaExport>[] = [
  { rotulo: "Período", valor: (l) => l.periodo },
  { rotulo: "Saldo inicial", valor: (l) => l.saldoInicial },
  { rotulo: "Entradas", valor: (l) => l.entradas },
  { rotulo: "Saídas", valor: (l) => l.saidas },
  { rotulo: "Geração líquida", valor: (l) => l.geracaoLiquida },
  { rotulo: "Saldo final", valor: (l) => l.saldoFinal },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "lancamento:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const granularidade = granularidadeValida(url.searchParams.get("granularidade"));
  const dataReferencia = dataValida(url.searchParams.get("data") ?? undefined);

  const periodos = await listarFluxoDeCaixaRealizado(sessao, granularidade, dataReferencia);
  const linhas: LinhaExport[] = periodos.map((periodo) => ({
    periodo: formatarRotuloPeriodo(granularidade, periodo.inicio, periodo.fim),
    saldoInicial: periodo.saldoInicial,
    entradas: periodo.entradas,
    saidas: periodo.saidas,
    geracaoLiquida: periodo.geracaoLiquida,
    saldoFinal: periodo.saldoFinal,
  }));

  const formato = url.searchParams.get("formato");
  const dataDeHoje = new Date().toISOString().slice(0, 10);

  if (formato === "xlsx") {
    const buffer = await gerarExcel(linhas, COLUNAS, "Fluxo de caixa");
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="fluxo-de-caixa-${dataDeHoje}.xlsx"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const csv = gerarCsv(linhas, COLUNAS);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fluxo-de-caixa-${dataDeHoje}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
