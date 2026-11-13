import Link from "next/link";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { buscarRelatorioOrigem } from "@/server/services/relatorioProducao/origem";
import { MESES } from "@/lib/producao/relatorios";
import type { IndicadoresOrigem } from "@/lib/producao/relatoriosOrigem";
import { ROTULOS_ORIGEM_RECEPCAO } from "@/lib/schemas/enums";
import { formatarData } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso, periodoDaUrl } from "@/lib/producao/periodo";
import { ExportarLinks } from "../../../_shared/exportar-links";
import { BarraDeFiltros } from "../../_shared/barra-de-filtros";
import { atalhosDePeriodo } from "../../_shared/atalhos";
import { formatarCelula as f, TabelaRelatorio } from "../_shared/tabela";
import { KgBarras } from "./graficos";

type Parametros = { inicio?: string; fim?: string };

export default async function RelatorioOrigemPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");

  const periodo = periodoDaUrl(await searchParams);
  const hoje = hojeDeCalendario();
  const r = await buscarRelatorioOrigem(sessao, periodo);

  const inicio = paraDataIso(periodo.inicio);
  const fim = paraDataIso(periodo.fim);
  const query = new URLSearchParams({ inicio, fim }).toString();
  const t = r.total;
  const tp = r.totalProdutividade;
  const n = (rotulo: string, detalhe?: string) => ({ rotulo, detalhe, numero: true });
  const kgDaFruta = (porFruta: Record<string, IndicadoresOrigem>) =>
    r.frutas.map((fr) => f(porFruta[fr.id]?.kg ?? 0, "kg"));

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Relatório de origem</h1>
        <p className="text-sm text-muted-foreground">
          {formatarData(periodo.inicio)} a {formatarData(periodo.fim)}. Recepções canceladas ficam fora; peso
          líquido (bruto − descarte). Produtividade e preço por mês: ano de {r.ano}.
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
              href={`/producao/relatorios/origem?inicio=${a.inicio}&fim=${a.fim}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {a.rotulo}
            </Link>
          ))}
        </div>
        <ExportarLinks baseHref="/producao/relatorios/origem/export" queryString={query} />
      </div>

      {r.porOrigem.length > 0 ? (
        <section className="space-y-2 lg:max-w-3xl">
          <h2 className="text-sm font-semibold">Top 10 origens (kg líquido)</h2>
          <KgBarras cor="var(--chart-2)" dados={r.porOrigem.slice(0, 10).map((o) => ({ nome: o.nome, kg: o.kg }))} />
        </section>
      ) : null}

      <TabelaRelatorio
        titulo="Por origem"
        colunas={[
          { rotulo: "Origem" },
          { rotulo: "Tipo" },
          ...r.frutas.map((fr) => n(fr.nome, "kg")),
          n("Total", "kg"),
          n("Valor pago", "terceiros"),
          n("Preço médio", "R$/kg"),
          n("Descarte"),
          n("Cargas"),
        ]}
        linhas={r.porOrigem.map((o) => ({
          chave: `${o.tipo}:${o.origemId}`,
          celulas: [
            o.nome,
            ROTULOS_ORIGEM_RECEPCAO[o.tipo],
            ...kgDaFruta(o.porFruta),
            f(o.kg, "kg"),
            f(o.valor, "R$"),
            f(o.precoMedio, "R$/kg"),
            f(o.percentualDescarte, "%"),
            f(o.cargas, "nº"),
          ],
        }))}
        total={[
          "Total",
          "",
          ...kgDaFruta(t.porFruta),
          f(t.kg, "kg"),
          f(t.valor, "R$"),
          f(t.precoMedio, "R$/kg"),
          f(t.percentualDescarte, "%"),
          f(t.cargas, "nº"),
        ]}
      />

      <TabelaRelatorio
        titulo={`Produtividade dos talhões em ${r.ano}`}
        vazio="Nenhum talhão cadastrado."
        colunas={[
          { rotulo: "Talhão" },
          { rotulo: "Fruta" },
          n("Área", "ha"),
          n("Kg no período"),
          n(`Kg em ${r.ano}`),
          n("Produtividade", "t/ha no ano"),
          n("Colheitas", "no ano"),
        ]}
        linhas={r.produtividade.map((p) => ({
          chave: p.talhaoId,
          celulas: [
            p.talhao,
            p.fruta,
            f(p.areaHa, "ha"),
            f(p.kgPeriodo, "kg"),
            f(p.kgAno, "kg"),
            f(p.toneladasHa, "t/ha"),
            f(p.colheitas, "nº"),
          ],
        }))}
        total={[
          "Total",
          "",
          f(tp.areaHa, "ha"),
          f(tp.kgPeriodo, "kg"),
          f(tp.kgAno, "kg"),
          "—",
          f(tp.colheitas, "nº"),
        ]}
      />

      <TabelaRelatorio
        titulo={`Preço médio pago a terceiros por mês em ${r.ano}`}
        vazio={`Nenhuma compra de terceiros em ${r.ano}.`}
        colunas={[{ rotulo: "Mês" }, ...r.frutasTerceiros.map((fr) => n(fr.nome, "R$/kg"))]}
        linhas={
          r.frutasTerceiros.length === 0
            ? []
            : MESES.map((mes, i) => ({
                chave: mes,
                celulas: [mes, ...r.frutasTerceiros.map((fr) => f(r.precoPorMes[fr.id][i], "R$/kg"))],
              }))
        }
        total={["Ano", ...r.frutasTerceiros.map((fr) => f(r.precoPorMes[fr.id][12], "R$/kg"))]}
      />
    </div>
  );
}
