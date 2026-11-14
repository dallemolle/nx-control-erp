import type { ColunaExport } from "@/lib/export/csv";
import { secaoPdf, type SecaoPdf } from "@/lib/export/pdf";
import { MESES } from "@/lib/producao/relatorios";
import type { IndicadoresOrigem, LinhaProdutividade } from "@/lib/producao/relatoriosOrigem";
import { ROTULOS_ORIGEM_RECEPCAO } from "@/lib/schemas/enums";
import type { RelatorioOrigem } from "@/server/services/relatorioProducao/origem";

export type LinhaOrigemExport = {
  secao: "Origem" | "Produtividade" | "Preço a terceiros";
  origem: string;
  tipo: string;
  fruta: string;
  /** 1–12 ou "Ano"; só na seção Preço a terceiros. */
  mes: string;
  kg: number | null;
  valor: number | null;
  precoMedio: number | null;
  percentualDescarte: number | null;
  cargas: number | null;
  areaHa: number | null;
  kgAno: number | null;
  toneladasHa: number | null;
  colheitas: number | null;
};

const VAZIA: Omit<LinhaOrigemExport, "secao"> = {
  origem: "",
  tipo: "",
  fruta: "",
  mes: "",
  kg: null,
  valor: null,
  precoMedio: null,
  percentualDescarte: null,
  cargas: null,
  areaHa: null,
  kgAno: null,
  toneladasHa: null,
  colheitas: null,
};

/** Uma linha por origem × fruta, por talhão e por fruta × mês; sem totais (para tabela dinâmica). */
export function linhasDeOrigem(r: RelatorioOrigem): LinhaOrigemExport[] {
  const origens = r.porOrigem.flatMap((o) =>
    r.frutas
      .filter((f) => f.id in o.porFruta)
      .map(
        (f): LinhaOrigemExport => ({
          ...VAZIA,
          ...o.porFruta[f.id],
          secao: "Origem",
          origem: o.nome,
          tipo: ROTULOS_ORIGEM_RECEPCAO[o.tipo],
          fruta: f.nome,
        }),
      ),
  );
  const produtividade = r.produtividade.map(
    (p): LinhaOrigemExport => ({
      ...VAZIA,
      secao: "Produtividade",
      origem: p.talhao,
      fruta: p.fruta,
      kg: p.kgPeriodo,
      areaHa: p.areaHa,
      kgAno: p.kgAno,
      toneladasHa: p.toneladasHa,
      colheitas: p.colheitas,
    }),
  );
  const precos = r.frutasTerceiros.flatMap((f) =>
    r.precoPorMes[f.id].flatMap((preco, i): LinhaOrigemExport[] =>
      preco === null
        ? []
        : [{ ...VAZIA, secao: "Preço a terceiros", fruta: f.nome, mes: i === 12 ? "Ano" : String(i + 1), precoMedio: preco }],
    ),
  );
  return [...origens, ...produtividade, ...precos];
}

const num = (v: number | null) => (v === null ? "" : v);
const pct = (v: number | null) => (v === null ? "" : v * 100);

export const COLUNAS_ORIGEM: ColunaExport<LinhaOrigemExport>[] = [
  { rotulo: "Seção", valor: (l) => l.secao },
  { rotulo: "Origem/Talhão", valor: (l) => l.origem },
  { rotulo: "Tipo", valor: (l) => l.tipo },
  { rotulo: "Fruta", valor: (l) => l.fruta },
  { rotulo: "Mês", valor: (l) => l.mes },
  { rotulo: "Kg", valor: (l) => num(l.kg) },
  { rotulo: "Valor", valor: (l) => num(l.valor) },
  { rotulo: "Preço médio", valor: (l) => num(l.precoMedio) },
  { rotulo: "Descarte %", valor: (l) => pct(l.percentualDescarte), tipo: "percentual" },
  { rotulo: "Cargas", valor: (l) => num(l.cargas) },
  { rotulo: "Área (ha)", valor: (l) => num(l.areaHa) },
  { rotulo: "Kg no ano", valor: (l) => num(l.kgAno) },
  { rotulo: "t/ha", valor: (l) => num(l.toneladasHa) },
  { rotulo: "Colheitas", valor: (l) => num(l.colheitas) },
];

type LinhaPdfOrigem = IndicadoresOrigem & { rotulo: string; tipo: string; porFruta: Record<string, IndicadoresOrigem> };
type LinhaPdfProdutividade = Omit<LinhaProdutividade, "talhaoId">;
type LinhaPdfPreco = { mes: string; precos: (number | null)[] };

/** No PDF, uma seção por tabela da tela, com a linha de total. */
export function secoesDeOrigem(r: RelatorioOrigem): SecaoPdf<unknown>[] {
  const tp = r.totalProdutividade;
  return [
    secaoPdf<LinhaPdfOrigem>({
      titulo: "Por origem",
      linhas: [
        ...r.porOrigem.map((o) => ({ ...o, rotulo: o.nome, tipo: ROTULOS_ORIGEM_RECEPCAO[o.tipo] })),
        { ...r.total, rotulo: "Total", tipo: "" },
      ],
      colunas: [
        { rotulo: "Origem", valor: (l) => l.rotulo },
        { rotulo: "Tipo", valor: (l) => l.tipo },
        ...r.frutas.map(
          (f): ColunaExport<LinhaPdfOrigem> => ({ rotulo: `${f.nome} (kg)`, valor: (l) => l.porFruta[f.id]?.kg ?? 0 }),
        ),
        { rotulo: "Total (kg)", valor: (l) => l.kg },
        { rotulo: "Valor pago (R$)", valor: (l) => num(l.valor) },
        { rotulo: "Preço médio (R$/kg)", valor: (l) => num(l.precoMedio) },
        { rotulo: "Descarte %", valor: (l) => pct(l.percentualDescarte), tipo: "percentual" },
        { rotulo: "Cargas", valor: (l) => l.cargas, tipo: "inteiro" },
      ],
    }),
    secaoPdf<LinhaPdfProdutividade>({
      titulo: `Produtividade dos talhões em ${r.ano}`,
      linhas: [...r.produtividade, { ...tp, talhao: "Total", fruta: "", toneladasHa: null }],
      colunas: [
        { rotulo: "Talhão", valor: (l) => l.talhao },
        { rotulo: "Fruta", valor: (l) => l.fruta },
        { rotulo: "Área (ha)", valor: (l) => l.areaHa },
        { rotulo: "Kg no período", valor: (l) => l.kgPeriodo },
        { rotulo: `Kg em ${r.ano}`, valor: (l) => l.kgAno },
        { rotulo: "t/ha no ano", valor: (l) => num(l.toneladasHa) },
        { rotulo: "Colheitas no ano", valor: (l) => l.colheitas, tipo: "inteiro" },
      ],
    }),
    secaoPdf<LinhaPdfPreco>({
      titulo: `Preço médio pago a terceiros por mês em ${r.ano}`,
      linhas:
        r.frutasTerceiros.length === 0
          ? []
          : [...MESES, "Ano"].map((mes, i) => ({ mes, precos: r.frutasTerceiros.map((f) => r.precoPorMes[f.id][i]) })),
      colunas: [
        { rotulo: "Mês", valor: (l) => l.mes },
        ...r.frutasTerceiros.map(
          (f, j): ColunaExport<LinhaPdfPreco> => ({ rotulo: `${f.nome} (R$/kg)`, valor: (l) => num(l.precos[j]) }),
        ),
      ],
    }),
  ];
}
