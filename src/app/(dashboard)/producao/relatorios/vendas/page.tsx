import Link from "next/link";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { buscarRelatorioVendas } from "@/server/services/relatorioProducao/vendas";
import { rotuloCanal } from "@/lib/producao/relatorios";
import { ROTULOS_FORMA_PAGAMENTO_VENDA } from "@/lib/schemas/enums";
import { formatarData } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso, periodoDaUrl } from "@/lib/producao/periodo";
import { ExportarLinks } from "../../../_shared/exportar-links";
import { BarraDeFiltros } from "../../_shared/barra-de-filtros";
import { atalhosDePeriodo } from "../../_shared/atalhos";
import { formatarCelula as f, TabelaRelatorio } from "../_shared/tabela";
import { FaturamentoBarras } from "./graficos";

type Parametros = { inicio?: string; fim?: string };

export default async function RelatorioVendasPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");

  const periodo = periodoDaUrl(await searchParams);
  const hoje = hojeDeCalendario();
  const r = await buscarRelatorioVendas(sessao, periodo, hoje);

  const inicio = paraDataIso(periodo.inicio);
  const fim = paraDataIso(periodo.fim);
  const query = new URLSearchParams({ inicio, fim }).toString();
  const t = r.total;
  const comVenda = t.faturamento > 0;
  const n = (rotulo: string, detalhe?: string) => ({ rotulo, detalhe, numero: true });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Relatório de vendas</h1>
        <p className="text-sm text-muted-foreground">
          {formatarData(periodo.inicio)} a {formatarData(periodo.fim)}. Pedidos cancelados ficam fora; a
          receber na data de hoje.
        </p>
      </div>

      <div className="space-y-3">
        <BarraDeFiltros
          valores={{ inicio, fim }}
          campos={[
            { tipo: "data", campo: "inicio", rotulo: "De" },
            { tipo: "data", campo: "fim", rotulo: "Até" },
          ]}
        />
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {atalhosDePeriodo(hoje).map((a) => (
            <Link
              key={a.rotulo}
              href={`/producao/relatorios/vendas?inicio=${a.inicio}&fim=${a.fim}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {a.rotulo}
            </Link>
          ))}
        </div>
        <ExportarLinks baseHref="/producao/relatorios/vendas/export" queryString={query} />
      </div>

      {comVenda ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Faturamento por canal</h2>
            <FaturamentoBarras
              cor="var(--chart-2)"
              dados={r.porCanal.map((c) => ({ nome: rotuloCanal(c.canal), faturamento: c.faturamento }))}
            />
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Top 10 clientes</h2>
            <FaturamentoBarras
              cor="var(--chart-3)"
              dados={r.porCliente
                .filter((c) => c.faturamento > 0)
                .slice(0, 10)
                .map((c) => ({ nome: c.cliente, faturamento: c.faturamento }))}
            />
          </section>
        </div>
      ) : null}

      <TabelaRelatorio
        titulo="Vendas por cliente"
        colunas={[
          { rotulo: "#" },
          { rotulo: "Cliente" },
          n("Kg"),
          n("Faturamento"),
          n("% do total"),
          n("Preço médio", "R$/kg"),
          n("Margem"),
          n("Margem %"),
          { rotulo: "Canal principal" },
          n("A receber", "hoje"),
        ]}
        linhas={r.porCliente.map((c, i) => ({
          chave: c.clienteId,
          celulas: [
            i + 1,
            c.cliente,
            f(c.kg, "kg"),
            f(c.faturamento, "R$"),
            f(c.percentual, "%"),
            f(c.precoMedio, "R$/kg"),
            f(c.margem, "R$"),
            f(c.margemPercentual, "%"),
            c.faturamento > 0 ? rotuloCanal(c.canal) : "—",
            f(c.aReceber, "R$"),
          ],
        }))}
        total={[
          "",
          "Total",
          f(t.kg, "kg"),
          f(t.faturamento, "R$"),
          f(t.percentual, "%"),
          f(t.precoMedio, "R$/kg"),
          f(t.margem, "R$"),
          f(t.margemPercentual, "%"),
          "",
          f(t.aReceber, "R$"),
        ]}
      />

      <TabelaRelatorio
        titulo="Por produto"
        colunas={[
          { rotulo: "Produto" },
          n("Kg"),
          n("Faturamento"),
          n("Preço médio", "R$/kg"),
          n("Custo médio", "R$/kg"),
          n("Margem %"),
        ]}
        linhas={r.porProduto.map((p) => ({
          chave: p.produtoId,
          celulas: [
            p.produto,
            f(p.kg, "kg"),
            f(p.faturamento, "R$"),
            f(p.precoMedio, "R$/kg"),
            f(p.custoMedio, "R$/kg"),
            f(p.margemPercentual, "%"),
          ],
        }))}
        total={[
          "Total",
          f(t.kg, "kg"),
          f(t.faturamento, "R$"),
          f(t.precoMedio, "R$/kg"),
          f(t.custoMedio, "R$/kg"),
          f(t.margemPercentual, "%"),
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <TabelaRelatorio
          titulo="Por canal"
          colunas={[{ rotulo: "Canal" }, n("Kg"), n("Faturamento"), n("% do total")]}
          linhas={r.porCanal.map((c) => ({
            chave: c.canal ?? "sem-canal",
            celulas: [rotuloCanal(c.canal), f(c.kg, "kg"), f(c.faturamento, "R$"), f(c.percentual, "%")],
          }))}
          total={["Total", f(t.kg, "kg"), f(t.faturamento, "R$"), f(t.percentual, "%")]}
        />
        <TabelaRelatorio
          titulo="Por forma de pagamento"
          colunas={[{ rotulo: "Forma" }, n("Faturamento"), n("A receber", "hoje")]}
          linhas={r.porForma.map((p) => ({
            chave: p.formaPagamento,
            celulas: [
              ROTULOS_FORMA_PAGAMENTO_VENDA[p.formaPagamento],
              f(p.faturamento, "R$"),
              f(p.aReceber, "R$"),
            ],
          }))}
          total={["Total", f(t.faturamento, "R$"), f(t.aReceber, "R$")]}
        />
      </div>
    </div>
  );
}
