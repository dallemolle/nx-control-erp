import type { CategoriaProduto, OrigemRecepcao, StatusOrdemProducao } from "@prisma/client";
import { arredondar } from "./arredondar";
import type { StatusLote } from "./statusLote";
import { calcularItem } from "./venda";

/** Divisão do painel: sem denominador positivo não há indicador (a tela mostra "—"). */
export function razao(numerador: number, denominador: number): number | null {
  return denominador > 0 ? numerador / denominador : null;
}

function agruparPor<T, R>(itens: T[], chave: (item: T) => string, totalizar: (grupo: T[]) => R): Map<string, R> {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const k = chave(item);
    grupos.set(k, [...(grupos.get(k) ?? []), item]);
  }
  return new Map([...grupos].map(([k, grupo]) => [k, totalizar(grupo)]));
}

const somar = <T>(itens: T[], valor: (item: T) => number) => itens.reduce((s, i) => s + valor(i), 0);

// Recepção ---------------------------------------------------------------

export type GrupoRecepcao = { frutaId: string; origem: OrigemRecepcao; brutoKg: number; descarteKg: number };

export type TotaisRecepcao = {
  brutoKg: number;
  descarteKg: number;
  recebidoKg: number;
  terceirosKg: number;
  /** RN-33: kg líquidos de terceiros ÷ kg líquidos recebidos. */
  percentualTerceiros: number | null;
  /** Σ descarte ÷ Σ bruto. */
  percentualDescarte: number | null;
};

function totaisRecepcao(grupos: GrupoRecepcao[]): TotaisRecepcao {
  const bruto = somar(grupos, (g) => g.brutoKg);
  const descarte = somar(grupos, (g) => g.descarteKg);
  const terceiros = somar(
    grupos.filter((g) => g.origem === "TERCEIRO"),
    (g) => g.brutoKg - g.descarteKg,
  );
  const recebido = bruto - descarte;
  return {
    brutoKg: arredondar(bruto, 3),
    descarteKg: arredondar(descarte, 3),
    recebidoKg: arredondar(recebido, 3),
    terceirosKg: arredondar(terceiros, 3),
    percentualTerceiros: razao(terceiros, recebido),
    percentualDescarte: razao(descarte, bruto),
  };
}

export function agregarRecepcoes(grupos: GrupoRecepcao[]) {
  return { total: totaisRecepcao(grupos), porFruta: agruparPor(grupos, (g) => g.frutaId, totaisRecepcao) };
}

// Processamento ----------------------------------------------------------

export type OPDoPainel = {
  frutaId: string;
  status: StatusOrdemProducao;
  frutoKg: number;
  polpaKg: number;
  /** Custo gravado (encerrada) ou provisório (aberta); só o da encerrada entra na média. */
  custoTotal: number;
  balancoVerificar: boolean;
  branqueamentoVerificar: boolean;
};

export type TotaisOPs = {
  quantidade: number;
  frutoKg: number;
  polpaKg: number;
  /** RN-10. */
  rendimento: number | null;
  /** Σ custo ÷ Σ polpa das OPs encerradas (D-26). */
  custoMedioPolpa: number | null;
};

function totaisOPs(ops: OPDoPainel[]): TotaisOPs {
  const fruto = somar(ops, (op) => op.frutoKg);
  const polpa = somar(ops, (op) => op.polpaKg);
  const encerradas = ops.filter((op) => op.status === "ENCERRADA");
  return {
    quantidade: ops.length,
    frutoKg: arredondar(fruto, 3),
    polpaKg: arredondar(polpa, 3),
    rendimento: razao(polpa, fruto),
    custoMedioPolpa: razao(
      somar(encerradas, (op) => op.custoTotal),
      somar(encerradas, (op) => op.polpaKg),
    ),
  };
}

/** OP cancelada fica fora de tudo; aberta conta no volume e nos alertas. */
export function agregarOPs(ops: OPDoPainel[]) {
  const validas = ops.filter((op) => op.status !== "CANCELADA");
  return {
    total: totaisOPs(validas),
    porFruta: agruparPor(validas, (op) => op.frutaId, totaisOPs),
    opsBalanco: validas.filter((op) => op.balancoVerificar).length,
    opsBranqueamento: validas.filter((op) => op.branqueamentoVerificar).length,
  };
}

// Vendas -----------------------------------------------------------------

export type ItemDoPainel = {
  pedidoId: string;
  produtoId: string;
  categoria: CategoriaProduto;
  frutaId: string;
  quantidadeKg: number;
  precoKg: number;
  custoKg: number;
};

export type TotaisVendas = {
  faturamento: number;
  faturamentoInNatura: number;
  faturamentoPolpa: number;
  kgVendidos: number;
  /** RN-32: faturamento ÷ kg. */
  precoMedio: number | null;
  pedidos: number;
  /** RN-32: faturamento ÷ nº de pedidos. */
  ticketMedio: number | null;
  /** RN-22, com o custo gravado no item. */
  margem: number;
  margemPercentual: number | null;
};

/** Itens de pedidos confirmados do período; valor e custo de cada item como no pedido (`calcularItem`). */
export function agregarVendas(itens: ItemDoPainel[]) {
  let faturamento = 0;
  let custo = 0;
  let kg = 0;
  let inNatura = 0;
  const pedidos = new Set<string>();
  const polpaPorFruta = new Map<string, number>();
  const porProduto = new Map<string, { kg: number; faturamento: number }>();

  for (const item of itens) {
    const r = calcularItem(item);
    faturamento += r.valor;
    custo += r.custo;
    kg += item.quantidadeKg;
    pedidos.add(item.pedidoId);
    if (item.categoria === "FRUTO") inNatura += r.valor;
    else polpaPorFruta.set(item.frutaId, arredondar((polpaPorFruta.get(item.frutaId) ?? 0) + r.valor, 2));
    const produto = porProduto.get(item.produtoId) ?? { kg: 0, faturamento: 0 };
    porProduto.set(item.produtoId, {
      kg: arredondar(produto.kg + item.quantidadeKg, 3),
      faturamento: arredondar(produto.faturamento + r.valor, 2),
    });
  }

  faturamento = arredondar(faturamento, 2);
  const margem = arredondar(faturamento - custo, 2);
  return {
    total: {
      faturamento,
      faturamentoInNatura: arredondar(inNatura, 2),
      faturamentoPolpa: arredondar(faturamento - inNatura, 2),
      kgVendidos: arredondar(kg, 3),
      precoMedio: razao(faturamento, kg),
      pedidos: pedidos.size,
      ticketMedio: razao(faturamento, pedidos.size),
      margem,
      margemPercentual: razao(margem, faturamento),
    } satisfies TotaisVendas,
    polpaPorFruta,
    porProduto,
  };
}

// Estoque ----------------------------------------------------------------

export type LoteDoPainel = {
  produtoId: string;
  categoria: CategoriaProduto;
  status: StatusLote;
  saldoKg: number;
  /** RN-17, já calculado pela listagem de lotes. */
  valor: number;
};

export type ContagemKg = { quantidade: number; kg: number };

/** Lotes com saldo na data de hoje (os mesmos da tela de Estoque). */
export function agregarEstoque(lotes: LoteDoPainel[]) {
  const contar = (status: StatusLote): ContagemKg => {
    const doStatus = lotes.filter((l) => l.status === status);
    return { quantidade: doStatus.length, kg: arredondar(somar(doStatus, (l) => l.saldoKg), 3) };
  };
  const kg = (grupo: LoteDoPainel[]) => arredondar(somar(grupo, (l) => l.saldoKg), 3);
  const valor = (grupo: LoteDoPainel[]) => arredondar(somar(grupo, (l) => l.valor), 2);
  const frutoValido = lotes.filter((l) => l.categoria === "FRUTO" && (l.status === "OK" || l.status === "VENCENDO"));
  return {
    polpaKg: kg(lotes.filter((l) => l.categoria === "POLPA")),
    frutoAguardandoKg: kg(frutoValido),
    valor: valor(lotes),
    vencendo: contar("VENCENDO"),
    vencidos: contar("VENCIDO"),
    porProduto: agruparPor(
      lotes,
      (l) => l.produtoId,
      (grupo) => ({ saldoKg: kg(grupo), valor: valor(grupo) }),
    ),
  };
}
