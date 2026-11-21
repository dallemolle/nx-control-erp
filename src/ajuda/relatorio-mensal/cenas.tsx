"use client";

import { Alvo } from "@/components/ajuda/campos-simulados";
import type { PropsCena } from "@/ajuda/tipos";
import { blocosMensais, frutasComMovimento, MESES, montarColunasMensais, polpaPorProdutoMes } from "@/lib/producao/relatorios";
import { cn } from "@/lib/utils";
// A tabela e a formatação são as da própria tela.
import { formatarCelula, TabelaRelatorio } from "@/app/(dashboard)/producao/relatorios/_shared/tabela";
import { ANO, FRUTAS, ITENS, OPS, PRODUCOES, PRODUTOS, RECEPCOES } from "./exemplo";

// Espelho de src/app/(dashboard)/producao/relatorios/mensal/page.tsx. Mudou uma tabela ou gráfico lá? Ajuste aqui.

/** O relatório do exemplo, pelas mesmas funções que o servidor usa. */
export function montarRelatorio() {
  const colunas = montarColunasMensais(
    RECEPCOES.map((r) => ({ ...r })),
    OPS.map((o) => ({ ...o })),
    ITENS.map((i) => ({
      pedidoId: String(i.pedido),
      produtoId: i.produtoId,
      categoria: PRODUTOS[i.produtoId].categoria,
      frutaId: PRODUTOS[i.produtoId].frutaId,
      quantidadeKg: i.quantidadeKg,
      precoKg: i.precoKg,
      custoKg: i.custoKg,
      data: i.data,
    })),
  );
  const polpa = [...polpaPorProdutoMes([...PRODUCOES])]
    .map(([produtoId, v]) => ({ produtoId, produto: PRODUTOS[produtoId].rotulo, ...v }))
    .sort((a, b) => a.produto.localeCompare(b.produto));
  return { colunas, frutas: frutasComMovimento(colunas[12], [...FRUTAS]), polpa };
}

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Imitação simplificada dos gráficos da tela (sem eixos nem dica ao passar o mouse). */
function Barras({
  series,
  rotuloExtra,
}: {
  series: { cor: string; rotulo: string; valores: number[] }[];
  rotuloExtra?: (mes: number) => string | null;
}) {
  const maximo = Math.max(1, ...series.flatMap((s) => s.valores));
  return (
    <div className="space-y-2 rounded-lg border p-3" aria-hidden>
      <div className="flex h-36 items-end justify-between gap-1">
        {MESES.map((mes, m) => (
          <div key={mes} className="flex h-full flex-col items-center justify-end gap-1">
            {rotuloExtra?.(m) ? <span className="text-[10px] text-muted-foreground">{rotuloExtra(m)}</span> : null}
            <div className="flex h-full items-end gap-0.5">
              {series.map((s) => (
                <div
                  key={s.rotulo}
                  className="w-1.5 sm:w-2"
                  style={{ height: `${(s.valores[m] / maximo) * 100}%`, background: s.cor }}
                />
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">{mes}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
        {series.map((s) => (
          <span key={s.rotulo} className="flex items-center gap-1">
            <span className="size-2.5 rounded-sm" style={{ background: s.cor }} />
            {s.rotulo}
          </span>
        ))}
        {rotuloExtra ? <span className="text-muted-foreground">Margem % em cima de cada mês</span> : null}
      </div>
    </div>
  );
}

const nomeMes = (mes: number | null) => (mes === null ? "Total" : MESES[mes]);

export function CenaMensal({ valores }: PropsCena) {
  const anoAnterior = valores["mensal.ano"] === String(ANO - 1);
  const ano = anoAnterior ? ANO - 1 : ANO;
  const { colunas, frutas, polpa } = montarRelatorio();
  const total = colunas[12];
  const meses = colunas.slice(0, 12);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-lg font-semibold">Relatório mensal</p>
        <p className="text-sm text-muted-foreground">
          Ano {ano}. Cancelados ficam fora; custo da polpa só de OPs encerradas.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Alvo nome="mensal.ano" className="flex items-center gap-x-4 p-1">
          <span className="text-primary">◀ {ano - 1}</span>
          <span className="font-medium">{ano}</span>
          <span className="text-primary">{ano + 1} ▶</span>
        </Alvo>
        <Alvo nome="mensal.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
          <span>Exportar CSV</span>
          <span>Exportar Excel</span>
          <span>Exportar PDF</span>
        </Alvo>
      </div>

      {anoAnterior ? (
        <p className="text-sm text-muted-foreground">Nada no ano.</p>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Alvo nome="mensal.graficoVolumes" className="space-y-2 p-1">
              <p className="text-sm font-semibold">Recebido × processado × vendido (kg)</p>
              <Barras
                series={[
                  { cor: "var(--chart-2)", rotulo: "Recebido", valores: meses.map((c) => c.recepcao.recebidoKg) },
                  { cor: "var(--chart-3)", rotulo: "Processado", valores: meses.map((c) => c.processamento.frutoKg) },
                  { cor: "var(--chart-4)", rotulo: "Vendido", valores: meses.map((c) => c.vendas.kgVendidos) },
                ]}
              />
            </Alvo>
            <Alvo nome="mensal.graficoFaturamento" className="space-y-2 p-1">
              <p className="text-sm font-semibold">Faturamento e margem</p>
              <Barras
                series={[
                  { cor: "var(--chart-2)", rotulo: "Faturamento", valores: meses.map((c) => c.vendas.faturamento) },
                ]}
                rotuloExtra={(m) => {
                  const pct = meses[m].vendas.margemPercentual;
                  return pct === null ? null : `${NUMERO.format(pct * 100)}%`;
                }}
              />
            </Alvo>
          </div>

          {blocosMensais(frutas).map((bloco) => (
            <Alvo key={bloco.titulo} nome={`tab.${bloco.titulo}`} className={cn("p-1")}>
              <TabelaRelatorio
                titulo={bloco.titulo}
                colunas={[
                  { rotulo: "Mês" },
                  ...bloco.indicadores.map((i) => ({
                    rotulo: `${i.rotulo} (${i.unidade})`,
                    detalhe: i.fruta || undefined,
                    numero: true,
                  })),
                ]}
                linhas={meses.map((c) => ({
                  chave: String(c.mes),
                  celulas: [
                    bloco.titulo === "Recepção" && c.mes === 10 ? (
                      <Alvo key="nov" nome="tab.novembro" className="inline-block px-1">
                        {nomeMes(c.mes)}
                      </Alvo>
                    ) : (
                      nomeMes(c.mes)
                    ),
                    ...bloco.indicadores.map((i) => formatarCelula(i.valor(c), i.unidade)),
                  ],
                }))}
                total={[
                  bloco.titulo === "Recepção" ? (
                    <Alvo key="total" nome="tab.total" className="inline-block px-1">
                      Total
                    </Alvo>
                  ) : (
                    "Total"
                  ),
                  ...bloco.indicadores.map((i) => formatarCelula(i.valor(total), i.unidade)),
                ]}
              />
            </Alvo>
          ))}

          <Alvo nome="tab.polpa" className="p-1">
            <TabelaRelatorio
              titulo="Polpa produzida por produto (kg)"
              colunas={[
                { rotulo: "Produto" },
                ...MESES.map((m) => ({ rotulo: m, numero: true })),
                { rotulo: "Total", numero: true },
              ]}
              linhas={polpa.map((p) => ({
                chave: p.produtoId,
                celulas: [p.produto, ...p.meses.map((kg) => formatarCelula(kg, "kg")), formatarCelula(p.total, "kg")],
              }))}
              vazio="Nenhuma polpa produzida no ano."
            />
          </Alvo>
        </>
      )}
    </div>
  );
}
