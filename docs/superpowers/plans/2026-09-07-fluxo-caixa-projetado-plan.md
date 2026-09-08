# Fluxo de Caixa Projetado (Fase 4b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a "Fluxo de caixa projetado" screen showing a 12-month cash-flow projection derived from open (unpaid) `Parcela` records, in either a rolling-12-month or fixed-calendar-year window.

**Architecture:** A new pure-calculation + DB-querying service (`fluxoDeCaixaProjetado.ts`), mirroring the already-shipped "Fluxo de Caixa Realizado" sibling (`fluxoDeCaixa.ts`) in structure, plus a new page + client selector component under `/financeiro/fluxo-de-caixa-projetado`. Two shared helper files used by both the realizado and projetado pages get extracted into a common folder first.

**Tech Stack:** Next.js 16 App Router (server component + searchParams), Prisma 7, TypeScript, Vitest (real Postgres for integration tests).

**Spec:** `docs/superpowers/specs/2026-09-07-fluxo-caixa-projetado-design.md`

## Global Constraints

- Dates are always UTC (`Date.UTC(...)`, never local-timezone constructors) — same rule as `fluxoDeCaixa.ts`.
- No new database table, no cache/materialized data — everything computed on demand from `Titulo`/`Parcela`/`Baixa`.
- No new permission — reuse `titulo:ler` (already granted to all 6 profiles).
- Filial-scoped only — no cross-empresa consolidation (that's Fase 5).
- Pure calculation functions live separately from async DB-querying functions, same file-organization style as `fluxoDeCaixa.ts`.
- "Open" parcela statuses: `EM_ABERTO`, `A_VENCER`, `VENCIDO`, `PARCIALMENTE_PAGO`. Excluded: `PAGO`, `CANCELADO`, `RENEGOCIADO`.
- Only `Baixa` rows with `statusAprovacao: "APROVADO"` reduce a parcela's outstanding balance.
- Contratos recorrentes, financiamentos, and orçamento are out of scope — they don't exist in the schema yet.

---

### Task 1: Extract shared period helpers into `_fluxo-de-caixa/`

**Files:**
- Create: `src/app/(dashboard)/financeiro/_fluxo-de-caixa/data-valida.ts`
- Create: `src/app/(dashboard)/financeiro/_fluxo-de-caixa/data-valida.test.ts`
- Create: `src/app/(dashboard)/financeiro/_fluxo-de-caixa/formatar-rotulo-periodo.ts`
- Create: `src/app/(dashboard)/financeiro/_fluxo-de-caixa/formatar-rotulo-periodo.test.ts`
- Delete: `src/app/(dashboard)/financeiro/fluxo-de-caixa/data-valida.ts`
- Delete: `src/app/(dashboard)/financeiro/fluxo-de-caixa/formatar-rotulo-periodo.ts`
- Delete: `src/app/(dashboard)/financeiro/fluxo-de-caixa/formatar-rotulo-periodo.test.ts`
- Modify: `src/app/(dashboard)/financeiro/fluxo-de-caixa/page.tsx` (2 import paths)

**Interfaces:**
- Produces: `dataValida(valor: string | undefined): Date` and `formatarRotuloPeriodo(granularidade: Granularidade, inicio: Date, fim: Date): string`, both importable from `@/app/(dashboard)/financeiro/_fluxo-de-caixa/data-valida` and `.../formatar-rotulo-periodo` respectively (or relative `../_fluxo-de-caixa/...` from sibling route folders). Task 4 imports both.

This is a pure file-move — no logic changes. It exists because Task 4 needs both helpers from a second route folder (`fluxo-de-caixa-projetado/`), and this codebase's established pattern for code shared across sibling route folders inside `financeiro/` is an underscore-prefixed folder (see `financeiro/_titulos/`, shared by `contas-a-pagar` and `contas-a-receber`).

- [ ] **Step 1: Create the shared folder and copy `data-valida.ts` verbatim**

Create `src/app/(dashboard)/financeiro/_fluxo-de-caixa/data-valida.ts`:

```ts
// src/app/(dashboard)/financeiro/_fluxo-de-caixa/data-valida.ts
export function dataValida(valor: string | undefined): Date {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return new Date();
  }
  const data = new Date(`${valor}T00:00:00Z`);
  return Number.isNaN(data.getTime()) ? new Date() : data;
}
```

- [ ] **Step 2: Copy `data-valida`'s test file verbatim**

Create `src/app/(dashboard)/financeiro/_fluxo-de-caixa/data-valida.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { dataValida } from "./data-valida";

describe("dataValida", () => {
  test("string no formato YYYY-MM-DD válida vira Date UTC-meia-noite", () => {
    const resultado = dataValida("2026-09-15");
    expect(resultado.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  test("string malformada cai no fallback de hoje, sem lançar erro", () => {
    expect(() => dataValida("abc")).not.toThrow();
  });

  test("undefined cai no fallback de hoje", () => {
    expect(() => dataValida(undefined)).not.toThrow();
  });

  test("data sintaticamente válida mas com valores impossíveis não lança erro", () => {
    expect(() => dataValida("2026-99-99")).not.toThrow();
  });
});
```

- [ ] **Step 3: Copy `formatar-rotulo-periodo.ts` verbatim**

Create `src/app/(dashboard)/financeiro/_fluxo-de-caixa/formatar-rotulo-periodo.ts`:

```ts
import type { Granularidade } from "@/server/services/fluxoDeCaixa";

function dataCurta(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function formatarRotuloPeriodo(granularidade: Granularidade, inicio: Date, fim: Date): string {
  if (granularidade === "DIA") {
    return dataCurta(inicio);
  }
  if (granularidade === "SEMANA") {
    return `Semana de ${dataCurta(inicio)} a ${dataCurta(fim)}`;
  }
  if (granularidade === "MES") {
    return inicio.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  return String(inicio.getUTCFullYear());
}
```

- [ ] **Step 4: Copy `formatar-rotulo-periodo`'s test file (drop the `dataValida` describe block — that now lives in its own test file from Step 2)**

Create `src/app/(dashboard)/financeiro/_fluxo-de-caixa/formatar-rotulo-periodo.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { formatarRotuloPeriodo } from "./formatar-rotulo-periodo";

describe("formatarRotuloPeriodo", () => {
  test("DIA formata como data curta", () => {
    const rotulo = formatarRotuloPeriodo("DIA", new Date(Date.UTC(2026, 8, 15)), new Date(Date.UTC(2026, 8, 15, 23, 59, 59, 999)));
    expect(rotulo).toBe("15/09/2026");
  });

  test("SEMANA formata como intervalo", () => {
    const rotulo = formatarRotuloPeriodo(
      "SEMANA",
      new Date(Date.UTC(2026, 7, 31)),
      new Date(Date.UTC(2026, 8, 6, 23, 59, 59, 999)),
    );
    expect(rotulo).toBe("Semana de 31/08/2026 a 06/09/2026");
  });

  test("MES formata como mês por extenso + ano", () => {
    const rotulo = formatarRotuloPeriodo("MES", new Date(Date.UTC(2026, 8, 1)), new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999)));
    expect(rotulo.toLowerCase()).toContain("setembro");
    expect(rotulo).toContain("2026");
  });

  test("ANO formata como o ano", () => {
    const rotulo = formatarRotuloPeriodo("ANO", new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999)));
    expect(rotulo).toBe("2026");
  });
});
```

- [ ] **Step 5: Delete the 3 old files**

```bash
rm "src/app/(dashboard)/financeiro/fluxo-de-caixa/data-valida.ts"
rm "src/app/(dashboard)/financeiro/fluxo-de-caixa/formatar-rotulo-periodo.ts"
rm "src/app/(dashboard)/financeiro/fluxo-de-caixa/formatar-rotulo-periodo.test.ts"
```

(There is no old `data-valida.test.ts` to delete — in the current codebase, `dataValida`'s tests live inside `formatar-rotulo-periodo.test.ts`, which Step 4 already recreated without that block.)

- [ ] **Step 6: Update the 2 imports in `fluxo-de-caixa/page.tsx`**

In `src/app/(dashboard)/financeiro/fluxo-de-caixa/page.tsx`, change:

```ts
import { formatarRotuloPeriodo } from "./formatar-rotulo-periodo";
import { dataValida } from "./data-valida";
```

to:

```ts
import { formatarRotuloPeriodo } from "../_fluxo-de-caixa/formatar-rotulo-periodo";
import { dataValida } from "../_fluxo-de-caixa/data-valida";
```

- [ ] **Step 7: Run the full test suite and verify nothing broke**

Run: `npm run test`
Expected: same test count as before minus the moved-and-renamed files' duplication (net same behavior, all passing). No file should reference the deleted paths anymore — run `npx tsc --noEmit` too and confirm it's clean.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/financeiro/_fluxo-de-caixa" "src/app/(dashboard)/financeiro/fluxo-de-caixa"
git commit -m "refactor: extrair data-valida/formatar-rotulo-periodo para pasta compartilhada"
```

---

### Task 2: Pure calculation engine — `fluxoDeCaixaProjetado.ts`

**Files:**
- Create: `src/server/services/fluxoDeCaixaProjetado.ts`
- Create: `src/server/services/fluxoDeCaixaProjetado.test.ts`
- Modify: `src/server/services/fluxoDeCaixa.ts` (export the existing private `fimDoDiaUTC` helper — one-word change, see Step 1)

**Interfaces:**
- Consumes: `SubPeriodo` and `calcularJanela` (both exported from `./fluxoDeCaixa`), and the newly-exported `fimDoDiaUTC(ano: number, mes: number, dia: number): Date` from the same file.
- Produces (consumed by Task 3): `ModoJanelaProjetado`, `ParcelaParaProjecao`, `PeriodoFluxoDeCaixaProjetado` types; `calcularJanelaProjetada(modo, dataReferencia): SubPeriodo[]`; `saldoRemanescenteParcela(valorAtualizado, baixasAprovadas): number`; `calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, saldoInicialAbsoluto): PeriodoFluxoDeCaixaProjetado[]`.

- [ ] **Step 1: Export `fimDoDiaUTC` from `fluxoDeCaixa.ts`**

In `src/server/services/fluxoDeCaixa.ts`, change:

```ts
function fimDoDiaUTC(ano: number, mes: number, dia: number): Date {
```

to:

```ts
export function fimDoDiaUTC(ano: number, mes: number, dia: number): Date {
```

No other change to that file. Run `npm run test` to confirm the realizado suite is still green after this one-word edit (it will be — this only widens visibility).

- [ ] **Step 2: Write the failing tests for `calcularJanelaProjetada`**

Create `src/server/services/fluxoDeCaixaProjetado.test.ts` with:

```ts
import { describe, expect, test } from "vitest";
import { calcularJanela } from "./fluxoDeCaixa";
import {
  calcularJanelaProjetada,
  calcularPeriodosFluxoDeCaixaProjetado,
  saldoRemanescenteParcela,
  type ParcelaParaProjecao,
} from "./fluxoDeCaixaProjetado";

describe("calcularJanelaProjetada", () => {
  test("MOVEL: 12 meses a partir do mês de referência, incluindo virada de ano", () => {
    const periodos = calcularJanelaProjetada("MOVEL", new Date(Date.UTC(2026, 5, 15))); // junho/2026
    expect(periodos).toHaveLength(12);
    expect(periodos[0].inicio.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(periodos[0].fim.toISOString()).toBe("2026-06-30T23:59:59.999Z");
    expect(periodos[11].inicio.toISOString()).toBe("2027-05-01T00:00:00.000Z");
    expect(periodos[11].fim.toISOString()).toBe("2027-05-31T23:59:59.999Z");
  });

  test("ANO_CIVIL: jan-dez do ano de referência, igual a calcularJanela(\"MES\", ...)", () => {
    const dataReferencia = new Date(Date.UTC(2026, 5, 15));
    const periodos = calcularJanelaProjetada("ANO_CIVIL", dataReferencia);
    const esperado = calcularJanela("MES", dataReferencia);
    expect(periodos).toEqual(esperado);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/server/services/fluxoDeCaixaProjetado.test.ts`
Expected: FAIL — `./fluxoDeCaixaProjetado` does not exist yet.

- [ ] **Step 4: Create `fluxoDeCaixaProjetado.ts` with types and `calcularJanelaProjetada`**

Create `src/server/services/fluxoDeCaixaProjetado.ts`:

```ts
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { TipoTitulo } from "@prisma/client";
import { buscarSaldoEmCaixaAte, calcularJanela, fimDoDiaUTC, type SubPeriodo } from "./fluxoDeCaixa";

export type ModoJanelaProjetado = "MOVEL" | "ANO_CIVIL";

export type ParcelaParaProjecao = { dataVencimento: Date; saldo: number; tipo: TipoTitulo };

export type PeriodoFluxoDeCaixaProjetado = SubPeriodo & {
  saldoInicial: number;
  entradasProjetadas: number;
  saidasProjetadas: number;
  geracaoLiquida: number;
  saldoFinal: number;
  alerta: boolean;
};

/**
 * Recorta a janela de 12 meses do modo escolhido. MOVEL desliza a partir do
 * mês de `dataReferencia`; ANO_CIVIL é jan-dez do ano de `dataReferencia`
 * (idêntico a `calcularJanela("MES", ...)` do fluxo realizado — reusado
 * diretamente em vez de duplicado).
 */
export function calcularJanelaProjetada(modo: ModoJanelaProjetado, dataReferencia: Date): SubPeriodo[] {
  if (modo === "ANO_CIVIL") {
    return calcularJanela("MES", dataReferencia);
  }

  const ano = dataReferencia.getUTCFullYear();
  const mes = dataReferencia.getUTCMonth();

  return Array.from({ length: 12 }, (_, i) => {
    const mesAbsoluto = mes + i;
    return {
      inicio: new Date(Date.UTC(ano, mesAbsoluto, 1)),
      fim: fimDoDiaUTC(ano, mesAbsoluto + 1, 0),
    };
  });
}
```

- [ ] **Step 5: Run to verify the `calcularJanelaProjetada` tests pass**

Run: `npx vitest run src/server/services/fluxoDeCaixaProjetado.test.ts`
Expected: the 2 `calcularJanelaProjetada` tests PASS (the file won't fully compile yet — `saldoRemanescenteParcela`/`calcularPeriodosFluxoDeCaixaProjetado` aren't defined; that's expected, move to the next step before running again).

- [ ] **Step 6: Add the failing tests for `saldoRemanescenteParcela` and `calcularPeriodosFluxoDeCaixaProjetado`**

Append to `src/server/services/fluxoDeCaixaProjetado.test.ts`:

```ts
describe("saldoRemanescenteParcela", () => {
  test("sem baixas, devolve o valor atualizado inteiro", () => {
    expect(saldoRemanescenteParcela(1000, [])).toBe(1000);
  });

  test("com baixa parcial, subtrai o valor pago", () => {
    expect(saldoRemanescenteParcela(1000, [{ valorPago: 400 }])).toBe(600);
  });

  test("com baixas somando mais que o valor, devolve negativo sem lançar erro", () => {
    expect(saldoRemanescenteParcela(1000, [{ valorPago: 600 }, { valorPago: 500 }])).toBe(-100);
  });
});

describe("calcularPeriodosFluxoDeCaixaProjetado", () => {
  const periodos = [
    { inicio: new Date(Date.UTC(2026, 8, 1)), fim: new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999)) },
    { inicio: new Date(Date.UTC(2026, 9, 1)), fim: new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999)) },
  ];

  test("separa RECEBER (entradas) de PAGAR (saídas) no mesmo mês e encadeia o saldo", () => {
    const parcelas: ParcelaParaProjecao[] = [
      { dataVencimento: new Date(Date.UTC(2026, 8, 10)), saldo: 1000, tipo: "RECEBER" },
      { dataVencimento: new Date(Date.UTC(2026, 8, 20)), saldo: 300, tipo: "PAGAR" },
      { dataVencimento: new Date(Date.UTC(2026, 9, 5)), saldo: 200, tipo: "RECEBER" },
    ];

    const resultado = calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, 500);

    expect(resultado[0]).toMatchObject({
      saldoInicial: 500,
      entradasProjetadas: 1000,
      saidasProjetadas: 300,
      geracaoLiquida: 700,
      saldoFinal: 1200,
      alerta: false,
    });
    expect(resultado[1]).toMatchObject({
      saldoInicial: 1200,
      entradasProjetadas: 200,
      saidasProjetadas: 0,
      geracaoLiquida: 200,
      saldoFinal: 1400,
      alerta: false,
    });
  });

  test("mês sem nenhuma parcela mantém o saldo inicial como saldo final", () => {
    const resultado = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500);
    expect(resultado[0]).toMatchObject({ entradasProjetadas: 0, saidasProjetadas: 0, geracaoLiquida: 0, saldoFinal: 500, alerta: false });
    expect(resultado[1]).toMatchObject({ saldoInicial: 500, saldoFinal: 500 });
  });

  test("saldoFinal negativo marca alerta true; exatamente zero não marca", () => {
    const resultadoNegativo = calcularPeriodosFluxoDeCaixaProjetado(
      periodos,
      [{ dataVencimento: new Date(Date.UTC(2026, 8, 10)), saldo: 600, tipo: "PAGAR" }],
      500,
    );
    expect(resultadoNegativo[0].saldoFinal).toBe(-100);
    expect(resultadoNegativo[0].alerta).toBe(true);

    const resultadoZero = calcularPeriodosFluxoDeCaixaProjetado(
      periodos,
      [{ dataVencimento: new Date(Date.UTC(2026, 8, 10)), saldo: 500, tipo: "PAGAR" }],
      500,
    );
    expect(resultadoZero[0].saldoFinal).toBe(0);
    expect(resultadoZero[0].alerta).toBe(false);
  });

  test("parcela fora do intervalo dos sub-períodos é ignorada", () => {
    const parcelas: ParcelaParaProjecao[] = [
      { dataVencimento: new Date(Date.UTC(2026, 7, 15)), saldo: 999, tipo: "RECEBER" },
    ];
    const resultado = calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, 500);
    expect(resultado[0].entradasProjetadas).toBe(0);
  });
});
```

- [ ] **Step 7: Run to verify these new tests fail**

Run: `npx vitest run src/server/services/fluxoDeCaixaProjetado.test.ts`
Expected: FAIL — `saldoRemanescenteParcela`/`calcularPeriodosFluxoDeCaixaProjetado` not defined/exported.

- [ ] **Step 8: Implement `saldoRemanescenteParcela` and `calcularPeriodosFluxoDeCaixaProjetado`**

Append to `src/server/services/fluxoDeCaixaProjetado.ts` (after `calcularJanelaProjetada`):

```ts
export function saldoRemanescenteParcela(
  valorAtualizado: number,
  baixasAprovadas: { valorPago: number }[],
): number {
  const totalPago = baixasAprovadas.reduce((soma, baixa) => soma + baixa.valorPago, 0);
  return valorAtualizado - totalPago;
}

/**
 * Agrega as parcelas em aberto (já filtradas por status e escopadas por
 * filial pelo chamador) em cada sub-período, encadeando o saldo final de
 * um como saldo inicial do próximo — mesmo princípio de
 * `calcularPeriodosFluxoDeCaixa` no fluxo realizado, mas agrupando por
 * `tipo` de título (RECEBER/PAGAR) em vez de tipo de lançamento.
 */
export function calcularPeriodosFluxoDeCaixaProjetado(
  periodos: SubPeriodo[],
  parcelas: ParcelaParaProjecao[],
  saldoInicialAbsoluto: number,
): PeriodoFluxoDeCaixaProjetado[] {
  let saldoCorrente = saldoInicialAbsoluto;

  return periodos.map(({ inicio, fim }) => {
    const doPeriodo = parcelas.filter((p) => p.dataVencimento >= inicio && p.dataVencimento <= fim);
    const entradasProjetadas = doPeriodo.filter((p) => p.tipo === "RECEBER").reduce((soma, p) => soma + p.saldo, 0);
    const saidasProjetadas = doPeriodo.filter((p) => p.tipo === "PAGAR").reduce((soma, p) => soma + p.saldo, 0);
    const geracaoLiquida = entradasProjetadas - saidasProjetadas;
    const saldoInicial = saldoCorrente;
    const saldoFinal = saldoInicial + geracaoLiquida;
    saldoCorrente = saldoFinal;

    return { inicio, fim, saldoInicial, entradasProjetadas, saidasProjetadas, geracaoLiquida, saldoFinal, alerta: saldoFinal < 0 };
  });
}
```

- [ ] **Step 9: Run to verify all tests in the file pass**

Run: `npx vitest run src/server/services/fluxoDeCaixaProjetado.test.ts`
Expected: PASS (9 tests: 2 janela + 3 saldo remanescente + 4 agregação).

- [ ] **Step 10: Run `tsc` and the full suite**

Run: `npx tsc --noEmit && npm run test`
Expected: both clean.

- [ ] **Step 11: Commit**

```bash
git add src/server/services/fluxoDeCaixa.ts src/server/services/fluxoDeCaixaProjetado.ts src/server/services/fluxoDeCaixaProjetado.test.ts
git commit -m "feat: motor de calculo puro do fluxo de caixa projetado"
```

---

### Task 3: DB-querying functions + integration tests

**Files:**
- Modify: `src/server/services/fluxoDeCaixaProjetado.ts` (append async functions)
- Modify: `src/server/services/fluxoDeCaixaProjetado.test.ts` (append integration describe block)

**Interfaces:**
- Consumes: `calcularJanelaProjetada`, `saldoRemanescenteParcela`, `calcularPeriodosFluxoDeCaixaProjetado`, `ParcelaParaProjecao`, `PeriodoFluxoDeCaixaProjetado`, `ModoJanelaProjetado` (Task 2, same file); `buscarSaldoEmCaixaAte` (from `./fluxoDeCaixa`); `criarTitulo` (from `./titulo`); `registrarBaixa`/`aprovarBaixa` (from `./baixa`); `criarFixtureFinanceiro`/`limparFixtureFinanceiro`/`FixtureFinanceiro` (from `./financeiroTestFixtures`).
- Produces (consumed by Task 4): `buscarParcelasEmAbertoNoPeriodo(filialId, inicio, fim): Promise<ParcelaParaProjecao[]>`; `listarFluxoDeCaixaProjetado(sessao, modo, dataReferencia): Promise<PeriodoFluxoDeCaixaProjetado[]>`.

- [ ] **Step 1: Write the failing integration tests**

Append to `src/server/services/fluxoDeCaixaProjetado.test.ts` (add these imports at the top of the file, alongside the existing ones):

```ts
import { afterAll, beforeAll } from "vitest";
import { prisma } from "@/server/db/client";
import type { TipoTitulo } from "@prisma/client";
import { buscarSaldoEmCaixaAte } from "./fluxoDeCaixa";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import { registrarBaixa, aprovarBaixa } from "./baixa";
import { buscarParcelasEmAbertoNoPeriodo, listarFluxoDeCaixaProjetado } from "./fluxoDeCaixaProjetado";
```

Then append this describe block at the end of the file:

```ts
describe("buscarParcelasEmAbertoNoPeriodo / listarFluxoDeCaixaProjetado (integração)", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("FCP", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  async function criarTituloDeTeste(tipo: TipoTitulo, valor: number, dataVencimento: Date) {
    return criarTitulo(fixture.sessaoAdmin, tipo, {
      contraparteId: tipo === "PAGAR" ? fixture.fornecedorId : fixture.clienteId,
      documento: `PROJ-${Date.now()}-${Math.random()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento, valorOriginal: valor }],
    });
  }

  test("só parcelas com status em aberto entram — uma PAGO fica de fora", async () => {
    const dataVencimento = new Date("2026-11-15T00:00:00Z");
    await criarTituloDeTeste("RECEBER", 1000, dataVencimento);
    const tituloPago = await criarTituloDeTeste("RECEBER", 2000, dataVencimento);

    const baixa = await registrarBaixa(fixture.sessao, tituloPago.parcelas[0].id, {
      data: new Date(),
      valorPago: 2000,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });
    await aprovarBaixa(fixture.sessao, baixa.id);

    const periodos = await listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", new Date("2026-11-01T00:00:00Z"));
    const totalEntradas = periodos.reduce((soma, p) => soma + p.entradasProjetadas, 0);
    expect(totalEntradas).toBe(1000);
  });

  test("baixa aprovada parcial abate do saldo; baixa pendente não abate nada", async () => {
    const dataVencimento = new Date("2026-11-20T00:00:00Z");
    const titulo = await criarTituloDeTeste("PAGAR", 1000, dataVencimento);
    const parcelaId = titulo.parcelas[0].id;

    const baixaAprovada = await registrarBaixa(fixture.sessao, parcelaId, {
      data: new Date(),
      valorPago: 300,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });
    await aprovarBaixa(fixture.sessao, baixaAprovada.id);

    // Baixa pendente sobre o saldo restante — não deve abater nada ainda.
    await registrarBaixa(fixture.sessao, parcelaId, {
      data: new Date(),
      valorPago: 200,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });

    const parcelas = await buscarParcelasEmAbertoNoPeriodo(
      fixture.filialId,
      new Date("2026-11-01T00:00:00Z"),
      new Date("2026-11-30T23:59:59.999Z"),
    );
    const parcelaEncontrada = parcelas.find((p) => p.dataVencimento.getTime() === dataVencimento.getTime());
    expect(parcelaEncontrada?.saldo).toBe(700);
  });

  test("separa RECEBER (entradas) de PAGAR (saídas) no mesmo mês", async () => {
    const dataVencimento = new Date("2026-12-10T00:00:00Z");
    await criarTituloDeTeste("RECEBER", 500, dataVencimento);
    await criarTituloDeTeste("PAGAR", 300, dataVencimento);

    const periodos = await listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", new Date("2026-12-01T00:00:00Z"));
    const mesDezembro = periodos.find((p) => p.inicio.toISOString() === "2026-12-01T00:00:00.000Z");
    expect(mesDezembro?.entradasProjetadas).toBeGreaterThanOrEqual(500);
    expect(mesDezembro?.saidasProjetadas).toBeGreaterThanOrEqual(300);
  });

  test("escopo de filial — parcela de outra filial não vaza", async () => {
    const outraFixture = await criarFixtureFinanceiro("FCP2", "TESOURARIA");
    try {
      await criarTitulo(outraFixture.sessaoAdmin, "RECEBER", {
        contraparteId: outraFixture.clienteId,
        documento: `OUTRA-${Date.now()}`,
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: outraFixture.categoriaFinanceiraId,
        centroCustoId: "",
        centroLucroId: "",
        safraId: "",
        projetoId: "",
        contaBancariaId: outraFixture.contaBancariaId,
        formaPagamento: "",
        parcelas: [{ numero: 1, dataVencimento: new Date("2027-01-15T00:00:00Z"), valorOriginal: 999999 }],
      });

      const parcelas = await buscarParcelasEmAbertoNoPeriodo(
        fixture.filialId,
        new Date("2027-01-01T00:00:00Z"),
        new Date("2027-01-31T23:59:59.999Z"),
      );
      expect(parcelas.every((p) => p.saldo !== 999999)).toBe(true);
    } finally {
      await limparFixtureFinanceiro(outraFixture);
    }
  });

  test("saldoInicial do primeiro mês bate com buscarSaldoEmCaixaAte pra mesma referência de tempo", async () => {
    const agora = new Date();
    const [periodos, saldoDireto] = await Promise.all([
      listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", agora),
      buscarSaldoEmCaixaAte(fixture.filialId, agora),
    ]);
    expect(periodos[0].saldoInicial).toBeCloseTo(saldoDireto, 2);
  });

  test("MOVEL e ANO_CIVIL com a mesma dataReferencia produzem janelas diferentes fora de janeiro", async () => {
    const dataReferencia = new Date("2026-06-01T00:00:00Z");
    const [periodosMovel, periodosAnoCivil] = await Promise.all([
      listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", dataReferencia),
      listarFluxoDeCaixaProjetado(fixture.sessao, "ANO_CIVIL", dataReferencia),
    ]);
    expect(periodosMovel[0].inicio.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(periodosAnoCivil[0].inicio.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/server/services/fluxoDeCaixaProjetado.test.ts`
Expected: FAIL — `buscarParcelasEmAbertoNoPeriodo`/`listarFluxoDeCaixaProjetado` not exported yet.

- [ ] **Step 3: Implement the async functions**

Append to `src/server/services/fluxoDeCaixaProjetado.ts`, and add `prisma`/`requirePermission`/`SessaoAtiva` imports at the top (they're already imported per Task 2 Step 4 — no change needed there):

```ts
export async function buscarParcelasEmAbertoNoPeriodo(
  filialId: string,
  inicio: Date,
  fim: Date,
): Promise<ParcelaParaProjecao[]> {
  const parcelas = await prisma.parcela.findMany({
    where: {
      titulo: { filialId },
      status: { in: ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"] },
      dataVencimento: { gte: inicio, lte: fim },
    },
    include: {
      titulo: { select: { tipo: true } },
      baixas: { where: { statusAprovacao: "APROVADO" } },
    },
  });

  return parcelas.map((parcela) => ({
    dataVencimento: parcela.dataVencimento,
    tipo: parcela.titulo.tipo,
    saldo: saldoRemanescenteParcela(
      Number(parcela.valorAtualizado),
      parcela.baixas.map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
    ),
  }));
}

export async function listarFluxoDeCaixaProjetado(
  sessao: SessaoAtiva,
  modo: ModoJanelaProjetado,
  dataReferencia: Date,
): Promise<PeriodoFluxoDeCaixaProjetado[]> {
  requirePermission(sessao.perfil, "titulo:ler");

  const periodos = calcularJanelaProjetada(modo, dataReferencia);
  const inicioDaJanela = periodos[0].inicio;
  const fimDaJanela = periodos[periodos.length - 1].fim;
  const agora = new Date();

  const [saldoInicialAbsoluto, parcelas] = await Promise.all([
    buscarSaldoEmCaixaAte(sessao.filialId, agora),
    buscarParcelasEmAbertoNoPeriodo(sessao.filialId, inicioDaJanela, fimDaJanela),
  ]);

  return calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, saldoInicialAbsoluto);
}
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `npx vitest run src/server/services/fluxoDeCaixaProjetado.test.ts`
Expected: PASS (9 pure tests from Task 2 + 6 integration tests = 15 total).

- [ ] **Step 5: Run `tsc` and the full suite**

Run: `npx tsc --noEmit && npm run test`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/fluxoDeCaixaProjetado.ts src/server/services/fluxoDeCaixaProjetado.test.ts
git commit -m "feat: leitura de titulos/parcelas em aberto pro fluxo de caixa projetado"
```

---

### Task 4: UI — `/financeiro/fluxo-de-caixa-projetado`

**Files:**
- Create: `src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/page.tsx`
- Create: `src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/seletor-modo.tsx`
- Create: `src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/seletor-modo.test.ts`
- Modify: `src/app/(dashboard)/nav-items.ts`

**Interfaces:**
- Consumes: `listarFluxoDeCaixaProjetado`, `ModoJanelaProjetado` (Task 3, `@/server/services/fluxoDeCaixaProjetado`); `formatarRotuloPeriodo`, `dataValida` (Task 1, `../_fluxo-de-caixa/...`); `requireSessaoAtiva`, `requirePermission` (existing).
- Produces: nothing consumed by a later task — this is the final task.

- [ ] **Step 1: Write the failing test for `deslocarDataProjetado`**

Create `src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/seletor-modo.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { deslocarDataProjetado } from "./seletor-modo";

describe("deslocarDataProjetado", () => {
  test("MOVEL: avança um mês, incluindo virada de ano (dezembro -> janeiro)", () => {
    const resultado = deslocarDataProjetado(new Date(Date.UTC(2026, 11, 15)), "MOVEL", 1);
    expect(resultado.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  test("MOVEL: volta um mês", () => {
    const resultado = deslocarDataProjetado(new Date(Date.UTC(2026, 5, 15)), "MOVEL", -1);
    expect(resultado.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  test("ANO_CIVIL: avança um ano", () => {
    const resultado = deslocarDataProjetado(new Date(Date.UTC(2026, 5, 15)), "ANO_CIVIL", 1);
    expect(resultado.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  test("ANO_CIVIL: volta um ano", () => {
    const resultado = deslocarDataProjetado(new Date(Date.UTC(2026, 5, 15)), "ANO_CIVIL", -1);
    expect(resultado.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/seletor-modo.test.ts"`
Expected: FAIL — `./seletor-modo` does not exist yet.

- [ ] **Step 3: Create `seletor-modo.tsx`**

Create `src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/seletor-modo.tsx`:

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ModoJanelaProjetado } from "@/server/services/fluxoDeCaixaProjetado";

const MODOS: ModoJanelaProjetado[] = ["MOVEL", "ANO_CIVIL"];
const LABEL: Record<ModoJanelaProjetado, string> = { MOVEL: "Móvel (12 meses)", ANO_CIVIL: "Ano civil" };

export function deslocarDataProjetado(data: Date, modo: ModoJanelaProjetado, direcao: 1 | -1): Date {
  const ano = data.getUTCFullYear();
  const mes = data.getUTCMonth();
  if (modo === "ANO_CIVIL") {
    return new Date(Date.UTC(ano + direcao, 0, 1));
  }
  return new Date(Date.UTC(ano, mes + direcao, 1));
}

export function SeletorModoProjetado({
  modo,
  dataReferencia,
}: {
  modo: ModoJanelaProjetado;
  dataReferencia: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function atualizar(novoModo: ModoJanelaProjetado, novaData: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("modo", novoModo);
    params.set("data", novaData);
    router.push(`${pathname}?${params.toString()}`);
  }

  function navegar(direcao: 1 | -1) {
    const nova = deslocarDataProjetado(new Date(dataReferencia), modo, direcao);
    atualizar(modo, nova.toISOString().slice(0, 10));
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={modo} onValueChange={(valor) => valor && atualizar(valor as ModoJanelaProjetado, dataReferencia)}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODOS.map((m) => (
            <SelectItem key={m} value={m}>
              {LABEL[m]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" size="sm" onClick={() => navegar(-1)}>
        Anterior
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => navegar(1)}>
        Próximo
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify the `deslocarDataProjetado` tests pass**

Run: `npx vitest run "src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/seletor-modo.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Create `page.tsx`**

Create `src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/page.tsx`:

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarFluxoDeCaixaProjetado, type ModoJanelaProjetado } from "@/server/services/fluxoDeCaixaProjetado";
import { SeletorModoProjetado } from "./seletor-modo";
import { formatarRotuloPeriodo } from "../_fluxo-de-caixa/formatar-rotulo-periodo";
import { dataValida } from "../_fluxo-de-caixa/data-valida";

const MODOS_VALIDOS: ModoJanelaProjetado[] = ["MOVEL", "ANO_CIVIL"];

function modoValido(valor: string | undefined): ModoJanelaProjetado {
  return MODOS_VALIDOS.includes(valor as ModoJanelaProjetado) ? (valor as ModoJanelaProjetado) : "MOVEL";
}

export default async function FluxoDeCaixaProjetadoPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string | string[]; data?: string | string[] }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:ler");

  const params = await searchParams;
  const modoParam = Array.isArray(params.modo) ? params.modo[0] : params.modo;
  const dataParam = Array.isArray(params.data) ? params.data[0] : params.data;
  const modo = modoValido(modoParam);
  const dataReferencia = dataValida(dataParam);

  const periodos = await listarFluxoDeCaixaProjetado(sessao, modo, dataReferencia);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Fluxo de caixa projetado</h1>
        <p className="text-sm text-muted-foreground">
          Projeção calculada a partir do saldo em caixa de hoje e dos
          títulos a pagar/receber já em aberto — não considera contratos
          recorrentes, financiamentos nem orçamento (ainda não existem no
          sistema).
        </p>
      </div>

      <SeletorModoProjetado modo={modo} dataReferencia={dataReferencia.toISOString().slice(0, 10)} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mês</TableHead>
            <TableHead>Saldo inicial</TableHead>
            <TableHead>Entradas projetadas</TableHead>
            <TableHead>Saídas projetadas</TableHead>
            <TableHead>Geração de caixa</TableHead>
            <TableHead>Saldo final</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {periodos.map((periodo) => (
            <TableRow key={periodo.inicio.toISOString()} className={periodo.alerta ? "bg-destructive/10" : undefined}>
              <TableCell>{formatarRotuloPeriodo("MES", periodo.inicio, periodo.fim)}</TableCell>
              <TableCell>{periodo.saldoInicial.toFixed(2)}</TableCell>
              <TableCell>{periodo.entradasProjetadas.toFixed(2)}</TableCell>
              <TableCell>{periodo.saidasProjetadas.toFixed(2)}</TableCell>
              <TableCell>{periodo.geracaoLiquida.toFixed(2)}</TableCell>
              <TableCell className={periodo.alerta ? "font-medium text-destructive" : undefined}>
                <div className="flex items-center gap-2">
                  {periodo.saldoFinal.toFixed(2)}
                  {periodo.alerta && <Badge variant="destructive">Saldo negativo</Badge>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 6: Add the nav entry**

In `src/app/(dashboard)/nav-items.ts`, change:

```ts
      { href: "/financeiro/fluxo-de-caixa", label: "Fluxo de caixa" },
    ],
  },
```

to:

```ts
      { href: "/financeiro/fluxo-de-caixa", label: "Fluxo de caixa" },
      { href: "/financeiro/fluxo-de-caixa-projetado", label: "Fluxo de caixa projetado" },
    ],
  },
```

- [ ] **Step 7: Run the full test suite, tsc, and build**

Run: `npx tsc --noEmit && npm run test && npm run build`
Expected: all clean.

- [ ] **Step 8: Manual check**

Run `npm run dev`, log in, open `/financeiro/fluxo-de-caixa-projetado`. Confirm: table renders with the Móvel window by default (12 months starting this month), switching to "Ano civil" shows Jan-Dec of the current year and Anterior/Próximo shifts by year, switching back to Móvel and navigating shifts by month. If any test títulos with a near-term `dataVencimento` and large `valorOriginal` exist, confirm a resulting negative-saldo month shows the red highlight + "Saldo negativo" badge.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado" src/app/\(dashboard\)/nav-items.ts
git commit -m "feat: tela de fluxo de caixa projetado"
```

---

## Self-Review Notes

- **Spec coverage**: every section of the design doc maps to a task — modelo de cálculo/tipos/funções puras → Task 2; funções assíncronas/Prisma → Task 3; UI/rotas/nav → Task 4; shared-file extraction (mentioned in the design's "Arquivos compartilhados" section) → Task 1. Permissions section requires no new task (reuses `titulo:ler`, wired directly into Task 3/4). "Fora de escopo" items are deliberately absent from every task.
- **Type consistency checked**: `ModoJanelaProjetado`, `ParcelaParaProjecao`, `PeriodoFluxoDeCaixaProjetado` are defined once in Task 2 and referenced with identical names/shapes in Tasks 3 and 4. `tipo` on `ParcelaParaProjecao` uses Prisma's own `TipoTitulo` enum type rather than a redeclared string union, so it can never drift from the schema.
- **No placeholders**: every step has literal, complete code — no "add tests for this" or "similar to Task N" shortcuts.
