import type { ColunaExport } from "@/lib/export/csv";
import { secaoPdf, type SecaoPdf } from "@/lib/export/pdf";
import type { LinhaProcessamento } from "@/lib/producao/relatoriosProcessamento";
import type { RelatorioProcessamento } from "@/server/services/relatorioProducao/processamento";

type Valores = {
  quantidade?: number;
  encerradas?: number;
  frutoKg?: number;
  polpaKg?: number;
  rendimento?: number | null;
  rendimentoMin?: number | null;
  rendimentoMax?: number | null;
  aguaKg?: number;
  carocoResiduoKg?: number;
  perdaKg?: number;
  diferencaKg?: number;
  percentual?: number | null;
  opsVerificar?: number;
  custoFruto?: number;
  custoInsumos?: number;
  custoTotal?: number;
  custoKg?: number | null;
};

export type LinhaProcessamentoExport = Valores & {
  secao: "Resumo" | "Balanço de massa" | "Custo";
  fruta: string;
};

/** Três linhas por fruta (resumo, balanço, custo), cada uma com as colunas da sua seção; sem totais. */
export function linhasDeProcessamento(r: RelatorioProcessamento): LinhaProcessamentoExport[] {
  return r.porFruta.flatMap((l): LinhaProcessamentoExport[] => [
    {
      secao: "Resumo",
      fruta: l.fruta,
      quantidade: l.volume.quantidade,
      frutoKg: l.volume.frutoKg,
      polpaKg: l.volume.polpaKg,
      rendimento: l.volume.rendimento,
      encerradas: l.encerradas,
      rendimentoMin: l.rendimentoMin,
      rendimentoMax: l.rendimentoMax,
    },
    { secao: "Balanço de massa", fruta: l.fruta, encerradas: l.encerradas, ...l.balanco },
    { secao: "Custo", fruta: l.fruta, ...l.custo },
  ]);
}

const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : v);
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "" : v * 100);

export const COLUNAS_PROCESSAMENTO: ColunaExport<LinhaProcessamentoExport>[] = [
  { rotulo: "Seção", valor: (l) => l.secao },
  { rotulo: "Fruta", valor: (l) => l.fruta },
  { rotulo: "Nº OPs", valor: (l) => num(l.quantidade) },
  { rotulo: "OPs encerradas", valor: (l) => num(l.encerradas) },
  { rotulo: "Fruto (kg)", valor: (l) => num(l.frutoKg) },
  { rotulo: "Polpa (kg)", valor: (l) => num(l.polpaKg) },
  { rotulo: "Rendimento médio", valor: (l) => pct(l.rendimento), tipo: "percentual" },
  { rotulo: "Rendimento mín.", valor: (l) => pct(l.rendimentoMin), tipo: "percentual" },
  { rotulo: "Rendimento máx.", valor: (l) => pct(l.rendimentoMax), tipo: "percentual" },
  { rotulo: "Água (kg)", valor: (l) => num(l.aguaKg) },
  { rotulo: "Caroço/resíduo (kg)", valor: (l) => num(l.carocoResiduoKg) },
  { rotulo: "Perda (kg)", valor: (l) => num(l.perdaKg) },
  { rotulo: "Diferença (kg)", valor: (l) => num(l.diferencaKg) },
  { rotulo: "Diferença %", valor: (l) => pct(l.percentual), tipo: "percentual" },
  { rotulo: "OPs a verificar", valor: (l) => num(l.opsVerificar) },
  { rotulo: "Custo fruto (R$)", valor: (l) => num(l.custoFruto) },
  { rotulo: "Custo insumos (R$)", valor: (l) => num(l.custoInsumos) },
  { rotulo: "Custo total (R$)", valor: (l) => num(l.custoTotal) },
  { rotulo: "Custo/kg (R$)", valor: (l) => num(l.custoKg) },
];

type LinhaPdf = LinhaProcessamento & { fruta: string };

/** No PDF, uma seção por tabela da tela, com a linha de total; balanço e custo só com frutas com OP encerrada. */
export function secoesDeProcessamento(r: RelatorioProcessamento): SecaoPdf<unknown>[] {
  const total: LinhaPdf = { ...r.total, fruta: "Total" };
  const comEncerradas = r.porFruta.filter((l) => l.encerradas > 0);
  const comTotal = (linhas: LinhaPdf[]) => (linhas.length > 0 ? [...linhas, total] : []);
  return [
    secaoPdf<LinhaPdf>({
      titulo: "Resumo por fruta",
      linhas: comTotal(r.porFruta),
      colunas: [
        { rotulo: "Fruta", valor: (l) => l.fruta },
        { rotulo: "Nº OPs", valor: (l) => l.volume.quantidade, tipo: "inteiro" },
        { rotulo: "Fruto (kg)", valor: (l) => l.volume.frutoKg },
        { rotulo: "Polpa (kg)", valor: (l) => l.volume.polpaKg },
        { rotulo: "Rendimento médio", valor: (l) => pct(l.volume.rendimento), tipo: "percentual" },
        { rotulo: "Rend. mín. (encerradas)", valor: (l) => pct(l.rendimentoMin), tipo: "percentual" },
        { rotulo: "Rend. máx. (encerradas)", valor: (l) => pct(l.rendimentoMax), tipo: "percentual" },
        { rotulo: "Custo médio (R$/kg)", valor: (l) => num(l.volume.custoMedioPolpa) },
      ],
    }),
    secaoPdf<LinhaPdf>({
      titulo: "Balanço de massa (OPs encerradas)",
      linhas: comTotal(comEncerradas),
      colunas: [
        { rotulo: "Fruta", valor: (l) => l.fruta },
        { rotulo: "OPs", valor: (l) => l.encerradas, tipo: "inteiro" },
        { rotulo: "Fruto (kg)", valor: (l) => l.balanco.frutoKg },
        { rotulo: "Água (kg)", valor: (l) => l.balanco.aguaKg },
        { rotulo: "Polpa (kg)", valor: (l) => l.balanco.polpaKg },
        { rotulo: "Caroço/resíduo (kg)", valor: (l) => l.balanco.carocoResiduoKg },
        { rotulo: "Perda (kg)", valor: (l) => l.balanco.perdaKg },
        { rotulo: "Diferença (kg)", valor: (l) => l.balanco.diferencaKg },
        { rotulo: "Diferença %", valor: (l) => pct(l.balanco.percentual), tipo: "percentual" },
        { rotulo: "A verificar", valor: (l) => l.balanco.opsVerificar, tipo: "inteiro" },
      ],
    }),
    secaoPdf<LinhaPdf>({
      titulo: "Custo por fruta (OPs encerradas)",
      linhas: comTotal(comEncerradas),
      colunas: [
        { rotulo: "Fruta", valor: (l) => l.fruta },
        { rotulo: "Fruto (R$)", valor: (l) => l.custo.custoFruto },
        { rotulo: "Insumos (R$)", valor: (l) => l.custo.custoInsumos },
        { rotulo: "Total (R$)", valor: (l) => l.custo.custoTotal },
        { rotulo: "Polpa (kg)", valor: (l) => l.custo.polpaKg },
        { rotulo: "Custo/kg (R$)", valor: (l) => num(l.custo.custoKg) },
      ],
    }),
  ];
}
