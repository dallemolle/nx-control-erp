import type { ColunaExport } from "@/lib/export/csv";
import { secaoPdf, type SecaoPdf } from "@/lib/export/pdf";
import type { PainelProducao } from "@/server/services/relatorioProducao/painel";

export type Unidade = "kg" | "%" | "R$" | "R$/kg" | "nº";
export type LinhaIndicador = {
  bloco: string;
  indicador: string;
  fruta: string;
  valor: number | null;
  unidade: Unidade;
};

const RECEPCAO = "Recepção e processamento";
const VENDAS = "Vendas";
const ESTOQUE = "Estoque e alertas";

/** Uma linha por indicador (total com fruta vazia, depois uma por fruta). Percentual em fração. */
export function linhasDoPainel(p: PainelProducao): LinhaIndicador[] {
  const linhas: LinhaIndicador[] = [];
  const add = (bloco: string, indicador: string, unidade: Unidade, valor: number | null, fruta = "") =>
    linhas.push({ bloco, indicador, fruta, valor, unidade });
  const porFruta = (
    bloco: string,
    indicador: string,
    unidade: Unidade,
    total: number | null,
    valor: (f: PainelProducao["porFruta"][number]) => number | null | undefined,
  ) => {
    add(bloco, indicador, unidade, total);
    for (const f of p.porFruta) {
      const v = valor(f);
      if (v !== undefined) add(bloco, indicador, unidade, v, f.fruta);
    }
  };

  porFruta(RECEPCAO, "Fruto recebido", "kg", p.recepcao.recebidoKg, (f) => f.recepcao?.recebidoKg);
  porFruta(
    RECEPCAO,
    "De terceiros",
    "%",
    p.recepcao.percentualTerceiros,
    (f) => f.recepcao?.percentualTerceiros,
  );
  porFruta(
    RECEPCAO,
    "Descarte na triagem",
    "%",
    p.recepcao.percentualDescarte,
    (f) => f.recepcao?.percentualDescarte,
  );
  porFruta(RECEPCAO, "Nº de OPs", "nº", p.processamento.quantidade, (f) => f.processamento?.quantidade);
  porFruta(RECEPCAO, "Fruto processado", "kg", p.processamento.frutoKg, (f) => f.processamento?.frutoKg);
  porFruta(RECEPCAO, "Polpa produzida", "kg", p.processamento.polpaKg, (f) => f.processamento?.polpaKg);
  porFruta(RECEPCAO, "Rendimento", "%", p.processamento.rendimento, (f) => f.processamento?.rendimento);
  porFruta(
    RECEPCAO,
    "Custo médio da polpa (só OPs encerradas)",
    "R$/kg",
    p.processamento.custoMedioPolpa,
    (f) => f.processamento?.custoMedioPolpa,
  );

  add(VENDAS, "Faturamento", "R$", p.vendas.faturamento);
  add(VENDAS, "Faturamento in natura", "R$", p.vendas.faturamentoInNatura);
  porFruta(VENDAS, "Faturamento de polpa", "R$", p.vendas.faturamentoPolpa, (f) =>
    f.faturamentoPolpa > 0 ? f.faturamentoPolpa : undefined,
  );
  add(VENDAS, "Kg vendidos", "kg", p.vendas.kgVendidos);
  add(VENDAS, "Preço médio", "R$/kg", p.vendas.precoMedio);
  add(VENDAS, "Nº de pedidos", "nº", p.vendas.pedidos);
  add(VENDAS, "Ticket médio", "R$", p.vendas.ticketMedio);
  add(VENDAS, "Margem bruta", "R$", p.vendas.margem);
  add(VENDAS, "Margem bruta (%)", "%", p.vendas.margemPercentual);
  add(VENDAS, "A receber em aberto (hoje)", "R$", p.vendas.aReceber);

  add(ESTOQUE, "Estoque de polpa", "kg", p.estoque.polpaKg);
  add(ESTOQUE, "Fruto aguardando", "kg", p.estoque.frutoAguardandoKg);
  add(ESTOQUE, "Valor do estoque a custo", "R$", p.estoque.valor);
  add(ESTOQUE, "Lotes vencendo", "nº", p.alertas.lotesVencendo.quantidade);
  add(ESTOQUE, "Lotes vencendo (kg)", "kg", p.alertas.lotesVencendo.kg);
  add(ESTOQUE, "Lotes vencidos com saldo", "nº", p.alertas.lotesVencidos.quantidade);
  add(ESTOQUE, "Lotes vencidos com saldo (kg)", "kg", p.alertas.lotesVencidos.kg);
  add(ESTOQUE, "Entregas pendentes ou em rota", "nº", p.alertas.entregasAbertas);
  add(ESTOQUE, "Entregas com atraso", "nº", p.alertas.entregasAtrasadas);
  add(ESTOQUE, "OPs com balanço a verificar", "nº", p.alertas.opsBalanco);
  add(ESTOQUE, "OPs com branqueamento a verificar", "nº", p.alertas.opsBranqueamento);
  return linhas;
}

export const COLUNAS_INDICADORES: ColunaExport<LinhaIndicador>[] = [
  { rotulo: "Bloco", valor: (l) => l.bloco },
  { rotulo: "Indicador", valor: (l) => l.indicador },
  { rotulo: "Fruta", valor: (l) => l.fruta },
  { rotulo: "Valor", valor: (l) => (l.valor === null ? "" : l.unidade === "%" ? l.valor * 100 : l.valor) },
  { rotulo: "Unidade", valor: (l) => l.unidade },
];

/** No PDF, uma seção por bloco (sem a coluna Bloco) e as duas tabelas. */
export function secoesDoPainel(p: PainelProducao): SecaoPdf<unknown>[] {
  const linhas = linhasDoPainel(p);
  const colunas = COLUNAS_INDICADORES.filter((c) => c.rotulo !== "Bloco");
  return [
    ...[RECEPCAO, VENDAS, ESTOQUE].map((bloco) =>
      secaoPdf({ titulo: bloco, linhas: linhas.filter((l) => l.bloco === bloco), colunas }),
    ),
    secaoPdf({
      titulo: "Estoque atual por produto",
      linhas: p.estoquePorProduto,
      colunas: [
        { rotulo: "Produto", valor: (l) => l.produto },
        { rotulo: "Saldo (kg)", valor: (l) => l.saldoKg },
        { rotulo: "Valor (R$)", valor: (l) => l.valor },
      ],
    }),
    secaoPdf({
      titulo: "Vendas do período por produto",
      linhas: p.vendasPorProduto,
      colunas: [
        { rotulo: "Produto", valor: (l) => l.produto },
        { rotulo: "Kg", valor: (l) => l.kg },
        { rotulo: "Faturamento (R$)", valor: (l) => l.faturamento },
      ],
    }),
  ];
}
