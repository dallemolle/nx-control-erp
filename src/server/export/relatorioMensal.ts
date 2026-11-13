import type { ColunaExport } from "@/lib/export/csv";
import { secaoPdf, type SecaoPdf } from "@/lib/export/pdf";
import { blocosMensais, MESES, type ColunaMensal, type Unidade } from "@/lib/producao/relatorios";
import type { RelatorioMensal } from "@/server/services/relatorioProducao/mensal";

export type LinhaMensal = {
  bloco: string;
  indicador: string;
  fruta: string;
  /** "1"–"12" ou "Total". */
  mes: string;
  valor: number | null;
  unidade: Unidade;
};

type LinhaPolpa = RelatorioMensal["polpaPorProduto"][number];

const POLPA = "Polpa por produto";
const mesDaColuna = (c: ColunaMensal) => (c.mes === null ? "Total" : String(c.mes + 1));
const nomeDaColuna = (c: ColunaMensal) => (c.mes === null ? "Total" : MESES[c.mes]);
/** Percentual em fração vira 0–100; nulo vira vazio. */
const paraExport = (valor: number | null, unidade: Unidade) =>
  valor === null ? "" : unidade === "%" ? valor * 100 : valor;
const tipoPdf = (unidade: Unidade) => (unidade === "%" ? "percentual" : unidade === "nº" ? "inteiro" : undefined);

/** Formato longo: um indicador × mês por linha (tabela dinâmica no Excel). */
export function linhasDoMensal(r: RelatorioMensal): LinhaMensal[] {
  const linhas: LinhaMensal[] = [];
  for (const bloco of blocosMensais(r.frutas)) {
    for (const ind of bloco.indicadores) {
      for (const c of r.colunas) {
        linhas.push({
          bloco: bloco.titulo,
          indicador: ind.rotulo,
          fruta: ind.fruta,
          mes: mesDaColuna(c),
          valor: ind.valor(c),
          unidade: ind.unidade,
        });
      }
    }
  }
  for (const p of r.polpaPorProduto) {
    [...p.meses, p.total].forEach((valor, i) =>
      linhas.push({
        bloco: POLPA,
        indicador: p.produto,
        fruta: "",
        mes: i === 12 ? "Total" : String(i + 1),
        valor,
        unidade: "kg",
      }),
    );
  }
  return linhas;
}

export const COLUNAS_MENSAL: ColunaExport<LinhaMensal>[] = [
  { rotulo: "Bloco", valor: (l) => l.bloco },
  { rotulo: "Indicador", valor: (l) => l.indicador },
  { rotulo: "Fruta", valor: (l) => l.fruta },
  { rotulo: "Mês", valor: (l) => l.mes },
  { rotulo: "Valor", valor: (l) => paraExport(l.valor, l.unidade) },
  { rotulo: "Unidade", valor: (l) => l.unidade },
];

/** No PDF, cada bloco como na tela: meses nas linhas, indicadores nas colunas. */
export function secoesDoMensal(r: RelatorioMensal): SecaoPdf<unknown>[] {
  return [
    ...blocosMensais(r.frutas).map((bloco) =>
      secaoPdf<ColunaMensal>({
        titulo: bloco.titulo,
        linhas: r.colunas,
        colunas: [
          { rotulo: "Mês", valor: nomeDaColuna },
          ...bloco.indicadores.map(
            (ind): ColunaExport<ColunaMensal> => ({
              rotulo: `${ind.rotulo}${ind.fruta ? ` ${ind.fruta}` : ""} (${ind.unidade})`,
              valor: (c) => paraExport(ind.valor(c), ind.unidade),
              tipo: tipoPdf(ind.unidade),
            }),
          ),
        ],
      }),
    ),
    secaoPdf<LinhaPolpa>({
      titulo: "Polpa produzida por produto (kg)",
      linhas: r.polpaPorProduto,
      colunas: [
        { rotulo: "Produto", valor: (p) => p.produto },
        ...MESES.map((m, i): ColunaExport<LinhaPolpa> => ({ rotulo: m, valor: (p) => p.meses[i] })),
        { rotulo: "Total", valor: (p) => p.total },
      ],
    }),
  ];
}
