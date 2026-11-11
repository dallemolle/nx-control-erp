# Fase 7g1 — Painel de produção e relatório de estoque — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Neste projeto a execução é **inline, sem subagentes** (preferência do usuário).

**Goal:** Painel `/producao/painel` com indicadores do período, alertas clicáveis e exportação; resumo por status de validade e PDF em seções na tela de Estoque; filtros "só atrasadas" (Entregas) e "a verificar" (OPs).

**Architecture:** Contas puras em `src/lib/producao/painel.ts` (agregadores testados em unidade). O serviço `src/server/services/relatorioProducao/painel.ts` compõe consultas agregadas com as **mesmas funções de listagem** das telas (`listarOPs`, `listarLotes`, `listarEntregas`), para que o número do alerta seja sempre igual ao da lista que ele abre. A tela é um Server Component; a exportação usa `responderExport`/`gerarPdfSecoes`.

**Tech Stack:** Next.js (App Router; ler `node_modules/next/dist/docs/` antes de mexer em rota/página, conforme AGENTS.md), Prisma/Postgres, Vitest (integração com Postgres real), pdf-lib via `src/lib/export/pdf.ts`, componentes `src/components/ui`.

**Spec:** [`docs/superpowers/specs/2026-11-11-fase-7g1-painel-design.md`](../specs/2026-11-11-fase-7g1-painel-design.md)

## Global Constraints

- Sem mudança de schema e sem migration.
- Tudo na filial da sessão (`sessao.filialId`); cadastros (fruta, produto) na empresa (`sessao.empresaId`).
- Cancelados fora de todos os números: recepção `CANCELADA`, OP `CANCELADA`, pedido `CANCELADO`; linhas de OP com `removidoEm` (já excluídas por `listarOPs`).
- OP aberta conta no volume; custo médio da polpa só com OPs `ENCERRADA` (D-26).
- A receber em aberto = posição de hoje, qualquer data de pedido (D-26).
- Lotes e entregas olham para `hoje`; OPs a verificar seguem o período (D-26).
- Percentuais e rendimento são **frações** (0,5 = 50%) no serviço e na tela; na exportação, `tipo: "percentual"` recebe o valor × 100.
- Denominador zero → `null` → a tela mostra "—".
- Nada fixo em açaí/acerola: uma linha por fruta com movimento.
- Permissão `producao:ler` no painel e na exportação (403 na rota); filtro de entregas segue `venda:ler`.
- Comandos: `npx vitest run <arquivo>`, `npm test`, `npm run lint`, `npm run build`. Antes de testar, `npx prisma generate` se o client estiver desatualizado; porta 3000 pode estar presa (ver memória do ambiente).
- Commits em português, no padrão `feat(producao): …`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/producao/painel.ts` (novo) | `razao` e agregadores puros: recepções, OPs, vendas, estoque. |
| `src/lib/producao/painel.test.ts` (novo) | Unidade dos agregadores. |
| `src/server/services/entrega.ts` / `vendas/entregas/filtros.ts`, `page.tsx`, `export/route.ts` | Filtro `atraso=1`. |
| `src/server/services/ordemProducao.ts` / `producao/processamento/filtros.ts`, `page.tsx`, `export/route.ts` | Filtro `verificar=balanco|branqueamento`. |
| `src/server/services/estoque.ts` | `resumoPorStatus`. |
| `src/app/(dashboard)/producao/estoque/resumo-status.tsx` (novo) | Cartões OK / Vencendo / Vencido. |
| `src/app/(dashboard)/producao/estoque/page.tsx`, `export/route.ts` | Cartões e PDF em seções. |
| `src/server/services/relatorioProducao/painel.ts` (novo) | `buscarPainelProducao`. |
| `src/server/services/relatorioProducao/painel.test.ts` (novo) | Cenário de caracterização. |
| `src/app/(dashboard)/producao/painel/atalhos.ts` (novo) | Atalhos de período (puro). |
| `src/app/(dashboard)/producao/painel/cartoes.tsx` (novo) | Indicador, alerta, formatação. |
| `src/app/(dashboard)/producao/painel/page.tsx` (novo) | Tela. |
| `src/server/export/painelProducao.ts` (novo) | Linhas do CSV e seções do PDF. |
| `src/app/(dashboard)/producao/painel/export/route.ts` (novo) | Rota de exportação. |
| `src/app/(dashboard)/nav-items.ts` | Item "Painel". |
| Docs | Ajuda, fase 7, doc 08, doc 09, status da spec. |

---

### Task 1: Agregadores puros do painel

**Files:**
- Create: `src/lib/producao/painel.ts`
- Test: `src/lib/producao/painel.test.ts`

**Interfaces:**
- Consumes: `calcularItem` (`src/lib/producao/venda.ts`), `arredondar` (`./arredondar`), `StatusLote` (`./statusLote`).
- Produces (usados nas Tasks 5 e 7):
  - `razao(numerador: number, denominador: number): number | null`
  - `type GrupoRecepcao = { frutaId: string; origem: OrigemRecepcao; brutoKg: number; descarteKg: number }`
  - `type TotaisRecepcao = { brutoKg; descarteKg; recebidoKg; terceirosKg: number; percentualTerceiros: number | null; percentualDescarte: number | null }`
  - `agregarRecepcoes(grupos): { total: TotaisRecepcao; porFruta: Map<string, TotaisRecepcao> }`
  - `type OPDoPainel = { frutaId: string; status: StatusOrdemProducao; frutoKg: number; polpaKg: number; custoTotal: number; balancoVerificar: boolean; branqueamentoVerificar: boolean }`
  - `type TotaisOPs = { quantidade: number; frutoKg: number; polpaKg: number; rendimento: number | null; custoMedioPolpa: number | null }`
  - `agregarOPs(ops): { total: TotaisOPs; porFruta: Map<string, TotaisOPs>; opsBalanco: number; opsBranqueamento: number }`
  - `type ItemDoPainel = { pedidoId: string; produtoId: string; categoria: CategoriaProduto; frutaId: string; quantidadeKg: number; precoKg: number; custoKg: number }`
  - `type TotaisVendas = { faturamento; faturamentoInNatura; faturamentoPolpa; kgVendidos: number; precoMedio: number | null; pedidos: number; ticketMedio: number | null; margem: number; margemPercentual: number | null }`
  - `agregarVendas(itens): { total: TotaisVendas; polpaPorFruta: Map<string, number>; porProduto: Map<string, { kg: number; faturamento: number }> }`
  - `type LoteDoPainel = { produtoId: string; categoria: CategoriaProduto; status: StatusLote; saldoKg: number; valor: number }`
  - `type ContagemKg = { quantidade: number; kg: number }`
  - `agregarEstoque(lotes): { polpaKg: number; frutoAguardandoKg: number; valor: number; vencendo: ContagemKg; vencidos: ContagemKg; porProduto: Map<string, { saldoKg: number; valor: number }> }`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/producao/painel.test.ts
import { describe, expect, test } from "vitest";
import { agregarEstoque, agregarOPs, agregarRecepcoes, agregarVendas, razao } from "./painel";

describe("razao", () => {
  test("divide e devolve null sem denominador", () => {
    expect(razao(1, 4)).toBe(0.25);
    expect(razao(5, 0)).toBeNull();
    expect(razao(5, -1)).toBeNull();
  });
});

describe("agregarRecepcoes", () => {
  test("líquido, % de terceiros (RN-33) e descarte por fruta e no total", () => {
    const r = agregarRecepcoes([
      { frutaId: "acai", origem: "PROPRIA", brutoKg: 100, descarteKg: 10 },
      { frutaId: "acai", origem: "TERCEIRO", brutoKg: 50, descarteKg: 0 },
      { frutaId: "cupu", origem: "TERCEIRO", brutoKg: 40, descarteKg: 4 },
    ]);
    expect(r.porFruta.get("acai")).toEqual({
      brutoKg: 150,
      descarteKg: 10,
      recebidoKg: 140,
      terceirosKg: 50,
      percentualTerceiros: 50 / 140,
      percentualDescarte: 10 / 150,
    });
    expect(r.porFruta.get("cupu")?.percentualTerceiros).toBe(1);
    expect(r.total.recebidoKg).toBe(176);
    expect(r.total.terceirosKg).toBe(86);
    expect(r.total.percentualDescarte).toBe(14 / 190);
  });

  test("sem recepção: zeros e indicadores nulos", () => {
    expect(agregarRecepcoes([]).total).toEqual({
      brutoKg: 0,
      descarteKg: 0,
      recebidoKg: 0,
      terceirosKg: 0,
      percentualTerceiros: null,
      percentualDescarte: null,
    });
  });
});

describe("agregarOPs", () => {
  const op = (o: Partial<Parameters<typeof agregarOPs>[0][number]>) => ({
    frutaId: "acai",
    status: "ENCERRADA" as const,
    frutoKg: 0,
    polpaKg: 0,
    custoTotal: 0,
    balancoVerificar: false,
    branqueamentoVerificar: false,
    ...o,
  });

  test("aberta conta no volume, custo médio só com encerradas, cancelada fica fora", () => {
    const r = agregarOPs([
      op({ frutoKg: 110, polpaKg: 60, custoTotal: 195 }),
      op({ status: "ABERTA", frutoKg: 20, polpaKg: 10, custoTotal: 30, balancoVerificar: true, branqueamentoVerificar: true }),
      op({ frutaId: "cupu", frutoKg: 30, polpaKg: 12, custoTotal: 90 }),
      op({ status: "CANCELADA", frutoKg: 5, polpaKg: 2, balancoVerificar: true }),
    ]);
    expect(r.porFruta.get("acai")).toEqual({
      quantidade: 2,
      frutoKg: 130,
      polpaKg: 70,
      rendimento: 70 / 130,
      custoMedioPolpa: 195 / 60,
    });
    expect(r.total).toEqual({
      quantidade: 3,
      frutoKg: 160,
      polpaKg: 82,
      rendimento: 82 / 160,
      custoMedioPolpa: 285 / 72,
    });
    expect(r.opsBalanco).toBe(1);
    expect(r.opsBranqueamento).toBe(1);
  });

  test("só OP aberta: sem custo médio", () => {
    expect(agregarOPs([op({ status: "ABERTA", frutoKg: 10, polpaKg: 5 })]).total.custoMedioPolpa).toBeNull();
  });
});

describe("agregarVendas", () => {
  test("faturamento, in natura × polpa, preço médio, ticket e margem (RN-22, RN-32)", () => {
    const r = agregarVendas([
      { pedidoId: "p1", produtoId: "agc", categoria: "POLPA", frutaId: "acai", quantidadeKg: 10, precoKg: 30, custoKg: 3.25 },
      { pedidoId: "p2", produtoId: "fa", categoria: "FRUTO", frutaId: "acai", quantidadeKg: 5, precoKg: 8, custoKg: 1.5 },
      { pedidoId: "p3", produtoId: "cpc", categoria: "POLPA", frutaId: "cupu", quantidadeKg: 6, precoKg: 20, custoKg: 7.5 },
    ]);
    expect(r.total).toEqual({
      faturamento: 460,
      faturamentoInNatura: 40,
      faturamentoPolpa: 420,
      kgVendidos: 21,
      precoMedio: 460 / 21,
      pedidos: 3,
      ticketMedio: 460 / 3,
      margem: 375,
      margemPercentual: 375 / 460,
    });
    expect(r.polpaPorFruta.get("acai")).toBe(300);
    expect(r.polpaPorFruta.get("cupu")).toBe(120);
    expect(r.porProduto.get("fa")).toEqual({ kg: 5, faturamento: 40 });
  });

  test("dois itens do mesmo pedido contam um pedido", () => {
    const item = { pedidoId: "p1", produtoId: "agc", categoria: "POLPA" as const, frutaId: "acai", quantidadeKg: 1, precoKg: 10, custoKg: 1 };
    expect(agregarVendas([item, item]).total.pedidos).toBe(1);
  });
});

describe("agregarEstoque", () => {
  test("polpa, fruto aguardando (não vencido), valor e alertas de validade", () => {
    const r = agregarEstoque([
      { produtoId: "agc", categoria: "POLPA", status: "OK", saldoKg: 30, valor: 97.5 },
      { produtoId: "agc", categoria: "POLPA", status: "VENCENDO", saldoKg: 8, valor: 32 },
      { produtoId: "fa", categoria: "FRUTO", status: "VENCIDO", saldoKg: 5, valor: 7.5 },
      { produtoId: "fc", categoria: "FRUTO", status: "OK", saldoKg: 25, valor: 50 },
      { produtoId: "fc", categoria: "FRUTO", status: "VENCENDO", saldoKg: 3, valor: 6 },
    ]);
    expect(r.polpaKg).toBe(38);
    expect(r.frutoAguardandoKg).toBe(28);
    expect(r.valor).toBe(193);
    expect(r.vencendo).toEqual({ quantidade: 2, kg: 11 });
    expect(r.vencidos).toEqual({ quantidade: 1, kg: 5 });
    expect(r.porProduto.get("agc")).toEqual({ saldoKg: 38, valor: 129.5 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/producao/painel.test.ts`
Expected: FAIL — `Cannot find module './painel'` (ou exportações inexistentes).

- [ ] **Step 3: Implementar**

```ts
// src/lib/producao/painel.ts
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
  const frutoValido = lotes.filter((l) => l.categoria === "FRUTO" && (l.status === "OK" || l.status === "VENCENDO"));
  return {
    polpaKg: arredondar(
      somar(
        lotes.filter((l) => l.categoria === "POLPA"),
        (l) => l.saldoKg,
      ),
      3,
    ),
    frutoAguardandoKg: arredondar(
      somar(frutoValido, (l) => l.saldoKg),
      3,
    ),
    valor: arredondar(
      somar(lotes, (l) => l.valor),
      2,
    ),
    vencendo: contar("VENCENDO"),
    vencidos: contar("VENCIDO"),
    porProduto: agruparPor(
      lotes,
      (l) => l.produtoId,
      (grupo) => ({
        saldoKg: arredondar(
          somar(grupo, (l) => l.saldoKg),
          3,
        ),
        valor: arredondar(
          somar(grupo, (l) => l.valor),
          2,
        ),
      }),
    ),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/producao/painel.test.ts`
Expected: PASS (todos). Se `percentualTerceiros` divergir por ponto flutuante, trocar `toEqual` por `toBeCloseTo` só naquele campo — não arredondar a função.

- [ ] **Step 5: Commit**

```bash
git add src/lib/producao/painel.ts src/lib/producao/painel.test.ts
git commit -m "feat(producao): contas do painel de produção"
```

---

### Task 2: Filtro "Só atrasadas" nas Entregas

**Files:**
- Modify: `src/server/services/entrega.ts:54-75` (`FiltroEntregas`, `listarEntregas`)
- Modify: `src/app/(dashboard)/vendas/entregas/filtros.ts`
- Modify: `src/app/(dashboard)/vendas/entregas/page.tsx` (valores e campo da barra)
- Modify: `src/app/(dashboard)/vendas/entregas/export/route.ts` (texto do filtro no PDF)
- Test: `src/server/services/entrega.test.ts`, `src/app/(dashboard)/vendas/entregas/filtros.test.ts` (novo)

**Interfaces:**
- Produces: `FiltroEntregas = { status?: StatusEntrega[]; inicio?: Date; fim?: Date; atrasadas?: boolean }`; URL `atraso=1`. Usado pelo link do alerta (Task 6).

- [ ] **Step 1: Testes que falham**

Em `src/server/services/entrega.test.ts`, novo teste dentro do `describe("entregas")` (usa `novoPedido` e `d` já definidos no arquivo):

```ts
  test("filtro de atrasadas: só entrega em aberto com atraso maior que zero", async () => {
    const atrasada = await novoPedido("2026-11-01");
    const noPrazo = await novoPedido("2026-11-30");
    const hoje = d("2026-11-20");

    const lista = await listarEntregas(fx.filialAId, { atrasadas: true }, hoje);
    const ids = lista.map((e) => e.pedidoId);
    expect(ids).toContain(atrasada);
    expect(ids).not.toContain(noPrazo);
    expect(lista.every((e) => (e.atraso ?? 0) > 0)).toBe(true);
  });
```

Novo `src/app/(dashboard)/vendas/entregas/filtros.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { filtrosDeEntregas } from "./filtros";

describe("filtrosDeEntregas", () => {
  test("atraso=1 liga o filtro; outro valor não", () => {
    expect(filtrosDeEntregas({ atraso: "1" }).atrasadas).toBe(true);
    expect(filtrosDeEntregas({ atraso: "x" }).atrasadas).toBe(false);
    expect(filtrosDeEntregas({}).atrasadas).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/entrega.test.ts "src/app/(dashboard)/vendas/entregas/filtros.test.ts"`
Expected: FAIL — `atrasadas` não existe em `FiltroEntregas` / retorno.

- [ ] **Step 3: Implementar**

`src/server/services/entrega.ts`:

```ts
export type FiltroEntregas = { status?: StatusEntrega[]; inicio?: Date; fim?: Date; atrasadas?: boolean };
```

e no fim de `listarEntregas`, trocar o `return entregas.map(...)` por:

```ts
  const listadas = entregas.map((entrega) => ({ ...entrega, atraso: atrasoEntregaDias(entrega, hoje) }));
  return filtros.atrasadas ? listadas.filter((entrega) => (entrega.atraso ?? 0) > 0) : listadas;
```

`src/app/(dashboard)/vendas/entregas/filtros.ts`:

```ts
export type ParametrosEntregas = { status?: string; inicio?: string; fim?: string; atraso?: string };
// ...
  return { status, inicio: dataDaUrl(sp.inicio), fim: dataDaUrl(sp.fim), atrasadas: sp.atraso === "1" };
```

`page.tsx`: em `valoresFiltro` acrescentar `atraso: filtros.atrasadas ? "1" : "",` e, depois do campo `fim`, `{ tipo: "checkbox", campo: "atraso", rotulo: "Só atrasadas" },`.

`export/route.ts`: na lista `filtros` do cabeçalho, acrescentar `filtros.atrasadas ? "Só atrasadas" : null,`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/services/entrega.test.ts "src/app/(dashboard)/vendas/entregas/filtros.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/entrega.ts src/server/services/entrega.test.ts "src/app/(dashboard)/vendas/entregas"
git commit -m "feat(vendas): filtro de entregas atrasadas"
```

---

### Task 3: Filtro "A verificar" nas OPs

**Files:**
- Modify: `src/server/services/ordemProducao.ts:711-735` (`FiltroOPs`, `listarOPs`)
- Modify: `src/app/(dashboard)/producao/processamento/filtros.ts`, `page.tsx`, `export/route.ts`
- Test: `src/server/services/ordemProducao.test.ts`, `src/app/(dashboard)/producao/processamento/filtros.test.ts` (novo)

**Interfaces:**
- Produces: `type VerificarOP = "balanco" | "branqueamento"`; `FiltroOPs = { inicio: Date; fim: Date; frutaId?: string; status?: StatusOrdemProducao; verificar?: VerificarOP }`; URL `verificar=balanco|branqueamento`. Usado pela Task 5 (`listarOPs` sem `verificar`) e pelo link do alerta (Task 6).

- [ ] **Step 1: Testes que falham**

Em `src/server/services/ordemProducao.test.ts`, um `describe` novo no fim do arquivo, com fixture própria (seguir os imports que o arquivo já tem; acrescentar os que faltarem):

```ts
describe("listarOPs: filtro a verificar", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  const ids = { ok: "", balanco: "", cancelada: "" };

  beforeAll(async () => {
    fx = await criarFixtureProducao("op-verificar");
    cat = await criarCatalogoDeTeste(fx);
    const adm = fx.sessao("ADMINISTRADOR");
    const fruto = await criarLoteDeTeste(fx, {
      produtoId: cat.produtoFrutoOutraId,
      localId: cat.localRecepcaoId,
      kg: 100,
      custoKg: 2,
      data: new Date("2026-11-10"),
      validade: new Date("2026-11-12"),
    });
    const nova = () => criarOP(adm, cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.outraFrutaId }));
    const consumir = (opId: string, kg: number) =>
      adicionarConsumo(adm, opId, consumoSchema.parse({ loteId: fruto.id, quantidadeKg: kg, motivoLiberacaoVencido: "" }));
    const produzir = (opId: string, kg: number) =>
      adicionarProducao(adm, opId, producaoSchema.parse({ produtoId: cat.produtoPolpaOutraId, quantidadeKg: kg, localId: cat.localCamaraId }));
    const processo = (opId: string, carocoResiduoKg: string) =>
      atualizarProcessoOP(adm, opId, processoOPSchema.parse({ aguaLitros: "0", carocoResiduoKg, perdaKg: "0" }));

    // Cupuaçu não exige branqueamento: só o balanço decide.
    const ok = await nova();
    await consumir(ok.id, 10);
    await produzir(ok.id, 4);
    await processo(ok.id, "6");
    const balanco = await nova();
    await consumir(balanco.id, 10);
    await produzir(balanco.id, 4);
    const cancelada = await nova();
    await consumir(cancelada.id, 10);
    await produzir(cancelada.id, 4);
    await cancelarOP(adm, cancelada.id, "Teste");
    Object.assign(ids, { ok: ok.id, balanco: balanco.id, cancelada: cancelada.id });
  });
  afterAll(async () => {
    await fx.limpar();
  });

  const periodo = { inicio: new Date("2026-11-01"), fim: new Date("2026-11-30") };

  test("balanco: só OP com balanço Verificar e não cancelada", async () => {
    const lista = await listarOPs(fx.filialAId, { ...periodo, verificar: "balanco" });
    expect(lista.map((op) => op.id)).toEqual([ids.balanco]);
  });

  test("branqueamento: nenhuma (cupuaçu não se aplica)", async () => {
    expect(await listarOPs(fx.filialAId, { ...periodo, verificar: "branqueamento" })).toEqual([]);
  });

  test("sem filtro: as três", async () => {
    expect(await listarOPs(fx.filialAId, periodo)).toHaveLength(3);
  });
});
```

Nota: se o `processoOPSchema` exigir os campos de branqueamento, passar `branqueamentoTemperaturaC: ""` e `branqueamentoTempoS: ""` (conferir o schema em `src/lib/schemas/ordemProducao.ts:23`).

Novo `src/app/(dashboard)/producao/processamento/filtros.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { filtrosDasOPs } from "./filtros";

describe("filtrosDasOPs", () => {
  test("verificar aceita só balanco e branqueamento", () => {
    expect(filtrosDasOPs({ verificar: "balanco" }).verificar).toBe("balanco");
    expect(filtrosDasOPs({ verificar: "branqueamento" }).verificar).toBe("branqueamento");
    expect(filtrosDasOPs({ verificar: "outro" }).verificar).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/ordemProducao.test.ts "src/app/(dashboard)/producao/processamento/filtros.test.ts"`
Expected: FAIL — o filtro é ignorado (lista com 3) / `verificar` indefinido.

- [ ] **Step 3: Implementar**

`src/server/services/ordemProducao.ts`:

```ts
export type VerificarOP = "balanco" | "branqueamento";
export const VERIFICAR_OP: VerificarOP[] = ["balanco", "branqueamento"];

export type FiltroOPs = {
  inicio: Date;
  fim: Date;
  frutaId?: string;
  status?: StatusOrdemProducao;
  /** Só OPs não canceladas com balanço (RN-11) ou branqueamento (RN-12) "Verificar". */
  verificar?: VerificarOP;
};
```

e no fim de `listarOPs`:

```ts
  const listadas = ops.map(({ consumos, producoes, insumos, ...op }) => ({
    ...op,
    resumo: resumoComCustoGravado(op, linhasEmNumeros({ consumos, producoes, insumos }), configuracao),
  }));
  if (!filtros.verificar) return listadas;
  return listadas.filter(
    (op) =>
      op.status !== "CANCELADA" &&
      (filtros.verificar === "balanco"
        ? op.resumo.balanco.status === "VERIFICAR"
        : op.resumo.branqueamento === "VERIFICAR"),
  );
```

`src/app/(dashboard)/producao/processamento/filtros.ts`:

```ts
import { VERIFICAR_OP, type FiltroOPs, type VerificarOP } from "@/server/services/ordemProducao";

export type ParametrosOPs = { inicio?: string; fim?: string; fruta?: string; status?: string; verificar?: string };

export const ROTULOS_VERIFICAR: Record<VerificarOP, string> = { balanco: "Balanço", branqueamento: "Branqueamento" };

export function filtrosDasOPs(sp: ParametrosOPs): FiltroOPs {
  const status = (STATUS_ORDEM_PRODUCAO as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as (typeof STATUS_ORDEM_PRODUCAO)[number])
    : undefined;
  const verificar = (VERIFICAR_OP as string[]).includes(sp.verificar ?? "") ? (sp.verificar as VerificarOP) : undefined;
  return { ...periodoDaUrl(sp), frutaId: sp.fruta || undefined, status, verificar };
}
```

Atenção: `filtros.ts` é importado por página (servidor), então importar de `@/server/services/ordemProducao` é permitido; se o lint reclamar de importar `prisma` em código de cliente, mover `VERIFICAR_OP`/`VerificarOP` para `src/lib/producao/op.ts` e importar de lá nos dois lugares.

`page.tsx`: `valoresFiltro.verificar = filtros.verificar ?? ""` e, depois do campo `status`:

```tsx
          {
            tipo: "select",
            campo: "verificar",
            rotulo: "A verificar",
            rotuloTodos: "Todas",
            opcoes: VERIFICAR_OP.map((v) => ({ valor: v, rotulo: ROTULOS_VERIFICAR[v] })),
          },
```

`export/route.ts`: nos filtros do cabeçalho, `filtros.verificar ? \`A verificar: ${ROTULOS_VERIFICAR[filtros.verificar]}\` : null,`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/services/ordemProducao.test.ts "src/app/(dashboard)/producao/processamento/filtros.test.ts"`
Expected: PASS, inclusive os testes antigos do arquivo.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/ordemProducao.ts src/server/services/ordemProducao.test.ts "src/app/(dashboard)/producao/processamento" src/lib/producao/op.ts
git commit -m "feat(producao): filtro de OPs a verificar"
```

---

### Task 4: Resumo por status e PDF em seções no Estoque

**Files:**
- Modify: `src/server/services/estoque.ts` (nova `resumoPorStatus`)
- Create: `src/app/(dashboard)/producao/estoque/resumo-status.tsx`
- Modify: `src/app/(dashboard)/producao/estoque/page.tsx`, `src/app/(dashboard)/producao/estoque/export/route.ts`
- Test: `src/server/services/estoque.test.ts`

**Interfaces:**
- Consumes: `listarLotes(filialId, filtros, referencia)`, `resumoProdutoLocal(filialId)`.
- Produces: `type ResumoStatus = Record<"OK" | "VENCENDO" | "VENCIDO", { quantidade: number; kg: number }>`; `resumoPorStatus(filialId: string, filtros: { produtoId?: string; localId?: string }, referencia: Date): Promise<ResumoStatus>`.

- [ ] **Step 1: Teste que falha**

Em `src/server/services/estoque.test.ts`, novo `describe` no fim do arquivo:

```ts
describe("resumoPorStatus", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  const ref = new Date("2026-11-20T00:00:00.000Z");

  beforeAll(async () => {
    fx = await criarFixtureProducao("estoque-status");
    cat = await criarCatalogoDeTeste(fx);
    const polpa = (kg: number, validade: string, localId = cat.localCamaraId) =>
      criarLoteDeTeste(fx, { produtoId: cat.produtoPolpaId, localId, kg, data: new Date("2026-11-01"), validade: new Date(validade) });
    await polpa(10, "2027-06-01"); // OK
    await polpa(4, "2026-12-10"); // Vencendo (20 dias ≤ 30, congelado)
    await polpa(3, "2026-11-15"); // Vencido
    await polpa(0, "2026-11-15"); // Zerado: não entra
    await polpa(7, "2027-06-01", cat.localRecepcaoId); // OK, outro local
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("conta lotes com saldo por status na data de referência", async () => {
    expect(await resumoPorStatus(fx.filialAId, {}, ref)).toEqual({
      OK: { quantidade: 2, kg: 17 },
      VENCENDO: { quantidade: 1, kg: 4 },
      VENCIDO: { quantidade: 1, kg: 3 },
    });
  });

  test("respeita o local", async () => {
    const r = await resumoPorStatus(fx.filialAId, { localId: cat.localRecepcaoId }, ref);
    expect(r.OK).toEqual({ quantidade: 1, kg: 7 });
    expect(r.VENCIDO).toEqual({ quantidade: 0, kg: 0 });
  });
});
```

(Acrescentar `resumoPorStatus` ao import de `./estoque` e `CatalogoDeTeste`/`criarCatalogoDeTeste` ao import das fixtures, se ainda não estiverem.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/estoque.test.ts`
Expected: FAIL — `resumoPorStatus is not a function`.

- [ ] **Step 3: Implementar o serviço**

Em `src/server/services/estoque.ts`, depois de `listarLotes`:

```ts
export type StatusResumido = "OK" | "VENCENDO" | "VENCIDO";
export const STATUS_RESUMIDOS: StatusResumido[] = ["OK", "VENCENDO", "VENCIDO"];
export type ResumoStatus = Record<StatusResumido, { quantidade: number; kg: number }>;

/** Nº de lotes e kg por status de validade (RN-16), só lotes com saldo; ignora o filtro de status. */
export async function resumoPorStatus(
  filialId: string,
  filtros: Pick<FiltroLotes, "produtoId" | "localId">,
  referencia: Date,
): Promise<ResumoStatus> {
  const lotes = await listarLotes(filialId, { produtoId: filtros.produtoId, localId: filtros.localId }, referencia);
  const resumo: ResumoStatus = {
    OK: { quantidade: 0, kg: 0 },
    VENCENDO: { quantidade: 0, kg: 0 },
    VENCIDO: { quantidade: 0, kg: 0 },
  };
  for (const lote of lotes) {
    if (lote.status === "ZERADO") continue;
    resumo[lote.status].quantidade += 1;
    resumo[lote.status].kg = arredondar(resumo[lote.status].kg + Number(lote.saldoKg), 3);
  }
  return resumo;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/services/estoque.test.ts`
Expected: PASS.

- [ ] **Step 5: Cartões na tela**

Criar `src/app/(dashboard)/producao/estoque/resumo-status.tsx` (Server Component, só links):

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ROTULOS_STATUS_LOTE } from "@/lib/producao/statusLote";
import { STATUS_RESUMIDOS, type ResumoStatus } from "@/server/services/estoque";

const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const COR: Record<keyof ResumoStatus, string> = {
  OK: "border-l-emerald-500",
  VENCENDO: "border-l-amber-500",
  VENCIDO: "border-l-destructive",
};

/** Três cartões clicáveis: clicar aplica o status; clicar no ativo limpa. */
export function ResumoStatusEstoque({
  resumo,
  ativo,
  hrefStatus,
}: {
  resumo: ResumoStatus;
  ativo: string;
  hrefStatus: (status: string) => string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {STATUS_RESUMIDOS.map((status) => {
        const selecionado = ativo === status;
        return (
          <Link
            key={status}
            href={hrefStatus(selecionado ? "" : status)}
            aria-pressed={selecionado}
            className={cn(
              "rounded-lg border border-l-4 bg-card p-3 transition-colors hover:bg-muted/50",
              COR[status],
              selecionado && "ring-2 ring-primary",
            )}
          >
            <p className="text-sm text-muted-foreground">{ROTULOS_STATUS_LOTE[status]}</p>
            <p className="text-lg font-semibold tabular-nums">
              {resumo[status].quantidade} {resumo[status].quantidade === 1 ? "lote" : "lotes"}
            </p>
            <p className="text-sm tabular-nums text-muted-foreground">{KG.format(resumo[status].kg)} kg</p>
          </Link>
        );
      })}
    </div>
  );
}
```

Em `page.tsx`:
- importar `resumoPorStatus` e `ResumoStatusEstoque`;
- buscar `resumoPorStatus(sessao.filialId, { produtoId: filtros.produtoId, localId: filtros.localId }, referencia)` no mesmo `Promise.all` dos produtos e locais;
- criar `const hrefStatus = (s: string) => \`/producao/estoque?${new URLSearchParams(Object.entries({ ...valoresFiltro, status: s, visao: visao === "resumo" ? "resumo" : "" }).filter(([, v]) => v))}\`;`
- renderizar `<ResumoStatusEstoque resumo={resumo} ativo={filtros.status ?? ""} hrefStatus={hrefStatus} />` logo abaixo do cabeçalho, antes das abas;
- incluir `visao` na `query` do `ExportarLinks` quando for `resumo` (para o PDF saber a aba): `const queryExport = visao === "resumo" ? \`${query}&visao=resumo\` : query;` e usá-la no `ExportarLinks`.

- [ ] **Step 6: PDF em seções na exportação**

Em `src/app/(dashboard)/producao/estoque/export/route.ts`, antes do `responderExport`:

```ts
  const formato = url.searchParams.get("formato");
  const cabecalho = () =>
    cabecalhoDoRelatorio(sessao, {
      titulo: "Estoque",
      filtros: [
        `Referência: ${formatarData(referencia)}`,
        filtros.status ? `Status: ${ROTULOS_STATUS_LOTE[filtros.status]}` : null,
        filtros.incluirZerados ? "Com lotes zerados" : null,
      ],
    });

  if (formato === "pdf") {
    const porLocal = url.searchParams.get("visao") === "resumo";
    const [resumo, produtoLocal] = await Promise.all([
      resumoPorStatus(sessao.filialId, filtros, referencia),
      porLocal ? resumoProdutoLocal(sessao.filialId) : Promise.resolve(null),
    ]);
    const secoes = [
      secaoPdf({
        titulo: "Resumo por status de validade",
        linhas: STATUS_RESUMIDOS.map((s) => ({ status: ROTULOS_STATUS_LOTE[s], ...resumo[s] })),
        colunas: COLUNAS_RESUMO,
      }),
      produtoLocal
        ? secaoPdf({ titulo: "Saldo por produto e local", linhas: produtoLocal.linhas, colunas: COLUNAS_PRODUTO_LOCAL })
        : secaoPdf({ titulo: "Lotes", linhas: lotes, colunas: COLUNAS }),
      ...(produtoLocal
        ? [secaoPdf({ titulo: "Ocupação dos locais", linhas: produtoLocal.locais, colunas: COLUNAS_OCUPACAO })]
        : []),
    ];
    return responderArquivoPdf(await gerarPdfSecoes(secoes, await cabecalho()), "estoque");
  }
```

com as colunas no topo do arquivo:

```ts
type LinhaResumo = { status: string; quantidade: number; kg: number };
const COLUNAS_RESUMO: ColunaExport<LinhaResumo>[] = [
  { rotulo: "Status", valor: (r) => r.status },
  { rotulo: "Lotes", tipo: "inteiro", valor: (r) => r.quantidade },
  { rotulo: "kg", valor: (r) => r.kg },
];

type LinhaProdutoLocal = Awaited<ReturnType<typeof resumoProdutoLocal>>["linhas"][number];
const COLUNAS_PRODUTO_LOCAL: ColunaExport<LinhaProdutoLocal>[] = [
  { rotulo: "Produto", valor: (l) => l.produto },
  { rotulo: "Local", valor: (l) => l.local },
  { rotulo: "Saldo (kg)", valor: (l) => l.saldoKg },
  { rotulo: "Valor", valor: (l) => l.valor },
];

type LinhaOcupacao = Awaited<ReturnType<typeof resumoProdutoLocal>>["locais"][number];
const COLUNAS_OCUPACAO: ColunaExport<LinhaOcupacao>[] = [
  { rotulo: "Local", valor: (l) => l.nome },
  { rotulo: "Capacidade (kg)", valor: (l) => l.capacidadeKg ?? "" },
  { rotulo: "Saldo (kg)", valor: (l) => l.saldoKg },
  { rotulo: "Ocupação (%)", tipo: "percentual", valor: (l) => (l.ocupacao === null ? "" : l.ocupacao * 100) },
];
```

Imports novos: `resumoPorStatus`, `resumoProdutoLocal`, `STATUS_RESUMIDOS` de `@/server/services/estoque`; `gerarPdfSecoes`, `secaoPdf` de `@/lib/export/pdf`; `responderArquivoPdf` de `@/lib/export/responder`. O `responderExport` existente passa a usar `formato` e `cabecalhoPdf: cabecalho` (CSV/Excel ficam como antes).

- [ ] **Step 7: Conferir tipos e lint**

Run: `npx tsc --noEmit -p . ; npm run lint`
Expected: sem erros novos.

- [ ] **Step 8: Commit**

```bash
git add src/server/services/estoque.ts src/server/services/estoque.test.ts "src/app/(dashboard)/producao/estoque"
git commit -m "feat(producao): resumo por status de validade no estoque"
```

---

### Task 5: Serviço do painel com cenário de caracterização

**Files:**
- Create: `src/server/services/relatorioProducao/painel.ts`
- Test: `src/server/services/relatorioProducao/painel.test.ts`

**Interfaces:**
- Consumes: Task 1 (agregadores); `listarOPs(filialId, FiltroOPs)`; `listarLotes(filialId, {}, hoje)`; `listarEntregas(filialId, {}, hoje)`; `saldoRemanescenteParcela(valor, baixas)` (`src/server/services/fluxoDeCaixaProjetado.ts:44`).
- Produces (Tasks 6 e 7):

```ts
export type Periodo = { inicio: Date; fim: Date };
export type LinhaFruta = {
  frutaId: string;
  fruta: string;
  recepcao: TotaisRecepcao | null;
  processamento: TotaisOPs | null;
  faturamentoPolpa: number;
};
export type PainelProducao = {
  periodo: Periodo;
  hoje: Date;
  porFruta: LinhaFruta[];
  recepcao: TotaisRecepcao;
  processamento: TotaisOPs;
  vendas: TotaisVendas & { aReceber: number };
  estoque: { polpaKg: number; frutoAguardandoKg: number; valor: number };
  alertas: {
    lotesVencendo: ContagemKg;
    lotesVencidos: ContagemKg;
    entregasAbertas: number;
    entregasAtrasadas: number;
    opsBalanco: number;
    opsBranqueamento: number;
  };
  estoquePorProduto: { produtoId: string; produto: string; saldoKg: number; valor: number }[];
  vendasPorProduto: { produtoId: string; produto: string; kg: number; faturamento: number }[];
};
export async function buscarPainelProducao(sessao: SessaoAtiva, periodo: Periodo, hoje: Date): Promise<PainelProducao>;
```

- [ ] **Step 1: Escrever o teste de caracterização (falha)**

Números do cenário (período 01–30/11/2026, hoje = 20/11/2026; custo padrão: açaí 1,50/kg, cupuaçu 2,00/kg; fruto próprio entra com o custo padrão, terceiro com o preço):

| Evento | Detalhe |
|---|---|
| R1 própria FA 10/11 | bruto 100, descarte 10 → 90 kg, custo 1,50 |
| R2 terceiro FA 10/11 | bruto 50, preço 2 → 50 kg, custo 2,00 |
| R3 terceiro FC 10/11 | bruto 40, descarte 4, preço 3 → 36 kg, custo 3,00 |
| R4 própria FA 10/11 | bruto 20, **cancelada** |
| R5 própria FA 25/10 | bruto 30, **fora do período** |
| OP1 açaí 10/11, encerrada | consome R1 60 + R2 50; produz AGC 40 + AFN 20; caroço 48, perda 2 (balanço 0); branqueamento 85 °C/12 s; insumo 10 × 0,50. Custo 60×1,5 + 50×2 + 5 = 195 → 3,25/kg |
| OP2 açaí 10/11, aberta | consome R1 20; produz AGC 10; sem processo → balanço 50% e branqueamento faltando = os dois "Verificar" |
| OP3 cupuaçu 10/11, encerrada | consome R3 30; produz CPC 12; caroço 15, perda 3. Custo 90 → 7,50/kg |
| OP4 açaí 10/11, **cancelada** | consome R1 5; produz AGC 2 |
| P1 12/11 a prazo | AGC (OP1) 10 kg × 30; entrega prevista 12/11 → 8 dias de atraso |
| P2 10/11 Pix | FA (R1) 5 kg × 8; retira |
| P3 12/11 Pix | CPC 6 kg × 20; entrega prevista 25/11 (no prazo) |
| P4 12/11 a prazo | AFN 5 kg × 25, **cancelado** |
| P5 01/12 a prazo | AFN 4 kg × 25 = 100, **fora do período** (conta no a receber) |
| Lote avulso AGC | 8 kg, custo 4, validade 10/12 → Vencendo |
| Lote avulso FC | 25 kg, custo 2, validade 22/11 → OK (fruto aguardando) |

Esperado:
- Recepção açaí: recebido 140, terceiros 50 (50/140), descarte 10/150. Cupuaçu: 36, terceiros 36 (1), descarte 4/40. Total: 176, terceiros 86, descarte 14/190.
- Processamento açaí: 2 OPs, fruto 130, polpa 70, rendimento 70/130, custo médio 3,25. Cupuaçu: 1 OP, 30, 12, 0,4, 7,5. Total: 3 OPs, 160, 82, 82/160, 285/72.
- Vendas: faturamento 460; in natura 40; polpa 420 (açaí 300, cupuaçu 120); 21 kg; preço médio 460/21; 3 pedidos; ticket 460/3; margem 460 − (32,5 + 7,5 + 45) = 375; margem % 375/460; a receber 300 (P1) + 100 (P5) = 400.
- Estoque: lotes com saldo: R1 5 (vencido), R3 6 (vencido), R5 30 (vencido), AGC-OP1 30, AFN 16, AGC-OP2 10, CPC 6, AGC avulso 8 (vencendo), FC avulso 25. Polpa 70 kg; fruto aguardando 25; vencendo 1 lote/8 kg; vencidos 3 lotes/41 kg. Estoque por produto: AGC 48, AFN 16, CPC 6, FA 35, FC 31.
- Alertas: entregas abertas 2, atrasadas 1, OPs balanço 1, branqueamento 1.

```ts
// src/server/services/relatorioProducao/painel.test.ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { recepcaoSchema } from "@/lib/schemas/recepcao";
import {
  cabecalhoOPSchema,
  consumoSchema,
  insumoOPSchema,
  processoOPSchema,
  producaoSchema,
} from "@/lib/schemas/ordemProducao";
import { pedidoVendaSchema } from "@/lib/schemas/pedidoVenda";
import {
  configurarVendas,
  criarCadastrosDeVenda,
  criarCatalogoDeTeste,
  criarFixtureProducao,
  criarLoteDeTeste,
  type CadastrosDeVenda,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "../producaoTestFixtures";
import { cancelarRecepcao, criarRecepcao } from "../recepcaoFruto";
import {
  adicionarConsumo,
  adicionarInsumo,
  adicionarProducao,
  atualizarProcessoOP,
  cancelarOP,
  criarOP,
  encerrarOP,
} from "../ordemProducao";
import { cancelarPedido, criarPedido } from "../pedidoVenda";
import { buscarPainelProducao, type PainelProducao } from "./painel";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("painel de produção", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  let painel: PainelProducao;
  let valorEsperado = 0;
  const adm = () => fx.sessao("ADMINISTRADOR");
  const periodo = { inicio: d("2026-11-01"), fim: d("2026-11-30") };
  const hoje = d("2026-11-20");

  const receber = (extra: Record<string, unknown>) =>
    criarRecepcao(
      adm(),
      recepcaoSchema.parse({ data: "2026-11-10", localId: cat.localRecepcaoId, unidade: "KG", descarte: "0", ...extra }),
    );
  const consumir = (opId: string, loteId: string, kg: number) =>
    adicionarConsumo(adm(), opId, consumoSchema.parse({ loteId, quantidadeKg: kg, motivoLiberacaoVencido: "" }));
  const produzir = (opId: string, produtoId: string, kg: number) =>
    adicionarProducao(adm(), opId, producaoSchema.parse({ produtoId, quantidadeKg: kg, localId: cat.localCamaraId }));
  const processo = (opId: string, dados: Record<string, string>) =>
    atualizarProcessoOP(adm(), opId, processoOPSchema.parse({ aguaLitros: "0", perdaKg: "0", carocoResiduoKg: "0", ...dados }));
  const vender = (data: string, loteId: string, kg: number, preco: number, extra: Record<string, unknown> = {}) =>
    criarPedido(
      adm(),
      pedidoVendaSchema.parse({
        data,
        clienteId: cad.clienteId,
        formaPagamento: "A_PRAZO",
        vencimento: "2026-12-31",
        retiraNaPropriedade: "true",
        itens: JSON.stringify([{ loteId, quantidadeKg: kg, precoKg: preco }]),
        ...extra,
      }),
    );

  beforeAll(async () => {
    fx = await criarFixtureProducao("painel");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
    await configurarVendas(fx, cad);
    await prisma.configuracaoProducao.update({
      where: { filialId: fx.filialAId },
      data: { categoriaCompraFrutoId: cat.categoriaCompraId },
    });

    const fa = { produtoId: cat.produtoFrutoId };
    const r1 = await receber({ ...fa, origem: "PROPRIA", talhaoId: cat.talhaoId, pesoBruto: "100", descarte: "10" });
    const r2 = await receber({ ...fa, origem: "TERCEIRO", fornecedorId: cat.fornecedorId, pesoBruto: "50", preco: "2" });
    const r3 = await receber({
      produtoId: cat.produtoFrutoOutraId,
      origem: "TERCEIRO",
      fornecedorId: cat.fornecedorId,
      pesoBruto: "40",
      descarte: "4",
      preco: "3",
    });
    const r4 = await receber({ ...fa, origem: "PROPRIA", talhaoId: cat.talhaoId, pesoBruto: "20" });
    await cancelarRecepcao(adm(), r4.recepcaoId, "Lançada em dobro");
    await receber({ ...fa, data: "2026-10-25", origem: "PROPRIA", talhaoId: cat.talhaoId, pesoBruto: "30" });

    const op1 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    await consumir(op1.id, r1.loteId, 60);
    await consumir(op1.id, r2.loteId, 50);
    const agc = await produzir(op1.id, cat.produtoPolpaId, 40);
    const afn = await produzir(op1.id, cat.produtoPolpaFinoId, 20);
    await adicionarInsumo(adm(), op1.id, insumoOPSchema.parse({ insumoId: cat.insumoId, quantidade: 10 }));
    await processo(op1.id, { carocoResiduoKg: "48", perdaKg: "2", branqueamentoTemperaturaC: "85", branqueamentoTempoS: "12" });
    await encerrarOP(adm(), op1.id, { confirmarVerificar: false });

    const op2 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    await consumir(op2.id, r1.loteId, 20);
    await produzir(op2.id, cat.produtoPolpaId, 10);

    const op3 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.outraFrutaId }));
    await consumir(op3.id, r3.loteId, 30);
    const cpc = await produzir(op3.id, cat.produtoPolpaOutraId, 12);
    await processo(op3.id, { carocoResiduoKg: "15", perdaKg: "3" });
    await encerrarOP(adm(), op3.id, { confirmarVerificar: false });

    const op4 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    await consumir(op4.id, r1.loteId, 5);
    await produzir(op4.id, cat.produtoPolpaId, 2);
    await cancelarOP(adm(), op4.id, "Teste");

    await vender("2026-11-12", agc.loteId, 10, 30, { retiraNaPropriedade: "false" });
    await vender("2026-11-10", r1.loteId, 5, 8, { formaPagamento: "PIX", vencimento: "" });
    await vender("2026-11-12", cpc.loteId, 6, 20, {
      formaPagamento: "PIX",
      vencimento: "",
      retiraNaPropriedade: "false",
      entregaDataPrevista: "2026-11-25",
    });
    const p4 = await vender("2026-11-12", afn.loteId, 5, 25);
    await cancelarPedido(adm(), p4.pedidoId, "Desistiu");
    await vender("2026-12-01", afn.loteId, 4, 25);

    await criarLoteDeTeste(fx, {
      produtoId: cat.produtoPolpaId,
      localId: cat.localCamaraId,
      kg: 8,
      custoKg: 4,
      data: d("2026-11-01"),
      validade: d("2026-12-10"),
    });
    await criarLoteDeTeste(fx, {
      produtoId: cat.produtoFrutoOutraId,
      localId: cat.localRecepcaoId,
      kg: 25,
      custoKg: 2,
      data: d("2026-11-19"),
      validade: d("2026-11-22"),
    });

    // Valor do estoque conferido pelo banco: o custo provisório da OP aberta não é regra deste painel.
    const lotes = await prisma.lote.findMany({ where: { filialId: fx.filialAId, saldoKg: { gt: 0 } } });
    valorEsperado = Math.round(lotes.reduce((s, l) => s + Number(l.saldoKg) * Number(l.custoKg), 0) * 100) / 100;

    painel = await buscarPainelProducao(adm(), periodo, hoje);
  }, 60_000);

  afterAll(async () => {
    await fx.limpar();
  });

  const fruta = (id: string) => painel.porFruta.find((f) => f.frutaId === id)!;

  test("recepção por fruta e total (RN-33, descarte)", () => {
    expect(fruta(cat.frutaId).recepcao).toMatchObject({ recebidoKg: 140, terceirosKg: 50, brutoKg: 150, descarteKg: 10 });
    expect(fruta(cat.frutaId).recepcao?.percentualTerceiros).toBeCloseTo(50 / 140, 10);
    expect(fruta(cat.outraFrutaId).recepcao).toMatchObject({ recebidoKg: 36, terceirosKg: 36, percentualTerceiros: 1 });
    expect(painel.recepcao).toMatchObject({ recebidoKg: 176, terceirosKg: 86, brutoKg: 190, descarteKg: 14 });
  });

  test("processamento: aberta no volume, custo só das encerradas, cancelada fora", () => {
    expect(fruta(cat.frutaId).processamento).toMatchObject({ quantidade: 2, frutoKg: 130, polpaKg: 70 });
    expect(fruta(cat.frutaId).processamento?.custoMedioPolpa).toBeCloseTo(3.25, 10);
    expect(fruta(cat.outraFrutaId).processamento).toMatchObject({ quantidade: 1, frutoKg: 30, polpaKg: 12 });
    expect(fruta(cat.outraFrutaId).processamento?.custoMedioPolpa).toBeCloseTo(7.5, 10);
    expect(painel.processamento).toMatchObject({ quantidade: 3, frutoKg: 160, polpaKg: 82 });
    expect(painel.processamento.rendimento).toBeCloseTo(82 / 160, 10);
    expect(painel.processamento.custoMedioPolpa).toBeCloseTo(285 / 72, 10);
  });

  test("vendas do período e a receber de hoje (RN-22, RN-26, RN-32)", () => {
    expect(painel.vendas).toMatchObject({
      faturamento: 460,
      faturamentoInNatura: 40,
      faturamentoPolpa: 420,
      kgVendidos: 21,
      pedidos: 3,
      margem: 375,
      aReceber: 400,
    });
    expect(painel.vendas.ticketMedio).toBeCloseTo(460 / 3, 10);
    expect(painel.vendas.margemPercentual).toBeCloseTo(375 / 460, 10);
    expect(fruta(cat.frutaId).faturamentoPolpa).toBe(300);
    expect(fruta(cat.outraFrutaId).faturamentoPolpa).toBe(120);
    expect(painel.vendasPorProduto.map((p) => [p.produto.split(" · ")[0], p.kg, p.faturamento])).toEqual([
      ["AGC", 10, 300],
      ["CPC", 6, 120],
      ["FA", 5, 40],
    ]);
  });

  test("estoque e alertas olham para hoje", () => {
    expect(painel.estoque).toEqual({ polpaKg: 70, frutoAguardandoKg: 25, valor: valorEsperado });
    expect(painel.alertas).toEqual({
      lotesVencendo: { quantidade: 1, kg: 8 },
      lotesVencidos: { quantidade: 3, kg: 41 },
      entregasAbertas: 2,
      entregasAtrasadas: 1,
      opsBalanco: 1,
      opsBranqueamento: 1,
    });
    expect(Object.fromEntries(painel.estoquePorProduto.map((p) => [p.produto.split(" · ")[0], p.saldoKg]))).toEqual({
      AFN: 16,
      AGC: 48,
      CPC: 6,
      FA: 35,
      FC: 31,
    });
  });

  test("outra filial não vê nada", async () => {
    const b = await buscarPainelProducao(fx.sessao("ADMINISTRADOR", { filial: "B" }), periodo, hoje);
    expect(b.porFruta).toEqual([]);
    expect(b.vendas.faturamento).toBe(0);
    expect(b.vendas.aReceber).toBe(0);
  });
});
```

Notas para quem executa:
- Conferir os nomes dos retornos antes de rodar: `criarRecepcao` → `{ recepcaoId, loteId, codigoLote }`; `adicionarProducao` → `{ loteId, codigoLote, … }`; `criarPedido` → `{ pedidoId, numero }` (ver `rastreabilidade.test.ts`). Ajustar só o nome da propriedade, nunca o cenário.
- Hoje **todos os perfis têm `producao:ler`** (`permissions.ts`), então não há teste de recusa por perfil; o `requirePermission` do serviço e o 403 da rota ficam como defesa.
- Se o `pedidoVendaSchema` recusar `vencimento: ""` no Pix, retirar a chave `vencimento` do `extra` em vez de passar vazio.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/relatorioProducao/painel.test.ts`
Expected: FAIL — `Cannot find module './painel'`.

- [ ] **Step 3: Implementar o serviço**

```ts
// src/server/services/relatorioProducao/painel.ts
import type { StatusParcela } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { arredondar } from "@/lib/producao/arredondar";
import {
  agregarEstoque,
  agregarOPs,
  agregarRecepcoes,
  agregarVendas,
  type ContagemKg,
  type TotaisOPs,
  type TotaisRecepcao,
  type TotaisVendas,
} from "@/lib/producao/painel";
import { listarOPs } from "../ordemProducao";
import { listarLotes } from "../estoque";
import { listarEntregas } from "../entrega";
import { saldoRemanescenteParcela } from "../fluxoDeCaixaProjetado";

/** Parcela ainda devida (RN-26); paga, cancelada e renegociada ficam fora. */
const PARCELA_ABERTA: StatusParcela[] = ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"];

export type Periodo = { inicio: Date; fim: Date };

export type LinhaFruta = {
  frutaId: string;
  fruta: string;
  recepcao: TotaisRecepcao | null;
  processamento: TotaisOPs | null;
  faturamentoPolpa: number;
};

export type PainelProducao = {
  periodo: Periodo;
  hoje: Date;
  porFruta: LinhaFruta[];
  recepcao: TotaisRecepcao;
  processamento: TotaisOPs;
  vendas: TotaisVendas & { aReceber: number };
  estoque: { polpaKg: number; frutoAguardandoKg: number; valor: number };
  alertas: {
    lotesVencendo: ContagemKg;
    lotesVencidos: ContagemKg;
    entregasAbertas: number;
    entregasAtrasadas: number;
    opsBalanco: number;
    opsBranqueamento: number;
  };
  estoquePorProduto: { produtoId: string; produto: string; saldoKg: number; valor: number }[];
  vendasPorProduto: { produtoId: string; produto: string; kg: number; faturamento: number }[];
};

/**
 * Indicadores do painel de produção (doc 07, D-26). Período pela data do
 * evento (RN-31); estoque, entregas e a receber na data de hoje. OPs, lotes e
 * entregas vêm das mesmas listagens das telas, para o alerta bater com a lista.
 */
export async function buscarPainelProducao(sessao: SessaoAtiva, periodo: Periodo, hoje: Date): Promise<PainelProducao> {
  requirePermission(sessao.perfil, "producao:ler");
  const { filialId, empresaId } = sessao;
  const noPeriodo = { gte: periodo.inicio, lte: periodo.fim };

  const [produtos, frutas, recepcoes, ops, itens, parcelas, lotes, entregas] = await Promise.all([
    prisma.produto.findMany({
      where: { empresaId },
      select: { id: true, codigo: true, descricao: true, categoria: true, frutaId: true },
    }),
    prisma.fruta.findMany({ where: { empresaId }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.recepcaoFruto.groupBy({
      by: ["produtoId", "origem"],
      where: { filialId, status: "ATIVA", data: noPeriodo },
      _sum: { pesoBrutoKg: true, descarteKg: true },
    }),
    listarOPs(filialId, periodo),
    prisma.itemPedidoVenda.findMany({
      where: { pedido: { filialId, status: "CONFIRMADO", data: noPeriodo } },
      select: { pedidoId: true, quantidadeKg: true, precoKg: true, custoKg: true, lote: { select: { produtoId: true } } },
    }),
    prisma.parcela.findMany({
      where: {
        status: { in: PARCELA_ABERTA },
        titulo: { pedidoVenda: { is: { filialId, status: "CONFIRMADO" } } },
      },
      select: { valorAtualizado: true, baixas: { where: { statusAprovacao: "APROVADO" }, select: { valorPago: true } } },
    }),
    listarLotes(filialId, {}, hoje),
    listarEntregas(filialId, {}, hoje),
  ]);

  const produto = new Map(produtos.map((p) => [p.id, p]));
  const rotulo = (id: string) => {
    const p = produto.get(id);
    return p ? `${p.codigo} · ${p.descricao}` : id;
  };

  const rec = agregarRecepcoes(
    recepcoes.map((g) => ({
      frutaId: produto.get(g.produtoId)?.frutaId ?? "",
      origem: g.origem,
      brutoKg: Number(g._sum.pesoBrutoKg ?? 0),
      descarteKg: Number(g._sum.descarteKg ?? 0),
    })),
  );

  const proc = agregarOPs(
    ops.map((op) => ({
      frutaId: op.frutaId,
      status: op.status,
      frutoKg: op.resumo.frutoKg,
      polpaKg: op.resumo.polpaKg,
      custoTotal: op.resumo.custo.custoTotal,
      balancoVerificar: op.resumo.balanco.status === "VERIFICAR",
      branqueamentoVerificar: op.resumo.branqueamento === "VERIFICAR",
    })),
  );

  const vendas = agregarVendas(
    itens.map((item) => {
      const p = produto.get(item.lote.produtoId)!;
      return {
        pedidoId: item.pedidoId,
        produtoId: p.id,
        categoria: p.categoria,
        frutaId: p.frutaId,
        quantidadeKg: Number(item.quantidadeKg),
        precoKg: Number(item.precoKg),
        custoKg: Number(item.custoKg),
      };
    }),
  );

  const aReceber = arredondar(
    parcelas.reduce(
      (soma, parcela) =>
        soma +
        saldoRemanescenteParcela(
          Number(parcela.valorAtualizado),
          parcela.baixas.map((b) => ({ valorPago: Number(b.valorPago) })),
        ),
      0,
    ),
    2,
  );

  const estoque = agregarEstoque(
    lotes
      .filter((lote) => lote.status !== "ZERADO")
      .map((lote) => ({
        produtoId: lote.produtoId,
        categoria: produto.get(lote.produtoId)!.categoria,
        status: lote.status,
        saldoKg: Number(lote.saldoKg),
        valor: lote.valor,
      })),
  );

  const porFruta = frutas.flatMap((f): LinhaFruta[] => {
    const recepcao = rec.porFruta.get(f.id) ?? null;
    const processamento = proc.porFruta.get(f.id) ?? null;
    const faturamentoPolpa = vendas.polpaPorFruta.get(f.id);
    if (!recepcao && !processamento && faturamentoPolpa === undefined) return [];
    return [{ frutaId: f.id, fruta: f.nome, recepcao, processamento, faturamentoPolpa: faturamentoPolpa ?? 0 }];
  });

  return {
    periodo,
    hoje,
    porFruta,
    recepcao: rec.total,
    processamento: proc.total,
    vendas: { ...vendas.total, aReceber },
    estoque: { polpaKg: estoque.polpaKg, frutoAguardandoKg: estoque.frutoAguardandoKg, valor: estoque.valor },
    alertas: {
      lotesVencendo: estoque.vencendo,
      lotesVencidos: estoque.vencidos,
      entregasAbertas: entregas.length,
      entregasAtrasadas: entregas.filter((e) => (e.atraso ?? 0) > 0).length,
      opsBalanco: proc.opsBalanco,
      opsBranqueamento: proc.opsBranqueamento,
    },
    estoquePorProduto: [...estoque.porProduto]
      .map(([produtoId, v]) => ({ produtoId, produto: rotulo(produtoId), ...v }))
      .sort((a, b) => a.produto.localeCompare(b.produto)),
    vendasPorProduto: [...vendas.porProduto]
      .map(([produtoId, v]) => ({ produtoId, produto: rotulo(produtoId), ...v }))
      .sort((a, b) => b.faturamento - a.faturamento || a.produto.localeCompare(b.produto)),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/services/relatorioProducao/painel.test.ts`
Expected: PASS. Se um número divergir, **conferir primeiro o cenário contra a tabela acima** (a conta à mão é a referência). Só mexer no serviço se a regra do serviço estiver errada, e anotar a diferença no relatório final.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/relatorioProducao
git commit -m "feat(producao): indicadores do painel de produção"
```

---

### Task 6: Tela `/producao/painel` e item de menu

**Files:**
- Create: `src/app/(dashboard)/producao/painel/atalhos.ts`, `atalhos.test.ts`
- Create: `src/app/(dashboard)/producao/painel/cartoes.tsx`
- Create: `src/app/(dashboard)/producao/painel/page.tsx`
- Modify: `src/app/(dashboard)/nav-items.ts`, `src/app/(dashboard)/nav-items.test.ts:55-64`

**Interfaces:**
- Consumes: `buscarPainelProducao`, `PainelProducao` (Task 5); `periodoDaUrl`, `hojeDeCalendario`, `paraDataIso`; URLs dos filtros das Tasks 2 e 3.
- Produces: `atalhosDePeriodo(hoje: Date): { rotulo: string; inicio: string; fim: string }[]`.

- [ ] **Step 1: Testes que falham**

```ts
// src/app/(dashboard)/producao/painel/atalhos.test.ts
import { describe, expect, test } from "vitest";
import { atalhosDePeriodo } from "./atalhos";

describe("atalhosDePeriodo", () => {
  test("mês atual, mês anterior e ano", () => {
    expect(atalhosDePeriodo(new Date("2026-01-15T00:00:00.000Z"))).toEqual([
      { rotulo: "Mês atual", inicio: "2026-01-01", fim: "2026-01-31" },
      { rotulo: "Mês anterior", inicio: "2025-12-01", fim: "2025-12-31" },
      { rotulo: "Ano", inicio: "2026-01-01", fim: "2026-12-31" },
    ]);
  });
});
```

Em `nav-items.test.ts`, no teste da seção Produção, a lista esperada passa a começar com `"/producao/painel"` (e o título do teste ganha "painel").

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "src/app/(dashboard)/producao/painel/atalhos.test.ts" "src/app/(dashboard)/nav-items.test.ts"`
Expected: FAIL.

- [ ] **Step 3: Atalhos e menu**

```ts
// src/app/(dashboard)/producao/painel/atalhos.ts
import { paraDataIso } from "@/lib/producao/periodo";

const dia = (ano: number, mes: number, d: number) => paraDataIso(new Date(Date.UTC(ano, mes, d)));

/** Atalhos do filtro do painel, a partir de hoje (data de calendário). */
export function atalhosDePeriodo(hoje: Date): { rotulo: string; inicio: string; fim: string }[] {
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth();
  return [
    { rotulo: "Mês atual", inicio: dia(ano, mes, 1), fim: dia(ano, mes + 1, 0) },
    { rotulo: "Mês anterior", inicio: dia(ano, mes - 1, 1), fim: dia(ano, mes, 0) },
    { rotulo: "Ano", inicio: dia(ano, 0, 1), fim: dia(ano, 11, 31) },
  ];
}
```

`nav-items.ts`, primeiro item da seção Produção:

```ts
      { href: "/producao/painel", label: "Painel", acao: "producao:ler" },
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run "src/app/(dashboard)/producao/painel/atalhos.test.ts" "src/app/(dashboard)/nav-items.test.ts"`
Expected: PASS.

- [ ] **Step 5: Componentes de apresentação**

```tsx
// src/app/(dashboard)/producao/painel/cartoes.tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatarMoeda } from "@/lib/formatacao";

const KG = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const PCT = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const INTEIRO = new Intl.NumberFormat("pt-BR");

export const fmt = {
  kg: (v: number) => `${KG.format(v)} kg`,
  pct: (v: number | null) => (v === null ? "—" : PCT.format(v)),
  moeda: (v: number | null) => (v === null ? "—" : formatarMoeda(v)),
  moedaKg: (v: number | null) => (v === null ? "—" : `${formatarMoeda(v)}/kg`),
  n: (v: number) => INTEIRO.format(v),
};

/** Bloco com título e grade de indicadores. */
export function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

/** Indicador: valor total e, opcionalmente, uma linha por fruta. */
export function Indicador({
  rotulo,
  valor,
  nota,
  porFruta,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  porFruta?: { fruta: string; valor: string }[];
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-sm text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums">{valor}</p>
      {porFruta && porFruta.length > 0 ? (
        <dl className="mt-2 space-y-0.5 text-sm">
          {porFruta.map((f) => (
            <div key={f.fruta} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{f.fruta}</dt>
              <dd className="tabular-nums">{f.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {nota ? <p className="mt-1 text-xs text-muted-foreground">{nota}</p> : null}
    </div>
  );
}

/** Alerta: neutro sem ocorrência; destacado e clicável quando há. */
export function Alerta({ rotulo, quantidade, detalhe, href }: { rotulo: string; quantidade: number; detalhe?: string; href: string }) {
  const conteudo = (
    <>
      <p className="text-sm text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums">{fmt.n(quantidade)}</p>
      {detalhe ? <p className="text-xs text-muted-foreground">{detalhe}</p> : null}
    </>
  );
  if (quantidade === 0) return <div className="rounded-lg border bg-card p-3">{conteudo}</div>;
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg border border-l-4 border-l-amber-500 bg-card p-3 transition-colors hover:bg-muted/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {conteudo}
    </Link>
  );
}
```

- [ ] **Step 6: Página**

Antes de escrever, ler em `node_modules/next/dist/docs/` o guia de páginas/`searchParams` (AGENTS.md) e seguir o mesmo formato de `producao/processamento/page.tsx` (`searchParams: Promise<…>`).

```tsx
// src/app/(dashboard)/producao/painel/page.tsx
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { buscarPainelProducao } from "@/server/services/relatorioProducao/painel";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso, periodoDaUrl } from "@/lib/producao/periodo";
import { ExportarLinks } from "../../_shared/exportar-links";
import { BarraDeFiltros } from "../_shared/barra-de-filtros";
import { atalhosDePeriodo } from "./atalhos";
import { Alerta, Bloco, fmt, Indicador } from "./cartoes";

type Parametros = { inicio?: string; fim?: string };

export default async function PainelProducaoPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");

  const periodo = periodoDaUrl(await searchParams);
  const hoje = hojeDeCalendario();
  const p = await buscarPainelProducao(sessao, periodo, hoje);

  const inicio = paraDataIso(periodo.inicio);
  const fim = paraDataIso(periodo.fim);
  const query = new URLSearchParams({ inicio, fim }).toString();
  const porFruta = <T,>(valor: (f: (typeof p.porFruta)[number]) => T | null | undefined, formatar: (v: T) => string) =>
    p.porFruta.flatMap((f) => {
      const v = valor(f);
      return v === null || v === undefined ? [] : [{ fruta: f.fruta, valor: formatar(v) }];
    });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Painel de produção</h1>
        <p className="text-sm text-muted-foreground">
          {formatarData(periodo.inicio)} a {formatarData(periodo.fim)}. Estoque, entregas e a receber na data de hoje.
        </p>
      </div>

      <div className="space-y-3">
        <BarraDeFiltros
          valores={{ inicio, fim }}
          campos={[
            { tipo: "data", campo: "inicio", rotulo: "De" },
            { tipo: "data", campo: "fim", rotulo: "Até" },
          ]}
        />
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {atalhosDePeriodo(hoje).map((a) => (
            <Link
              key={a.rotulo}
              href={`/producao/painel?inicio=${a.inicio}&fim=${a.fim}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {a.rotulo}
            </Link>
          ))}
        </div>
        <ExportarLinks baseHref="/producao/painel/export" queryString={query} />
      </div>

      <Bloco titulo="Recepção e processamento">
        <Indicador
          rotulo="Fruto recebido"
          valor={fmt.kg(p.recepcao.recebidoKg)}
          porFruta={porFruta((f) => f.recepcao?.recebidoKg, fmt.kg)}
        />
        <Indicador
          rotulo="De terceiros"
          valor={fmt.pct(p.recepcao.percentualTerceiros)}
          porFruta={porFruta((f) => f.recepcao && f.recepcao.percentualTerceiros, (v: number) => fmt.pct(v))}
        />
        <Indicador
          rotulo="Descarte na triagem"
          valor={fmt.pct(p.recepcao.percentualDescarte)}
          porFruta={porFruta((f) => f.recepcao && f.recepcao.percentualDescarte, (v: number) => fmt.pct(v))}
        />
        <Indicador rotulo="Nº de OPs" valor={fmt.n(p.processamento.quantidade)} />
        <Indicador
          rotulo="Fruto processado"
          valor={fmt.kg(p.processamento.frutoKg)}
          porFruta={porFruta((f) => f.processamento?.frutoKg, fmt.kg)}
        />
        <Indicador
          rotulo="Polpa produzida"
          valor={fmt.kg(p.processamento.polpaKg)}
          porFruta={porFruta((f) => f.processamento?.polpaKg, fmt.kg)}
        />
        <Indicador
          rotulo="Rendimento"
          valor={fmt.pct(p.processamento.rendimento)}
          porFruta={porFruta((f) => f.processamento && f.processamento.rendimento, (v: number) => fmt.pct(v))}
        />
        <Indicador
          rotulo="Custo médio da polpa"
          valor={fmt.moedaKg(p.processamento.custoMedioPolpa)}
          nota="Só OPs encerradas."
          porFruta={porFruta((f) => f.processamento && f.processamento.custoMedioPolpa, (v: number) => fmt.moedaKg(v))}
        />
      </Bloco>

      <Bloco titulo="Vendas">
        <Indicador
          rotulo="Faturamento"
          valor={formatarMoeda(p.vendas.faturamento)}
          porFruta={[
            { fruta: "Fruto in natura", valor: formatarMoeda(p.vendas.faturamentoInNatura) },
            ...p.porFruta
              .filter((f) => f.faturamentoPolpa > 0)
              .map((f) => ({ fruta: `Polpa de ${f.fruta.toLowerCase()}`, valor: formatarMoeda(f.faturamentoPolpa) })),
          ]}
        />
        <Indicador rotulo="Kg vendidos" valor={fmt.kg(p.vendas.kgVendidos)} nota={`Preço médio ${fmt.moedaKg(p.vendas.precoMedio)}`} />
        <Indicador rotulo="Pedidos" valor={fmt.n(p.vendas.pedidos)} nota={`Ticket médio ${fmt.moeda(p.vendas.ticketMedio)}`} />
        <Indicador
          rotulo="Margem bruta"
          valor={formatarMoeda(p.vendas.margem)}
          nota={`${fmt.pct(p.vendas.margemPercentual)} do faturamento`}
        />
        <Indicador rotulo="A receber em aberto" valor={formatarMoeda(p.vendas.aReceber)} nota="Posição de hoje." />
      </Bloco>

      <Bloco titulo="Estoque e alertas">
        <Indicador rotulo="Estoque de polpa" valor={fmt.kg(p.estoque.polpaKg)} />
        <Indicador rotulo="Fruto aguardando" valor={fmt.kg(p.estoque.frutoAguardandoKg)} nota="Não vencido." />
        <Indicador rotulo="Valor do estoque" valor={formatarMoeda(p.estoque.valor)} nota="A custo." />
        <Alerta
          rotulo="Lotes vencendo"
          quantidade={p.alertas.lotesVencendo.quantidade}
          detalhe={fmt.kg(p.alertas.lotesVencendo.kg)}
          href="/producao/estoque?status=VENCENDO"
        />
        <Alerta
          rotulo="Lotes vencidos com saldo"
          quantidade={p.alertas.lotesVencidos.quantidade}
          detalhe={fmt.kg(p.alertas.lotesVencidos.kg)}
          href="/producao/estoque?status=VENCIDO"
        />
        <Alerta rotulo="Entregas pendentes ou em rota" quantidade={p.alertas.entregasAbertas} href="/vendas/entregas" />
        <Alerta rotulo="Entregas com atraso" quantidade={p.alertas.entregasAtrasadas} href="/vendas/entregas?atraso=1" />
        <Alerta
          rotulo="OPs com balanço a verificar"
          quantidade={p.alertas.opsBalanco}
          href={`/producao/processamento?verificar=balanco&${query}`}
        />
        <Alerta
          rotulo="OPs com branqueamento a verificar"
          quantidade={p.alertas.opsBranqueamento}
          href={`/producao/processamento?verificar=branqueamento&${query}`}
        />
      </Bloco>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Estoque atual por produto</h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.estoquePorProduto.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                      Sem estoque.
                    </TableCell>
                  </TableRow>
                ) : null}
                {p.estoquePorProduto.map((l) => (
                  <TableRow key={l.produtoId}>
                    <TableCell>{l.produto}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.kg(l.saldoKg)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(l.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Vendas do período por produto</h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Kg</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.vendasPorProduto.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                      Nada no período.
                    </TableCell>
                  </TableRow>
                ) : null}
                {p.vendasPorProduto.map((l) => (
                  <TableRow key={l.produtoId}>
                    <TableCell>{l.produto}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.kg(l.kg)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(l.faturamento)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
```

Se a assinatura genérica de `porFruta` ficar confusa para o TypeScript, trocar por chamadas explícitas `p.porFruta.flatMap(...)` em cada indicador; o comportamento esperado é "uma linha por fruta que tem o dado".

- [ ] **Step 7: Tipos, lint e verificação visual rápida**

Run: `npx tsc --noEmit -p . ; npm run lint`
Expected: sem erros. Depois `npm run dev` e abrir `/producao/painel` logado (ver memória do ambiente para o login local); conferir que a página abre sem erro no console.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/producao/painel" "src/app/(dashboard)/nav-items.ts" "src/app/(dashboard)/nav-items.test.ts"
git commit -m "feat(producao): tela do painel de produção"
```

---

### Task 7: Exportação do painel

**Files:**
- Create: `src/server/export/painelProducao.ts`, `src/server/export/painelProducao.test.ts`
- Create: `src/app/(dashboard)/producao/painel/export/route.ts`

**Interfaces:**
- Consumes: `PainelProducao` (Task 5); `ColunaExport`, `secaoPdf`, `gerarPdfSecoes`, `responderExport`, `responderArquivoPdf`, `cabecalhoDoRelatorio`.
- Produces: `type LinhaIndicador = { bloco: string; indicador: string; fruta: string; valor: number | null; unidade: "kg" | "%" | "R$" | "R$/kg" | "nº" }`; `linhasDoPainel(p): LinhaIndicador[]`; `COLUNAS_INDICADORES`; `secoesDoPainel(p): SecaoPdf<unknown>[]`.

- [ ] **Step 1: Teste que falha**

```ts
// src/server/export/painelProducao.test.ts
import { describe, expect, test } from "vitest";
import type { PainelProducao } from "@/server/services/relatorioProducao/painel";
import { COLUNAS_INDICADORES, linhasDoPainel } from "./painelProducao";

const vazio: PainelProducao = {
  periodo: { inicio: new Date("2026-11-01"), fim: new Date("2026-11-30") },
  hoje: new Date("2026-11-20"),
  porFruta: [
    {
      frutaId: "a",
      fruta: "Açaí",
      recepcao: { brutoKg: 150, descarteKg: 10, recebidoKg: 140, terceirosKg: 50, percentualTerceiros: 0.25, percentualDescarte: null },
      processamento: null,
      faturamentoPolpa: 300,
    },
  ],
  recepcao: { brutoKg: 150, descarteKg: 10, recebidoKg: 140, terceirosKg: 50, percentualTerceiros: 0.25, percentualDescarte: null },
  processamento: { quantidade: 0, frutoKg: 0, polpaKg: 0, rendimento: null, custoMedioPolpa: null },
  vendas: {
    faturamento: 300, faturamentoInNatura: 0, faturamentoPolpa: 300, kgVendidos: 10, precoMedio: 30,
    pedidos: 1, ticketMedio: 300, margem: 267.5, margemPercentual: 0.89, aReceber: 300,
  },
  estoque: { polpaKg: 30, frutoAguardandoKg: 0, valor: 97.5 },
  alertas: {
    lotesVencendo: { quantidade: 0, kg: 0 }, lotesVencidos: { quantidade: 1, kg: 5 },
    entregasAbertas: 1, entregasAtrasadas: 1, opsBalanco: 0, opsBranqueamento: 0,
  },
  estoquePorProduto: [],
  vendasPorProduto: [],
};

describe("linhasDoPainel", () => {
  const linhas = linhasDoPainel(vazio);
  const achar = (indicador: string, fruta = "") => linhas.find((l) => l.indicador === indicador && l.fruta === fruta);

  test("total e por fruta, percentual em fração", () => {
    expect(achar("Fruto recebido")).toMatchObject({ bloco: "Recepção e processamento", valor: 140, unidade: "kg" });
    expect(achar("Fruto recebido", "Açaí")).toMatchObject({ valor: 140 });
    expect(achar("De terceiros")).toMatchObject({ valor: 0.25, unidade: "%" });
    expect(achar("Descarte na triagem")).toMatchObject({ valor: null });
    expect(achar("Faturamento de polpa", "Açaí")).toMatchObject({ valor: 300, unidade: "R$" });
    expect(achar("Lotes vencidos com saldo")).toMatchObject({ bloco: "Estoque e alertas", valor: 1, unidade: "nº" });
  });

  test("CSV: percentual × 100 e vazio quando null", () => {
    const valor = COLUNAS_INDICADORES.find((c) => c.rotulo === "Valor")!;
    expect(valor.valor(achar("De terceiros")!)).toBe(25);
    expect(valor.valor(achar("Descarte na triagem")!)).toBe("");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/export/painelProducao.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
// src/server/export/painelProducao.ts
import type { ColunaExport } from "@/lib/export/csv";
import { secaoPdf, type SecaoPdf } from "@/lib/export/pdf";
import type { PainelProducao } from "@/server/services/relatorioProducao/painel";

export type Unidade = "kg" | "%" | "R$" | "R$/kg" | "nº";
export type LinhaIndicador = { bloco: string; indicador: string; fruta: string; valor: number | null; unidade: Unidade };

const RECEPCAO = "Recepção e processamento";
const VENDAS = "Vendas";
const ESTOQUE = "Estoque e alertas";

/** Uma linha por indicador (total com fruta vazia, depois uma por fruta). Percentual em fração. */
export function linhasDoPainel(p: PainelProducao): LinhaIndicador[] {
  const linhas: LinhaIndicador[] = [];
  const add = (bloco: string, indicador: string, unidade: Unidade, valor: number | null, fruta = "") =>
    linhas.push({ bloco, indicador, fruta, valor, unidade });
  const porFruta = (bloco: string, indicador: string, unidade: Unidade, total: number | null, valor: (f: PainelProducao["porFruta"][number]) => number | null | undefined) => {
    add(bloco, indicador, unidade, total);
    for (const f of p.porFruta) {
      const v = valor(f);
      if (v !== undefined) add(bloco, indicador, unidade, v, f.fruta);
    }
  };

  porFruta(RECEPCAO, "Fruto recebido", "kg", p.recepcao.recebidoKg, (f) => f.recepcao?.recebidoKg);
  porFruta(RECEPCAO, "De terceiros", "%", p.recepcao.percentualTerceiros, (f) => f.recepcao?.percentualTerceiros);
  porFruta(RECEPCAO, "Descarte na triagem", "%", p.recepcao.percentualDescarte, (f) => f.recepcao?.percentualDescarte);
  porFruta(RECEPCAO, "Nº de OPs", "nº", p.processamento.quantidade, (f) => f.processamento?.quantidade);
  porFruta(RECEPCAO, "Fruto processado", "kg", p.processamento.frutoKg, (f) => f.processamento?.frutoKg);
  porFruta(RECEPCAO, "Polpa produzida", "kg", p.processamento.polpaKg, (f) => f.processamento?.polpaKg);
  porFruta(RECEPCAO, "Rendimento", "%", p.processamento.rendimento, (f) => f.processamento?.rendimento);
  porFruta(RECEPCAO, "Custo médio da polpa (só OPs encerradas)", "R$/kg", p.processamento.custoMedioPolpa, (f) => f.processamento?.custoMedioPolpa);

  add(VENDAS, "Faturamento", "R$", p.vendas.faturamento);
  add(VENDAS, "Faturamento in natura", "R$", p.vendas.faturamentoInNatura);
  porFruta(VENDAS, "Faturamento de polpa", "R$", p.vendas.faturamentoPolpa, (f) => (f.faturamentoPolpa > 0 ? f.faturamentoPolpa : undefined));
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
```

Observação: no PDF, a coluna "Valor" sai com 2 casas (padrão do `formatarValorPdf`), inclusive percentual já × 100; a coluna Unidade deixa claro o que é.

```ts
// src/app/(dashboard)/producao/painel/export/route.ts
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { buscarPainelProducao } from "@/server/services/relatorioProducao/painel";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import { COLUNAS_INDICADORES, linhasDoPainel, secoesDoPainel } from "@/server/export/painelProducao";
import { gerarPdfSecoes } from "@/lib/export/pdf";
import { responderArquivoPdf, responderExport } from "@/lib/export/responder";
import { formatarData } from "@/lib/formatacao";
import { hojeDeCalendario, periodoDaUrl } from "@/lib/producao/periodo";

const NOME = "painel-producao";

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const periodo = periodoDaUrl(Object.fromEntries(url.searchParams));
  const painel = await buscarPainelProducao(sessao, periodo, hojeDeCalendario());
  const cabecalho = () =>
    cabecalhoDoRelatorio(sessao, {
      titulo: "Painel de produção",
      filtros: [`Período: ${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`],
      avisos: ["Estoque, entregas e a receber na data de hoje; custo médio só de OPs encerradas."],
    });
  const formato = url.searchParams.get("formato");

  if (formato === "pdf") {
    return responderArquivoPdf(await gerarPdfSecoes(secoesDoPainel(painel), await cabecalho()), NOME);
  }
  return responderExport(linhasDoPainel(painel), COLUNAS_INDICADORES, {
    nomeArquivo: NOME,
    nomeAba: "Painel",
    formato,
    cabecalhoPdf: cabecalho,
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/export/painelProducao.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/export/painelProducao.ts src/server/export/painelProducao.test.ts "src/app/(dashboard)/producao/painel/export"
git commit -m "feat(producao): exportação do painel em PDF, CSV e Excel"
```

---

### Task 8: Documentação, verificação completa e conferência no navegador

**Files:**
- Modify: `content/ajuda/passo-a-passo.md` (nova seção 5.0 ou 5.7 "Painel de produção"; parágrafo em 5.3 e 6.3; filtro em 5.2)
- Modify: `docs/fases/fase-7-producao-estoque-vendas.md`
- Modify: `docs/modulos/producao-estoque-vendas/08-duvidas-decisoes.md` (D-24, D-25, D-26)
- Modify: `docs/modulos/producao-estoque-vendas/09-plano-de-entrega.md` (linha da 7g dividida)
- Modify: `docs/superpowers/specs/2026-11-11-fase-7g1-painel-design.md` (status)

- [ ] **Step 1: Ajuda**

Em `content/ajuda/passo-a-passo.md`, logo após o parágrafo de abertura de "## 5. Produção", inserir:

```markdown
### Painel de produção

Produção → **Painel** resume o período escolhido (padrão: o mês atual; atalhos Mês atual, Mês anterior e Ano) em três blocos:

- **Recepção e processamento:** fruto recebido (kg líquido), quanto veio de terceiros, descarte na triagem, nº de OPs, fruto processado, polpa produzida, rendimento e custo médio da polpa, com uma linha por fruta.
- **Vendas:** faturamento (in natura e polpa de cada fruta), kg vendidos, preço médio, nº de pedidos, ticket médio, margem bruta e o total a receber.
- **Estoque e alertas:** estoque de polpa, fruto aguardando processamento, valor do estoque a custo e os alertas.

Como o painel conta:

- Pedidos, recepções e OPs cancelados ficam fora.
- OP aberta entra no volume (fruto processado, polpa e rendimento), mas o **custo médio** usa só OPs encerradas, que já têm o custo gravado.
- **A receber**, estoque e entregas mostram a situação de hoje, qualquer que seja o período.

Cada alerta com ocorrência fica destacado e abre a lista já filtrada: lotes vencendo ou vencidos (Estoque), entregas em aberto ou atrasadas (Entregas) e OPs do período com balanço ou branqueamento a verificar (Processamento). Os botões de exportação geram o PDF do painel e uma planilha com um indicador por linha.
```

Em "### 5.3. Estoque", acrescentar ao fim:

```markdown
No topo, três cartões contam os lotes com saldo e os kg em cada situação (OK, Vencendo, Vencido) na data de referência. Clique num cartão para filtrar a lista; clique de novo para limpar. O PDF traz esse resumo e a aba que estiver aberta.
```

Em "### 5.2. Processamento (OP)", acrescentar: `O filtro **A verificar** mostra só as OPs com balanço ou branqueamento fora do limite.` Em "### 6.3. Entregas", acrescentar: `Marque **Só atrasadas** para ver apenas as entregas em aberto que passaram da data prevista.`

- [ ] **Step 2: Docs do módulo e da fase**

- Doc 08: três linhas novas na tabela "Decisões de negócio", após D-23:

```markdown
| D-24 | Tamanho da 7g | Painel e cinco relatórios numa entrega só? | Dividir: 7g1 painel + estoque; 7g2 mensal, vendas, origem, processamento e gráficos. | 7g | **Duas entregas** (2026-11-11). |
| D-25 | Relatório de estoque | Tela nova em Relatórios ou completar a tela de Estoque? | Completar a tela existente com o resumo por status e o PDF em seções. | 7g1 | **Tela existente** (2026-11-11). |
| D-26 | Contagem do painel | O que entra nos números do painel? | Cancelados fora; OP aberta no volume, custo médio só de encerradas; a receber, estoque e entregas na data de hoje; OPs a verificar no período. | 7g1 | **Como recomendado** (2026-11-11). |
```

- Doc 09: no diagrama, trocar `7g Painel e relatórios` por `7g1 Painel ─► 7g2 Relatórios`; na tabela, substituir a linha da 7g por duas:

```markdown
| **7g1 Painel** | Painel de produção com indicadores, alertas clicáveis e exportação; resumo por status e PDF em seções no Estoque; filtros "só atrasadas" e "a verificar". | 7c, 7e | D-24, D-25, D-26 | M |
| **7g2 Relatórios** | Relatório mensal, de vendas, de origem e de processamento, com gráficos e exports. | 7g1 | — | L |
```

- `docs/fases/fase-7-producao-estoque-vendas.md`: no parágrafo de status, trocar "Próximo: 7g (painel e relatórios)." por "7g1 (painel) concluída em AAAA-MM-DD: painel de produção com indicadores do período por fruta, alertas que abrem a lista filtrada e exportação; resumo por status de validade no Estoque (D-24 a D-26). Próximo: 7g2 (relatórios mensal, de vendas, de origem e de processamento)." — com a data real. Na lista de sub-projetos, `7g Painel e relatórios` vira `7g1 Painel · 7g2 Relatórios`.
- Spec: `Status: implementada (AAAA-MM-DD)` e uma linha "Ajustes na implementação:" se algo mudou em relação ao desenho.

- [ ] **Step 3: Verificação completa**

Run: `npm test`
Expected: todos passam.
Run: `npm run lint`
Expected: limpo.
Run: `npm run build`
Expected: build ok (se falhar por porta/prisma, ver memória do ambiente).

- [ ] **Step 4: Conferência no navegador (desktop e 390px)**

Com `npm run dev` e dados de demonstração:
1. `/producao/painel`: os três blocos, linhas por fruta, "—" onde não há dado; trocar o período e usar os três atalhos.
2. Cada alerta com ocorrência abre a lista filtrada e o número bate com a lista (lotes vencendo/vencidos, entregas, entregas atrasadas, OPs balanço/branqueamento).
3. Exportar CSV, Excel e PDF do painel e abrir os arquivos.
4. `/producao/estoque`: cartões de status, clique liga e desliga o filtro, PDF nas duas abas.
5. `/vendas/entregas` com "Só atrasadas" e `/producao/processamento` com "A verificar", inclusive exportação.
6. Repetir 1 e 4 em 390px: cartões empilhados, tabelas rolando dentro do contêiner, sem rolagem horizontal da página.
7. Perfil PRODUCAO e VENDAS: o item "Painel" aparece e o painel abre com o bloco de vendas (todo perfil tem `producao:ler` e `venda:ler`).

- [ ] **Step 5: Commit**

```bash
git add content/ajuda/passo-a-passo.md docs
git commit -m "docs(producao): ajuda e decisões do painel (7g1)"
```

- [ ] **Step 6: Relatório final ao usuário**

Resumo do que foi entregue, decisões D-24 a D-26, ajustes feitos em relação à spec, pendências (7g2; D-06 e D-10 seguem no backlog) e o lembrete de que push, PR e merge ficam com o usuário.
