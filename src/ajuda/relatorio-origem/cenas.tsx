"use client";

import { Alvo, CampoSimulado } from "@/components/ajuda/campos-simulados";
import { MESES, mesUTC } from "@/lib/producao/relatorios";
import {
  agregarPorOrigem,
  precoTerceirosPorMes,
  produtividadeTalhoes,
  type IndicadoresOrigem,
} from "@/lib/producao/relatoriosOrigem";
import { ROTULOS_ORIGEM_RECEPCAO } from "@/lib/schemas/enums";
// A tabela e a formatação são as da própria tela.
import { formatarCelula as f, TabelaRelatorio } from "@/app/(dashboard)/producao/relatorios/_shared/tabela";
import { ANO, FRUTAS, MES_DO_PERIODO, PERIODO, RECEPCOES, TALHOES } from "./exemplo";

// Espelho de src/app/(dashboard)/producao/relatorios/origem/page.tsx. Mudou uma tabela ou gráfico lá? Ajuste aqui.

/** O relatório do exemplo, pelas mesmas funções que o servidor usa. */
export function montarRelatorio() {
  const doPeriodo = RECEPCOES.filter((r) => mesUTC(r.data) === MES_DO_PERIODO);
  const { linhas, total } = agregarPorOrigem(
    doPeriodo.map((r) => ({
      tipo: r.tipo,
      origemId: r.origemId,
      nome: r.nome,
      frutaId: r.frutaId,
      brutoKg: r.brutoKg,
      descarteKg: r.descarteKg,
      valorTotal: r.valorTotal,
      cargas: 1,
    })),
  );
  const noAno = new Map<string, { talhaoId: string; brutoKg: number; descarteKg: number; colheitas: number }>();
  for (const r of RECEPCOES.filter((x) => x.tipo === "PROPRIA")) {
    const atual = noAno.get(r.origemId) ?? { talhaoId: r.origemId, brutoKg: 0, descarteKg: 0, colheitas: 0 };
    noAno.set(r.origemId, {
      ...atual,
      brutoKg: atual.brutoKg + r.brutoKg,
      descarteKg: atual.descarteKg + r.descarteKg,
      colheitas: atual.colheitas + 1,
    });
  }
  const produtividade = produtividadeTalhoes(
    TALHOES.map((t) => ({ ...t })),
    new Map(linhas.filter((l) => l.tipo === "PROPRIA").map((l) => [l.origemId, l.kg])),
    [...noAno.values()],
  );
  const precoPorMes = precoTerceirosPorMes(
    RECEPCOES.filter((r) => r.tipo === "TERCEIRO").map((r) => ({
      frutaId: r.frutaId,
      data: r.data,
      brutoKg: r.brutoKg,
      descarteKg: r.descarteKg,
      valorTotal: r.valorTotal,
    })),
  );
  return {
    porOrigem: linhas,
    total,
    frutas: FRUTAS.filter((fr) => fr.id in total.porFruta),
    produtividade: produtividade.linhas,
    totalProdutividade: produtividade.total,
    frutasTerceiros: FRUTAS.filter((fr) => fr.id in precoPorMes),
    precoPorMes,
  };
}

/** Imitação simplificada das barras horizontais da tela (sem eixos nem dica ao passar o mouse). */
function Barras({ dados }: { dados: { nome: string; kg: number }[] }) {
  const maximo = Math.max(1, ...dados.map((d) => d.kg));
  return (
    <div className="space-y-2 rounded-lg border p-3" aria-hidden>
      {dados.map((d) => (
        <div key={d.nome} className="grid grid-cols-[10rem_1fr] items-center gap-2 text-xs">
          <span className="truncate text-muted-foreground">{d.nome}</span>
          <div className="flex items-center gap-2">
            <div
              className="h-4 rounded-sm"
              style={{ width: `${(d.kg / maximo) * 80}%`, background: "var(--chart-2)" }}
            />
            <span className="tabular-nums">{f(d.kg, "kg")} kg</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const n = (rotulo: string, detalhe?: string) => ({ rotulo, detalhe, numero: true });

export function CenaOrigem() {
  const r = montarRelatorio();
  const t = r.total;
  const tp = r.totalProdutividade;
  const kgDaFruta = (porFruta: Record<string, IndicadoresOrigem>) =>
    r.frutas.map((fr) => f(porFruta[fr.id]?.kg ?? 0, "kg"));
  const primeiroTalhao = r.porOrigem.find((o) => o.tipo === "PROPRIA")?.origemId;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-lg font-semibold">Relatório de origem</p>
        <p className="text-sm text-muted-foreground">
          {PERIODO.inicio} a {PERIODO.fim}. Recepções canceladas ficam fora; peso líquido (bruto − descarte).
          Produtividade e preço por mês: ano de {ANO}.
        </p>
      </div>

      <div className="space-y-3">
        <Alvo nome="origem.periodo" className="flex flex-wrap items-end gap-3 p-1">
          <CampoSimulado compacto rotulo="De" valor={PERIODO.inicio} className="w-40" />
          <CampoSimulado compacto rotulo="Até" valor={PERIODO.fim} className="w-40" />
        </Alvo>
        <Alvo nome="origem.atalhos" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
          <span>Mês atual</span>
          <span>Mês anterior</span>
          <span>Ano</span>
        </Alvo>
        <Alvo nome="origem.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
          <span>Exportar CSV</span>
          <span>Exportar Excel</span>
          <span>Exportar PDF</span>
        </Alvo>
      </div>

      <Alvo nome="origem.grafico" className="space-y-2 p-1 lg:max-w-3xl">
        <p className="text-sm font-semibold">Top 10 origens (kg líquido)</p>
        <Barras dados={r.porOrigem.slice(0, 10).map((o) => ({ nome: o.nome, kg: o.kg }))} />
      </Alvo>

      <Alvo nome="tab.origem" className="p-1">
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
              o.origemId === "jose" ? (
                <Alvo key="jose" nome="tab.jose" className="inline-block px-1">
                  {o.nome}
                </Alvo>
              ) : o.origemId === primeiroTalhao ? (
                <Alvo key="talhao" nome="tab.talhao" className="inline-block px-1">
                  {o.nome}
                </Alvo>
              ) : (
                o.nome
              ),
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
      </Alvo>

      <Alvo nome="tab.produtividade" className="p-1">
        <TabelaRelatorio
          titulo={`Produtividade dos talhões em ${ANO}`}
          vazio="Nenhum talhão cadastrado."
          colunas={[
            { rotulo: "Talhão" },
            { rotulo: "Fruta" },
            n("Área", "ha"),
            n("Kg no período"),
            n(`Kg em ${ANO}`),
            n("Produtividade", "t/ha no ano"),
            n("Colheitas", "no ano"),
          ]}
          linhas={r.produtividade.map((p) => ({
            chave: p.talhaoId,
            celulas: [
              p.colheitas === 0 ? (
                <Alvo key="sem" nome="tab.semColheita" className="inline-block px-1">
                  {p.talhao}
                </Alvo>
              ) : (
                p.talhao
              ),
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
      </Alvo>

      <Alvo nome="tab.preco" className="p-1">
        <TabelaRelatorio
          titulo={`Preço médio pago a terceiros por mês em ${ANO}`}
          vazio={`Nenhuma compra de terceiros em ${ANO}.`}
          colunas={[{ rotulo: "Mês" }, ...r.frutasTerceiros.map((fr) => n(fr.nome, "R$/kg"))]}
          linhas={MESES.map((mes, i) => ({
            chave: mes,
            celulas: [mes, ...r.frutasTerceiros.map((fr) => f(r.precoPorMes[fr.id][i], "R$/kg"))],
          }))}
          total={["Ano", ...r.frutasTerceiros.map((fr) => f(r.precoPorMes[fr.id][12], "R$/kg"))]}
        />
      </Alvo>
    </div>
  );
}
