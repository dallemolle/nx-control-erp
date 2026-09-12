import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { buscarIndicadoresExecutivos, buscarGraficosExecutivos } from "@/server/services/dashboardExecutivo";
import { EntradasSaidasChart } from "./entradas-saidas-chart";
import { EvolucaoSaldoChart } from "./evolucao-saldo-chart";
import { AgingChart } from "./aging-chart";

function formatarMoeda(valor: number): string {
  return valor.toFixed(2);
}

export default async function DashboardExecutivoPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "dashboardExecutivo:ler");

  const [indicadores, graficos] = await Promise.all([
    buscarIndicadoresExecutivos(sessao),
    buscarGraficosExecutivos(sessao),
  ]);

  const cards = [
    { label: "Caixa disponível", valor: indicadores.caixaDisponivel },
    { label: "Contas a pagar em aberto", valor: indicadores.contasAPagarEmAberto },
    { label: "Contas a receber em aberto", valor: indicadores.contasAReceberEmAberto },
    { label: "Inadimplência", valor: indicadores.inadimplencia },
    { label: "Geração de caixa (mês atual)", valor: indicadores.geracaoDeCaixaMesAtual },
    { label: "Obrigações (7 dias)", valor: indicadores.obrigacoes7Dias },
    { label: "Obrigações (30 dias)", valor: indicadores.obrigacoes30Dias },
    { label: "Recebimentos esperados (30 dias)", valor: indicadores.recebimentosEsperados30Dias },
    { label: "Saldo projetado (30 dias)", valor: indicadores.saldoProjetado30Dias },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Dashboard executivo</h1>
        <p className="text-sm text-muted-foreground">
          Consolidado de todas as filiais da empresa. Restrito a Administrador, Gestor e Auditor.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatarMoeda(card.valor)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Entradas x Saídas (últimos 6 meses)</h2>
          <EntradasSaidasChart dados={graficos.entradasSaidas} />
        </section>
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Evolução do saldo (últimos 6 meses)</h2>
          <EvolucaoSaldoChart dados={graficos.evolucaoSaldo} />
        </section>
        <section className="space-y-2 lg:col-span-2">
          <h2 className="text-base font-semibold">Aging de contas a pagar/receber</h2>
          <AgingChart dados={graficos.aging} />
        </section>
      </div>
    </div>
  );
}
