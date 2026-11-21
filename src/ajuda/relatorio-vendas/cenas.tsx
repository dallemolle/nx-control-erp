"use client";

import { Alvo, CampoSimulado } from "@/components/ajuda/campos-simulados";
import { agregarVendasDetalhadas, rotuloCanal } from "@/lib/producao/relatorios";
import { ROTULOS_FORMA_PAGAMENTO_VENDA } from "@/lib/schemas/enums";
import { formatarMoeda } from "@/lib/formatacao";
// A tabela e a formatação são as da própria tela.
import { formatarCelula as f, TabelaRelatorio } from "@/app/(dashboard)/producao/relatorios/_shared/tabela";
import { ITENS, PERIODO, PRODUTOS, SALDOS } from "./exemplo";

// Espelho de src/app/(dashboard)/producao/relatorios/vendas/page.tsx. Mudou uma tabela ou gráfico lá? Ajuste aqui.

/** O relatório do exemplo, pela mesma função que o servidor usa. */
export function montarRelatorio() {
  const r = agregarVendasDetalhadas(
    ITENS.map((i) => ({
      pedidoId: String(i.pedido),
      produtoId: i.produtoId,
      categoria: PRODUTOS[i.produtoId].categoria,
      frutaId: PRODUTOS[i.produtoId].frutaId,
      quantidadeKg: i.quantidadeKg,
      precoKg: i.precoKg,
      custoKg: i.custoKg,
      clienteId: i.clienteId,
      cliente: i.cliente,
      canal: i.canal,
      formaPagamento: i.formaPagamento,
    })),
    [...SALDOS],
  );
  return { ...r, porProduto: r.porProduto.map((p) => ({ ...p, produto: PRODUTOS[p.produtoId].rotulo })) };
}

/** Imitação simplificada das barras horizontais da tela (sem eixos nem dica ao passar o mouse). */
function Barras({ cor, dados }: { cor: string; dados: { nome: string; faturamento: number }[] }) {
  const maximo = Math.max(1, ...dados.map((d) => d.faturamento));
  return (
    <div className="space-y-2 rounded-lg border p-3" aria-hidden>
      {dados.map((d) => (
        <div key={d.nome} className="grid grid-cols-[8rem_1fr] items-center gap-2 text-xs">
          <span className="truncate text-muted-foreground">{d.nome}</span>
          <div className="flex items-center gap-2">
            <div className="h-4 rounded-sm" style={{ width: `${(d.faturamento / maximo) * 80}%`, background: cor }} />
            <span className="tabular-nums">{formatarMoeda(d.faturamento)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const n = (rotulo: string, detalhe?: string) => ({ rotulo, detalhe, numero: true });

export function CenaVendas() {
  const r = montarRelatorio();
  const t = r.total;
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-lg font-semibold">Relatório de vendas</p>
        <p className="text-sm text-muted-foreground">
          {PERIODO.inicio} a {PERIODO.fim}. Pedidos cancelados ficam fora; a receber na data de hoje.
        </p>
      </div>

      <div className="space-y-3">
        <Alvo nome="vendas.periodo" className="flex flex-wrap items-end gap-3 p-1">
          <CampoSimulado compacto rotulo="De" valor={PERIODO.inicio} className="w-40" />
          <CampoSimulado compacto rotulo="Até" valor={PERIODO.fim} className="w-40" />
        </Alvo>
        <Alvo nome="vendas.atalhos" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
          <span>Mês atual</span>
          <span>Mês anterior</span>
          <span>Ano</span>
        </Alvo>
        <Alvo nome="vendas.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
          <span>Exportar CSV</span>
          <span>Exportar Excel</span>
          <span>Exportar PDF</span>
        </Alvo>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Alvo nome="vendas.graficoCanal" className="space-y-2 p-1">
          <p className="text-sm font-semibold">Faturamento por canal</p>
          <Barras
            cor="var(--chart-2)"
            dados={r.porCanal.map((c) => ({ nome: rotuloCanal(c.canal), faturamento: c.faturamento }))}
          />
        </Alvo>
        <Alvo nome="vendas.graficoClientes" className="space-y-2 p-1">
          <p className="text-sm font-semibold">Top 10 clientes</p>
          <Barras
            cor="var(--chart-3)"
            dados={r.porCliente
              .filter((c) => c.faturamento > 0)
              .slice(0, 10)
              .map((c) => ({ nome: c.cliente, faturamento: c.faturamento }))}
          />
        </Alvo>
      </div>

      <Alvo nome="tab.clientes" className="p-1">
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
              c.faturamento > 0 ? (
                c.cliente
              ) : (
                <Alvo key="sem" nome="tab.semCompra" className="inline-block px-1">
                  {c.cliente}
                </Alvo>
              ),
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
      </Alvo>

      <Alvo nome="tab.produtos" className="p-1">
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
      </Alvo>

      <div className="grid gap-6 lg:grid-cols-2">
        <Alvo nome="tab.canais" className="p-1">
          <TabelaRelatorio
            titulo="Por canal"
            colunas={[{ rotulo: "Canal" }, n("Kg"), n("Faturamento"), n("% do total")]}
            linhas={r.porCanal.map((c) => ({
              chave: c.canal ?? "sem-canal",
              celulas: [rotuloCanal(c.canal), f(c.kg, "kg"), f(c.faturamento, "R$"), f(c.percentual, "%")],
            }))}
            total={["Total", f(t.kg, "kg"), f(t.faturamento, "R$"), f(t.percentual, "%")]}
          />
        </Alvo>
        <Alvo nome="tab.formas" className="p-1">
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
        </Alvo>
      </div>
    </div>
  );
}
