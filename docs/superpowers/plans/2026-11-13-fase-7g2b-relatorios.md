# Fase 7g2b — Relatórios de origem e de processamento: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Neste projeto a execução é **inline** (sem subagentes).

**Goal:** Telas `/producao/relatorios/origem` e `/producao/relatorios/processamento`, com exportação em PDF, CSV e Excel, fechando a 7g.

**Architecture:** O mesmo desenho da 7g2a. Uma consulta por fonte para o período ou o ano. As contas ficam em funções puras, testadas sem banco, em dois arquivos novos de `src/lib/producao/`. Os serviços ficam em `src/server/services/relatorioProducao/`, e as telas são componentes de servidor que usam `TabelaRelatorio`. O resumo de volumes do processamento reaproveita `agregarOPs` do painel, para os números baterem com o painel (D-29).

**Tech Stack:** Next.js (App Router, server components), Prisma/Postgres, Vitest (unidade e integração com banco real), recharts via `src/components/ui/chart.tsx`.

**Spec:** `docs/superpowers/specs/2026-11-13-fase-7g2b-relatorios-design.md`

## Global Constraints

- Sem mudanças no schema e sem migration.
- Recepções e OPs `CANCELADA` ficam fora; linhas de OP com `removidoEm` também (D-29).
- Processamento: volumes (nº de OPs, fruto, polpa, rendimento médio) com abertas e encerradas; rendimento mín./máx., balanço e custo **só com encerradas** (D-31).
- Origem: o ano é `periodo.fim.getUTCFullYear()`; valor pago e preço médio só de fornecedores, "—" nos talhões (D-32).
- Não repetir a lista de OPs; só o link para `/producao/processamento?inicio=…&fim=…` (D-30).
- Divisão com denominador zero → `null` → a tela mostra "—" (`razao` de `src/lib/producao/painel.ts`).
- Permissão `producao:ler` nos serviços (`requirePermission`) e nas rotas de exportação (403).
- Nome dos arquivos exportados: `relatorio-origem` e `relatorio-processamento` (o responder acrescenta a data).
- Cores de gráfico: só `--chart-2` a `--chart-4`.
- Textos de tela, ajuda e mensagens de commit em pt-BR. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Arquivos novos do repositório usam CRLF quando o git avisar (o aviso "LF will be replaced by CRLF" é normal).

**Ajuste em relação à spec:** a spec manda as funções puras para `src/lib/producao/relatorios.ts`, que já tem 298 linhas. Elas vão para `src/lib/producao/relatoriosOrigem.ts` e `src/lib/producao/relatoriosProcessamento.ts`, e a seção 2 da spec é atualizada na Task 10.

---

## Estrutura de arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/producao/relatoriosOrigem.ts` (novo) | `agregarPorOrigem`, `produtividadeTalhoes`, `precoTerceirosPorMes` |
| `src/lib/producao/relatoriosProcessamento.ts` (novo) | `agregarProcessamento` |
| `src/lib/producao/relatorios.ts` | `Unidade` ganha `"ha"` e `"t/ha"` |
| `src/app/(dashboard)/producao/relatorios/_shared/tabela.tsx` | `formatarCelula` formata `ha` e `t/ha` |
| `src/server/services/relatorioProducao/consultas.ts` | `opDoProcessamento` |
| `src/server/services/relatorioProducao/origem.ts` (novo) | `buscarRelatorioOrigem` |
| `src/server/services/relatorioProducao/processamento.ts` (novo) | `buscarRelatorioProcessamento` |
| `src/server/export/relatorioOrigem.ts` (novo) | linhas CSV e seções PDF da origem |
| `src/server/export/relatorioProcessamento.ts` (novo) | linhas CSV e seções PDF do processamento |
| `src/app/(dashboard)/producao/relatorios/origem/{page.tsx,graficos.tsx,export/route.ts}` (novos) | tela, gráfico e exportação |
| `src/app/(dashboard)/producao/relatorios/processamento/{page.tsx,export/route.ts}` (novos) | tela e exportação |
| `src/app/(dashboard)/nav-items.ts` + `.test.ts` | dois itens de menu |
| `content/ajuda/passo-a-passo.md`, docs 08/09, `docs/fases/fase-7-…md`, spec | documentação |

---

### Task 1: Funções puras do relatório de origem

**Files:**
- Create: `src/lib/producao/relatoriosOrigem.ts`
- Test: `src/lib/producao/relatoriosOrigem.test.ts`

**Interfaces:**
- Consumes: `razao` (`./painel`), `agruparPorMes` (`./relatorios`), `arredondar` (`./arredondar`).
- Produces:
  - `type GrupoOrigem = { tipo: OrigemRecepcao; origemId: string; nome: string; frutaId: string; brutoKg: number; descarteKg: number; valorTotal: number; cargas: number }`
  - `type IndicadoresOrigem = { kg: number; valor: number | null; precoMedio: number | null; percentualDescarte: number | null; cargas: number }`
  - `type ComFrutas = IndicadoresOrigem & { porFruta: Record<string, IndicadoresOrigem> }`
  - `type LinhaOrigem = ComFrutas & { tipo: OrigemRecepcao; origemId: string; nome: string }`
  - `agregarPorOrigem(grupos: GrupoOrigem[]): { linhas: LinhaOrigem[]; total: ComFrutas }`
  - `type TalhaoDoRelatorio = { id: string; nome: string; fruta: string; areaHa: number; ativo: boolean }`
  - `type ColheitaNoAno = { talhaoId: string; brutoKg: number; descarteKg: number; colheitas: number }`
  - `type LinhaProdutividade = { talhaoId: string; talhao: string; fruta: string; areaHa: number; kgPeriodo: number; kgAno: number; toneladasHa: number | null; colheitas: number }`
  - `type TotalProdutividade = { areaHa: number; kgPeriodo: number; kgAno: number; colheitas: number }`
  - `produtividadeTalhoes(talhoes: TalhaoDoRelatorio[], kgPeriodo: Map<string, number>, noAno: ColheitaNoAno[]): { linhas: LinhaProdutividade[]; total: TotalProdutividade }`
  - `type CompraDeTerceiro = { frutaId: string; data: Date; brutoKg: number; descarteKg: number; valorTotal: number }`
  - `precoTerceirosPorMes(compras: CompraDeTerceiro[]): Record<string, (number | null)[]>`: 13 posições, Jan–Dez (0–11) e o ano (12).

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/producao/relatoriosOrigem.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  agregarPorOrigem,
  precoTerceirosPorMes,
  produtividadeTalhoes,
  type CompraDeTerceiro,
  type GrupoOrigem,
} from "./relatoriosOrigem";

const g = (x: Partial<GrupoOrigem>): GrupoOrigem => ({
  tipo: "TERCEIRO",
  origemId: "f1",
  nome: "Produtor",
  frutaId: "a",
  brutoKg: 0,
  descarteKg: 0,
  valorTotal: 0,
  cargas: 1,
  ...x,
});

describe("agregarPorOrigem", () => {
  const r = agregarPorOrigem([
    g({ frutaId: "a", brutoKg: 200, descarteKg: 20, valorTotal: 360 }),
    g({ frutaId: "c", brutoKg: 40, valorTotal: 120 }),
    g({ tipo: "PROPRIA", origemId: "t1", nome: "Talhão 1", brutoKg: 100, descarteKg: 10, valorTotal: 135 }),
  ]);

  test("uma linha por origem, ordenada por kg líquido", () => {
    expect(r.linhas.map((l) => [l.nome, l.tipo, l.kg, l.valor, l.cargas])).toEqual([
      ["Produtor", "TERCEIRO", 220, 480, 2],
      ["Talhão 1", "PROPRIA", 90, null, 1],
    ]);
  });

  test("kg por fruta, preço médio e descarte", () => {
    expect(r.linhas[0].porFruta.a).toMatchObject({ kg: 180, valor: 360, precoMedio: 2, cargas: 1 });
    expect(r.linhas[0].porFruta.c).toMatchObject({ kg: 40, valor: 120, precoMedio: 3 });
    expect(r.linhas[0].precoMedio).toBeCloseTo(480 / 220);
    expect(r.linhas[0].percentualDescarte).toBeCloseTo(20 / 240);
    expect(r.linhas[1]).toMatchObject({ precoMedio: null, percentualDescarte: 0.1 });
  });

  test("total: valor e preço só de terceiros (D-32)", () => {
    expect(r.total).toMatchObject({ kg: 310, valor: 480, cargas: 3 });
    expect(r.total.porFruta.a.kg).toBe(270);
    expect(r.total.precoMedio).toBeCloseTo(480 / 220);
  });

  test("talhão e fornecedor com o mesmo id não se misturam; só talhões = sem valor", () => {
    const s = agregarPorOrigem([
      g({ tipo: "PROPRIA", origemId: "x", nome: "X", brutoKg: 10 }),
      g({ tipo: "TERCEIRO", origemId: "x", nome: "X", brutoKg: 5 }),
    ]);
    expect(s.linhas).toHaveLength(2);
    expect(agregarPorOrigem([g({ tipo: "PROPRIA", brutoKg: 10 })]).total.valor).toBeNull();
    expect(agregarPorOrigem([]).total).toMatchObject({ kg: 0, valor: null, percentualDescarte: null, cargas: 0 });
  });
});

describe("produtividadeTalhoes", () => {
  const r = produtividadeTalhoes(
    [
      { id: "t2", nome: "Talhão 2", fruta: "Cupuaçu", areaHa: 0.5, ativo: false },
      { id: "t1", nome: "Talhão 1", fruta: "Açaí", areaHa: 2, ativo: true },
      { id: "t3", nome: "Talhão 3", fruta: "Açaí", areaHa: 1, ativo: false },
      { id: "t4", nome: "Talhão 4", fruta: "Açaí", areaHa: 0, ativo: true },
    ],
    new Map([
      ["t1", 90],
      ["t2", 50],
    ]),
    [
      { talhaoId: "t1", brutoKg: 1100, descarteKg: 10, colheitas: 2 },
      { talhaoId: "t2", brutoKg: 50, descarteKg: 0, colheitas: 1 },
    ],
  );

  test("ativos e inativos com colheita, por nome; inativo sem colheita fora", () => {
    expect(r.linhas.map((l) => [l.talhao, l.kgPeriodo, l.kgAno, l.colheitas])).toEqual([
      ["Talhão 1", 90, 1090, 2],
      ["Talhão 2", 50, 50, 1],
      ["Talhão 4", 0, 0, 0],
    ]);
  });

  test("t/ha no ano (RN-30); área zero = null", () => {
    expect(r.linhas[0].toneladasHa).toBeCloseTo(0.545);
    expect(r.linhas[1].toneladasHa).toBeCloseTo(0.1);
    expect(r.linhas[2].toneladasHa).toBeNull();
  });

  test("total soma área, kg e colheitas", () => {
    expect(r.total).toEqual({ areaHa: 2.5, kgPeriodo: 140, kgAno: 1140, colheitas: 3 });
  });
});

describe("precoTerceirosPorMes", () => {
  const c = (frutaId: string, iso: string, bruto: number, descarte: number, valor: number): CompraDeTerceiro => ({
    frutaId,
    data: new Date(`${iso}T00:00:00.000Z`),
    brutoKg: bruto,
    descarteKg: descarte,
    valorTotal: valor,
  });
  const r = precoTerceirosPorMes([
    c("a", "2026-03-10", 100, 0, 180),
    c("a", "2026-11-07", 200, 20, 360),
    c("a", "2026-11-09", 60, 0, 150),
    c("c", "2026-11-08", 40, 0, 120),
  ]);

  test("Σ valor ÷ Σ kg líquido por mês e no ano; mês sem compra = null", () => {
    expect(r.a).toHaveLength(13);
    expect(r.a[2]).toBeCloseTo(1.8);
    expect(r.a[10]).toBeCloseTo(510 / 240);
    expect(r.a[12]).toBeCloseTo(690 / 340);
    expect(r.a[0]).toBeNull();
    expect(r.c[10]).toBe(3);
    expect(r.c[2]).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que ele falha**

Run: `npx vitest run src/lib/producao/relatoriosOrigem.test.ts`
Expected: FAIL, com "Failed to resolve import ./relatoriosOrigem".

- [ ] **Step 3: Implementar**

`src/lib/producao/relatoriosOrigem.ts`:

```ts
import type { OrigemRecepcao } from "@prisma/client";
import { arredondar } from "./arredondar";
import { razao } from "./painel";
import { agruparPorMes } from "./relatorios";

/** Soma das recepções ativas de uma origem e um produto (groupBy do período). */
export type GrupoOrigem = {
  tipo: OrigemRecepcao;
  /** Talhão (própria) ou fornecedor (terceiro). */
  origemId: string;
  nome: string;
  frutaId: string;
  brutoKg: number;
  descarteKg: number;
  valorTotal: number;
  /** Nº de recepções. */
  cargas: number;
};

export type IndicadoresOrigem = {
  /** Peso líquido (bruto − descarte). */
  kg: number;
  /** Σ valor só de terceiros; `null` sem terceiro (fruto próprio vale o custo-padrão, D-32). */
  valor: number | null;
  /** Σ valor ÷ Σ kg líquido de terceiros. */
  precoMedio: number | null;
  /** Σ descarte ÷ Σ bruto. */
  percentualDescarte: number | null;
  cargas: number;
};

export type ComFrutas = IndicadoresOrigem & { porFruta: Record<string, IndicadoresOrigem> };
export type LinhaOrigem = ComFrutas & { tipo: OrigemRecepcao; origemId: string; nome: string };

function agrupar<T>(itens: T[], chave: (item: T) => string): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const item of itens) grupos.set(chave(item), [...(grupos.get(chave(item)) ?? []), item]);
  return grupos;
}

function indicadoresOrigem(grupos: GrupoOrigem[]): IndicadoresOrigem {
  let bruto = 0;
  let descarte = 0;
  let cargas = 0;
  let valorTerceiros = 0;
  let kgTerceiros = 0;
  let temTerceiro = false;
  for (const g of grupos) {
    bruto += g.brutoKg;
    descarte += g.descarteKg;
    cargas += g.cargas;
    if (g.tipo === "TERCEIRO") {
      temTerceiro = true;
      valorTerceiros += g.valorTotal;
      kgTerceiros += g.brutoKg - g.descarteKg;
    }
  }
  const valor = temTerceiro ? arredondar(valorTerceiros, 2) : null;
  return {
    kg: arredondar(bruto - descarte, 3),
    valor,
    precoMedio: valor === null ? null : razao(valor, kgTerceiros),
    percentualDescarte: razao(descarte, bruto),
    cargas,
  };
}

function comFrutas(grupos: GrupoOrigem[]): ComFrutas {
  return {
    ...indicadoresOrigem(grupos),
    porFruta: Object.fromEntries(
      [...agrupar(grupos, (g) => g.frutaId)].map(([frutaId, gs]) => [frutaId, indicadoresOrigem(gs)]),
    ),
  };
}

/** Uma linha por talhão e por fornecedor, maior kg líquido primeiro, e o total. */
export function agregarPorOrigem(grupos: GrupoOrigem[]): { linhas: LinhaOrigem[]; total: ComFrutas } {
  const linhas = [...agrupar(grupos, (g) => `${g.tipo}:${g.origemId}`).values()]
    .map((gs): LinhaOrigem => ({ ...comFrutas(gs), tipo: gs[0].tipo, origemId: gs[0].origemId, nome: gs[0].nome }))
    .sort((a, b) => b.kg - a.kg || a.nome.localeCompare(b.nome));
  return { linhas, total: comFrutas(grupos) };
}

// Produtividade dos talhões --------------------------------------------------

export type TalhaoDoRelatorio = { id: string; nome: string; fruta: string; areaHa: number; ativo: boolean };
/** Recepções próprias ativas de um talhão no ano. */
export type ColheitaNoAno = { talhaoId: string; brutoKg: number; descarteKg: number; colheitas: number };

export type LinhaProdutividade = {
  talhaoId: string;
  talhao: string;
  fruta: string;
  areaHa: number;
  kgPeriodo: number;
  kgAno: number;
  /** RN-30: kg líquidos do ano ÷ 1000 ÷ área. */
  toneladasHa: number | null;
  colheitas: number;
};
export type TotalProdutividade = { areaHa: number; kgPeriodo: number; kgAno: number; colheitas: number };

/** Talhões ativos e os inativos com colheita, por nome; o total não tem t/ha (mistura frutas). */
export function produtividadeTalhoes(
  talhoes: TalhaoDoRelatorio[],
  kgPeriodo: Map<string, number>,
  noAno: ColheitaNoAno[],
): { linhas: LinhaProdutividade[]; total: TotalProdutividade } {
  const ano = new Map(noAno.map((c) => [c.talhaoId, c]));
  const linhas = talhoes
    .filter((t) => t.ativo || ano.has(t.id) || kgPeriodo.has(t.id))
    .map((t): LinhaProdutividade => {
      const c = ano.get(t.id);
      const kgAno = c ? arredondar(c.brutoKg - c.descarteKg, 3) : 0;
      return {
        talhaoId: t.id,
        talhao: t.nome,
        fruta: t.fruta,
        areaHa: t.areaHa,
        kgPeriodo: kgPeriodo.get(t.id) ?? 0,
        kgAno,
        toneladasHa: razao(kgAno / 1000, t.areaHa),
        colheitas: c?.colheitas ?? 0,
      };
    })
    .sort((a, b) => a.talhao.localeCompare(b.talhao));
  const soma = (valor: (l: LinhaProdutividade) => number, casas: number) =>
    arredondar(
      linhas.reduce((s, l) => s + valor(l), 0),
      casas,
    );
  return {
    linhas,
    total: {
      areaHa: soma((l) => l.areaHa, 2),
      kgPeriodo: soma((l) => l.kgPeriodo, 3),
      kgAno: soma((l) => l.kgAno, 3),
      colheitas: soma((l) => l.colheitas, 0),
    },
  };
}

// Preço pago a terceiros por mês ----------------------------------------------

export type CompraDeTerceiro = { frutaId: string; data: Date; brutoKg: number; descarteKg: number; valorTotal: number };

function precoMedio(compras: CompraDeTerceiro[]): number | null {
  const valor = compras.reduce((s, c) => s + c.valorTotal, 0);
  const kg = compras.reduce((s, c) => s + c.brutoKg - c.descarteKg, 0);
  return razao(valor, kg);
}

/** Por fruta: Jan–Dez (0–11) e o ano (12); mês sem compra = null. */
export function precoTerceirosPorMes(compras: CompraDeTerceiro[]): Record<string, (number | null)[]> {
  return Object.fromEntries(
    [...agrupar(compras, (c) => c.frutaId)].map(([frutaId, cs]) => [
      frutaId,
      [...agruparPorMes(cs, (c) => c.data).map(precoMedio), precoMedio(cs)],
    ]),
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que ele passa**

Run: `npx vitest run src/lib/producao/relatoriosOrigem.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/producao/relatoriosOrigem.ts src/lib/producao/relatoriosOrigem.test.ts
git commit -m "feat(producao): contas do relatório de origem"
```

---

### Task 2: Funções puras do relatório de processamento

**Files:**
- Create: `src/lib/producao/relatoriosProcessamento.ts`
- Test: `src/lib/producao/relatoriosProcessamento.test.ts`

**Interfaces:**
- Consumes: `agregarOPs`, `razao`, `OPDoPainel`, `TotaisOPs` (`./painel`); `rendimento` (`./op`); `arredondar`.
- Produces:
  - `type OPDoProcessamento = OPDoPainel & { aguaLitros: number; carocoResiduoKg: number; perdaKg: number; custoFrutoTotal: number; custoInsumosTotal: number }`
  - `type BalancoAgregado = { frutoKg: number; aguaKg: number; polpaKg: number; carocoResiduoKg: number; perdaKg: number; diferencaKg: number; percentual: number | null; opsVerificar: number }`
  - `type CustoAgregado = { custoFruto: number; custoInsumos: number; custoTotal: number; polpaKg: number; custoKg: number | null }`
  - `type LinhaProcessamento = { volume: TotaisOPs; encerradas: number; rendimentoMin: number | null; rendimentoMax: number | null; balanco: BalancoAgregado; custo: CustoAgregado }`
  - `agregarProcessamento(ops: OPDoProcessamento[]): { porFruta: Map<string, LinhaProcessamento>; total: LinhaProcessamento }`

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/producao/relatoriosProcessamento.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { agregarProcessamento, type OPDoProcessamento } from "./relatoriosProcessamento";

const op = (x: Partial<OPDoProcessamento>): OPDoProcessamento => ({
  frutaId: "a",
  status: "ENCERRADA",
  frutoKg: 0,
  polpaKg: 0,
  custoTotal: 0,
  balancoVerificar: false,
  branqueamentoVerificar: false,
  aguaLitros: 0,
  carocoResiduoKg: 0,
  perdaKg: 0,
  custoFrutoTotal: 0,
  custoInsumosTotal: 0,
  ...x,
});

const r = agregarProcessamento([
  op({ frutoKg: 100, polpaKg: 40, aguaLitros: 20, carocoResiduoKg: 70, perdaKg: 9, custoFrutoTotal: 150, custoInsumosTotal: 5, custoTotal: 155 }),
  op({ frutoKg: 50, polpaKg: 25, carocoResiduoKg: 20, custoFrutoTotal: 75, custoTotal: 75, balancoVerificar: true }),
  op({ status: "ABERTA", frutoKg: 30, custoFrutoTotal: 45, custoTotal: 45, balancoVerificar: true }),
  op({ frutaId: "c", frutoKg: 40, polpaKg: 16, carocoResiduoKg: 20, perdaKg: 4, custoFrutoTotal: 80, custoTotal: 80 }),
  op({ frutaId: "c", status: "CANCELADA", frutoKg: 10 }),
]);
const a = r.porFruta.get("a")!;

describe("agregarProcessamento", () => {
  test("volume com abertas, como o painel (D-29)", () => {
    expect(a.volume).toMatchObject({ quantidade: 3, frutoKg: 180, polpaKg: 65 });
    expect(a.volume.rendimento).toBeCloseTo(65 / 180);
    expect(a.volume.custoMedioPolpa).toBeCloseTo(230 / 65);
  });

  test("rendimento mín./máx. só de encerradas (D-31)", () => {
    expect(a).toMatchObject({ encerradas: 2, rendimentoMin: 0.4, rendimentoMax: 0.5 });
  });

  test("balanço de massa das encerradas", () => {
    expect(a.balanco).toMatchObject({
      frutoKg: 150,
      aguaKg: 20,
      polpaKg: 65,
      carocoResiduoKg: 90,
      perdaKg: 9,
      diferencaKg: 6,
      opsVerificar: 1,
    });
    expect(a.balanco.percentual).toBeCloseTo(6 / 170);
  });

  test("custo das encerradas", () => {
    expect(a.custo).toMatchObject({ custoFruto: 225, custoInsumos: 5, custoTotal: 230, polpaKg: 65 });
    expect(a.custo.custoKg).toBeCloseTo(230 / 65);
  });

  test("cancelada fora; total de todas as frutas", () => {
    expect(r.porFruta.get("c")!.volume.quantidade).toBe(1);
    expect(r.total.volume).toMatchObject({ quantidade: 4, frutoKg: 220, polpaKg: 81 });
    expect(r.total).toMatchObject({ encerradas: 3, rendimentoMin: 0.4, rendimentoMax: 0.5 });
    expect(r.total.balanco).toMatchObject({ diferencaKg: 6, opsVerificar: 1 });
    expect(r.total.custo.custoTotal).toBe(310);
  });

  test("só abertas: nada de encerradas", () => {
    const s = agregarProcessamento([op({ status: "ABERTA", frutoKg: 30 })]);
    expect(s.total).toMatchObject({ encerradas: 0, rendimentoMin: null, rendimentoMax: null });
    expect(s.total.balanco.percentual).toBeNull();
    expect(s.total.custo.custoKg).toBeNull();
    expect(s.total.volume.quantidade).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que ele falha**

Run: `npx vitest run src/lib/producao/relatoriosProcessamento.test.ts`
Expected: FAIL, com "Failed to resolve import ./relatoriosProcessamento".

- [ ] **Step 3: Implementar**

`src/lib/producao/relatoriosProcessamento.ts`:

```ts
import { arredondar } from "./arredondar";
import { rendimento } from "./op";
import { agregarOPs, razao, type OPDoPainel, type TotaisOPs } from "./painel";

export type OPDoProcessamento = OPDoPainel & {
  aguaLitros: number;
  carocoResiduoKg: number;
  perdaKg: number;
  custoFrutoTotal: number;
  custoInsumosTotal: number;
};

export type BalancoAgregado = {
  frutoKg: number;
  /** 1 L = 1 kg (RN-11). */
  aguaKg: number;
  polpaKg: number;
  carocoResiduoKg: number;
  perdaKg: number;
  diferencaKg: number;
  /** diferença ÷ (fruto + água). */
  percentual: number | null;
  /** OPs com balanço "Verificar" pela tolerância configurada. */
  opsVerificar: number;
};

export type CustoAgregado = {
  custoFruto: number;
  custoInsumos: number;
  custoTotal: number;
  polpaKg: number;
  custoKg: number | null;
};

export type LinhaProcessamento = {
  /** Abertas e encerradas: os mesmos números do painel (D-29). */
  volume: TotaisOPs;
  /** Daqui para baixo, só OPs encerradas (D-31). */
  encerradas: number;
  rendimentoMin: number | null;
  rendimentoMax: number | null;
  balanco: BalancoAgregado;
  custo: CustoAgregado;
};

const somar = <T>(itens: T[], valor: (item: T) => number) => itens.reduce((s, i) => s + valor(i), 0);

function soEncerradas(ops: OPDoProcessamento[]): Omit<LinhaProcessamento, "volume"> {
  const enc = ops.filter((op) => op.status === "ENCERRADA");
  const rendimentos = enc.map((op) => rendimento(op.frutoKg, op.polpaKg)).filter((r): r is number => r !== null);
  const fruto = somar(enc, (op) => op.frutoKg);
  const agua = somar(enc, (op) => op.aguaLitros);
  const polpa = somar(enc, (op) => op.polpaKg);
  const caroco = somar(enc, (op) => op.carocoResiduoKg);
  const perda = somar(enc, (op) => op.perdaKg);
  const diferenca = fruto + agua - polpa - caroco - perda;
  const custoFruto = somar(enc, (op) => op.custoFrutoTotal);
  const custoInsumos = somar(enc, (op) => op.custoInsumosTotal);
  const custoTotal = custoFruto + custoInsumos;
  return {
    encerradas: enc.length,
    rendimentoMin: rendimentos.length > 0 ? Math.min(...rendimentos) : null,
    rendimentoMax: rendimentos.length > 0 ? Math.max(...rendimentos) : null,
    balanco: {
      frutoKg: arredondar(fruto, 3),
      aguaKg: arredondar(agua, 3),
      polpaKg: arredondar(polpa, 3),
      carocoResiduoKg: arredondar(caroco, 3),
      perdaKg: arredondar(perda, 3),
      diferencaKg: arredondar(diferenca, 3),
      percentual: razao(diferenca, fruto + agua),
      opsVerificar: enc.filter((op) => op.balancoVerificar).length,
    },
    custo: {
      custoFruto: arredondar(custoFruto, 2),
      custoInsumos: arredondar(custoInsumos, 2),
      custoTotal: arredondar(custoTotal, 2),
      polpaKg: arredondar(polpa, 3),
      custoKg: razao(custoTotal, polpa),
    },
  };
}

/** Resumo, balanço e custo por fruta e no total; OP cancelada fica fora (D-29, D-31). */
export function agregarProcessamento(ops: OPDoProcessamento[]): {
  porFruta: Map<string, LinhaProcessamento>;
  total: LinhaProcessamento;
} {
  const validas = ops.filter((op) => op.status !== "CANCELADA");
  const volume = agregarOPs(validas);
  const grupos = new Map<string, OPDoProcessamento[]>();
  for (const op of validas) grupos.set(op.frutaId, [...(grupos.get(op.frutaId) ?? []), op]);
  return {
    porFruta: new Map(
      [...grupos].map(([frutaId, grupo]) => [frutaId, { volume: volume.porFruta.get(frutaId)!, ...soEncerradas(grupo) }]),
    ),
    total: { volume: volume.total, ...soEncerradas(validas) },
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que ele passa**

Run: `npx vitest run src/lib/producao/relatoriosProcessamento.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/producao/relatoriosProcessamento.ts src/lib/producao/relatoriosProcessamento.test.ts
git commit -m "feat(producao): contas do relatório de processamento"
```

---

### Task 3: Serviço do relatório de origem

**Files:**
- Create: `src/server/services/relatorioProducao/origem.ts`
- Test: `src/server/services/relatorioProducao/origem.test.ts`
- Modify: `src/server/services/relatorioProducao/relatorios.permissao.test.ts`

**Interfaces:**
- Consumes: tudo da Task 1.
- Produces:
  ```ts
  export type RelatorioOrigem = {
    periodo: { inicio: Date; fim: Date };
    ano: number;
    frutas: { id: string; nome: string }[];          // com recepção no período
    porOrigem: LinhaOrigem[];
    total: ComFrutas;
    produtividade: LinhaProdutividade[];
    totalProdutividade: TotalProdutividade;
    frutasTerceiros: { id: string; nome: string }[]; // compradas de terceiros no ano
    precoPorMes: Record<string, (number | null)[]>;
  };
  export async function buscarRelatorioOrigem(sessao: SessaoAtiva, periodo: { inicio: Date; fim: Date }): Promise<RelatorioOrigem>
  ```

- [ ] **Step 1: Escrever o teste de integração que falha**

`src/server/services/relatorioProducao/origem.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { recepcaoSchema } from "@/lib/schemas/recepcao";
import {
  criarCatalogoDeTeste,
  criarFixtureProducao,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "../producaoTestFixtures";
import { cancelarRecepcao, criarRecepcao } from "../recepcaoFruto";
import { buscarPainelProducao } from "./painel";
import { buscarRelatorioOrigem, type RelatorioOrigem } from "./origem";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("relatório de origem", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let r: RelatorioOrigem;
  const adm = () => fx.sessao("ADMINISTRADOR");
  const periodo = { inicio: d("2026-11-01"), fim: d("2026-11-30") };

  const receber = (data: string, extra: Record<string, unknown>) =>
    criarRecepcao(
      adm(),
      recepcaoSchema.parse({ data, localId: cat.localRecepcaoId, unidade: "KG", descarte: "0", ...extra }),
    );

  beforeAll(async () => {
    fx = await criarFixtureProducao("origem");
    cat = await criarCatalogoDeTeste(fx);
    await prisma.configuracaoProducao.update({
      where: { filialId: fx.filialAId },
      data: { categoriaCompraFrutoId: cat.categoriaCompraId },
    });
    const t2 = await prisma.talhao.create({
      data: { filialId: fx.filialAId, nome: "Talhão 2", frutaId: cat.outraFrutaId, areaHa: 0.5 },
    });
    await prisma.talhao.create({
      data: { filialId: fx.filialAId, nome: "Talhão 3", frutaId: cat.frutaId, areaHa: 1, ativo: false },
    });
    await prisma.talhao.create({ data: { filialId: fx.filialAId, nome: "Talhão 4", frutaId: cat.frutaId, areaHa: 1 } });
    const fornB = await prisma.fornecedor.create({
      data: { empresaId: fx.empresaId, nome: "Fornecedor B", cnpjCpf: `fb-${Date.now()}` },
    });
    const talhao = (talhaoId: string) => ({ origem: "PROPRIA", talhaoId });
    const terceiro = (fornecedorId: string) => ({ origem: "TERCEIRO", fornecedorId });
    const FA = cat.produtoFrutoId;
    const FC = cat.produtoFrutoOutraId;

    await receber("2025-12-15", { produtoId: FA, ...talhao(cat.talhaoId), pesoBruto: "500" }); // ano anterior
    await receber("2026-03-10", { produtoId: FA, ...talhao(cat.talhaoId), pesoBruto: "1000" });
    await receber("2026-03-10", { produtoId: FA, ...terceiro(cat.fornecedorId), pesoBruto: "100", preco: "1.8" });
    await receber("2026-11-05", { produtoId: FA, ...talhao(cat.talhaoId), pesoBruto: "100", descarte: "10" });
    await receber("2026-11-06", { produtoId: FC, ...talhao(t2.id), pesoBruto: "50" });
    await receber("2026-11-07", {
      produtoId: FA,
      ...terceiro(cat.fornecedorId),
      pesoBruto: "200",
      descarte: "20",
      preco: "2",
    });
    await receber("2026-11-08", { produtoId: FC, ...terceiro(cat.fornecedorId), pesoBruto: "40", preco: "3" });
    await receber("2026-11-09", { produtoId: FA, ...terceiro(fornB.id), pesoBruto: "60", preco: "2.5" });
    const cancelada = await receber("2026-11-10", { produtoId: FA, ...terceiro(fornB.id), pesoBruto: "30", preco: "2" });
    await cancelarRecepcao(adm(), cancelada.recepcaoId, "Lançada em dobro");
    await prisma.talhao.update({ where: { id: t2.id }, data: { ativo: false } });

    r = await buscarRelatorioOrigem(adm(), periodo);
  }, 60_000);

  afterAll(async () => {
    await fx.limpar();
  });

  test("ano da data Até e frutas do período", () => {
    expect(r.ano).toBe(2026);
    expect(r.frutas.map((f) => f.nome)).toEqual(["Açaí", "Cupuaçu"]);
  });

  test("por origem: kg líquido, valor só de terceiros, cancelada fora", () => {
    expect(r.porOrigem.map((o) => [o.nome, o.tipo, o.kg, o.valor, o.cargas])).toEqual([
      ["Produtor exemplo", "TERCEIRO", 220, 480, 2],
      ["Talhão 1", "PROPRIA", 90, null, 1],
      ["Fornecedor B", "TERCEIRO", 60, 150, 1],
      ["Talhão 2", "PROPRIA", 50, null, 1],
    ]);
    expect(r.porOrigem[0].porFruta[cat.frutaId].kg).toBe(180);
    expect(r.porOrigem[0].porFruta[cat.outraFrutaId].kg).toBe(40);
    expect(r.total).toMatchObject({ kg: 420, valor: 630, precoMedio: 2.25, cargas: 5 });
    expect(r.total.percentualDescarte).toBeCloseTo(30 / 450);
  });

  test("produtividade no ano: inativo com colheita entra, sem colheita não", () => {
    expect(r.produtividade.map((p) => [p.talhao, p.kgPeriodo, p.kgAno, p.colheitas])).toEqual([
      ["Talhão 1", 90, 1090, 2],
      ["Talhão 2", 50, 50, 1],
      ["Talhão 4", 0, 0, 0],
    ]);
    expect(r.produtividade[0].toneladasHa).toBeCloseTo(0.545);
    expect(r.produtividade[1].toneladasHa).toBeCloseTo(0.1);
    expect(r.totalProdutividade).toEqual({ areaHa: 3.5, kgPeriodo: 140, kgAno: 1140, colheitas: 3 });
  });

  test("preço médio pago a terceiros por mês no ano", () => {
    expect(r.frutasTerceiros.map((f) => f.nome)).toEqual(["Açaí", "Cupuaçu"]);
    const acai = r.precoPorMes[cat.frutaId];
    expect(acai[2]).toBeCloseTo(1.8);
    expect(acai[10]).toBeCloseTo(510 / 240);
    expect(acai[12]).toBeCloseTo(690 / 340);
    expect(acai[0]).toBeNull();
    expect(r.precoPorMes[cat.outraFrutaId][10]).toBe(3);
  });

  test("kg total bate com o fruto recebido do painel (D-29)", async () => {
    const p = await buscarPainelProducao(adm(), periodo, d("2026-11-20"));
    expect(r.total.kg).toBe(p.recepcao.recebidoKg);
  });

  test("outra filial não vê nada", async () => {
    const b = await buscarRelatorioOrigem(fx.sessao("ADMINISTRADOR", { filial: "B" }), periodo);
    expect(b.porOrigem).toEqual([]);
    expect(b.produtividade).toEqual([]);
    expect(b.precoPorMes).toEqual({});
  });
});
```

Em `relatorios.permissao.test.ts`, acrescente o import `import { buscarRelatorioOrigem } from "./origem";` e o teste:

```ts
  test("sem producao:ler o de origem é recusado antes de consultar o banco", async () => {
    await expect(buscarRelatorioOrigem(sessao, { inicio: dia, fim: dia })).rejects.toThrow(PermissionError);
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que ele falha**

Run: `npx vitest run src/server/services/relatorioProducao/origem.test.ts src/server/services/relatorioProducao/relatorios.permissao.test.ts`
Expected: FAIL, com "Failed to resolve import ./origem".

- [ ] **Step 3: Implementar**

`src/server/services/relatorioProducao/origem.ts`:

```ts
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import {
  agregarPorOrigem,
  precoTerceirosPorMes,
  produtividadeTalhoes,
  type ComFrutas,
  type LinhaOrigem,
  type LinhaProdutividade,
  type TotalProdutividade,
} from "@/lib/producao/relatoriosOrigem";

export type RelatorioOrigem = {
  periodo: { inicio: Date; fim: Date };
  /** Ano da data "Até" (D-32): produtividade e preço por mês. */
  ano: number;
  /** Frutas com recepção no período, por nome. */
  frutas: { id: string; nome: string }[];
  porOrigem: LinhaOrigem[];
  total: ComFrutas;
  produtividade: LinhaProdutividade[];
  totalProdutividade: TotalProdutividade;
  /** Frutas compradas de terceiros no ano, por nome. */
  frutasTerceiros: { id: string; nome: string }[];
  /** frutaId → Jan–Dez e o ano. */
  precoPorMes: Record<string, (number | null)[]>;
};

const n = (v: unknown) => Number(v ?? 0);

/**
 * Relatório de origem da matéria-prima (doc 07, REL_ORIGEM): recepções ativas
 * do período por talhão e fornecedor; produtividade dos talhões e preço pago a
 * terceiros no ano da data "Até" (D-32).
 */
export async function buscarRelatorioOrigem(
  sessao: SessaoAtiva,
  periodo: { inicio: Date; fim: Date },
): Promise<RelatorioOrigem> {
  requirePermission(sessao.perfil, "producao:ler");
  const { filialId, empresaId } = sessao;
  const ano = periodo.fim.getUTCFullYear();
  const noAno = { gte: new Date(Date.UTC(ano, 0, 1)), lte: new Date(Date.UTC(ano, 11, 31)) };
  const ativa = { filialId, status: "ATIVA" as const };

  const [produtos, frutas, talhoes, fornecedores, doPeriodo, talhoesNoAno, compras] = await Promise.all([
    prisma.produto.findMany({ where: { empresaId }, select: { id: true, frutaId: true } }),
    prisma.fruta.findMany({ where: { empresaId }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.talhao.findMany({
      where: { filialId },
      select: { id: true, nome: true, areaHa: true, ativo: true, fruta: { select: { nome: true } } },
    }),
    prisma.fornecedor.findMany({
      where: { empresaId, recepcoesFruto: { some: { filialId } } },
      select: { id: true, nome: true },
    }),
    prisma.recepcaoFruto.groupBy({
      by: ["origem", "talhaoId", "fornecedorId", "produtoId"],
      where: { ...ativa, data: { gte: periodo.inicio, lte: periodo.fim } },
      _sum: { pesoBrutoKg: true, descarteKg: true, valorTotal: true },
      _count: { _all: true },
    }),
    prisma.recepcaoFruto.groupBy({
      by: ["talhaoId"],
      where: { ...ativa, origem: "PROPRIA", data: noAno },
      _sum: { pesoBrutoKg: true, descarteKg: true },
      _count: { _all: true },
    }),
    prisma.recepcaoFruto.groupBy({
      by: ["produtoId", "data"],
      where: { ...ativa, origem: "TERCEIRO", data: noAno },
      _sum: { pesoBrutoKg: true, descarteKg: true, valorTotal: true },
    }),
  ]);

  const frutaDo = new Map(produtos.map((p) => [p.id, p.frutaId]));
  const nomeTalhao = new Map(talhoes.map((t) => [t.id, t.nome]));
  const nomeFornecedor = new Map(fornecedores.map((f) => [f.id, f.nome]));

  const { linhas, total } = agregarPorOrigem(
    doPeriodo.map((g) => {
      const propria = g.origem === "PROPRIA";
      const origemId = (propria ? g.talhaoId : g.fornecedorId) ?? "";
      return {
        tipo: g.origem,
        origemId,
        nome: (propria ? nomeTalhao : nomeFornecedor).get(origemId) ?? "—",
        frutaId: frutaDo.get(g.produtoId) ?? "",
        brutoKg: n(g._sum.pesoBrutoKg),
        descarteKg: n(g._sum.descarteKg),
        valorTotal: n(g._sum.valorTotal),
        cargas: g._count._all,
      };
    }),
  );

  const produtividade = produtividadeTalhoes(
    talhoes.map((t) => ({ id: t.id, nome: t.nome, fruta: t.fruta.nome, areaHa: n(t.areaHa), ativo: t.ativo })),
    new Map(linhas.filter((l) => l.tipo === "PROPRIA").map((l) => [l.origemId, l.kg])),
    talhoesNoAno.flatMap((g) =>
      g.talhaoId
        ? [
            {
              talhaoId: g.talhaoId,
              brutoKg: n(g._sum.pesoBrutoKg),
              descarteKg: n(g._sum.descarteKg),
              colheitas: g._count._all,
            },
          ]
        : [],
    ),
  );

  const precoPorMes = precoTerceirosPorMes(
    compras.map((c) => ({
      frutaId: frutaDo.get(c.produtoId) ?? "",
      data: c.data,
      brutoKg: n(c._sum.pesoBrutoKg),
      descarteKg: n(c._sum.descarteKg),
      valorTotal: n(c._sum.valorTotal),
    })),
  );

  return {
    periodo,
    ano,
    frutas: frutas.filter((f) => f.id in total.porFruta),
    porOrigem: linhas,
    total,
    produtividade: produtividade.linhas,
    totalProdutividade: produtividade.total,
    frutasTerceiros: frutas.filter((f) => f.id in precoPorMes),
    precoPorMes,
  };
}
```

Se o TypeScript reclamar do tipo de `_count` dentro do `Promise.all` (é um problema conhecido de inferência do `groupBy`), tire os três `groupBy` do `Promise.all` e use `await` sequencial. O resultado não muda.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/server/services/relatorioProducao/origem.test.ts src/server/services/relatorioProducao/relatorios.permissao.test.ts`
Expected: PASS. Se o banco local não estiver de pé, veja a memória [[ambiente-dev-armadilhas]].

- [ ] **Step 5: Commit**

```bash
git add src/server/services/relatorioProducao/origem.ts src/server/services/relatorioProducao/origem.test.ts src/server/services/relatorioProducao/relatorios.permissao.test.ts
git commit -m "feat(producao): serviço do relatório de origem"
```

---

### Task 4: Serviço do relatório de processamento

**Files:**
- Modify: `src/server/services/relatorioProducao/consultas.ts` (acrescentar `opDoProcessamento`)
- Create: `src/server/services/relatorioProducao/processamento.ts`
- Test: `src/server/services/relatorioProducao/processamento.test.ts`
- Modify: `src/server/services/relatorioProducao/relatorios.permissao.test.ts`

**Interfaces:**
- Consumes: `agregarProcessamento`, `OPDoProcessamento`, `LinhaProcessamento` (Task 2); `listarOPs`, `OPListada` (`../ordemProducao`); `opDoPainel` (`./consultas`).
- Produces:
  ```ts
  export function opDoProcessamento(op: OPListada): OPDoProcessamento   // consultas.ts
  export type LinhaProcessamentoFruta = LinhaProcessamento & { frutaId: string; fruta: string };
  export type RelatorioProcessamento = { periodo: { inicio: Date; fim: Date }; porFruta: LinhaProcessamentoFruta[]; total: LinhaProcessamento };
  export async function buscarRelatorioProcessamento(sessao: SessaoAtiva, periodo: { inicio: Date; fim: Date }): Promise<RelatorioProcessamento>
  ```

- [ ] **Step 1: Escrever o teste de integração que falha**

`src/server/services/relatorioProducao/processamento.test.ts`:

```ts
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
import {
  criarCatalogoDeTeste,
  criarFixtureProducao,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "../producaoTestFixtures";
import { criarRecepcao } from "../recepcaoFruto";
import {
  adicionarConsumo,
  adicionarInsumo,
  adicionarProducao,
  atualizarProcessoOP,
  cancelarOP,
  criarOP,
  encerrarOP,
  removerProducao,
} from "../ordemProducao";
import { buscarPainelProducao } from "./painel";
import { buscarRelatorioProcessamento, type RelatorioProcessamento } from "./processamento";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("relatório de processamento", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let r: RelatorioProcessamento;
  const adm = () => fx.sessao("ADMINISTRADOR");
  const periodo = { inicio: d("2026-11-01"), fim: d("2026-11-30") };
  const BRANQUEAMENTO = { branqueamentoTemperaturaC: "85", branqueamentoTempoS: "12" };

  const lote = async (data: string, produtoId: string, talhaoId: string, kg: number) =>
    (
      await criarRecepcao(
        adm(),
        recepcaoSchema.parse({
          data,
          localId: cat.localRecepcaoId,
          unidade: "KG",
          descarte: "0",
          produtoId,
          origem: "PROPRIA",
          talhaoId,
          pesoBruto: String(kg),
        }),
      )
    ).loteId;
  const novaOP = (data: string, frutaId: string) => criarOP(adm(), cabecalhoOPSchema.parse({ data, frutaId }));
  const consumir = (opId: string, loteId: string, kg: number) =>
    adicionarConsumo(adm(), opId, consumoSchema.parse({ loteId, quantidadeKg: kg, motivoLiberacaoVencido: "" }));
  const produzir = (opId: string, produtoId: string, kg: number) =>
    adicionarProducao(adm(), opId, producaoSchema.parse({ produtoId, quantidadeKg: kg, localId: cat.localCamaraId }));
  const processo = (opId: string, dados: Record<string, string>) =>
    atualizarProcessoOP(
      adm(),
      opId,
      processoOPSchema.parse({ aguaLitros: "0", perdaKg: "0", carocoResiduoKg: "0", ...dados }),
    );

  beforeAll(async () => {
    fx = await criarFixtureProducao("processamento");
    cat = await criarCatalogoDeTeste(fx);
    const talhaoC = await prisma.talhao.create({
      data: { filialId: fx.filialAId, nome: "Talhão C", frutaId: cat.outraFrutaId, areaHa: 1 },
    });
    const FA = cat.produtoFrutoId;
    const FC = cat.produtoFrutoOutraId;

    // Fora do período.
    const op0 = await novaOP("2026-10-20", cat.frutaId);
    await consumir(op0.id, await lote("2026-10-20", FA, cat.talhaoId, 20), 20);
    await produzir(op0.id, cat.produtoPolpaId, 10);
    await processo(op0.id, { carocoResiduoKg: "10", ...BRANQUEAMENTO });
    await encerrarOP(adm(), op0.id, { confirmarVerificar: false });

    // Açaí, encerrada, balanço OK; uma polpa removida e um insumo.
    const a1 = await novaOP("2026-11-05", cat.frutaId);
    await consumir(a1.id, await lote("2026-11-05", FA, cat.talhaoId, 100), 100);
    await produzir(a1.id, cat.produtoPolpaId, 40);
    const removida = await produzir(a1.id, cat.produtoPolpaId, 5);
    await removerProducao(adm(), removida.id);
    await adicionarInsumo(adm(), a1.id, insumoOPSchema.parse({ insumoId: cat.insumoId, quantidade: 10 }));
    await processo(a1.id, { aguaLitros: "20", carocoResiduoKg: "70", perdaKg: "9", ...BRANQUEAMENTO });
    await encerrarOP(adm(), a1.id, { confirmarVerificar: false });

    // Açaí, encerrada, balanço "Verificar" (5 de 50 = 10%).
    const a2 = await novaOP("2026-11-06", cat.frutaId);
    await consumir(a2.id, await lote("2026-11-06", FA, cat.talhaoId, 50), 50);
    await produzir(a2.id, cat.produtoPolpaId, 25);
    await processo(a2.id, { carocoResiduoKg: "20", ...BRANQUEAMENTO });
    await encerrarOP(adm(), a2.id, { confirmarVerificar: true });

    // Açaí, aberta, sem polpa ainda.
    const a3 = await novaOP("2026-11-07", cat.frutaId);
    await consumir(a3.id, await lote("2026-11-07", FA, cat.talhaoId, 30), 30);

    // Cupuaçu, encerrada.
    const c1 = await novaOP("2026-11-08", cat.outraFrutaId);
    await consumir(c1.id, await lote("2026-11-08", FC, talhaoC.id, 40), 40);
    await produzir(c1.id, cat.produtoPolpaOutraId, 16);
    await processo(c1.id, { carocoResiduoKg: "20", perdaKg: "4" });
    await encerrarOP(adm(), c1.id, { confirmarVerificar: false });

    // Cupuaçu, cancelada.
    const c2 = await novaOP("2026-11-09", cat.outraFrutaId);
    await consumir(c2.id, await lote("2026-11-09", FC, talhaoC.id, 10), 10);
    await cancelarOP(adm(), c2.id, "Teste");

    r = await buscarRelatorioProcessamento(adm(), periodo);
  }, 90_000);

  afterAll(async () => {
    await fx.limpar();
  });

  test("uma linha por fruta com OP no período", () => {
    expect(r.porFruta.map((l) => l.fruta)).toEqual(["Açaí", "Cupuaçu"]);
  });

  test("resumo: volume com aberta; mín./máx. e custo só de encerradas", () => {
    const [acai, cupu] = r.porFruta;
    expect(acai.volume).toMatchObject({ quantidade: 3, frutoKg: 180, polpaKg: 65 });
    expect(acai).toMatchObject({ encerradas: 2, rendimentoMin: 0.4, rendimentoMax: 0.5 });
    expect(acai.volume.custoMedioPolpa).toBeCloseTo(230 / 65);
    expect(cupu.volume).toMatchObject({ quantidade: 1, frutoKg: 40, polpaKg: 16, custoMedioPolpa: 5 });
  });

  test("balanço de massa das encerradas", () => {
    expect(r.porFruta[0].balanco).toMatchObject({
      frutoKg: 150,
      aguaKg: 20,
      polpaKg: 65,
      carocoResiduoKg: 90,
      perdaKg: 9,
      diferencaKg: 6,
      opsVerificar: 1,
    });
    expect(r.porFruta[1].balanco).toMatchObject({ diferencaKg: 0, percentual: 0, opsVerificar: 0 });
  });

  test("custo das encerradas, com insumo", () => {
    expect(r.porFruta[0].custo).toMatchObject({ custoFruto: 225, custoInsumos: 5, custoTotal: 230, polpaKg: 65 });
    expect(r.porFruta[1].custo).toMatchObject({ custoFruto: 80, custoInsumos: 0, custoTotal: 80, custoKg: 5 });
    expect(r.total.custo.custoTotal).toBe(310);
  });

  test("volume bate com o painel (D-29)", async () => {
    const p = await buscarPainelProducao(adm(), periodo, d("2026-11-20"));
    expect(r.total.volume).toEqual(p.processamento);
  });

  test("outra filial não vê nada", async () => {
    const b = await buscarRelatorioProcessamento(fx.sessao("ADMINISTRADOR", { filial: "B" }), periodo);
    expect(b.porFruta).toEqual([]);
    expect(b.total.volume.quantidade).toBe(0);
  });
});
```

Em `relatorios.permissao.test.ts`, acrescente `import { buscarRelatorioProcessamento } from "./processamento";` e:

```ts
  test("sem producao:ler o de processamento é recusado antes de consultar o banco", async () => {
    await expect(buscarRelatorioProcessamento(sessao, { inicio: dia, fim: dia })).rejects.toThrow(PermissionError);
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que ele falha**

Run: `npx vitest run src/server/services/relatorioProducao/processamento.test.ts`
Expected: FAIL, com "Failed to resolve import ./processamento".

- [ ] **Step 3: Implementar**

Em `consultas.ts`, acrescente o import `import type { OPDoProcessamento } from "@/lib/producao/relatoriosProcessamento";` e, depois de `opDoPainel`:

```ts
/** OP da listagem com o processo (água, caroço, perda) e o custo separado em fruto e insumos. */
export function opDoProcessamento(op: OPListada): OPDoProcessamento {
  return {
    ...opDoPainel(op),
    aguaLitros: Number(op.aguaLitros),
    carocoResiduoKg: Number(op.carocoResiduoKg),
    perdaKg: Number(op.perdaKg),
    custoFrutoTotal: op.resumo.custo.custoFrutoTotal,
    custoInsumosTotal: op.resumo.custo.custoInsumosTotal,
  };
}
```

`src/server/services/relatorioProducao/processamento.ts`:

```ts
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { agregarProcessamento, type LinhaProcessamento } from "@/lib/producao/relatoriosProcessamento";
import { listarOPs } from "../ordemProducao";
import { opDoProcessamento } from "./consultas";

export type LinhaProcessamentoFruta = LinhaProcessamento & { frutaId: string; fruta: string };

export type RelatorioProcessamento = {
  periodo: { inicio: Date; fim: Date };
  /** Frutas com OP (não cancelada) no período, por nome. */
  porFruta: LinhaProcessamentoFruta[];
  total: LinhaProcessamento;
};

/**
 * Relatório de processamento (doc 07, REL_PROCESSAMENTO): OPs do período pela
 * mesma listagem da tela Processamento; volume com abertas (D-29), mínimo,
 * máximo, balanço e custo só com encerradas (D-31).
 */
export async function buscarRelatorioProcessamento(
  sessao: SessaoAtiva,
  periodo: { inicio: Date; fim: Date },
): Promise<RelatorioProcessamento> {
  requirePermission(sessao.perfil, "producao:ler");
  const { filialId, empresaId } = sessao;
  const [frutas, ops] = await Promise.all([
    prisma.fruta.findMany({ where: { empresaId }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    listarOPs(filialId, periodo),
  ]);
  const { porFruta, total } = agregarProcessamento(ops.map(opDoProcessamento));
  return {
    periodo,
    porFruta: frutas.flatMap((f) => {
      const linha = porFruta.get(f.id);
      return linha ? [{ ...linha, frutaId: f.id, fruta: f.nome }] : [];
    }),
    total,
  };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/server/services/relatorioProducao/`
Expected: PASS, incluindo painel, mensal, vendas e permissão.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/relatorioProducao/
git commit -m "feat(producao): serviço do relatório de processamento"
```

---

### Task 5: Exportação do relatório de origem

**Files:**
- Create: `src/server/export/relatorioOrigem.ts`
- Test: `src/server/export/relatorioOrigem.test.ts`
- Create: `src/app/(dashboard)/producao/relatorios/origem/export/route.ts`

**Interfaces:**
- Consumes: `RelatorioOrigem` (Task 3); `agregarPorOrigem`, `produtividadeTalhoes`, `precoTerceirosPorMes` (Task 1, nos testes).
- Produces: `linhasDeOrigem(r: RelatorioOrigem): LinhaOrigemExport[]`, `COLUNAS_ORIGEM: ColunaExport<LinhaOrigemExport>[]`, `secoesDeOrigem(r: RelatorioOrigem): SecaoPdf<unknown>[]`.

- [ ] **Step 1: Escrever o teste que falha**

`src/server/export/relatorioOrigem.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { agregarPorOrigem, precoTerceirosPorMes, produtividadeTalhoes } from "@/lib/producao/relatoriosOrigem";
import type { RelatorioOrigem } from "@/server/services/relatorioProducao/origem";
import { COLUNAS_ORIGEM, linhasDeOrigem, secoesDeOrigem } from "./relatorioOrigem";

const base = { origemId: "f1", nome: "Produtor", descarteKg: 0, cargas: 1 };
const origem = agregarPorOrigem([
  { ...base, tipo: "TERCEIRO", frutaId: "a", brutoKg: 100, valorTotal: 200 },
  { ...base, tipo: "TERCEIRO", frutaId: "c", brutoKg: 40, valorTotal: 120 },
  { ...base, tipo: "PROPRIA", origemId: "t1", nome: "Talhão 1", frutaId: "a", brutoKg: 50, valorTotal: 75 },
]);
const prod = produtividadeTalhoes(
  [{ id: "t1", nome: "Talhão 1", fruta: "Açaí", areaHa: 2, ativo: true }],
  new Map([["t1", 50]]),
  [{ talhaoId: "t1", brutoKg: 1000, descarteKg: 0, colheitas: 3 }],
);
const preco = precoTerceirosPorMes([
  { frutaId: "a", data: new Date("2026-11-05T00:00:00Z"), brutoKg: 100, descarteKg: 0, valorTotal: 200 },
]);
const r: RelatorioOrigem = {
  periodo: { inicio: new Date("2026-11-01T00:00:00Z"), fim: new Date("2026-11-30T00:00:00Z") },
  ano: 2026,
  frutas: [
    { id: "a", nome: "Açaí" },
    { id: "c", nome: "Cupuaçu" },
  ],
  porOrigem: origem.linhas,
  total: origem.total,
  produtividade: prod.linhas,
  totalProdutividade: prod.total,
  frutasTerceiros: [{ id: "a", nome: "Açaí" }],
  precoPorMes: preco,
};

describe("exportação de origem", () => {
  const linhas = linhasDeOrigem(r);

  test("origem em formato longo (origem × fruta), produtividade e preço por mês", () => {
    expect(linhas.map((l) => [l.secao, l.origem, l.fruta, l.mes, l.kg])).toEqual([
      ["Origem", "Produtor", "Açaí", "", 100],
      ["Origem", "Produtor", "Cupuaçu", "", 40],
      ["Origem", "Talhão 1", "Açaí", "", 50],
      ["Produtividade", "Talhão 1", "Açaí", "", 50],
      ["Preço a terceiros", "", "Açaí", "11", null],
      ["Preço a terceiros", "", "Açaí", "Ano", null],
    ]);
    expect(linhas[0]).toMatchObject({ tipo: "Terceiro", valor: 200, precoMedio: 2, cargas: 1 });
    expect(linhas[2]).toMatchObject({ tipo: "Própria", valor: null, precoMedio: null });
    expect(linhas[3]).toMatchObject({ areaHa: 2, kgAno: 1000, toneladasHa: 0.5, colheitas: 3 });
    expect(linhas[4].precoMedio).toBe(2);
  });

  test("vazio quando não se aplica; percentual × 100", () => {
    const col = (rotulo: string) => COLUNAS_ORIGEM.find((c) => c.rotulo === rotulo)!;
    expect(col("Valor").valor(linhas[2])).toBe("");
    expect(col("Descarte %").valor(linhas[0])).toBe(0);
  });

  test("PDF: três seções com o ano no título", () => {
    expect(secoesDeOrigem(r).map((s) => s.titulo)).toEqual([
      "Por origem",
      "Produtividade dos talhões em 2026",
      "Preço médio pago a terceiros por mês em 2026",
    ]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que ele falha**

Run: `npx vitest run src/server/export/relatorioOrigem.test.ts`
Expected: FAIL, com "Failed to resolve import ./relatorioOrigem".

- [ ] **Step 3: Implementar o montador**

`src/server/export/relatorioOrigem.ts`:

```ts
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
  return [
    ...r.porOrigem.flatMap((o) =>
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
    ),
    ...r.produtividade.map(
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
    ),
    ...r.frutasTerceiros.flatMap((f) =>
      r.precoPorMes[f.id].flatMap((preco, i) =>
        preco === null
          ? []
          : [
              {
                ...VAZIA,
                secao: "Preço a terceiros" as const,
                fruta: f.nome,
                mes: i === 12 ? "Ano" : String(i + 1),
                precoMedio: preco,
              },
            ],
      ),
    ),
  ];
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
type LinhaPdfProdutividade = Omit<LinhaProdutividade, "talhaoId" | "toneladasHa"> & { toneladasHa: number | null };
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
      linhas: [...MESES, "Ano"].map((mes, i) => ({ mes, precos: r.frutasTerceiros.map((f) => r.precoPorMes[f.id][i]) })),
      colunas: [
        { rotulo: "Mês", valor: (l) => l.mes },
        ...r.frutasTerceiros.map(
          (f, j): ColunaExport<LinhaPdfPreco> => ({ rotulo: `${f.nome} (R$/kg)`, valor: (l) => num(l.precos[j]) }),
        ),
      ],
    }),
  ];
}
```

- [ ] **Step 4: Rodar o teste e confirmar que ele passa**

Run: `npx vitest run src/server/export/relatorioOrigem.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Criar a rota de exportação**

`src/app/(dashboard)/producao/relatorios/origem/export/route.ts`:

```ts
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { buscarRelatorioOrigem } from "@/server/services/relatorioProducao/origem";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import { COLUNAS_ORIGEM, linhasDeOrigem, secoesDeOrigem } from "@/server/export/relatorioOrigem";
import { gerarPdfSecoes } from "@/lib/export/pdf";
import { responderArquivoPdf, responderExport } from "@/lib/export/responder";
import { formatarData } from "@/lib/formatacao";
import { periodoDaUrl } from "@/lib/producao/periodo";

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const periodo = periodoDaUrl(Object.fromEntries(url.searchParams));
  const relatorio = await buscarRelatorioOrigem(sessao, periodo);
  // O responder acrescenta a data de hoje ao nome.
  const nome = "relatorio-origem";
  const cabecalho = () =>
    cabecalhoDoRelatorio(sessao, {
      titulo: "Relatório de origem da matéria-prima",
      filtros: [
        `Período: ${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`,
        `Produtividade e preço por mês: ${relatorio.ano}`,
      ],
      avisos: ["Recepções canceladas ficam fora; peso líquido (bruto − descarte). Valor pago só de terceiros."],
    });
  const formato = url.searchParams.get("formato");

  if (formato === "pdf") {
    return responderArquivoPdf(await gerarPdfSecoes(secoesDeOrigem(relatorio), await cabecalho()), nome);
  }
  return responderExport(linhasDeOrigem(relatorio), COLUNAS_ORIGEM, {
    nomeArquivo: nome,
    nomeAba: "Origem",
    formato,
    cabecalhoPdf: cabecalho,
  });
}
```

- [ ] **Step 6: Checar os tipos**

Run: `npx tsc --noEmit -p .`
Expected: nenhum erro.

- [ ] **Step 7: Commit**

```bash
git add src/server/export/relatorioOrigem.ts src/server/export/relatorioOrigem.test.ts "src/app/(dashboard)/producao/relatorios/origem/export/route.ts"
git commit -m "feat(producao): exportação do relatório de origem"
```

---

### Task 6: Exportação do relatório de processamento

**Files:**
- Create: `src/server/export/relatorioProcessamento.ts`
- Test: `src/server/export/relatorioProcessamento.test.ts`
- Create: `src/app/(dashboard)/producao/relatorios/processamento/export/route.ts`

**Interfaces:**
- Consumes: `RelatorioProcessamento`, `LinhaProcessamentoFruta` (Task 4); `agregarProcessamento` (Task 2, no teste).
- Produces: `linhasDeProcessamento(r): LinhaProcessamentoExport[]`, `COLUNAS_PROCESSAMENTO`, `secoesDeProcessamento(r): SecaoPdf<unknown>[]`.

- [ ] **Step 1: Escrever o teste que falha**

`src/server/export/relatorioProcessamento.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { agregarProcessamento } from "@/lib/producao/relatoriosProcessamento";
import type { RelatorioProcessamento } from "@/server/services/relatorioProducao/processamento";
import { COLUNAS_PROCESSAMENTO, linhasDeProcessamento, secoesDeProcessamento } from "./relatorioProcessamento";

const agregado = agregarProcessamento([
  {
    frutaId: "a",
    status: "ENCERRADA",
    frutoKg: 100,
    polpaKg: 40,
    custoTotal: 155,
    balancoVerificar: false,
    branqueamentoVerificar: false,
    aguaLitros: 20,
    carocoResiduoKg: 70,
    perdaKg: 9,
    custoFrutoTotal: 150,
    custoInsumosTotal: 5,
  },
]);
const r: RelatorioProcessamento = {
  periodo: { inicio: new Date("2026-11-01T00:00:00Z"), fim: new Date("2026-11-30T00:00:00Z") },
  porFruta: [{ ...agregado.porFruta.get("a")!, frutaId: "a", fruta: "Açaí" }],
  total: agregado.total,
};

describe("exportação de processamento", () => {
  const linhas = linhasDeProcessamento(r);

  test("três linhas por fruta, uma por seção, sem totais", () => {
    expect(linhas.map((l) => [l.secao, l.fruta])).toEqual([
      ["Resumo", "Açaí"],
      ["Balanço de massa", "Açaí"],
      ["Custo", "Açaí"],
    ]);
    expect(linhas[0]).toMatchObject({ quantidade: 1, encerradas: 1, frutoKg: 100, polpaKg: 40, rendimentoMin: 0.4 });
    expect(linhas[1]).toMatchObject({ aguaKg: 20, diferencaKg: 1, opsVerificar: 0 });
    expect(linhas[2]).toMatchObject({ custoFruto: 150, custoInsumos: 5, custoTotal: 155 });
  });

  test("percentual × 100; vazio quando a seção não usa a coluna", () => {
    const col = (rotulo: string) => COLUNAS_PROCESSAMENTO.find((c) => c.rotulo === rotulo)!;
    expect(col("Rendimento médio").valor(linhas[0])).toBeCloseTo(40);
    expect(col("Água (kg)").valor(linhas[0])).toBe("");
    expect(col("Custo total (R$)").valor(linhas[2])).toBe(155);
  });

  test("PDF: três seções", () => {
    expect(secoesDeProcessamento(r).map((s) => s.titulo)).toEqual([
      "Resumo por fruta",
      "Balanço de massa (OPs encerradas)",
      "Custo por fruta (OPs encerradas)",
    ]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que ele falha**

Run: `npx vitest run src/server/export/relatorioProcessamento.test.ts`
Expected: FAIL, com "Failed to resolve import ./relatorioProcessamento".

- [ ] **Step 3: Implementar o montador**

`src/server/export/relatorioProcessamento.ts`:

```ts
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
  const totalSe = (linhas: LinhaPdf[]) => (linhas.length > 0 ? [...linhas, total] : []);
  return [
    secaoPdf<LinhaPdf>({
      titulo: "Resumo por fruta",
      linhas: totalSe(r.porFruta),
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
      linhas: totalSe(comEncerradas),
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
      linhas: totalSe(comEncerradas),
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
```

No teste, `linhas[1].diferencaKg` é 1 (100 + 20 − 40 − 70 − 9).

- [ ] **Step 4: Rodar o teste e confirmar que ele passa**

Run: `npx vitest run src/server/export/relatorioProcessamento.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Criar a rota de exportação**

`src/app/(dashboard)/producao/relatorios/processamento/export/route.ts`:

```ts
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { buscarRelatorioProcessamento } from "@/server/services/relatorioProducao/processamento";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import {
  COLUNAS_PROCESSAMENTO,
  linhasDeProcessamento,
  secoesDeProcessamento,
} from "@/server/export/relatorioProcessamento";
import { gerarPdfSecoes } from "@/lib/export/pdf";
import { responderArquivoPdf, responderExport } from "@/lib/export/responder";
import { formatarData } from "@/lib/formatacao";
import { periodoDaUrl } from "@/lib/producao/periodo";

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const periodo = periodoDaUrl(Object.fromEntries(url.searchParams));
  const relatorio = await buscarRelatorioProcessamento(sessao, periodo);
  // O responder acrescenta a data de hoje ao nome.
  const nome = "relatorio-processamento";
  const cabecalho = () =>
    cabecalhoDoRelatorio(sessao, {
      titulo: "Relatório de processamento",
      filtros: [`Período: ${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`],
      avisos: [
        "OPs canceladas ficam fora. Volumes com OPs abertas e encerradas; mínimo, máximo, balanço e custo só com encerradas.",
      ],
    });
  const formato = url.searchParams.get("formato");

  if (formato === "pdf") {
    return responderArquivoPdf(await gerarPdfSecoes(secoesDeProcessamento(relatorio), await cabecalho()), nome);
  }
  return responderExport(linhasDeProcessamento(relatorio), COLUNAS_PROCESSAMENTO, {
    nomeArquivo: nome,
    nomeAba: "Processamento",
    formato,
    cabecalhoPdf: cabecalho,
  });
}
```

- [ ] **Step 6: Checar os tipos**

Run: `npx tsc --noEmit -p .`
Expected: nenhum erro.

- [ ] **Step 7: Commit**

```bash
git add src/server/export/relatorioProcessamento.ts src/server/export/relatorioProcessamento.test.ts "src/app/(dashboard)/producao/relatorios/processamento/export/route.ts"
git commit -m "feat(producao): exportação do relatório de processamento"
```

---

### Task 7: Tela do relatório de origem (com o gráfico)

**Files:**
- Modify: `src/lib/producao/relatorios.ts:98` (`Unidade`)
- Modify: `src/app/(dashboard)/producao/relatorios/_shared/tabela.tsx` (`formatarCelula`)
- Create: `src/app/(dashboard)/producao/relatorios/origem/graficos.tsx`
- Create: `src/app/(dashboard)/producao/relatorios/origem/page.tsx`

**Interfaces:**
- Consumes: `buscarRelatorioOrigem`, `RelatorioOrigem` (Task 3).
- Produces: `KgBarras({ dados: { nome: string; kg: number }[]; cor: string })`; `Unidade` com `"ha"` e `"t/ha"`.

- [ ] **Step 1: Acrescentar as unidades `ha` e `t/ha`**

Em `src/lib/producao/relatorios.ts`:

```ts
export type Unidade = "kg" | "%" | "R$" | "R$/kg" | "nº" | "ha" | "t/ha";
```

Em `tabela.tsx`, junto dos outros formatadores:

```ts
const DECIMAL2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
```

e em `formatarCelula`, antes do `return formatarMoeda(valor);`:

```ts
  if (unidade === "ha" || unidade === "t/ha") return DECIMAL2.format(valor);
```

Run: `npx tsc --noEmit -p .`
Expected: nenhum erro. Se o `relatorioMensal.ts` usar `switch` exaustivo sobre `Unidade`, trate `ha`/`t/ha` como número cru.

- [ ] **Step 2: Criar o gráfico**

`src/app/(dashboard)/producao/relatorios/origem/graficos.tsx`:

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";

export type PontoKg = { nome: string; kg: number };

const COMPACTO = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const KG = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Barras horizontais de kg líquido (top 10 origens). */
export function KgBarras({ dados, cor }: { dados: PontoKg[]; cor: string }) {
  return (
    <ChartContainer className="h-72 w-full">
      <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tickFormatter={(v: number) => COMPACTO.format(v)} />
        <YAxis type="category" dataKey="nome" width={140} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(v) => `${KG.format(Number(v))} kg`} />
        <Bar dataKey="kg" fill={cor} name="Kg líquido" />
      </BarChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 3: Criar a tela**

`src/app/(dashboard)/producao/relatorios/origem/page.tsx`:

```tsx
import Link from "next/link";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { buscarRelatorioOrigem } from "@/server/services/relatorioProducao/origem";
import { MESES } from "@/lib/producao/relatorios";
import type { IndicadoresOrigem } from "@/lib/producao/relatoriosOrigem";
import { ROTULOS_ORIGEM_RECEPCAO } from "@/lib/schemas/enums";
import { formatarData } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso, periodoDaUrl } from "@/lib/producao/periodo";
import { ExportarLinks } from "../../../_shared/exportar-links";
import { BarraDeFiltros } from "../../_shared/barra-de-filtros";
import { atalhosDePeriodo } from "../../_shared/atalhos";
import { formatarCelula as f, TabelaRelatorio } from "../_shared/tabela";
import { KgBarras } from "./graficos";

type Parametros = { inicio?: string; fim?: string };

export default async function RelatorioOrigemPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");

  const periodo = periodoDaUrl(await searchParams);
  const hoje = hojeDeCalendario();
  const r = await buscarRelatorioOrigem(sessao, periodo);

  const inicio = paraDataIso(periodo.inicio);
  const fim = paraDataIso(periodo.fim);
  const query = new URLSearchParams({ inicio, fim }).toString();
  const t = r.total;
  const tp = r.totalProdutividade;
  const n = (rotulo: string, detalhe?: string) => ({ rotulo, detalhe, numero: true });
  const kgDaFruta = (porFruta: Record<string, IndicadoresOrigem>) =>
    r.frutas.map((fr) => f(porFruta[fr.id]?.kg ?? 0, "kg"));

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Relatório de origem</h1>
        <p className="text-sm text-muted-foreground">
          {formatarData(periodo.inicio)} a {formatarData(periodo.fim)}. Recepções canceladas ficam fora; peso
          líquido (bruto − descarte). Produtividade e preço por mês: ano de {r.ano}.
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
              href={`/producao/relatorios/origem?inicio=${a.inicio}&fim=${a.fim}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {a.rotulo}
            </Link>
          ))}
        </div>
        <ExportarLinks baseHref="/producao/relatorios/origem/export" queryString={query} />
      </div>

      {r.porOrigem.length > 0 ? (
        <section className="space-y-2 lg:max-w-3xl">
          <h2 className="text-sm font-semibold">Top 10 origens (kg líquido)</h2>
          <KgBarras cor="var(--chart-2)" dados={r.porOrigem.slice(0, 10).map((o) => ({ nome: o.nome, kg: o.kg }))} />
        </section>
      ) : null}

      <TabelaRelatorio
        titulo="Por origem"
        colunas={[
          { rotulo: "Origem" },
          { rotulo: "Tipo" },
          ...r.frutas.map((fr) => n(fr.nome, "kg")),
          n("Total", "kg"),
          n("Valor pago", "terceiros"),
          n("Preço médio", "R$/kg"),
          n("Descarte"),
          n("Cargas"),
        ]}
        linhas={r.porOrigem.map((o) => ({
          chave: `${o.tipo}:${o.origemId}`,
          celulas: [
            o.nome,
            ROTULOS_ORIGEM_RECEPCAO[o.tipo],
            ...kgDaFruta(o.porFruta),
            f(o.kg, "kg"),
            f(o.valor, "R$"),
            f(o.precoMedio, "R$/kg"),
            f(o.percentualDescarte, "%"),
            f(o.cargas, "nº"),
          ],
        }))}
        total={[
          "Total",
          "",
          ...kgDaFruta(t.porFruta),
          f(t.kg, "kg"),
          f(t.valor, "R$"),
          f(t.precoMedio, "R$/kg"),
          f(t.percentualDescarte, "%"),
          f(t.cargas, "nº"),
        ]}
      />

      <TabelaRelatorio
        titulo={`Produtividade dos talhões em ${r.ano}`}
        vazio="Nenhum talhão cadastrado."
        colunas={[
          { rotulo: "Talhão" },
          { rotulo: "Fruta" },
          n("Área", "ha"),
          n("Kg no período"),
          n(`Kg em ${r.ano}`),
          n("Produtividade", "t/ha no ano"),
          n("Colheitas", "no ano"),
        ]}
        linhas={r.produtividade.map((p) => ({
          chave: p.talhaoId,
          celulas: [
            p.talhao,
            p.fruta,
            f(p.areaHa, "ha"),
            f(p.kgPeriodo, "kg"),
            f(p.kgAno, "kg"),
            f(p.toneladasHa, "t/ha"),
            f(p.colheitas, "nº"),
          ],
        }))}
        total={[
          "Total",
          "",
          f(tp.areaHa, "ha"),
          f(tp.kgPeriodo, "kg"),
          f(tp.kgAno, "kg"),
          "—",
          f(tp.colheitas, "nº"),
        ]}
      />

      <TabelaRelatorio
        titulo={`Preço médio pago a terceiros por mês em ${r.ano}`}
        vazio={`Nenhuma compra de terceiros em ${r.ano}.`}
        colunas={[{ rotulo: "Mês" }, ...r.frutasTerceiros.map((fr) => n(fr.nome, "R$/kg"))]}
        linhas={
          r.frutasTerceiros.length === 0
            ? []
            : MESES.map((mes, i) => ({
                chave: mes,
                celulas: [mes, ...r.frutasTerceiros.map((fr) => f(r.precoPorMes[fr.id][i], "R$/kg"))],
              }))
        }
        total={["Ano", ...r.frutasTerceiros.map((fr) => f(r.precoPorMes[fr.id][12], "R$/kg"))]}
      />
    </div>
  );
}
```

- [ ] **Step 4: Checar tipos e lint**

Run: `npx tsc --noEmit -p . ; npx eslint "src/app/(dashboard)/producao/relatorios" src/lib/producao`
Expected: nenhum erro.

- [ ] **Step 5: Commit**

```bash
git add src/lib/producao/relatorios.ts "src/app/(dashboard)/producao/relatorios/_shared/tabela.tsx" "src/app/(dashboard)/producao/relatorios/origem"
git commit -m "feat(producao): tela do relatório de origem"
```

---

### Task 8: Tela do relatório de processamento

**Files:**
- Create: `src/app/(dashboard)/producao/relatorios/processamento/page.tsx`

**Interfaces:**
- Consumes: `buscarRelatorioProcessamento`, `RelatorioProcessamento` (Task 4).

- [ ] **Step 1: Criar a tela**

`src/app/(dashboard)/producao/relatorios/processamento/page.tsx`:

```tsx
import Link from "next/link";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { buscarRelatorioProcessamento } from "@/server/services/relatorioProducao/processamento";
import { formatarData } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso, periodoDaUrl } from "@/lib/producao/periodo";
import { ExportarLinks } from "../../../_shared/exportar-links";
import { BarraDeFiltros } from "../../_shared/barra-de-filtros";
import { atalhosDePeriodo } from "../../_shared/atalhos";
import { formatarCelula as f, TabelaRelatorio } from "../_shared/tabela";

type Parametros = { inicio?: string; fim?: string };

const link = "text-primary underline-offset-4 hover:underline";

export default async function RelatorioProcessamentoPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");

  const periodo = periodoDaUrl(await searchParams);
  const hoje = hojeDeCalendario();
  const r = await buscarRelatorioProcessamento(sessao, periodo);

  const inicio = paraDataIso(periodo.inicio);
  const fim = paraDataIso(periodo.fim);
  const query = new URLSearchParams({ inicio, fim }).toString();
  const t = r.total;
  const comEncerradas = r.porFruta.filter((l) => l.encerradas > 0);
  const semEncerradas = "Nenhuma OP encerrada no período.";
  const n = (rotulo: string, detalhe?: string) => ({ rotulo, detalhe, numero: true });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Relatório de processamento</h1>
        <p className="text-sm text-muted-foreground">
          {formatarData(periodo.inicio)} a {formatarData(periodo.fim)}. OPs canceladas ficam fora. Volumes com
          OPs abertas e encerradas; mínimo, máximo, balanço e custo só com OPs encerradas.
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
            <Link key={a.rotulo} href={`/producao/relatorios/processamento?inicio=${a.inicio}&fim=${a.fim}`} className={link}>
              {a.rotulo}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ExportarLinks baseHref="/producao/relatorios/processamento/export" queryString={query} />
          <Link href={`/producao/processamento?${query}`} className={`text-sm ${link}`}>
            Ver as OPs do período
          </Link>
        </div>
      </div>

      <TabelaRelatorio
        titulo="Resumo por fruta"
        colunas={[
          { rotulo: "Fruta" },
          n("OPs"),
          n("Fruto", "kg"),
          n("Polpa", "kg"),
          n("Rendimento", "médio"),
          n("Rendimento mín.", "encerradas"),
          n("Rendimento máx.", "encerradas"),
          n("Custo médio", "R$/kg · encerradas"),
        ]}
        linhas={r.porFruta.map((l) => ({
          chave: l.frutaId,
          celulas: [
            l.fruta,
            f(l.volume.quantidade, "nº"),
            f(l.volume.frutoKg, "kg"),
            f(l.volume.polpaKg, "kg"),
            f(l.volume.rendimento, "%"),
            f(l.rendimentoMin, "%"),
            f(l.rendimentoMax, "%"),
            f(l.volume.custoMedioPolpa, "R$/kg"),
          ],
        }))}
        total={[
          "Total",
          f(t.volume.quantidade, "nº"),
          f(t.volume.frutoKg, "kg"),
          f(t.volume.polpaKg, "kg"),
          f(t.volume.rendimento, "%"),
          f(t.rendimentoMin, "%"),
          f(t.rendimentoMax, "%"),
          f(t.volume.custoMedioPolpa, "R$/kg"),
        ]}
      />

      <TabelaRelatorio
        titulo="Balanço de massa (OPs encerradas)"
        vazio={semEncerradas}
        colunas={[
          { rotulo: "Fruta" },
          n("OPs"),
          n("Fruto", "kg"),
          n("Água", "kg"),
          n("Polpa", "kg"),
          n("Caroço/resíduo", "kg"),
          n("Perda", "kg"),
          n("Diferença", "kg"),
          n("Diferença", "%"),
          n("A verificar", "OPs"),
        ]}
        linhas={comEncerradas.map((l) => ({
          chave: l.frutaId,
          celulas: [
            l.fruta,
            f(l.encerradas, "nº"),
            f(l.balanco.frutoKg, "kg"),
            f(l.balanco.aguaKg, "kg"),
            f(l.balanco.polpaKg, "kg"),
            f(l.balanco.carocoResiduoKg, "kg"),
            f(l.balanco.perdaKg, "kg"),
            f(l.balanco.diferencaKg, "kg"),
            f(l.balanco.percentual, "%"),
            f(l.balanco.opsVerificar, "nº"),
          ],
        }))}
        total={[
          "Total",
          f(t.encerradas, "nº"),
          f(t.balanco.frutoKg, "kg"),
          f(t.balanco.aguaKg, "kg"),
          f(t.balanco.polpaKg, "kg"),
          f(t.balanco.carocoResiduoKg, "kg"),
          f(t.balanco.perdaKg, "kg"),
          f(t.balanco.diferencaKg, "kg"),
          f(t.balanco.percentual, "%"),
          f(t.balanco.opsVerificar, "nº"),
        ]}
      />

      <TabelaRelatorio
        titulo="Custo por fruta (OPs encerradas)"
        vazio={semEncerradas}
        colunas={[
          { rotulo: "Fruta" },
          n("Fruto", "R$"),
          n("Insumos", "R$"),
          n("Total", "R$"),
          n("Polpa", "kg"),
          n("Custo", "R$/kg"),
        ]}
        linhas={comEncerradas.map((l) => ({
          chave: l.frutaId,
          celulas: [
            l.fruta,
            f(l.custo.custoFruto, "R$"),
            f(l.custo.custoInsumos, "R$"),
            f(l.custo.custoTotal, "R$"),
            f(l.custo.polpaKg, "kg"),
            f(l.custo.custoKg, "R$/kg"),
          ],
        }))}
        total={[
          "Total",
          f(t.custo.custoFruto, "R$"),
          f(t.custo.custoInsumos, "R$"),
          f(t.custo.custoTotal, "R$"),
          f(t.custo.polpaKg, "kg"),
          f(t.custo.custoKg, "R$/kg"),
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 2: Checar tipos e lint**

Run: `npx tsc --noEmit -p . ; npx eslint "src/app/(dashboard)/producao/relatorios"`
Expected: nenhum erro.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/producao/relatorios/processamento/page.tsx"
git commit -m "feat(producao): tela do relatório de processamento"
```

---

### Task 9: Menu

**Files:**
- Modify: `src/app/(dashboard)/nav-items.ts:40`
- Modify: `src/app/(dashboard)/nav-items.test.ts:57-66`

- [ ] **Step 1: Atualizar o teste (que falha)**

No teste "seção Produção com painel, relatórios, …", a lista esperada passa a ser:

```ts
      expect(producao?.itens.map((i) => i.href)).toEqual([
        "/producao/painel",
        "/producao/relatorios/mensal",
        "/producao/relatorios/vendas",
        "/producao/relatorios/origem",
        "/producao/relatorios/processamento",
        "/producao/recepcao",
        "/producao/processamento",
        "/producao/estoque",
        "/producao/ajustes",
        "/producao/rastreabilidade",
      ]);
```

Run: `npx vitest run "src/app/(dashboard)/nav-items.test.ts"`
Expected: FAIL (a lista não tem os dois itens novos).

- [ ] **Step 2: Acrescentar os itens**

Em `nav-items.ts`, logo depois de "Relatório de vendas":

```ts
      { href: "/producao/relatorios/origem", label: "Relatório de origem", acao: "producao:ler" },
      { href: "/producao/relatorios/processamento", label: "Relatório de processamento", acao: "producao:ler" },
```

- [ ] **Step 3: Rodar o teste e confirmar que ele passa**

Run: `npx vitest run "src/app/(dashboard)/nav-items.test.ts"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/nav-items.ts" "src/app/(dashboard)/nav-items.test.ts"
git commit -m "feat(producao): relatórios de origem e processamento no menu"
```

---

### Task 10: Ajuda e documentos

**Files:**
- Modify: `content/ajuda/passo-a-passo.md` (seção 5.8, depois do relatório de vendas)
- Modify: `docs/modulos/producao-estoque-vendas/08-duvidas-decisoes.md` (depois da linha D-29)
- Modify: `docs/modulos/producao-estoque-vendas/09-plano-de-entrega.md:34`
- Modify: `docs/fases/fase-7-producao-estoque-vendas.md:36`
- Modify: `docs/superpowers/specs/2026-11-13-fase-7g2b-relatorios-design.md` (status e arquivos das funções puras)

- [ ] **Step 1: Ajuda**

Na seção 5.8, troque a primeira frase ("Os relatórios seguem as mesmas regras do painel: …") por:

```markdown
Os relatórios seguem as mesmas regras do painel: cancelados ficam fora, OP aberta entra no volume, o custo da polpa usa só OPs encerradas e o a receber é a posição de hoje. Todos exportam PDF, CSV e Excel.
```

(o texto fica igual, só confira). Depois do bloco do relatório de vendas, acrescente:

```markdown
**Relatório de origem** (Produção → Relatório de origem): escolha o período (padrão: o mês atual). O gráfico mostra as dez origens que mais entregaram fruto. As tabelas:

- **Por origem:** cada talhão próprio e cada fornecedor, com o kg líquido de cada fruta, o total, o valor pago, o preço médio por kg, o descarte e o nº de cargas. Valor pago e preço médio aparecem só para fornecedores; nos talhões ficam "—", porque o fruto próprio é lançado pelo custo-padrão da fruta, não por um pagamento.
- **Produtividade dos talhões:** área, kg colhido no período e no ano, toneladas por hectare no ano e nº de colheitas no ano. Entram os talhões ativos e os inativos que tiveram colheita no ano.
- **Preço médio pago a terceiros por mês:** quanto foi pago por kg líquido de cada fruta, mês a mês e no ano. Mês sem compra fica "—".

O "ano" dessas duas últimas tabelas é o ano da data **Até** do período.

**Relatório de processamento** (Produção → Relatório de processamento): escolha o período. As tabelas:

- **Resumo por fruta:** nº de OPs, fruto processado, polpa produzida e rendimento médio, contando OPs abertas e encerradas (os mesmos números do painel). O rendimento mínimo e máximo e o custo médio da polpa usam só OPs encerradas, porque uma OP ainda aberta pode ter o fruto lançado e a polpa não.
- **Balanço de massa:** fruto, água, polpa, caroço/resíduo, perda e a diferença (kg e %) das OPs encerradas, com quantas ficaram "Verificar".
- **Custo por fruta:** custo do fruto, dos insumos e total das OPs encerradas, com o custo por kg de polpa.

Para ver cada OP, use o link **Ver as OPs do período**, que abre a tela Processamento já filtrada.
```

- [ ] **Step 2: Decisões (doc 08)**

Depois da linha da D-29:

```markdown
| D-30 | Últimas OPs no relatório de processamento | Repetir a lista de OPs dentro do relatório? | Não: a tela Processamento já lista as OPs do período com as mesmas colunas e exporta; o relatório traz só o link "Ver as OPs do período". | 7g2b | **Só o link** (2026-11-13). |
| D-31 | OP aberta no relatório de processamento | A OP aberta entra em tudo? | Volumes (nº de OPs, fruto, polpa, rendimento médio) com abertas, como no painel; rendimento mínimo e máximo, balanço e custo só com encerradas, porque a OP aberta sem polpa lançada distorce mínimo e balanço. | 7g2b | **Como recomendado** (2026-11-13). |
| D-32 | Ano e valor no relatório de origem | De onde vem o ano da produtividade e do preço por mês? Fruto próprio tem valor pago? | Ano da data "Até" do período (um filtro só). Valor pago e preço médio só de fornecedores; talhão mostra "—" (o valor gravado é o custo-padrão, D-04). | 7g2b | **Como recomendado** (2026-11-13). |
```

- [ ] **Step 3: Plano de entrega (doc 09)**

Na linha da 7g2b, troque `| 7g2a | — | M |` por `| 7g2a | D-30, D-31, D-32 | M |`.

- [ ] **Step 4: Fase 7**

Em `docs/fases/fase-7-producao-estoque-vendas.md`, troque `Próximo: 7g2b (origem e processamento).` por:

```markdown
7g2b (relatório de origem e de processamento) concluída em <data da
conclusão>: telas em `/producao/relatorios/origem` e
`/producao/relatorios/processamento`, com exportação em PDF, CSV e Excel; a
lista de OPs não se repete no relatório (D-30); OP aberta só nos volumes
(D-31); ano da data "Até" e valor pago só de terceiros (D-32). Com ela a 7g
está concluída.
```

Use a data real do dia da conclusão.

- [ ] **Step 5: Spec**

Na spec, troque `Status: desenho aprovado` por `Status: implementada (<data>)`. Logo abaixo, acrescente:

```markdown
Ajustes na implementação: as funções puras ficaram em
`src/lib/producao/relatoriosOrigem.ts` e `relatoriosProcessamento.ts` (o
`relatorios.ts` já estava grande); no CSV de origem, cada linha é uma origem ×
fruta com todos os indicadores daquele par; no CSV de processamento, o custo
médio aparece na linha da seção Custo.
```

Acrescente também os ajustes que surgirem na conferência no navegador.

- [ ] **Step 6: Commit**

```bash
git add content/ajuda/passo-a-passo.md docs/
git commit -m "docs(producao): ajuda e decisões dos relatórios (7g2b)"
```

---

### Task 11: Verificação final e conferência no navegador

- [ ] **Step 1: Suíte inteira, tipos e lint**

Run: `npm test ; npx tsc --noEmit -p . ; npm run lint`
Expected: tudo verde. Se algum teste falhar, investigue antes de seguir (superpowers:systematic-debugging).

- [ ] **Step 2: Montar o cenário numa empresa de teste e conferir no navegador**

Antes, leia a memória [[ambiente-dev-armadilhas]] (prisma generate, porta 3000, login local). Suba `npm run dev` em segundo plano e, com o Playwright:

- Monte numa empresa/filial de teste os mesmos cenários dos testes de integração das Tasks 3 e 4, via script com os serviços ou pela tela.
- **Origem**, em desktop e em 390px:
  - gráfico top 10;
  - tabela por origem com "—" no valor dos talhões;
  - produtividade com o ano;
  - preço por mês;
  - atalhos "Mês atual", "Mês anterior" e "Ano";
  - PDF, CSV e Excel baixando com nome `relatorio-origem-<data>`.
- **Processamento**, em desktop e em 390px:
  - três tabelas;
  - "Nenhuma OP encerrada no período." num período só com OP aberta;
  - o link "Ver as OPs do período" abrindo `/producao/processamento` com o mesmo período;
  - os três formatos de exportação.
- **Menu:** os dois itens novos, logo abaixo de "Relatório de vendas".
- Apague os dados de teste no fim.

- [ ] **Step 3: Registrar ajustes**

Corrija o que a conferência mostrar, com teste quando for regra. Registre na spec (Task 10, Step 5) e faça um commit `fix(producao): ajustes da conferência dos relatórios no navegador`.

- [ ] **Step 4: Relatório final ao usuário**

Informe as decisões tomadas, os ajustes e as pendências. Atualize a memória `fluxo-fase-7.md` (7g2b implementada, 7g concluída). O usuário faz push, PR e merge; o título do PR vai sem o prefixo `feat:`.
