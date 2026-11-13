import type { CanalVenda, FormaPagamentoVenda } from "@prisma/client";
import { CANAL_VENDA, FORMA_PAGAMENTO_VENDA, ROTULOS_CANAL_VENDA } from "@/lib/schemas/enums";
import { arredondar } from "./arredondar";
import { calcularItem } from "./venda";
import {
  agregarOPs,
  agregarRecepcoes,
  agregarVendas,
  razao,
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

export type Unidade = "kg" | "%" | "R$" | "R$/kg" | "nº" | "ha" | "t/ha";

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

// Relatório de vendas ------------------------------------------------------

export type ItemVenda = ItemDoPainel & {
  clienteId: string;
  cliente: string;
  canal: CanalVenda | null;
  formaPagamento: FormaPagamentoVenda;
};
export type ItemVendido = ItemVenda & { data: Date };

/** Saldo de uma parcela aberta (RN-26), com o cliente e a forma do pedido de origem. */
export type SaldoAReceber = { clienteId: string; cliente: string; formaPagamento: FormaPagamentoVenda; saldo: number };

export type IndicadoresVenda = {
  kg: number;
  faturamento: number;
  custo: number;
  margem: number;
  margemPercentual: number | null;
  precoMedio: number | null;
  /** Σ custo ÷ Σ kg. */
  custoMedio: number | null;
  /** Fração do faturamento total. */
  percentual: number | null;
};
export type LinhaCliente = IndicadoresVenda & {
  clienteId: string;
  cliente: string;
  canal: CanalVenda | null;
  aReceber: number;
};
export type LinhaProdutoVenda = IndicadoresVenda & { produtoId: string };
export type LinhaCanal = IndicadoresVenda & { canal: CanalVenda | null };
export type LinhaForma = IndicadoresVenda & { formaPagamento: FormaPagamentoVenda; aReceber: number };

type Soma = { kg: number; faturamento: number; custo: number };

function somarItens(itens: ItemVenda[]): Soma {
  let kg = 0;
  let faturamento = 0;
  let custo = 0;
  for (const item of itens) {
    const r = calcularItem(item);
    kg += item.quantidadeKg;
    faturamento += r.valor;
    custo += r.custo;
  }
  return { kg: arredondar(kg, 3), faturamento: arredondar(faturamento, 2), custo: arredondar(custo, 2) };
}

function indicadores(s: Soma, faturamentoTotal: number): IndicadoresVenda {
  const margem = arredondar(s.faturamento - s.custo, 2);
  return {
    ...s,
    margem,
    margemPercentual: razao(margem, s.faturamento),
    precoMedio: razao(s.faturamento, s.kg),
    custoMedio: razao(s.custo, s.kg),
    percentual: razao(s.faturamento, faturamentoTotal),
  };
}

function agrupar<T, K>(itens: T[], chave: (item: T) => K): Map<K, T[]> {
  const grupos = new Map<K, T[]>();
  for (const item of itens) grupos.set(chave(item), [...(grupos.get(chave(item)) ?? []), item]);
  return grupos;
}

const ordemCanal = (c: CanalVenda | null) => (c === null ? CANAL_VENDA.length : CANAL_VENDA.indexOf(c));

export function rotuloCanal(canal: CanalVenda | null): string {
  return canal === null ? "Sem canal" : ROTULOS_CANAL_VENDA[canal];
}

/** Canal que mais faturou nos itens; empate pela ordem do cadastro, "sem canal" por último. */
export function canalPrincipal(itens: ItemVenda[]): CanalVenda | null {
  let melhor: { canal: CanalVenda | null; valor: number } | null = null;
  for (const [canal, grupo] of agrupar(itens, (i) => i.canal)) {
    const valor = somarItens(grupo).faturamento;
    if (!melhor || valor > melhor.valor || (valor === melhor.valor && ordemCanal(canal) < ordemCanal(melhor.canal))) {
      melhor = { canal, valor };
    }
  }
  return melhor?.canal ?? null;
}

export function somarSaldos(saldos: SaldoAReceber[]): number {
  return arredondar(
    saldos.reduce((s, x) => s + x.saldo, 0),
    2,
  );
}

/** Tabelas do relatório de vendas: itens do período e saldos a receber de hoje (D-29). */
export function agregarVendasDetalhadas(itens: ItemVenda[], saldos: SaldoAReceber[]) {
  const soma = somarItens(itens);
  const total = { ...indicadores(soma, soma.faturamento), aReceber: somarSaldos(saldos) };
  const ind = (grupo: ItemVenda[]) => indicadores(somarItens(grupo), soma.faturamento);

  const itensPorCliente = agrupar(itens, (i) => i.clienteId);
  const saldosPorCliente = agrupar(saldos, (s) => s.clienteId);
  const nomes = new Map([...itens, ...saldos].map((x) => [x.clienteId, x.cliente]));
  const porCliente: LinhaCliente[] = [...nomes].map(([clienteId, cliente]) => {
    const grupo = itensPorCliente.get(clienteId) ?? [];
    return {
      ...ind(grupo),
      clienteId,
      cliente,
      canal: canalPrincipal(grupo),
      aReceber: somarSaldos(saldosPorCliente.get(clienteId) ?? []),
    };
  });
  porCliente.sort(
    (a, b) => b.faturamento - a.faturamento || b.aReceber - a.aReceber || a.cliente.localeCompare(b.cliente),
  );

  const porProduto: LinhaProdutoVenda[] = [...agrupar(itens, (i) => i.produtoId)]
    .map(([produtoId, grupo]) => ({ ...ind(grupo), produtoId }))
    .sort((a, b) => b.faturamento - a.faturamento || a.produtoId.localeCompare(b.produtoId));

  const porCanal: LinhaCanal[] = [...agrupar(itens, (i) => i.canal)]
    .map(([canal, grupo]) => ({ ...ind(grupo), canal }))
    .sort((a, b) => b.faturamento - a.faturamento || ordemCanal(a.canal) - ordemCanal(b.canal));

  const itensPorForma = agrupar(itens, (i) => i.formaPagamento);
  const saldosPorForma = agrupar(saldos, (s) => s.formaPagamento);
  const porForma: LinhaForma[] = FORMA_PAGAMENTO_VENDA.filter((f) => itensPorForma.has(f) || saldosPorForma.has(f))
    .map((formaPagamento) => ({
      ...ind(itensPorForma.get(formaPagamento) ?? []),
      formaPagamento,
      aReceber: somarSaldos(saldosPorForma.get(formaPagamento) ?? []),
    }))
    .sort((a, b) => b.faturamento - a.faturamento || b.aReceber - a.aReceber);

  return { total, porCliente, porProduto, porCanal, porForma };
}
