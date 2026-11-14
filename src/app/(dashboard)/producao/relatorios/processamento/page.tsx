import Link from "next/link";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { buscarRelatorioProcessamento } from "@/server/services/relatorioProducao/processamento";
import { formatarData } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso, periodoDaUrl } from "@/lib/producao/periodo";
import { ExportarLinks } from "../../../_shared/exportar-links";
import { BarraDeFiltros } from "../../_shared/barra-de-filtros";
import { atalhosDePeriodo } from "../../_shared/atalhos";
import { formatarCelula as f, TabelaRelatorio } from "../_shared/tabela";

type Parametros = { inicio?: string; fim?: string };

const link = "text-primary underline-offset-4 hover:underline";

export default async function RelatorioProcessamentoPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");

  const periodo = periodoDaUrl(await searchParams);
  const hoje = hojeDeCalendario();
  const r = await buscarRelatorioProcessamento(sessao, periodo);

  const inicio = paraDataIso(periodo.inicio);
  const fim = paraDataIso(periodo.fim);
  const query = new URLSearchParams({ inicio, fim }).toString();
  const t = r.total;
  const comEncerradas = r.porFruta.filter((l) => l.encerradas > 0);
  const semEncerradas = "Nenhuma OP encerrada no período.";
  const n = (rotulo: string, detalhe?: string) => ({ rotulo, detalhe, numero: true });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Relatório de processamento</h1>
        <p className="text-sm text-muted-foreground">
          {formatarData(periodo.inicio)} a {formatarData(periodo.fim)}. OPs canceladas ficam fora. Volumes com OPs
          abertas e encerradas; mínimo, máximo, balanço e custo só com OPs encerradas.
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
              href={`/producao/relatorios/processamento?inicio=${a.inicio}&fim=${a.fim}`}
              className={link}
            >
              {a.rotulo}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ExportarLinks baseHref="/producao/relatorios/processamento/export" queryString={query} />
          <Link href={`/producao/processamento?${query}`} className={`text-sm ${link}`}>
            Ver as OPs do período
          </Link>
        </div>
      </div>

      <TabelaRelatorio
        titulo="Resumo por fruta"
        colunas={[
          { rotulo: "Fruta" },
          n("OPs"),
          n("Fruto", "kg"),
          n("Polpa", "kg"),
          n("Rendimento", "médio"),
          n("Rendimento mín.", "encerradas"),
          n("Rendimento máx.", "encerradas"),
          n("Custo médio", "R$/kg · encerradas"),
        ]}
        linhas={r.porFruta.map((l) => ({
          chave: l.frutaId,
          celulas: [
            l.fruta,
            f(l.volume.quantidade, "nº"),
            f(l.volume.frutoKg, "kg"),
            f(l.volume.polpaKg, "kg"),
            f(l.volume.rendimento, "%"),
            f(l.rendimentoMin, "%"),
            f(l.rendimentoMax, "%"),
            f(l.volume.custoMedioPolpa, "R$/kg"),
          ],
        }))}
        total={[
          "Total",
          f(t.volume.quantidade, "nº"),
          f(t.volume.frutoKg, "kg"),
          f(t.volume.polpaKg, "kg"),
          f(t.volume.rendimento, "%"),
          f(t.rendimentoMin, "%"),
          f(t.rendimentoMax, "%"),
          f(t.volume.custoMedioPolpa, "R$/kg"),
        ]}
      />

      <TabelaRelatorio
        titulo="Balanço de massa (OPs encerradas)"
        vazio={semEncerradas}
        colunas={[
          { rotulo: "Fruta" },
          n("OPs"),
          n("Fruto", "kg"),
          n("Água", "kg"),
          n("Polpa", "kg"),
          n("Caroço/resíduo", "kg"),
          n("Perda", "kg"),
          n("Diferença", "kg"),
          n("Diferença", "%"),
          n("A verificar", "OPs"),
        ]}
        linhas={comEncerradas.map((l) => ({
          chave: l.frutaId,
          celulas: [
            l.fruta,
            f(l.encerradas, "nº"),
            f(l.balanco.frutoKg, "kg"),
            f(l.balanco.aguaKg, "kg"),
            f(l.balanco.polpaKg, "kg"),
            f(l.balanco.carocoResiduoKg, "kg"),
            f(l.balanco.perdaKg, "kg"),
            f(l.balanco.diferencaKg, "kg"),
            f(l.balanco.percentual, "%"),
            f(l.balanco.opsVerificar, "nº"),
          ],
        }))}
        total={[
          "Total",
          f(t.encerradas, "nº"),
          f(t.balanco.frutoKg, "kg"),
          f(t.balanco.aguaKg, "kg"),
          f(t.balanco.polpaKg, "kg"),
          f(t.balanco.carocoResiduoKg, "kg"),
          f(t.balanco.perdaKg, "kg"),
          f(t.balanco.diferencaKg, "kg"),
          f(t.balanco.percentual, "%"),
          f(t.balanco.opsVerificar, "nº"),
        ]}
      />

      <TabelaRelatorio
        titulo="Custo por fruta (OPs encerradas)"
        vazio={semEncerradas}
        colunas={[
          { rotulo: "Fruta" },
          n("Fruto", "R$"),
          n("Insumos", "R$"),
          n("Total", "R$"),
          n("Polpa", "kg"),
          n("Custo", "R$/kg"),
        ]}
        linhas={comEncerradas.map((l) => ({
          chave: l.frutaId,
          celulas: [
            l.fruta,
            f(l.custo.custoFruto, "R$"),
            f(l.custo.custoInsumos, "R$"),
            f(l.custo.custoTotal, "R$"),
            f(l.custo.polpaKg, "kg"),
            f(l.custo.custoKg, "R$/kg"),
          ],
        }))}
        total={[
          "Total",
          f(t.custo.custoFruto, "R$"),
          f(t.custo.custoInsumos, "R$"),
          f(t.custo.custoTotal, "R$"),
          f(t.custo.polpaKg, "kg"),
          f(t.custo.custoKg, "R$/kg"),
        ]}
      />
    </div>
  );
}
