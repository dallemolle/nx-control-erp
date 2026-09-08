import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarFluxoDeCaixaProjetado, type ModoJanelaProjetado } from "@/server/services/fluxoDeCaixaProjetado";
import { SeletorModoProjetado } from "./seletor-modo";
import { formatarRotuloPeriodo } from "../_fluxo-de-caixa/formatar-rotulo-periodo";
import { dataValida } from "../_fluxo-de-caixa/data-valida";

const MODOS_VALIDOS: ModoJanelaProjetado[] = ["MOVEL", "ANO_CIVIL"];

function modoValido(valor: string | undefined): ModoJanelaProjetado {
  return MODOS_VALIDOS.includes(valor as ModoJanelaProjetado) ? (valor as ModoJanelaProjetado) : "MOVEL";
}

export default async function FluxoDeCaixaProjetadoPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string | string[]; data?: string | string[] }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:ler");

  const params = await searchParams;
  const modoParam = Array.isArray(params.modo) ? params.modo[0] : params.modo;
  const dataParam = Array.isArray(params.data) ? params.data[0] : params.data;
  const modo = modoValido(modoParam);
  const dataReferencia = dataValida(dataParam);

  const periodos = await listarFluxoDeCaixaProjetado(sessao, modo, dataReferencia);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Fluxo de caixa projetado</h1>
        <p className="text-sm text-muted-foreground">
          Projeção calculada a partir do saldo em caixa de hoje e dos
          títulos a pagar/receber já em aberto — não considera contratos
          recorrentes, financiamentos nem orçamento (ainda não existem no
          sistema).
        </p>
      </div>

      <SeletorModoProjetado modo={modo} dataReferencia={dataReferencia.toISOString().slice(0, 10)} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mês</TableHead>
            <TableHead>Saldo inicial</TableHead>
            <TableHead>Entradas projetadas</TableHead>
            <TableHead>Saídas projetadas</TableHead>
            <TableHead>Geração de caixa</TableHead>
            <TableHead>Saldo final</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {periodos.map((periodo) => (
            <TableRow key={periodo.inicio.toISOString()} className={periodo.alerta ? "bg-destructive/10" : undefined}>
              <TableCell>{formatarRotuloPeriodo("MES", periodo.inicio, periodo.fim)}</TableCell>
              <TableCell>{periodo.saldoInicial.toFixed(2)}</TableCell>
              <TableCell>{periodo.entradasProjetadas.toFixed(2)}</TableCell>
              <TableCell>{periodo.saidasProjetadas.toFixed(2)}</TableCell>
              <TableCell>{periodo.geracaoLiquida.toFixed(2)}</TableCell>
              <TableCell className={periodo.alerta ? "font-medium text-destructive" : undefined}>
                <div className="flex items-center gap-2">
                  {periodo.saldoFinal.toFixed(2)}
                  {periodo.alerta && <Badge variant="destructive">Saldo negativo</Badge>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
