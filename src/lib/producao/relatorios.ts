import { arredondar } from "./arredondar";
import {
  agregarOPs,
  agregarRecepcoes,
  agregarVendas,
  type GrupoRecepcao,
  type ItemDoPainel,
  type OPDoPainel,
  type TotaisOPs,
  type TotaisRecepcao,
  type TotaisVendas,
} from "./painel";

export const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;

/** Mês (0–11) da data do evento; as datas do sistema são de calendário em UTC. */
export function mesUTC(data: Date): number {
  return data.getUTCMonth();
}

export function agruparPorMes<T>(linhas: T[], data: (linha: T) => Date): T[][] {
  const meses: T[][] = Array.from({ length: 12 }, () => []);
  for (const linha of linhas) meses[mesUTC(data(linha))].push(linha);
  return meses;
}

// Relatório mensal ---------------------------------------------------------

export type RecepcaoDatada = GrupoRecepcao & { data: Date; valorTotal: number };
export type OPDatada = OPDoPainel & { data: Date };
export type ItemDatado = ItemDoPainel & { data: Date };

export type ColunaMensal = {
  /** 0–11; `null` = total do ano. */
  mes: number | null;
  recepcao: TotaisRecepcao;
  recepcaoPorFruta: Record<string, TotaisRecepcao>;
  /** Σ valor das recepções de terceiro (fruto pago). */
  pagoTerceiros: number;
  processamento: TotaisOPs;
  processamentoPorFruta: Record<string, TotaisOPs>;
  vendas: TotaisVendas;
  /** Faturamento de polpa por fruta. */
  polpaPorFruta: Record<string, number>;
};

function coluna(mes: number | null, recepcoes: RecepcaoDatada[], ops: OPDatada[], itens: ItemDatado[]): ColunaMensal {
  const rec = agregarRecepcoes(recepcoes);
  const proc = agregarOPs(ops);
  const vendas = agregarVendas(itens);
  return {
    mes,
    recepcao: rec.total,
    recepcaoPorFruta: Object.fromEntries(rec.porFruta),
    pagoTerceiros: arredondar(
      recepcoes.filter((r) => r.origem === "TERCEIRO").reduce((s, r) => s + r.valorTotal, 0),
      2,
    ),
    processamento: proc.total,
    processamentoPorFruta: Object.fromEntries(proc.porFruta),
    vendas: vendas.total,
    polpaPorFruta: Object.fromEntries(vendas.polpaPorFruta),
  };
}

/** Doze meses e o total do ano, cada um pelas mesmas funções do painel (D-29). */
export function montarColunasMensais(recepcoes: RecepcaoDatada[], ops: OPDatada[], itens: ItemDatado[]): ColunaMensal[] {
  const r = agruparPorMes(recepcoes, (x) => x.data);
  const o = agruparPorMes(ops, (x) => x.data);
  const i = agruparPorMes(itens, (x) => x.data);
  return [...MESES.map((_, m) => coluna(m, r[m], o[m], i[m])), coluna(null, recepcoes, ops, itens)];
}

/** kg de polpa produzida por produto: 12 meses e o total. */
export function polpaPorProdutoMes(linhas: { produtoId: string; data: Date; kg: number }[]) {
  const porProduto = new Map<string, { meses: number[]; total: number }>();
  for (const l of linhas) {
    const atual = porProduto.get(l.produtoId) ?? { meses: Array<number>(12).fill(0), total: 0 };
    const m = mesUTC(l.data);
    atual.meses[m] = arredondar(atual.meses[m] + l.kg, 3);
    atual.total = arredondar(atual.total + l.kg, 3);
    porProduto.set(l.produtoId, atual);
  }
  return porProduto;
}

/** Frutas com recepção, OP ou venda de polpa no ano, na ordem recebida (por nome). */
export function frutasComMovimento<F extends { id: string }>(total: ColunaMensal, frutas: F[]): F[] {
  return frutas.filter(
    (f) => f.id in total.recepcaoPorFruta || f.id in total.processamentoPorFruta || f.id in total.polpaPorFruta,
  );
}

export type Unidade = "kg" | "%" | "R$" | "R$/kg" | "nº";

export type IndicadorMensal = {
  rotulo: string;
  /** Nome da fruta; vazio = total. */
  fruta: string;
  unidade: Unidade;
  valor: (coluna: ColunaMensal) => number | null;
};

export type BlocoMensal = { titulo: string; indicadores: IndicadorMensal[] };

/** Colunas das quatro tabelas do mensal (tela, PDF e CSV usam a mesma definição). */
export function blocosMensais(frutas: { id: string; nome: string }[]): BlocoMensal[] {
  const porFruta = (rotulo: string, unidade: Unidade, valor: (c: ColunaMensal, frutaId: string) => number | null) =>
    frutas.map((f): IndicadorMensal => ({ rotulo, fruta: f.nome, unidade, valor: (c) => valor(c, f.id) }));
  const total = (rotulo: string, unidade: Unidade, valor: (c: ColunaMensal) => number | null): IndicadorMensal => ({
    rotulo,
    fruta: "",
    unidade,
    valor,
  });

  return [
    {
      titulo: "Recepção",
      indicadores: [
        ...porFruta("Próprio", "kg", (c, id) => {
          const r = c.recepcaoPorFruta[id];
          return r ? arredondar(r.recebidoKg - r.terceirosKg, 3) : 0;
        }),
        ...porFruta("Terceiros", "kg", (c, id) => c.recepcaoPorFruta[id]?.terceirosKg ?? 0),
        total("Total recebido", "kg", (c) => c.recepcao.recebidoKg),
      ],
    },
    {
      titulo: "Processamento",
      indicadores: [
        ...porFruta("Fruto processado", "kg", (c, id) => c.processamentoPorFruta[id]?.frutoKg ?? 0),
        ...porFruta("Polpa produzida", "kg", (c, id) => c.processamentoPorFruta[id]?.polpaKg ?? 0),
        ...porFruta("Rendimento", "%", (c, id) => c.processamentoPorFruta[id]?.rendimento ?? null),
        total("Nº de OPs", "nº", (c) => c.processamento.quantidade),
      ],
    },
    {
      titulo: "Vendas",
      indicadores: [
        total("Fruto in natura", "R$", (c) => c.vendas.faturamentoInNatura),
        ...porFruta("Polpa", "R$", (c, id) => c.polpaPorFruta[id] ?? 0),
        total("Faturamento total", "R$", (c) => c.vendas.faturamento),
        total("Kg vendidos", "kg", (c) => c.vendas.kgVendidos),
        total("Margem bruta", "R$", (c) => c.vendas.margem),
        total("Margem bruta (%)", "%", (c) => c.vendas.margemPercentual),
      ],
    },
    {
      titulo: "Custos",
      indicadores: [
        ...porFruta("Custo da polpa", "R$/kg", (c, id) => c.processamentoPorFruta[id]?.custoMedioPolpa ?? null),
        total("Fruto pago a terceiros", "R$", (c) => c.pagoTerceiros),
      ],
    },
  ];
}
