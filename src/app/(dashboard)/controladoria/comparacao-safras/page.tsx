// Espelhado na ajuda (src/ajuda/comparacao-safras/cenas.tsx): mudou rótulo, coluna ou texto? Ajuste a ajuda junto.
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverOrcamento } from "@/server/auth/permissions";
import { listarComparativoSafras } from "@/server/services/orcamentoSafra";
import { LinhaSafraForm } from "./linha-safra-form";
import { SeletorClassificacao } from "../../_shared/seletor-classificacao";
import { ExportarLinks } from "../../_shared/exportar-links";
import { classificacaoDaUrl } from "@/lib/classificacaoFiscal";
import { formatarMoeda } from "@/lib/formatacao";
import { ROTULOS_STATUS_SAFRA_PROJETO } from "@/lib/schemas/enums";

export default async function ComparacaoSafrasPage({
  searchParams,
}: {
  searchParams: Promise<{ classificacao?: string | string[] }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "orcamento:ler");

  const params = await searchParams;
  const classificacao = classificacaoDaUrl(
    Array.isArray(params.classificacao) ? params.classificacao[0] : params.classificacao,
  );

  const linhas = await listarComparativoSafras(sessao, { classificacao });
  const somenteLeitura = !podeEscreverOrcamento(sessao.perfil, sessao.podeAlterarFilial);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-semibold">Comparação entre safras</h1>
          <BotaoAjuda tela="comparacao-safras" />
        </div>
        <p className="text-sm text-muted-foreground">
          Orçado, realizado e projetado por safra. Realizado e projetado somam
          tudo o que está marcado com a safra, em qualquer data (inclusive
          compras de pré-safra e vendas depois da colheita). Realizado usa
          apenas movimentações já conciliadas; projetado usa títulos em
          aberto.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SeletorClassificacao classificacao={classificacao} />
        <ExportarLinks
          baseHref="/controladoria/comparacao-safras/export"
          queryString={classificacao ? `classificacao=${classificacao}` : undefined}
        />
        {classificacao ? (
          <p className="text-sm text-muted-foreground" role="note">
            Realizado e projetado só do movimento {classificacao === "FISCAL" ? "fiscal" : "gerencial"}; o orçado da
            safra não é dividido.
          </p>
        ) : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Safra</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Orçado</TableHead>
            <TableHead>Realizado</TableHead>
            <TableHead>Projetado</TableHead>
            <TableHead>Variação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((linha) => (
            <TableRow key={linha.safraId}>
              <TableCell className="font-medium">{linha.safraNome}</TableCell>
              <TableCell>{ROTULOS_STATUS_SAFRA_PROJETO[linha.status]}</TableCell>
              <TableCell>
                <LinhaSafraForm safraId={linha.safraId} valorOrcado={linha.orcado} somenteLeitura={somenteLeitura} />
              </TableCell>
              <TableCell>{formatarMoeda(linha.realizado)}</TableCell>
              <TableCell>{formatarMoeda(linha.projetado)}</TableCell>
              <TableCell>
                {formatarMoeda(linha.variacaoAbsolutaRealizado)}
                {linha.variacaoPercentualRealizado !== null
                  ? ` (${(linha.variacaoPercentualRealizado * 100).toFixed(1)}%)`
                  : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
