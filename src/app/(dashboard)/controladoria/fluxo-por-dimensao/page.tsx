// Espelhado na ajuda (src/ajuda/fluxo-por-dimensao/cenas.tsx): mudou rótulo, coluna ou texto? Ajuste a ajuda junto.
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resultadoDoMes, totalDoFluxo } from "@/lib/fluxoPorDimensao";
import { AvisoVisaoFiltrada } from "../../financeiro/_fluxo-de-caixa/aviso-visao-filtrada";
import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarFluxoDeCaixaPorDimensao, type TipoDimensao } from "@/server/services/fluxoDeCaixaPorDimensao";
import { SeletorAnoMes } from "../_shared/seletor-ano-mes";
import { SeletorDimensao } from "./seletor-dimensao";
import { SeletorClassificacao } from "../../_shared/seletor-classificacao";
import { ExportarLinks } from "../../_shared/exportar-links";
import { classificacaoDaUrl } from "@/lib/classificacaoFiscal";
import { formatarMoeda } from "@/lib/formatacao";
import { montarArvore } from "@/lib/arvoreDeLinhas";
import { LinhasRecolhiveis } from "../_shared/linhas-recolhiveis";

const DIMENSOES_VALIDAS: TipoDimensao[] = ["CENTRO_CUSTO", "CENTRO_LUCRO", "SAFRA", "PROJETO"];

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
  const total = totalDoFluxo(linhas);
  // Só o Centro de custo tem pai; nas outras dimensões todas as linhas ficam no nível 1.
  const itens = montarArvore(
    linhas.map((linha) => ({
      ...linha,
      id: linha.dimensaoId ?? "nao-classificado",
      grupo: "dimensao",
      nome: linha.dimensaoNome,
    })),
    (linha) => ({
      entradasRealizadas: linha.entradasRealizadas,
      saidasRealizadas: linha.saidasRealizadas,
      entradasProjetadas: linha.entradasProjetadas,
      saidasProjetadas: linha.saidasProjetadas,
    }),
  );

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-semibold">Fluxo de caixa por dimensão</h1>
          <BotaoAjuda tela="fluxo-por-dimensao" />
        </div>
        <p className="text-sm text-muted-foreground">
          Realizado (movimentações conciliadas) e projetado (títulos em
          aberto) do mês, agrupados por centro de custo, centro de lucro,
          safra ou projeto. &quot;Não classificado&quot; reúne o que não tem essa dimensão
          preenchida.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SeletorDimensao dimensao={dimensao} ano={ano} mes={mes} />
        <SeletorAnoMes ano={ano} mes={mes} />
        <SeletorClassificacao classificacao={classificacao} />
        <ExportarLinks
          baseHref="/controladoria/fluxo-por-dimensao/export"
          queryString={`dimensao=${dimensao}&ano=${ano}&mes=${mes}${classificacao ? `&classificacao=${classificacao}` : ""}`}
        />
      </div>

      <AvisoVisaoFiltrada
        classificacao={classificacao}
        detalhe={
          <>
            . O que tem a outra classificação fica de fora, então o total não bate com o Fluxo de caixa na visão
            &quot;Todos&quot;.
          </>
        }
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dimensão</TableHead>
            <TableHead>Entradas realizadas</TableHead>
            <TableHead>Saídas realizadas</TableHead>
            <TableHead>Entradas projetadas</TableHead>
            <TableHead>Saídas projetadas</TableHead>
            <TableHead>Resultado do mês</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <LinhasRecolhiveis
            linhas={itens.map((item) => {
              const resultado = resultadoDoMes(item.valores);
              return {
                chave: item.chave,
                paiChave: item.paiChave,
                nivel: item.nivel,
                temFilhos: item.temFilhos,
                direto: item.direto,
                nome: item.nome,
                celulas: (
                  <>
                    <TableCell>{formatarMoeda(item.valores.entradasRealizadas)}</TableCell>
                    <TableCell>{formatarMoeda(item.valores.saidasRealizadas)}</TableCell>
                    <TableCell>{formatarMoeda(item.valores.entradasProjetadas)}</TableCell>
                    <TableCell>{formatarMoeda(item.valores.saidasProjetadas)}</TableCell>
                    <TableCell className={resultado < 0 ? "font-medium text-destructive" : undefined}>
                      {formatarMoeda(resultado)}
                    </TableCell>
                  </>
                ),
              };
            })}
          />
        </TableBody>
        <TableFooter>
          <TableRow className="font-semibold">
            <TableCell>Total</TableCell>
            <TableCell>{formatarMoeda(total.entradasRealizadas)}</TableCell>
            <TableCell>{formatarMoeda(total.saidasRealizadas)}</TableCell>
            <TableCell>{formatarMoeda(total.entradasProjetadas)}</TableCell>
            <TableCell>{formatarMoeda(total.saidasProjetadas)}</TableCell>
            <TableCell className={total.resultado < 0 ? "text-destructive" : undefined}>
              {formatarMoeda(total.resultado)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
