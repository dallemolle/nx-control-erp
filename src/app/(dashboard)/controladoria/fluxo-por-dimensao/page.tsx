import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarFluxoDeCaixaPorDimensao, type TipoDimensao } from "@/server/services/fluxoDeCaixaPorDimensao";
import { SeletorAnoMes } from "../_shared/seletor-ano-mes";
import { SeletorDimensao } from "./seletor-dimensao";
import { SeletorClassificacao } from "../../_shared/seletor-classificacao";
import { classificacaoDaUrl } from "@/lib/classificacaoFiscal";
import { formatarMoeda } from "@/lib/formatacao";

const DIMENSOES_VALIDAS: TipoDimensao[] = ["CENTRO_CUSTO", "CENTRO_LUCRO", "SAFRA"];

function dimensaoValida(valor: string | undefined): TipoDimensao {
  return DIMENSOES_VALIDAS.includes(valor as TipoDimensao) ? (valor as TipoDimensao) : "CENTRO_CUSTO";
}

function anoValido(valor: string | undefined): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : new Date().getUTCFullYear();
}

function mesValido(valor: string | undefined): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 1 && numero <= 12 ? numero : new Date().getUTCMonth() + 1;
}

export default async function FluxoPorDimensaoPage({
  searchParams,
}: {
  searchParams: Promise<{
    dimensao?: string | string[];
    ano?: string | string[];
    mes?: string | string[];
    classificacao?: string | string[];
  }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:ler");

  const params = await searchParams;
  const dimensaoParam = Array.isArray(params.dimensao) ? params.dimensao[0] : params.dimensao;
  const anoParam = Array.isArray(params.ano) ? params.ano[0] : params.ano;
  const mesParam = Array.isArray(params.mes) ? params.mes[0] : params.mes;

  const dimensao = dimensaoValida(dimensaoParam);
  const ano = anoValido(anoParam);
  const mes = mesValido(mesParam);
  const classificacao = classificacaoDaUrl(
    Array.isArray(params.classificacao) ? params.classificacao[0] : params.classificacao,
  );

  const linhas = await listarFluxoDeCaixaPorDimensao(sessao, dimensao, ano, mes, { classificacao });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Fluxo de caixa por dimensão</h1>
        <p className="text-sm text-muted-foreground">
          Realizado (movimentações conciliadas) e projetado (títulos em
          aberto) do mês, agrupados por centro de custo, centro de lucro ou
          safra. &quot;Não classificado&quot; reúne o que não tem essa dimensão
          preenchida.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SeletorDimensao dimensao={dimensao} ano={ano} mes={mes} />
        <SeletorAnoMes ano={ano} mes={mes} />
        <SeletorClassificacao classificacao={classificacao} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dimensão</TableHead>
            <TableHead>Entradas realizadas</TableHead>
            <TableHead>Saídas realizadas</TableHead>
            <TableHead>Entradas projetadas</TableHead>
            <TableHead>Saídas projetadas</TableHead>
            <TableHead>Saldo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((linha) => {
            const saldo =
              linha.entradasRealizadas + linha.entradasProjetadas - (linha.saidasRealizadas + linha.saidasProjetadas);
            return (
              <TableRow key={linha.dimensaoId ?? "nao-classificado"}>
                <TableCell className="font-medium">{linha.dimensaoNome}</TableCell>
                <TableCell>{formatarMoeda(linha.entradasRealizadas)}</TableCell>
                <TableCell>{formatarMoeda(linha.saidasRealizadas)}</TableCell>
                <TableCell>{formatarMoeda(linha.entradasProjetadas)}</TableCell>
                <TableCell>{formatarMoeda(linha.saidasProjetadas)}</TableCell>
                <TableCell className={saldo < 0 ? "font-medium text-destructive" : undefined}>
                  {formatarMoeda(saldo)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
