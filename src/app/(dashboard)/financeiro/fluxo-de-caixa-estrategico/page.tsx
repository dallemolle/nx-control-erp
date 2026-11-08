import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeExecutar } from "@/server/auth/permissions";
import { listarProjecaoEstrategica, TIPOS_CENARIO } from "@/server/services/fluxoDeCaixaEstrategico";
import { PremissasForm } from "./premissas-form";
import { ExportarLinks } from "../../_shared/exportar-links";
import { SeletorClassificacao } from "../../_shared/seletor-classificacao";
import { AvisoVisaoFiltrada } from "../_fluxo-de-caixa/aviso-visao-filtrada";
import { classificacaoDaUrl } from "@/lib/classificacaoFiscal";
import { formatarMoeda } from "@/lib/formatacao";
import { filiaisDesativadasComPendencia } from "@/server/services/filiaisConsolidadas";
import { AvisoFiliaisDesativadas } from "../../_shared/aviso-filiais-desativadas";

const LABEL_CENARIO: Record<(typeof TIPOS_CENARIO)[number], string> = {
  BASE: "Base",
  OTIMISTA: "Otimista",
  PESSIMISTA: "Pessimista",
};

export default async function FluxoDeCaixaEstrategicoPage({
  searchParams,
}: {
  searchParams: Promise<{ classificacao?: string | string[] }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "planejamentoEstrategico:ler");

  const params = await searchParams;
  const classificacao = classificacaoDaUrl(
    Array.isArray(params.classificacao) ? params.classificacao[0] : params.classificacao,
  );

  const [{ cenarios, projecoes }, desativadas] = await Promise.all([
    listarProjecaoEstrategica(sessao, { classificacao }),
    filiaisDesativadasComPendencia(sessao.empresaId),
  ]);

  const somenteLeitura = !podeExecutar(sessao.perfil, "planejamentoEstrategico:escrever");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Fluxo de caixa estratégico</h1>
        <p className="text-sm text-muted-foreground">
          Projeção de 5 anos por cenário, consolidando as filiais ativas
          da empresa a partir do fluxo de caixa realizado dos últimos 12
          meses. Não considera prazo de recebimento/pagamento, capital
          de giro nem amortização de dívida (juros incidem sobre o saldo
          devedor acumulado, que nunca é amortizado).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SeletorClassificacao classificacao={classificacao} />
        <ExportarLinks
          baseHref="/financeiro/fluxo-de-caixa-estrategico/export"
          queryString={classificacao ? `classificacao=${classificacao}` : undefined}
        />
      </div>

      <AvisoVisaoFiltrada classificacao={classificacao} />
      <AvisoFiliaisDesativadas filiais={desativadas} />

      {TIPOS_CENARIO.map((tipo) => (
        <section key={tipo} className="space-y-4 rounded-lg border p-4">
          <h2 className="text-base font-semibold">Cenário {LABEL_CENARIO[tipo]}</h2>

          <PremissasForm tipo={tipo} premissas={cenarios[tipo]} somenteLeitura={somenteLeitura} />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                {projecoes[tipo].map((ano) => (
                  <TableHead key={ano.ano}>Ano {ano.ano}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Receita</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{formatarMoeda(ano.receita)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Custo operacional</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{formatarMoeda(ano.custoOperacional)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">CAPEX</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{formatarMoeda(ano.capex)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Juros</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{formatarMoeda(ano.jurosSobreDivida)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Geração líquida</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{formatarMoeda(ano.geracaoLiquida)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">{classificacao ? "Acumulado de caixa" : "Saldo de caixa"}</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano} className={ano.saldoCaixa < 0 ? "font-medium text-destructive" : undefined}>
                    {formatarMoeda(ano.saldoCaixa)}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Margem líquida</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{(ano.margemLiquida * 100).toFixed(1)}%</TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </section>
      ))}
    </div>
  );
}
