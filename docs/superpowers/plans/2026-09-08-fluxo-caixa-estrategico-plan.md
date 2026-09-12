# Fluxo de Caixa Estratégico (Fase 4c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a "Fluxo de caixa estratégico" screen showing a 5-year annual cash-flow projection, per empresa (consolidating all its filiais), across 3 fixed scenarios (base/otimista/pessimista) with 5 user-editable growth/CAPEX/debt assumptions per scenario.

**Architecture:** A new persisted model (`CenarioEstrategico`, one row per empresa × scenario type) holds the editable assumptions. A new service (`fluxoDeCaixaEstrategico.ts`) mirrors the pure-calculation/async-DB-function split already established by the "realizado" and "projetado" siblings, consolidating the "ano base" from the already-shipped realizado data across every filial of the empresa. A new page + form let ADMINISTRADOR/GESTOR edit assumptions and everyone with read access view the 5-year table per scenario.

**Tech Stack:** Next.js 16 App Router (server component + Server Actions), Prisma 7 (migration required — this is the first sub-project of Fase 4 that persists new data), TypeScript, Zod, Vitest (real Postgres for integration tests).

**Spec:** `docs/superpowers/specs/2026-09-08-fluxo-caixa-estrategico-design.md`

## Global Constraints

- This feature is scoped by **empresa**, not filial — the only entity in this codebase with that scope besides `Empresa`/`Usuario` management themselves. Do not add `filialId` anywhere in this feature.
- Percentages are stored as decimal fractions (`0.08` = 8% ao ano), never as whole-number percents, and always `Decimal` in the schema — never `Float`.
- No new permission couples with `requireAlteracaoFilial` — that check is about filial-level write access and doesn't apply here. Only `requirePermission` gates writes, same as `empresa:gerenciar`/`usuario:gerenciar`.
- The 3 `CenarioEstrategico` rows per empresa are guaranteed via `upsert` (idempotent, on read and on write) — never via eager creation at `Empresa`-creation time, never via a data-backfill migration.
- Only `Baixa` rows with `statusAprovacao: "APROVADO"` are never relevant here — this feature doesn't touch `Titulo`/`Parcela`/`Baixa` at all, only `LancamentoBancario` (via the already-shipped `buscarSaldoEmCaixaAte`) for the ano-base consolidation.
- Dates: the ano-base window is "last 12 months from today", always UTC, same rule as every other date computation in `fluxoDeCaixa.ts`.
- `margemLiquida` is a derived, display-only field — it must be 0 (not `NaN`/`Infinity`) when `receita` is 0 for that year.

---

### Task 1: Schema migration + permissions

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/server/auth/permissions.ts`
- Modify: `src/server/auth/permissions.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 2-4): the `TipoCenarioEstrategico` enum and `CenarioEstrategico` model (both auto-exported from `@prisma/client` after `prisma generate`), and the `Acao` union members `"planejamentoEstrategico:ler"` / `"planejamentoEstrategico:escrever"`.

- [ ] **Step 1: Add the enum and model to the schema**

In `prisma/schema.prisma`, add this enum next to the other enums (e.g. right after the existing `MeioPagamento` enum):

```prisma
enum TipoCenarioEstrategico {
  BASE
  OTIMISTA
  PESSIMISTA
}
```

Add this model anywhere after the `Empresa` model definition:

```prisma
model CenarioEstrategico {
  id                     String                 @id @default(uuid())
  empresaId              String
  tipo                   TipoCenarioEstrategico
  crescimentoReceita     Decimal                @db.Decimal(7, 4)
  crescimentoCustos      Decimal                @db.Decimal(7, 4)
  capexPercentualReceita Decimal                @db.Decimal(7, 4)
  novoEndividamentoAnual Decimal                @db.Decimal(18, 2)
  taxaJurosAnual         Decimal                @db.Decimal(7, 4)
  criadoEm               DateTime               @default(now())
  atualizadoEm           DateTime               @updatedAt

  empresa Empresa @relation(fields: [empresaId], references: [id], onDelete: Cascade)

  @@unique([empresaId, tipo])
  @@index([empresaId])
  @@map("cenarios_estrategicos")
}
```

In the existing `model Empresa { ... }` block, add a new relation field alongside the other back-relations (`usuarios`, `filiais`, `clientes`, `fornecedores`, `auditLogs`):

```prisma
  cenariosEstrategicos CenarioEstrategico[]
```

- [ ] **Step 2: Run the migration**

Run: `npx prisma migrate dev --name add_cenario_estrategico`
Expected: migration applies cleanly, `npx prisma generate` runs automatically as part of `migrate dev` and produces `TipoCenarioEstrategico`/`CenarioEstrategico` types in `@prisma/client`.

- [ ] **Step 3: Add the 2 new permission actions**

In `src/server/auth/permissions.ts`, add to the `Acao` union (after `"conciliacao:escrever"`):

```ts
  | "planejamentoEstrategico:ler"
  | "planejamentoEstrategico:escrever";
```

(Change the preceding line's trailing `;` to `|` — it's the last member of the union today.)

In the `PERMISSOES` map, add `"planejamentoEstrategico:ler"` to every non-ADMINISTRADOR profile's set (`ADMINISTRADOR` already has everything via `"TODAS"`), and add `"planejamentoEstrategico:escrever"` to `GESTOR` only. The updated map:

```ts
const PERMISSOES: Record<Perfil, ReadonlySet<Acao> | "TODAS"> = {
  ADMINISTRADOR: "TODAS",
  FINANCEIRO: new Set([
    "cadastro:escrever",
    "cadastro:ler",
    "titulo:ler",
    "titulo:escrever",
    "titulo:baixar",
    "lancamento:ler",
    "conciliacao:ler",
    "planejamentoEstrategico:ler",
  ]),
  TESOURARIA: new Set([
    "cadastro:escrever",
    "cadastro:ler",
    "titulo:ler",
    "titulo:baixar",
    "titulo:aprovar",
    "lancamento:ler",
    "lancamento:escrever",
    "conciliacao:ler",
    "conciliacao:escrever",
    "planejamentoEstrategico:ler",
  ]),
  GESTOR: new Set([
    "cadastro:ler",
    "auditoria:ler",
    "titulo:ler",
    "lancamento:ler",
    "conciliacao:ler",
    "planejamentoEstrategico:ler",
    "planejamentoEstrategico:escrever",
  ]),
  AUDITOR: new Set([
    "cadastro:ler",
    "auditoria:ler",
    "titulo:ler",
    "lancamento:ler",
    "conciliacao:ler",
    "planejamentoEstrategico:ler",
  ]),
  CONSULTA: new Set([
    "cadastro:ler",
    "titulo:ler",
    "lancamento:ler",
    "conciliacao:ler",
    "planejamentoEstrategico:ler",
  ]),
};
```

- [ ] **Step 4: Add the failing permission tests**

Append to `src/server/auth/permissions.test.ts`:

```ts
describe("permissões de planejamento estratégico", () => {
  test("GESTOR pode ler e escrever premissas — primeira escrita do perfil no sistema", () => {
    expect(() => requirePermission("GESTOR", "planejamentoEstrategico:ler")).not.toThrow();
    expect(() => requirePermission("GESTOR", "planejamentoEstrategico:escrever")).not.toThrow();
  });

  test("FINANCEIRO, TESOURARIA, AUDITOR e CONSULTA só leem, não escrevem", () => {
    for (const perfil of ["FINANCEIRO", "TESOURARIA", "AUDITOR", "CONSULTA"] as const) {
      expect(() => requirePermission(perfil, "planejamentoEstrategico:ler")).not.toThrow();
      expect(() => requirePermission(perfil, "planejamentoEstrategico:escrever")).toThrow(PermissionError);
    }
  });
});
```

- [ ] **Step 5: Run to verify**

Run: `npx vitest run src/server/auth/permissions.test.ts`
Expected: PASS (all tests, including the 2 new ones).

Run: `npx tsc --noEmit`
Expected: clean — confirms the Prisma-generated types compile.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/server/auth/permissions.ts src/server/auth/permissions.test.ts
git commit -m "feat: schema e permissoes do fluxo de caixa estrategico"
```

---

### Task 2: Pure calculation engine

**Files:**
- Create: `src/server/services/fluxoDeCaixaEstrategico.ts`
- Create: `src/server/services/fluxoDeCaixaEstrategico.test.ts`

**Interfaces:**
- Produces (consumed by Task 3): `PremissasCenario` type, `AnoProjetadoEstrategico` type, `calcularProjecaoEstrategica(premissas: PremissasCenario, receitaBase: number, custoBase: number, saldoCaixaBase: number): AnoProjetadoEstrategico[]`.

- [ ] **Step 1: Write the failing tests**

Create `src/server/services/fluxoDeCaixaEstrategico.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { calcularProjecaoEstrategica, type PremissasCenario } from "./fluxoDeCaixaEstrategico";

describe("calcularProjecaoEstrategica", () => {
  const premissasZeradas: PremissasCenario = {
    crescimentoReceita: 0,
    crescimentoCustos: 0,
    capexPercentualReceita: 0,
    novoEndividamentoAnual: 0,
    taxaJurosAnual: 0,
  };

  test("devolve exatamente 5 anos, numerados 1 a 5", () => {
    const resultado = calcularProjecaoEstrategica(premissasZeradas, 1000, 600, 200);
    expect(resultado).toHaveLength(5);
    expect(resultado.map((a) => a.ano)).toEqual([1, 2, 3, 4, 5]);
  });

  test("premissas todas zeradas reproduz o ano base nos 5 anos, sem crescimento", () => {
    const resultado = calcularProjecaoEstrategica(premissasZeradas, 1000, 600, 200);
    for (const ano of resultado) {
      expect(ano.receita).toBe(1000);
      expect(ano.custoOperacional).toBe(600);
      expect(ano.capex).toBe(0);
      expect(ano.jurosSobreDivida).toBe(0);
      expect(ano.geracaoOperacional).toBe(400);
      expect(ano.geracaoLiquida).toBe(400);
    }
    expect(resultado[0].saldoCaixa).toBe(600); // 200 + 400
    expect(resultado[4].saldoCaixa).toBe(200 + 400 * 5);
  });

  test("encadeia receita/custo/saldo de caixa ano a ano com crescimento", () => {
    const premissas: PremissasCenario = { ...premissasZeradas, crescimentoReceita: 0.1, crescimentoCustos: 0.05 };
    const resultado = calcularProjecaoEstrategica(premissas, 1000, 600, 0);
    expect(resultado[0].receita).toBeCloseTo(1100, 6);
    expect(resultado[0].custoOperacional).toBeCloseTo(630, 6);
    expect(resultado[1].receita).toBeCloseTo(1210, 6);
    expect(resultado[1].custoOperacional).toBeCloseTo(661.5, 6);
  });

  test("CAPEX é percentual da receita do próprio ano, não do ano base", () => {
    const premissas: PremissasCenario = { ...premissasZeradas, crescimentoReceita: 1, capexPercentualReceita: 0.1 };
    const resultado = calcularProjecaoEstrategica(premissas, 1000, 0, 0);
    expect(resultado[0].receita).toBe(2000);
    expect(resultado[0].capex).toBeCloseTo(200, 6); // 10% de 2000, não de 1000
  });

  test("saldo devedor acumula novoEndividamentoAnual todo ano, sem amortização", () => {
    const premissas: PremissasCenario = { ...premissasZeradas, novoEndividamentoAnual: 500 };
    const resultado = calcularProjecaoEstrategica(premissas, 1000, 600, 0);
    // geracaoLiquida[N] = geracaoOperacional (400) + novoEndividamentoAnual (500) - juros (0, sem taxa)
    for (const ano of resultado) {
      expect(ano.geracaoLiquida).toBe(900);
    }
  });

  test("juros incidem sobre o saldo devedor do ANO ANTERIOR, não o do próprio ano", () => {
    const premissas: PremissasCenario = { ...premissasZeradas, novoEndividamentoAnual: 1000, taxaJurosAnual: 0.1 };
    const resultado = calcularProjecaoEstrategica(premissas, 1000, 600, 0);
    // Ano 1: saldo devedor anterior = 0 -> juros = 0
    expect(resultado[0].jurosSobreDivida).toBe(0);
    // Ano 2: saldo devedor no fim do ano 1 = 1000 -> juros do ano 2 = 100
    expect(resultado[1].jurosSobreDivida).toBeCloseTo(100, 6);
    // Ano 3: saldo devedor no fim do ano 2 = 2000 -> juros do ano 3 = 200
    expect(resultado[2].jurosSobreDivida).toBeCloseTo(200, 6);
  });

  test("margemLiquida é geracaoOperacional/receita, e não lança erro quando receita é 0", () => {
    const resultado = calcularProjecaoEstrategica(premissasZeradas, 1000, 600, 0);
    expect(resultado[0].margemLiquida).toBeCloseTo(0.4, 6);

    const resultadoZerado = calcularProjecaoEstrategica(premissasZeradas, 0, 0, 0);
    expect(resultadoZerado[0].margemLiquida).toBe(0);
    expect(Number.isFinite(resultadoZerado[0].margemLiquida)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/server/services/fluxoDeCaixaEstrategico.test.ts`
Expected: FAIL — `./fluxoDeCaixaEstrategico` does not exist yet.

- [ ] **Step 3: Implement the types and the pure function**

Create `src/server/services/fluxoDeCaixaEstrategico.ts`:

```ts
export type PremissasCenario = {
  crescimentoReceita: number;
  crescimentoCustos: number;
  capexPercentualReceita: number;
  novoEndividamentoAnual: number;
  taxaJurosAnual: number;
};

export type AnoProjetadoEstrategico = {
  ano: number;
  receita: number;
  custoOperacional: number;
  capex: number;
  jurosSobreDivida: number;
  geracaoOperacional: number;
  geracaoLiquida: number;
  saldoCaixa: number;
  margemLiquida: number;
};

const ANOS_DE_PROJECAO = 5;

/**
 * Roda os 5 anos da fórmula do fluxo de caixa estratégico — ver "Modelo
 * de cálculo" na spec. Juros incidem sobre o saldo devedor ANTES de
 * somar o novo endividamento do próprio ano (empréstimo tomado em
 * janeiro do ano N só gera juros a partir do ano N+1). Sem amortização:
 * o saldo devedor só cresce.
 */
export function calcularProjecaoEstrategica(
  premissas: PremissasCenario,
  receitaBase: number,
  custoBase: number,
  saldoCaixaBase: number,
): AnoProjetadoEstrategico[] {
  const anos: AnoProjetadoEstrategico[] = [];

  let receitaAnterior = receitaBase;
  let custoAnterior = custoBase;
  let saldoCaixaAnterior = saldoCaixaBase;
  let saldoDevedorAnterior = 0;

  for (let ano = 1; ano <= ANOS_DE_PROJECAO; ano++) {
    const receita = receitaAnterior * (1 + premissas.crescimentoReceita);
    const custoOperacional = custoAnterior * (1 + premissas.crescimentoCustos);
    const capex = receita * premissas.capexPercentualReceita;
    const jurosSobreDivida = saldoDevedorAnterior * premissas.taxaJurosAnual;
    const saldoDevedor = saldoDevedorAnterior + premissas.novoEndividamentoAnual;

    const geracaoOperacional = receita - custoOperacional;
    const geracaoLiquida = geracaoOperacional - capex + premissas.novoEndividamentoAnual - jurosSobreDivida;
    const saldoCaixa = saldoCaixaAnterior + geracaoLiquida;
    const margemLiquida = receita === 0 ? 0 : geracaoOperacional / receita;

    anos.push({ ano, receita, custoOperacional, capex, jurosSobreDivida, geracaoOperacional, geracaoLiquida, saldoCaixa, margemLiquida });

    receitaAnterior = receita;
    custoAnterior = custoOperacional;
    saldoCaixaAnterior = saldoCaixa;
    saldoDevedorAnterior = saldoDevedor;
  }

  return anos;
}
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `npx vitest run src/server/services/fluxoDeCaixaEstrategico.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Run `tsc` and the full suite**

Run: `npx tsc --noEmit && npm run test`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/fluxoDeCaixaEstrategico.ts src/server/services/fluxoDeCaixaEstrategico.test.ts
git commit -m "feat: motor de calculo puro do fluxo de caixa estrategico"
```

---

### Task 3: Async service layer (ano base, cenários, atualização)

**Files:**
- Modify: `src/server/services/fluxoDeCaixaEstrategico.ts` (append)
- Modify: `src/server/services/fluxoDeCaixaEstrategico.test.ts` (append)

**Interfaces:**
- Consumes: `calcularProjecaoEstrategica`, `PremissasCenario`, `AnoProjetadoEstrategico` (Task 2, same file); `buscarSaldoEmCaixaAte` (from `./fluxoDeCaixa`); `requirePermission` (from `@/server/auth/permissions`); `SessaoAtiva` (from `@/server/auth/sessao`); `registrarAuditoria`, `ClientePrisma` (from `@/server/audit/registrar`); `prisma` (from `@/server/db/client`).
- Produces (consumed by Task 4): `TIPOS_CENARIO: readonly TipoCenarioEstrategico[]`; `garantirCenariosEstrategicos(empresaId: string, db?: ClientePrisma): Promise<void>`; `buscarAnoBaseConsolidado(empresaId: string): Promise<{ receitaBase: number; custoBase: number; saldoCaixaBase: number }>`; `listarCenariosEstrategicos(sessao: SessaoAtiva): Promise<Record<TipoCenarioEstrategico, PremissasCenario & { id: string }>>`; `listarProjecaoEstrategica(sessao: SessaoAtiva): Promise<Record<TipoCenarioEstrategico, AnoProjetadoEstrategico[]>>`; `atualizarPremissasCenario(sessao: SessaoAtiva, tipo: TipoCenarioEstrategico, premissas: PremissasCenario): Promise<void>`.

- [ ] **Step 1: Write the failing integration tests**

Read the current top of `src/server/services/fluxoDeCaixaEstrategico.test.ts` first (from Task 2) — add these imports alongside the existing `vitest`/local import (don't remove anything):

```ts
import { afterAll, beforeAll } from "vitest";
import { prisma } from "@/server/db/client";
import type { TipoCenarioEstrategico } from "@prisma/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import {
  garantirCenariosEstrategicos,
  buscarAnoBaseConsolidado,
  listarCenariosEstrategicos,
  listarProjecaoEstrategica,
  atualizarPremissasCenario,
  TIPOS_CENARIO,
} from "./fluxoDeCaixaEstrategico";
```

Then append this describe block at the end of the file:

```ts
describe("garantirCenariosEstrategicos / listarCenariosEstrategicos / listarProjecaoEstrategica / atualizarPremissasCenario (integração)", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("FCE", "GESTOR");
  });

  afterAll(async () => {
    await prisma.cenarioEstrategico.deleteMany({ where: { empresaId: fixture.empresaId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("garantirCenariosEstrategicos cria os 3 tipos quando nenhum existe, e não duplica ao rodar de novo", async () => {
    await garantirCenariosEstrategicos(fixture.empresaId);
    const primeiraLeitura = await prisma.cenarioEstrategico.findMany({ where: { empresaId: fixture.empresaId } });
    expect(primeiraLeitura).toHaveLength(3);
    expect(new Set(primeiraLeitura.map((c) => c.tipo))).toEqual(new Set(TIPOS_CENARIO));

    await garantirCenariosEstrategicos(fixture.empresaId);
    const segundaLeitura = await prisma.cenarioEstrategico.findMany({ where: { empresaId: fixture.empresaId } });
    expect(segundaLeitura).toHaveLength(3);
  });

  test("buscarAnoBaseConsolidado soma os últimos 12 meses de 2 filiais da mesma empresa", async () => {
    const filial2 = await prisma.filial.create({
      data: { empresaId: fixture.empresaId, nome: "Filial 2 FCE", cnpj: `88.888.FCE2/0001-99` },
    });
    const banco = await prisma.banco.create({ data: { codigo: `FCEB${Date.now()}`, nome: "Banco FCE" } });
    const contaFilial2 = await prisma.contaBancaria.create({
      data: { filialId: filial2.id, bancoId: banco.id, agencia: "0001", conta: "fce2-1", saldoInicial: 0 },
    });

    const hoje = new Date();
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: hoje,
        tipo: "ENTRADA",
        valor: 1000,
        descricao: "Receita filial 1",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });
    await prisma.lancamentoBancario.create({
      data: {
        filialId: filial2.id,
        contaBancariaId: contaFilial2.id,
        data: hoje,
        tipo: "ENTRADA",
        valor: 500,
        descricao: "Receita filial 2",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });

    const anoBase = await buscarAnoBaseConsolidado(fixture.empresaId);
    expect(anoBase.receitaBase).toBeGreaterThanOrEqual(1500);

    await prisma.lancamentoBancario.deleteMany({ where: { filialId: filial2.id } });
    await prisma.contaBancaria.deleteMany({ where: { filialId: filial2.id } });
    await prisma.banco.delete({ where: { id: banco.id } });
    await prisma.filial.delete({ where: { id: filial2.id } });
  });

  test("listarCenariosEstrategicos e listarProjecaoEstrategica escopam pela empresa ativa da sessão", async () => {
    const cenarios = await listarCenariosEstrategicos(fixture.sessao);
    expect(Object.keys(cenarios).sort()).toEqual([...TIPOS_CENARIO].sort());

    const projecoes = await listarProjecaoEstrategica(fixture.sessao);
    for (const tipo of TIPOS_CENARIO) {
      expect(projecoes[tipo]).toHaveLength(5);
    }
  });

  test("atualizarPremissasCenario recusa perfil sem planejamentoEstrategico:escrever", async () => {
    const sessaoConsulta = { ...fixture.sessao, perfil: "CONSULTA" as const };
    await expect(
      atualizarPremissasCenario(sessaoConsulta, "BASE", {
        crescimentoReceita: 0.1,
        crescimentoCustos: 0.05,
        capexPercentualReceita: 0.02,
        novoEndividamentoAnual: 0,
        taxaJurosAnual: 0,
      }),
    ).rejects.toThrow();
  });

  test("atualizarPremissasCenario persiste e listarCenariosEstrategicos reflete o valor novo", async () => {
    await atualizarPremissasCenario(fixture.sessao, "OTIMISTA", {
      crescimentoReceita: 0.15,
      crescimentoCustos: 0.08,
      capexPercentualReceita: 0.03,
      novoEndividamentoAnual: 10000,
      taxaJurosAnual: 0.12,
    });

    const cenarios = await listarCenariosEstrategicos(fixture.sessao);
    expect(cenarios.OTIMISTA.crescimentoReceita).toBeCloseTo(0.15, 6);
    expect(cenarios.OTIMISTA.novoEndividamentoAnual).toBeCloseTo(10000, 6);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/server/services/fluxoDeCaixaEstrategico.test.ts`
Expected: FAIL — the new exports don't exist yet.

- [ ] **Step 3: Implement the async functions**

Append to `src/server/services/fluxoDeCaixaEstrategico.ts`, and add these imports at the top of the file (above the existing type definitions from Task 2):

```ts
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { registrarAuditoria, type ClientePrisma } from "@/server/audit/registrar";
import type { TipoCenarioEstrategico } from "@prisma/client";
import { buscarSaldoEmCaixaAte } from "./fluxoDeCaixa";
```

Then append:

```ts
export const TIPOS_CENARIO: readonly TipoCenarioEstrategico[] = ["BASE", "OTIMISTA", "PESSIMISTA"];

const PREMISSAS_ZERADAS = {
  crescimentoReceita: 0,
  crescimentoCustos: 0,
  capexPercentualReceita: 0,
  novoEndividamentoAnual: 0,
  taxaJurosAnual: 0,
};

export async function garantirCenariosEstrategicos(empresaId: string, db: ClientePrisma = prisma): Promise<void> {
  await Promise.all(
    TIPOS_CENARIO.map((tipo) =>
      db.cenarioEstrategico.upsert({
        where: { empresaId_tipo: { empresaId, tipo } },
        create: { empresaId, tipo, ...PREMISSAS_ZERADAS },
        update: {},
      }),
    ),
  );
}

export async function buscarAnoBaseConsolidado(
  empresaId: string,
): Promise<{ receitaBase: number; custoBase: number; saldoCaixaBase: number }> {
  const filiais = await prisma.filial.findMany({ where: { empresaId }, select: { id: true } });
  const hoje = new Date();
  const inicioJanela = new Date(hoje);
  inicioJanela.setUTCFullYear(inicioJanela.getUTCFullYear() - 1);

  let receitaBase = 0;
  let custoBase = 0;
  let saldoCaixaBase = 0;

  for (const filial of filiais) {
    saldoCaixaBase += await buscarSaldoEmCaixaAte(filial.id, hoje);

    const somas = await prisma.lancamentoBancario.groupBy({
      by: ["tipo"],
      where: {
        filialId: filial.id,
        conciliado: true,
        data: { gte: inicioJanela, lte: hoje },
        contaBancaria: { ativo: true },
      },
      _sum: { valor: true },
    });

    receitaBase += Number(somas.find((s) => s.tipo === "ENTRADA")?._sum.valor ?? 0);
    custoBase += Number(somas.find((s) => s.tipo === "SAIDA")?._sum.valor ?? 0);
  }

  return { receitaBase, custoBase, saldoCaixaBase };
}

export async function listarCenariosEstrategicos(
  sessao: SessaoAtiva,
): Promise<Record<TipoCenarioEstrategico, PremissasCenario & { id: string }>> {
  requirePermission(sessao.perfil, "planejamentoEstrategico:ler");

  await garantirCenariosEstrategicos(sessao.empresaId);
  const cenarios = await prisma.cenarioEstrategico.findMany({ where: { empresaId: sessao.empresaId } });

  const resultado = {} as Record<TipoCenarioEstrategico, PremissasCenario & { id: string }>;
  for (const cenario of cenarios) {
    resultado[cenario.tipo] = {
      id: cenario.id,
      crescimentoReceita: Number(cenario.crescimentoReceita),
      crescimentoCustos: Number(cenario.crescimentoCustos),
      capexPercentualReceita: Number(cenario.capexPercentualReceita),
      novoEndividamentoAnual: Number(cenario.novoEndividamentoAnual),
      taxaJurosAnual: Number(cenario.taxaJurosAnual),
    };
  }
  return resultado;
}

export async function listarProjecaoEstrategica(
  sessao: SessaoAtiva,
): Promise<Record<TipoCenarioEstrategico, AnoProjetadoEstrategico[]>> {
  requirePermission(sessao.perfil, "planejamentoEstrategico:ler");

  const [anoBase, cenarios] = await Promise.all([
    buscarAnoBaseConsolidado(sessao.empresaId),
    listarCenariosEstrategicos(sessao),
  ]);

  const resultado = {} as Record<TipoCenarioEstrategico, AnoProjetadoEstrategico[]>;
  for (const tipo of TIPOS_CENARIO) {
    resultado[tipo] = calcularProjecaoEstrategica(cenarios[tipo], anoBase.receitaBase, anoBase.custoBase, anoBase.saldoCaixaBase);
  }
  return resultado;
}

export async function atualizarPremissasCenario(
  sessao: SessaoAtiva,
  tipo: TipoCenarioEstrategico,
  premissas: PremissasCenario,
): Promise<void> {
  requirePermission(sessao.perfil, "planejamentoEstrategico:escrever");

  const anterior = await prisma.cenarioEstrategico.findUnique({
    where: { empresaId_tipo: { empresaId: sessao.empresaId, tipo } },
  });

  const cenario = await prisma.cenarioEstrategico.upsert({
    where: { empresaId_tipo: { empresaId: sessao.empresaId, tipo } },
    create: { empresaId: sessao.empresaId, tipo, ...premissas },
    update: { ...premissas },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: null,
    usuarioId: sessao.usuarioId,
    entidade: "CenarioEstrategico",
    entidadeId: cenario.id,
    acao: anterior ? "ATUALIZAR" : "CRIAR",
    anterior: anterior
      ? {
          crescimentoReceita: Number(anterior.crescimentoReceita),
          crescimentoCustos: Number(anterior.crescimentoCustos),
          capexPercentualReceita: Number(anterior.capexPercentualReceita),
          novoEndividamentoAnual: Number(anterior.novoEndividamentoAnual),
          taxaJurosAnual: Number(anterior.taxaJurosAnual),
        }
      : null,
    novo: premissas,
  });
}
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `npx vitest run src/server/services/fluxoDeCaixaEstrategico.test.ts`
Expected: PASS (7 pure tests from Task 2 + 5 integration tests = 12 total).

- [ ] **Step 5: Run `tsc` and the full suite**

Run: `npx tsc --noEmit && npm run test`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/fluxoDeCaixaEstrategico.ts src/server/services/fluxoDeCaixaEstrategico.test.ts
git commit -m "feat: camada assincrona do fluxo de caixa estrategico (ano base, cenarios, atualizacao)"
```

---

### Task 4: UI — `/financeiro/fluxo-de-caixa-estrategico`

**Files:**
- Create: `src/lib/schemas/cenarioEstrategico.ts`
- Create: `src/app/(dashboard)/financeiro/fluxo-de-caixa-estrategico/page.tsx`
- Create: `src/app/(dashboard)/financeiro/fluxo-de-caixa-estrategico/actions.ts`
- Create: `src/app/(dashboard)/financeiro/fluxo-de-caixa-estrategico/premissas-form.tsx`
- Modify: `src/app/(dashboard)/nav-items.ts`

**Interfaces:**
- Consumes: `listarProjecaoEstrategica`, `atualizarPremissasCenario`, `PremissasCenario`, `TIPOS_CENARIO` (Task 3, `@/server/services/fluxoDeCaixaEstrategico`); `requireSessaoAtiva`, `requirePermission`, `podeExecutar` (existing).
- Produces: nothing consumed by a later task — this is the final task.

- [ ] **Step 1: Create the Zod schema**

Create `src/lib/schemas/cenarioEstrategico.ts`:

```ts
import { z } from "zod";

export const premissasCenarioSchema = z.object({
  crescimentoReceita: z.coerce.number().min(-1, "Não pode ser menor que -100%").max(10, "Valor muito alto"),
  crescimentoCustos: z.coerce.number().min(-1, "Não pode ser menor que -100%").max(10, "Valor muito alto"),
  capexPercentualReceita: z.coerce.number().min(0, "Não pode ser negativo").max(1, "Não pode passar de 100% da receita"),
  novoEndividamentoAnual: z.coerce.number().min(0, "Não pode ser negativo"),
  taxaJurosAnual: z.coerce.number().min(0, "Não pode ser negativa").max(2, "Valor muito alto"),
});

export type PremissasCenarioFormValues = z.infer<typeof premissasCenarioSchema>;
```

- [ ] **Step 2: Create the Server Action**

Create `src/app/(dashboard)/financeiro/fluxo-de-caixa-estrategico/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { premissasCenarioSchema } from "@/lib/schemas/cenarioEstrategico";
import { atualizarPremissasCenario, TIPOS_CENARIO } from "@/server/services/fluxoDeCaixaEstrategico";
import type { TipoCenarioEstrategico } from "@prisma/client";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

function tipoValido(valor: FormDataEntryValue | null): valor is TipoCenarioEstrategico {
  return typeof valor === "string" && (TIPOS_CENARIO as string[]).includes(valor);
}

export async function atualizarPremissasCenarioAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const tipoBruto = formData.get("tipo");
  if (!tipoValido(tipoBruto)) {
    return { erro: "Cenário inválido" };
  }
  const tipo = tipoBruto;
  const parsed = premissasCenarioSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await atualizarPremissasCenario(sessao, tipo, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/fluxo-de-caixa-estrategico");
  return { sucesso: true };
}
```

- [ ] **Step 3: Create the premises form (client component)**

Create `src/app/(dashboard)/financeiro/fluxo-de-caixa-estrategico/premissas-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PremissasCenario } from "@/server/services/fluxoDeCaixaEstrategico";
import type { TipoCenarioEstrategico } from "@prisma/client";
import { atualizarPremissasCenarioAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

export function PremissasForm({
  tipo,
  premissas,
  somenteLeitura,
}: {
  tipo: TipoCenarioEstrategico;
  premissas: PremissasCenario;
  somenteLeitura: boolean;
}) {
  const [state, formAction, pendente] = useActionState(atualizarPremissasCenarioAction, ESTADO_INICIAL);

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="tipo" value={tipo} />
      <div className="space-y-2">
        <Label htmlFor={`${tipo}-crescimentoReceita`}>Crescimento de receita (% a.a.)</Label>
        <Input
          id={`${tipo}-crescimentoReceita`}
          name="crescimentoReceita"
          type="number"
          step="0.0001"
          defaultValue={premissas.crescimentoReceita}
          disabled={somenteLeitura}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${tipo}-crescimentoCustos`}>Crescimento de custos/despesas (% a.a.)</Label>
        <Input
          id={`${tipo}-crescimentoCustos`}
          name="crescimentoCustos"
          type="number"
          step="0.0001"
          defaultValue={premissas.crescimentoCustos}
          disabled={somenteLeitura}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${tipo}-capexPercentualReceita`}>CAPEX (% da receita)</Label>
        <Input
          id={`${tipo}-capexPercentualReceita`}
          name="capexPercentualReceita"
          type="number"
          step="0.0001"
          defaultValue={premissas.capexPercentualReceita}
          disabled={somenteLeitura}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${tipo}-novoEndividamentoAnual`}>Novo endividamento anual (R$)</Label>
        <Input
          id={`${tipo}-novoEndividamentoAnual`}
          name="novoEndividamentoAnual"
          type="number"
          step="0.01"
          defaultValue={premissas.novoEndividamentoAnual}
          disabled={somenteLeitura}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${tipo}-taxaJurosAnual`}>Taxa de juros anual (% a.a.)</Label>
        <Input
          id={`${tipo}-taxaJurosAnual`}
          name="taxaJurosAnual"
          type="number"
          step="0.0001"
          defaultValue={premissas.taxaJurosAnual}
          disabled={somenteLeitura}
          required
        />
      </div>
      {!somenteLeitura && (
        <div className="flex items-end">
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar premissas"}
          </Button>
        </div>
      )}
      {state.erro ? <p className="text-sm text-destructive sm:col-span-2 lg:col-span-3">{state.erro}</p> : null}
    </form>
  );
}
```

- [ ] **Step 4: Create the page**

Create `src/app/(dashboard)/financeiro/fluxo-de-caixa-estrategico/page.tsx`:

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeExecutar } from "@/server/auth/permissions";
import { listarCenariosEstrategicos, listarProjecaoEstrategica, TIPOS_CENARIO } from "@/server/services/fluxoDeCaixaEstrategico";
import { PremissasForm } from "./premissas-form";

const LABEL_CENARIO: Record<(typeof TIPOS_CENARIO)[number], string> = {
  BASE: "Base",
  OTIMISTA: "Otimista",
  PESSIMISTA: "Pessimista",
};

export default async function FluxoDeCaixaEstrategicoPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "planejamentoEstrategico:ler");

  const [cenarios, projecoes] = await Promise.all([
    listarCenariosEstrategicos(sessao),
    listarProjecaoEstrategica(sessao),
  ]);

  const somenteLeitura = !podeExecutar(sessao.perfil, "planejamentoEstrategico:escrever");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Fluxo de caixa estratégico</h1>
        <p className="text-sm text-muted-foreground">
          Projeção de 5 anos por cenário, consolidando todas as filiais
          da empresa a partir do fluxo de caixa realizado dos últimos 12
          meses. Não considera prazo de recebimento/pagamento, capital
          de giro nem amortização de dívida (juros incidem sobre o saldo
          devedor acumulado, que nunca é amortizado).
        </p>
      </div>

      {TIPOS_CENARIO.map((tipo) => (
        <section key={tipo} className="space-y-4 rounded-lg border p-4">
          <h2 className="text-base font-semibold">Cenário {LABEL_CENARIO[tipo]}</h2>

          <PremissasForm tipo={tipo} premissas={cenarios[tipo]} somenteLeitura={somenteLeitura} />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                {projecoes[tipo].map((ano) => (
                  <TableHead key={ano.ano}>Ano {ano.ano}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Receita</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{ano.receita.toFixed(2)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Custo operacional</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{ano.custoOperacional.toFixed(2)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">CAPEX</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{ano.capex.toFixed(2)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Juros</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{ano.jurosSobreDivida.toFixed(2)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Geração líquida</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{ano.geracaoLiquida.toFixed(2)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Saldo de caixa</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano} className={ano.saldoCaixa < 0 ? "font-medium text-destructive" : undefined}>
                    {ano.saldoCaixa.toFixed(2)}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Margem líquida</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{(ano.margemLiquida * 100).toFixed(1)}%</TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Add the nav entry**

In `src/app/(dashboard)/nav-items.ts`, change:

```ts
      { href: "/financeiro/fluxo-de-caixa-projetado", label: "Fluxo de caixa projetado" },
    ],
  },
```

to:

```ts
      { href: "/financeiro/fluxo-de-caixa-projetado", label: "Fluxo de caixa projetado" },
      { href: "/financeiro/fluxo-de-caixa-estrategico", label: "Fluxo de caixa estratégico" },
    ],
  },
```

- [ ] **Step 6: Run the full test suite, tsc, and build**

Run: `npx tsc --noEmit && npm run test && npm run build`
Expected: all clean.

- [ ] **Step 7: Manual check**

Run `npm run dev`, log in as ADMINISTRADOR or GESTOR, open `/financeiro/fluxo-de-caixa-estrategico`. Confirm: 3 seções (Base/Otimista/Pessimista), cada uma com formulário editável e tabela de 5 anos. Editar uma premissa (ex.: crescimento de receita) e salvar; confirmar que a tabela daquele cenário atualiza após o reload. Logar como FINANCEIRO/TESOURARIA/AUDITOR/CONSULTA e confirmar que os campos aparecem desabilitados (sem botão "Salvar").

- [ ] **Step 8: Commit**

```bash
git add src/lib/schemas/cenarioEstrategico.ts "src/app/(dashboard)/financeiro/fluxo-de-caixa-estrategico" src/app/\(dashboard\)/nav-items.ts
git commit -m "feat: tela de fluxo de caixa estrategico"
```

---

## Self-Review Notes

- **Spec coverage**: schema + garantia via upsert → Task 1 (schema part) + Task 3 (`garantirCenariosEstrategicos`); permissões (incluindo a decisão de não usar `requireAlteracaoFilial`) → Task 1 + Task 3's `atualizarPremissasCenario`; modelo de cálculo → Task 2; ano base consolidado por empresa → Task 3's `buscarAnoBaseConsolidado`; UI (formulário editável só pra quem tem escrita, tabela de 5 anos, texto explicando as simplificações) → Task 4. "Fora de escopo" items (DSO/DPO, capital de giro, amortização, premissas por ano, cenários customizáveis, gráficos, orçamento) are deliberately absent from every task.
- **Type consistency checked**: `PremissasCenario`, `AnoProjetadoEstrategico`, `TIPOS_CENARIO` defined once in Tasks 2-3 and referenced identically in Task 4. `atualizarPremissasCenario`'s parameter shape matches `PremissasCenarioFormValues` (Zod-inferred) field-for-field, so `parsed.data` passes straight through without remapping.
- **No placeholders**: every step has literal, complete code.
- **Note for the implementer of Task 1**: after `npx prisma migrate dev`, check that the generated migration SQL only adds the new enum/table/index/column — it should not touch any existing table's data. If `prisma migrate dev` prompts about a destructive change, stop and report back rather than confirming — that would indicate a schema conflict.
