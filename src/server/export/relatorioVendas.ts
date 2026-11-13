import type { ColunaExport } from "@/lib/export/csv";
import { secaoPdf, type SecaoPdf } from "@/lib/export/pdf";
import { rotuloCanal, type IndicadoresVenda, type LinhaCliente } from "@/lib/producao/relatorios";
import { ROTULOS_FORMA_PAGAMENTO_VENDA } from "@/lib/schemas/enums";
import type { RelatorioVendas } from "@/server/services/relatorioProducao/vendas";

export type LinhaVendas = IndicadoresVenda & {
  secao: "Cliente" | "Produto" | "Canal" | "Forma de pagamento";
  item: string;
  /** Só na seção Cliente. */
  canal: string | null;
  /** Só nas seções Cliente e Forma de pagamento. */
  aReceber: number | null;
};

/** Cliente que só tem saldo (sem compra no período) não tem canal principal. */
const canalDoCliente = (c: LinhaCliente) => (c.faturamento > 0 ? rotuloCanal(c.canal) : "");

/** Uma linha por item de cada seção, sem totais (para filtrar por Seção no Excel). */
export function linhasDeVendas(r: RelatorioVendas): LinhaVendas[] {
  return [
    ...r.porCliente.map(
      (c): LinhaVendas => ({
        ...c,
        secao: "Cliente",
        item: c.cliente,
        canal: canalDoCliente(c),
        aReceber: c.aReceber,
      }),
    ),
    ...r.porProduto.map((p): LinhaVendas => ({ ...p, secao: "Produto", item: p.produto, canal: null, aReceber: null })),
    ...r.porCanal.map(
      (c): LinhaVendas => ({ ...c, secao: "Canal", item: rotuloCanal(c.canal), canal: null, aReceber: null }),
    ),
    ...r.porForma.map(
      (f): LinhaVendas => ({
        ...f,
        secao: "Forma de pagamento",
        item: ROTULOS_FORMA_PAGAMENTO_VENDA[f.formaPagamento],
        canal: null,
        aReceber: f.aReceber,
      }),
    ),
  ];
}

const num = (v: number | null) => (v === null ? "" : v);
const pct = (v: number | null) => (v === null ? "" : v * 100);

export const COLUNAS_VENDAS: ColunaExport<LinhaVendas>[] = [
  { rotulo: "Seção", valor: (l) => l.secao },
  { rotulo: "Item", valor: (l) => l.item },
  { rotulo: "Kg", valor: (l) => l.kg },
  { rotulo: "Faturamento", valor: (l) => l.faturamento },
  { rotulo: "% do total", valor: (l) => pct(l.percentual), tipo: "percentual" },
  { rotulo: "Preço médio", valor: (l) => num(l.precoMedio) },
  { rotulo: "Custo médio", valor: (l) => num(l.custoMedio) },
  { rotulo: "Margem", valor: (l) => l.margem },
  { rotulo: "Margem %", valor: (l) => pct(l.margemPercentual), tipo: "percentual" },
  { rotulo: "Canal principal", valor: (l) => l.canal ?? "" },
  { rotulo: "A receber", valor: (l) => num(l.aReceber) },
];

/** Linha de seção do PDF: indicadores com o rótulo da primeira coluna (e o total por último). */
type LinhaPdf = IndicadoresVenda & { rotulo: string; ordem?: number; canal?: string; aReceber?: number };

const colunasBase: ColunaExport<LinhaPdf>[] = [
  { rotulo: "Kg", valor: (l) => l.kg },
  { rotulo: "Faturamento (R$)", valor: (l) => l.faturamento },
  { rotulo: "% do total", valor: (l) => pct(l.percentual), tipo: "percentual" },
];

/** No PDF, uma seção por tabela da tela, cada uma com a linha de total. */
export function secoesDeVendas(r: RelatorioVendas): SecaoPdf<unknown>[] {
  const total: LinhaPdf = { ...r.total, rotulo: "Total" };
  return [
    secaoPdf<LinhaPdf>({
      titulo: "Vendas por cliente",
      linhas: [
        ...r.porCliente.map((c, i) => ({ ...c, rotulo: c.cliente, canal: canalDoCliente(c), ordem: i + 1 })),
        total,
      ],
      colunas: [
        { rotulo: "#", valor: (l) => l.ordem ?? "", tipo: "inteiro" },
        { rotulo: "Cliente", valor: (l) => l.rotulo },
        ...colunasBase,
        { rotulo: "Preço médio (R$/kg)", valor: (l) => num(l.precoMedio) },
        { rotulo: "Margem (R$)", valor: (l) => l.margem },
        { rotulo: "Margem %", valor: (l) => pct(l.margemPercentual), tipo: "percentual" },
        { rotulo: "Canal principal", valor: (l) => l.canal ?? "" },
        { rotulo: "A receber (R$)", valor: (l) => l.aReceber ?? "" },
      ],
    }),
    secaoPdf<LinhaPdf>({
      titulo: "Por produto",
      linhas: [...r.porProduto.map((p) => ({ ...p, rotulo: p.produto })), total],
      colunas: [
        { rotulo: "Produto", valor: (l) => l.rotulo },
        ...colunasBase,
        { rotulo: "Preço médio (R$/kg)", valor: (l) => num(l.precoMedio) },
        { rotulo: "Custo médio (R$/kg)", valor: (l) => num(l.custoMedio) },
        { rotulo: "Margem %", valor: (l) => pct(l.margemPercentual), tipo: "percentual" },
      ],
    }),
    secaoPdf<LinhaPdf>({
      titulo: "Por canal",
      linhas: [...r.porCanal.map((c) => ({ ...c, canal: undefined, rotulo: rotuloCanal(c.canal) })), total],
      colunas: [{ rotulo: "Canal", valor: (l) => l.rotulo }, ...colunasBase],
    }),
    secaoPdf<LinhaPdf>({
      titulo: "Por forma de pagamento",
      linhas: [...r.porForma.map((f) => ({ ...f, rotulo: ROTULOS_FORMA_PAGAMENTO_VENDA[f.formaPagamento] })), total],
      colunas: [
        { rotulo: "Forma", valor: (l) => l.rotulo },
        { rotulo: "Faturamento (R$)", valor: (l) => l.faturamento },
        { rotulo: "A receber hoje (R$)", valor: (l) => l.aReceber ?? "" },
      ],
    }),
  ];
}
