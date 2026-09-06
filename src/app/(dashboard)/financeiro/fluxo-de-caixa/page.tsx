import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarFluxoDeCaixaRealizado, type Granularidade } from "@/server/services/fluxoDeCaixa";
import { SeletorPeriodo } from "./seletor-periodo";
import { formatarRotuloPeriodo } from "./formatar-rotulo-periodo";
import { dataValida } from "./data-valida";

const GRANULARIDADES_VALIDAS: Granularidade[] = ["DIA", "SEMANA", "MES", "ANO"];

function granularidadeValida(valor: string | undefined): Granularidade {
  return GRANULARIDADES_VALIDAS.includes(valor as Granularidade) ? (valor as Granularidade) : "MES";
}

export default async function FluxoDeCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ granularidade?: string | string[]; data?: string | string[] }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "lancamento:ler");

  const params = await searchParams;
  const granularidadeParam = Array.isArray(params.granularidade) ? params.granularidade[0] : params.granularidade;
  const dataParam = Array.isArray(params.data) ? params.data[0] : params.data;
  const granularidade = granularidadeValida(granularidadeParam);
  const dataReferencia = dataValida(dataParam);

  const periodos = await listarFluxoDeCaixaRealizado(sessao, granularidade, dataReferencia);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Fluxo de caixa</h1>
        <p className="text-sm text-muted-foreground">
          Movimentações bancárias já conciliadas, por período.
        </p>
      </div>

      <SeletorPeriodo granularidade={granularidade} dataReferencia={dataReferencia.toISOString().slice(0, 10)} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Período</TableHead>
            <TableHead>Saldo inicial</TableHead>
            <TableHead>Entradas</TableHead>
            <TableHead>Saídas</TableHead>
            <TableHead>Geração de caixa</TableHead>
            <TableHead>Saldo final</TableHead>
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
