import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarFluxoDeCaixaProjetado, type ModoJanelaProjetado } from "@/server/services/fluxoDeCaixaProjetado";
import { SeletorModoProjetado } from "./seletor-modo";
import { formatarRotuloPeriodo, rotuloEmAtraso } from "../_fluxo-de-caixa/formatar-rotulo-periodo";
import { dataValida } from "../_fluxo-de-caixa/data-valida";
import { AvisoVisaoFiltrada } from "../_fluxo-de-caixa/aviso-visao-filtrada";
import { SeletorClassificacao } from "../../_shared/seletor-classificacao";
import { ExportarLinks } from "../../_shared/exportar-links";
import { classificacaoDaUrl } from "@/lib/classificacaoFiscal";
import { formatarMoeda } from "@/lib/formatacao";

const MODOS_VALIDOS: ModoJanelaProjetado[] = ["MOVEL", "ANO_CIVIL"];

function modoValido(valor: string | undefined): ModoJanelaProjetado {
  return MODOS_VALIDOS.includes(valor as ModoJanelaProjetado) ? (valor as ModoJanelaProjetado) : "MOVEL";
}

export default async function FluxoDeCaixaProjetadoPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string | string[]; data?: string | string[]; classificacao?: string | string[] }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:ler");

  const params = await searchParams;
  const modoParam = Array.isArray(params.modo) ? params.modo[0] : params.modo;
  const dataParam = Array.isArray(params.data) ? params.data[0] : params.data;
  const modo = modoValido(modoParam);
  const dataReferencia = dataValida(dataParam);
  const classificacao = classificacaoDaUrl(
    Array.isArray(params.classificacao) ? params.classificacao[0] : params.classificacao,
  );
  const rotuloSaldo = classificacao ? "Acumulado" : "Saldo";

  const { emAtraso, periodos } = await listarFluxoDeCaixaProjetado(sessao, modo, dataReferencia, { classificacao });
  const linhas = [
    ...(emAtraso ? [{ chave: "em-atraso", rotulo: rotuloEmAtraso(emAtraso.venceuAte), atraso: true, ...emAtraso }] : []),
    ...periodos.map((periodo) => ({
      chave: periodo.inicio.toISOString(),
      rotulo: formatarRotuloPeriodo("MES", periodo.inicio, periodo.fim),
      atraso: false,
      ...periodo,
    })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Fluxo de caixa projetado</h1>
        <p className="text-sm text-muted-foreground">
          Projeção calculada a partir do saldo em caixa conciliado de hoje e
          dos títulos a pagar/receber em aberto. Parcelas em aberto vencidas
          antes do período entram na linha &quot;Em atraso&quot;, e o saldo dos
          meses parte dela. Não considera contratos recorrentes,
          financiamentos nem orçamento (ainda não existem no sistema).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SeletorModoProjetado modo={modo} dataReferencia={dataReferencia.toISOString().slice(0, 10)} />
        <SeletorClassificacao classificacao={classificacao} />
      </div>

      <AvisoVisaoFiltrada classificacao={classificacao} />

      <ExportarLinks
        baseHref="/financeiro/fluxo-de-caixa-projetado/export"
        queryString={`modo=${modo}&data=${dataReferencia.toISOString().slice(0, 10)}${
          classificacao ? `&classificacao=${classificacao}` : ""
        }`}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mês</TableHead>
            <TableHead>{rotuloSaldo} inicial</TableHead>
            <TableHead>Entradas projetadas</TableHead>
            <TableHead>Saídas projetadas</TableHead>
            <TableHead>Geração líquida</TableHead>
            <TableHead>{rotuloSaldo} final</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((periodo) => (
            <TableRow key={periodo.chave} className={periodo.alerta ? "bg-destructive/10" : undefined}>
              <TableCell className={periodo.atraso ? "text-muted-foreground" : undefined}>{periodo.rotulo}</TableCell>
              <TableCell>{formatarMoeda(periodo.saldoInicial)}</TableCell>
              <TableCell>{formatarMoeda(periodo.entradasProjetadas)}</TableCell>
              <TableCell>{formatarMoeda(periodo.saidasProjetadas)}</TableCell>
              <TableCell>{formatarMoeda(periodo.geracaoLiquida)}</TableCell>
              <TableCell className={periodo.alerta ? "font-medium text-destructive" : undefined}>
                <div className="flex items-center gap-2">
                  {formatarMoeda(periodo.saldoFinal)}
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
