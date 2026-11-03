import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarFluxoDeCaixaRealizado, type Granularidade } from "@/server/services/fluxoDeCaixa";
import { SeletorPeriodo } from "./seletor-periodo";
import { formatarRotuloPeriodo } from "../_fluxo-de-caixa/formatar-rotulo-periodo";
import { dataValida } from "../_fluxo-de-caixa/data-valida";
import { ExportarLinks } from "../../_shared/exportar-links";
import { SeletorClassificacao } from "../../_shared/seletor-classificacao";
import { AvisoVisaoFiltrada } from "../_fluxo-de-caixa/aviso-visao-filtrada";
import { classificacaoDaUrl } from "@/lib/classificacaoFiscal";

const GRANULARIDADES_VALIDAS: Granularidade[] = ["DIA", "SEMANA", "MES", "ANO"];

function granularidadeValida(valor: string | undefined): Granularidade {
  return GRANULARIDADES_VALIDAS.includes(valor as Granularidade) ? (valor as Granularidade) : "MES";
}

export default async function FluxoDeCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{
    granularidade?: string | string[];
    data?: string | string[];
    classificacao?: string | string[];
  }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "lancamento:ler");

  const params = await searchParams;
  const granularidadeParam = Array.isArray(params.granularidade) ? params.granularidade[0] : params.granularidade;
  const dataParam = Array.isArray(params.data) ? params.data[0] : params.data;
  const granularidade = granularidadeValida(granularidadeParam);
  const dataReferencia = dataValida(dataParam);
  const classificacao = classificacaoDaUrl(
    Array.isArray(params.classificacao) ? params.classificacao[0] : params.classificacao,
  );
  const rotuloSaldo = classificacao ? "Acumulado" : "Saldo";

  const periodos = await listarFluxoDeCaixaRealizado(sessao, granularidade, dataReferencia, { classificacao });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Fluxo de caixa</h1>
        <p className="text-sm text-muted-foreground">
          Movimentações bancárias já conciliadas, por período.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SeletorPeriodo granularidade={granularidade} dataReferencia={dataReferencia.toISOString().slice(0, 10)} />
        <SeletorClassificacao classificacao={classificacao} />
      </div>

      <AvisoVisaoFiltrada classificacao={classificacao} />

      <ExportarLinks
        baseHref="/financeiro/fluxo-de-caixa/export"
        queryString={`granularidade=${granularidade}&data=${dataReferencia.toISOString().slice(0, 10)}${
          classificacao ? `&classificacao=${classificacao}` : ""
        }`}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Período</TableHead>
            <TableHead>{rotuloSaldo} inicial</TableHead>
            <TableHead>Entradas</TableHead>
            <TableHead>Saídas</TableHead>
            <TableHead>Geração de caixa</TableHead>
            <TableHead>{rotuloSaldo} final</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {periodos.map((periodo) => (
            <TableRow key={periodo.inicio.toISOString()}>
              <TableCell>{formatarRotuloPeriodo(granularidade, periodo.inicio, periodo.fim)}</TableCell>
              <TableCell>{periodo.saldoInicial.toFixed(2)}</TableCell>
              <TableCell>{periodo.entradas.toFixed(2)}</TableCell>
              <TableCell>{periodo.saidas.toFixed(2)}</TableCell>
              <TableCell>{periodo.geracaoLiquida.toFixed(2)}</TableCell>
              <TableCell>{periodo.saldoFinal.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
