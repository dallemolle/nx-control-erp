import Link from "next/link";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { buscarRelatorioMensal } from "@/server/services/relatorioProducao/mensal";
import { blocosMensais, MESES } from "@/lib/producao/relatorios";
import { anoDaUrl, hojeDeCalendario } from "@/lib/producao/periodo";
import { ExportarLinks } from "../../../_shared/exportar-links";
import { formatarCelula, TabelaRelatorio } from "../_shared/tabela";
import { FaturamentoMargemChart, VolumesChart, type PontoMensal } from "./graficos";

type Parametros = { ano?: string };

const link = "text-primary underline-offset-4 hover:underline";

export default async function RelatorioMensalPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");

  const ano = anoDaUrl((await searchParams).ano, hojeDeCalendario());
  const r = await buscarRelatorioMensal(sessao, ano);
  const total = r.colunas[12];
  const vazio =
    total.recepcao.brutoKg === 0 &&
    total.processamento.quantidade === 0 &&
    total.vendas.pedidos === 0 &&
    r.polpaPorProduto.length === 0;
  const pontos: PontoMensal[] = r.colunas.slice(0, 12).map((c, m) => ({
    mes: MESES[m],
    recebido: c.recepcao.recebidoKg,
    processado: c.processamento.frutoKg,
    vendido: c.vendas.kgVendidos,
    faturamento: c.vendas.faturamento,
    margemPercentual: c.vendas.margemPercentual === null ? null : c.vendas.margemPercentual * 100,
  }));
  const nomeMes = (mes: number | null) => (mes === null ? "Total" : MESES[mes]);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Relatório mensal</h1>
        <p className="text-sm text-muted-foreground">
          Ano {ano}. Cancelados ficam fora; custo da polpa só de OPs encerradas.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href={`/producao/relatorios/mensal?ano=${ano - 1}`} className={link}>
          ◀ {ano - 1}
        </Link>
        <span className="font-medium">{ano}</span>
        <Link href={`/producao/relatorios/mensal?ano=${ano + 1}`} className={link}>
          {ano + 1} ▶
        </Link>
        <ExportarLinks baseHref="/producao/relatorios/mensal/export" queryString={`ano=${ano}`} />
      </div>

      {vazio ? (
        <p className="text-sm text-muted-foreground">Nada no ano.</p>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Recebido × processado × vendido (kg)</h2>
              <VolumesChart dados={pontos} />
            </section>
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Faturamento e margem</h2>
              <FaturamentoMargemChart dados={pontos} />
            </section>
          </div>

          {blocosMensais(r.frutas).map((bloco) => (
            <TabelaRelatorio
              key={bloco.titulo}
              titulo={bloco.titulo}
              colunas={[
                { rotulo: "Mês" },
                ...bloco.indicadores.map((i) => ({
                  rotulo: `${i.rotulo} (${i.unidade})`,
                  detalhe: i.fruta || undefined,
                  numero: true,
                })),
              ]}
              linhas={r.colunas.slice(0, 12).map((c) => ({
                chave: String(c.mes),
                celulas: [nomeMes(c.mes), ...bloco.indicadores.map((i) => formatarCelula(i.valor(c), i.unidade))],
              }))}
              total={["Total", ...bloco.indicadores.map((i) => formatarCelula(i.valor(total), i.unidade))]}
            />
          ))}

          <TabelaRelatorio
            titulo="Polpa produzida por produto (kg)"
            colunas={[
              { rotulo: "Produto" },
              ...MESES.map((m) => ({ rotulo: m, numero: true })),
              { rotulo: "Total", numero: true },
            ]}
            linhas={r.polpaPorProduto.map((p) => ({
              chave: p.produtoId,
              celulas: [p.produto, ...p.meses.map((kg) => formatarCelula(kg, "kg")), formatarCelula(p.total, "kg")],
            }))}
            vazio="Nenhuma polpa produzida no ano."
          />
        </>
      )}
    </div>
  );
}
