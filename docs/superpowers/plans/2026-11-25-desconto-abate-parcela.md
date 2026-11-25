# Desconto abate o saldo da parcela — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o saldo e o status da parcela passam a usar o valor abatido de cada baixa aprovada (pago − juros − multa + desconto), com validação, prévia no diálogo e ajuda atualizada.

**Architecture:** uma função pura (`src/lib/financeiro/valorAbatido.ts`) concentra a regra; `calcularStatusParcela`, `saldoRemanescenteParcela` e `resumirBaixasDaParcela` passam a usá-la, e os chamadores carregam os quatro campos da baixa. O `baixaSchema` recusa baixa que não abate nada. Uma migration SQL corrige o status gravado.

**Tech Stack:** Next.js (App Router, ver `AGENTS.md`), Prisma 7 + PostgreSQL, Zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-desconto-abate-parcela-design.md`

## Global Constraints

- Regra: `valor abatido = valorPago − valorJuros − valorMulta + valorDesconto`, conta em centavos.
- O lançamento bancário continua com `valorPago` (não mexer em `efetivarBaixa` além do recálculo).
- Mensagem da recusa, exata: `Juros e multa não podem ser maiores que o valor pago mais o desconto`.
- Texto da prévia, exato: `Abate R$ X da parcela · fica R$ Y em aberto`; acima do saldo: `Abate R$ X da parcela · R$ Z acima do saldo`. Valores com `formatarMoeda` (`@/lib/formatacao`).
- Textos de tela e ajuda em português do Brasil, frases curtas, sem jargão.
- Testes: `npx vitest run <arquivo>`; testes de serviço usam o banco de teste local (ver `src/server/services/financeiroTestFixtures.ts`).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Regra do valor abatido e validação do schema

**Files:**
- Create: `src/lib/financeiro/valorAbatido.ts`
- Create: `src/lib/financeiro/valorAbatido.test.ts`
- Modify: `src/lib/schemas/baixa.ts`
- Create: `src/lib/schemas/baixa.test.ts`

**Interfaces:**
- Produces:
  - `type ValoresDaBaixa = { valorPago: number; valorJuros: number; valorMulta: number; valorDesconto: number }`
  - `valorAbatidoDaBaixa(b: ValoresDaBaixa): number`
  - `totalAbatido(baixas: readonly ValoresDaBaixa[]): number`
  - `MSG_BAIXA_SEM_ABATIMENTO` (string da recusa), exportada de `valorAbatido.ts`

- [ ] **Step 1: testes da regra** (`valorAbatido.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { totalAbatido, valorAbatidoDaBaixa } from "./valorAbatido";

const b = (valorPago: number, valorJuros = 0, valorMulta = 0, valorDesconto = 0) => ({
  valorPago, valorJuros, valorMulta, valorDesconto,
});

describe("valorAbatidoDaBaixa", () => {
  it("desconto soma ao que foi pago", () => expect(valorAbatidoDaBaixa(b(950, 0, 0, 50))).toBe(1000));
  it("juros e multa saem do que foi pago", () => expect(valorAbatidoDaBaixa(b(1022, 12, 10))).toBe(1000));
  it("juros sem aumentar o pago: abate menos", () => expect(valorAbatidoDaBaixa(b(1000, 30))).toBe(970));
  it("conta em centavos", () => expect(valorAbatidoDaBaixa(b(100.1, 0.2, 0, 0.3))).toBe(100.2));
});

describe("totalAbatido", () => {
  it("soma várias baixas", () => expect(totalAbatido([b(500), b(450, 0, 0, 50)])).toBe(1000));
  it("lista vazia é zero", () => expect(totalAbatido([])).toBe(0));
});
```

- [ ] **Step 2:** `npx vitest run src/lib/financeiro/valorAbatido.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: implementação**

```ts
/** Valores de uma baixa que definem quanto ela quita da parcela. */
export type ValoresDaBaixa = { valorPago: number; valorJuros: number; valorMulta: number; valorDesconto: number };

export const MSG_BAIXA_SEM_ABATIMENTO = "Juros e multa não podem ser maiores que o valor pago mais o desconto";

const centavos = (valor: number) => Math.round(valor * 100);

/**
 * Quanto a baixa quita da parcela: o valor pago (total que saiu ou entrou na conta,
 * já com juros e multa) menos juros e multa, mais o desconto.
 */
export function valorAbatidoDaBaixa(b: ValoresDaBaixa): number {
  return (centavos(b.valorPago) - centavos(b.valorJuros) - centavos(b.valorMulta) + centavos(b.valorDesconto)) / 100;
}

export function totalAbatido(baixas: readonly ValoresDaBaixa[]): number {
  return baixas.reduce((soma, b) => soma + centavos(valorAbatidoDaBaixa(b)), 0) / 100;
}
```

- [ ] **Step 4:** rodar de novo → PASS.

- [ ] **Step 5: testes do schema** (`src/lib/schemas/baixa.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { baixaSchema } from "./baixa";
import { MSG_BAIXA_SEM_ABATIMENTO } from "@/lib/financeiro/valorAbatido";

const base = { data: "2026-10-15", valorPago: "20", valorJuros: "0", valorMulta: "0", valorDesconto: "0", contaBancariaId: "c1" };

describe("baixaSchema", () => {
  it("recusa juros + multa iguais a pago + desconto", () => {
    const r = baixaSchema.safeParse({ ...base, valorJuros: "15", valorMulta: "5" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(MSG_BAIXA_SEM_ABATIMENTO);
    expect(r.error?.issues[0]?.path).toEqual(["valorJuros"]);
  });
  it("recusa juros maiores que o pago", () => {
    expect(baixaSchema.safeParse({ ...base, valorJuros: "30" }).success).toBe(false);
  });
  it("aceita quando sobra um centavo para abater", () => {
    expect(baixaSchema.safeParse({ ...base, valorJuros: "19.99" }).success).toBe(true);
  });
  it("aceita desconto que compensa os juros", () => {
    expect(baixaSchema.safeParse({ ...base, valorJuros: "25", valorDesconto: "10" }).success).toBe(true);
  });
});
```

- [ ] **Step 6:** `npx vitest run src/lib/schemas/baixa.test.ts` → os dois "recusa" falham.

- [ ] **Step 7:** em `src/lib/schemas/baixa.ts`, encadear no `z.object({...})` do `baixaSchema`:

```ts
  .refine((b) => valorAbatidoDaBaixa(b) > 0, { message: MSG_BAIXA_SEM_ABATIMENTO, path: ["valorJuros"] });
```

com `import { MSG_BAIXA_SEM_ABATIMENTO, valorAbatidoDaBaixa } from "@/lib/financeiro/valorAbatido";`. `BaixaFormValues` continua `z.infer<typeof baixaSchema>`.

- [ ] **Step 8:** rodar os dois testes → PASS. Rodar `npx vitest run src/app/api/v1` para conferir que a rota de baixas segue verde.

- [ ] **Step 9:** commit `feat(baixa): regra do valor abatido e recusa de baixa que não abate nada`.

---

### Task 2: Status e saldo da parcela pelo valor abatido

**Files:**
- Modify: `src/server/services/parcela.ts`, `src/server/services/parcela.test.ts`
- Modify: `src/server/services/fluxoDeCaixaProjetado.ts` (`saldoRemanescenteParcela` e o `select`/`include` das baixas), `src/server/services/fluxoDeCaixaProjetado.test.ts`
- Modify: `src/lib/financeiro/avisosDaBaixa.ts` (`resumirBaixasDaParcela`), `src/lib/financeiro/avisosDaBaixa.test.ts`
- Modify (chamadores): `src/server/services/titulo.ts` (~282), `dashboardExecutivo.ts` (37 e 135), `filiaisConsolidadas.ts` (46–56), `relatorioFiscalGerencial.ts` (97–105), `orcamento.ts` (~213), `fluxoDeCaixaPorDimensao.ts` (~181), `relatorioProducao/consultas.ts` (59–77), `src/server/services/baixa.ts` (`listarBaixasPendentes`, ~103), `src/app/(dashboard)/financeiro/aprovacoes/page.tsx` (~66)
- Test: `src/server/services/baixa.test.ts`

**Interfaces:**
- Consumes: `ValoresDaBaixa`, `totalAbatido` (Task 1).
- Produces:
  - `calcularStatusParcela(parcela, baixasAprovadas: ValoresDaBaixa[], hoje)` (o tipo `BaixaAprovadaParaStatus` vira alias de `ValoresDaBaixa`).
  - `saldoRemanescenteParcela(valorAtualizado: number, baixasAprovadas: readonly ValoresDaBaixa[]): number`.
  - `resumirBaixasDaParcela(baixaId, baixas: readonly (ValoresDaBaixa & { id: string; statusAprovacao: string })[])` → `{ totalAprovado, outrasPendentes }`, com `totalAprovado` = total abatido.
  - `valoresDaBaixa(b: { valorPago: Decimal|number; valorJuros: ...; valorMulta: ...; valorDesconto: ... }): ValoresDaBaixa` — helper de conversão de `Decimal` para `number`, exportado de `parcela.ts`, para não repetir `Number(...)` quatro vezes em cada chamador.
  - Constante `SELECT_VALORES_BAIXA = { valorPago: true, valorJuros: true, valorMulta: true, valorDesconto: true } as const`, exportada de `parcela.ts`.

- [ ] **Step 1: testes unitários que falham.** Em `parcela.test.ts`, trocar os literais `{ valorPago: N }` por um helper `pago(N, ajustes?)` que devolve os quatro campos, e acrescentar:

```ts
const pago = (valorPago: number, a: Partial<{ valorJuros: number; valorMulta: number; valorDesconto: number }> = {}) => ({
  valorPago, valorJuros: 0, valorMulta: 0, valorDesconto: 0, ...a,
});

test("desconto completa o valor da parcela = PAGO", () => {
  expect(calcularStatusParcela(parcela(), [pago(950, { valorDesconto: 50 })], HOJE)).toBe("PAGO");
});
test("juros dentro do valor pago não quitam a parcela = PARCIALMENTE_PAGO", () => {
  expect(calcularStatusParcela(parcela(), [pago(1000, { valorJuros: 30 })], HOJE)).toBe("PARCIALMENTE_PAGO");
});
test("pagou com juros por cima = PAGO", () => {
  expect(calcularStatusParcela(parcela(), [pago(1012, { valorJuros: 12 })], HOJE)).toBe("PAGO");
});
test("duas baixas parciais, a segunda com desconto = PAGO", () => {
  expect(calcularStatusParcela(parcela(), [pago(500), pago(450, { valorDesconto: 50 })], HOJE)).toBe("PAGO");
});
```

Em `fluxoDeCaixaProjetado.test.ts`, mesmo helper nos testes existentes de `saldoRemanescenteParcela` e:

```ts
test("desconto abate o saldo", () => {
  expect(saldoRemanescenteParcela(1000, [pago(950, { valorDesconto: 50 })])).toBe(0);
});
test("juros não abatem o saldo", () => {
  expect(saldoRemanescenteParcela(1000, [pago(1000, { valorJuros: 30 })])).toBe(30);
});
```

Em `avisosDaBaixa.test.ts`, dar os quatro campos às baixas do teste existente de `resumirBaixasDaParcela` e acrescentar:

```ts
it("total aprovado usa o valor abatido (desconto de baixa anterior conta)", () => {
  const baixas = [
    { id: "esta", valorPago: 450, valorJuros: 0, valorMulta: 0, valorDesconto: 0, statusAprovacao: "PENDENTE" },
    { id: "a1", valorPago: 500, valorJuros: 10, valorMulta: 0, valorDesconto: 60, statusAprovacao: "APROVADO" },
  ];
  expect(resumirBaixasDaParcela("esta", baixas)).toEqual({ totalAprovado: 550, outrasPendentes: 0 });
});
```

- [ ] **Step 2:** `npx vitest run src/server/services/parcela.test.ts src/server/services/fluxoDeCaixaProjetado.test.ts src/lib/financeiro/avisosDaBaixa.test.ts` → os novos falham.

- [ ] **Step 3: implementação das três funções.**
  - `parcela.ts`: `const saldo = parcela.valorAtualizado - totalAbatido(baixasAprovadas);` e, em `recalcularEPersistirStatusParcela`, `.map(valoresDaBaixa)`. Adicionar o helper e a constante:

```ts
type Decimalish = { toString(): string } | number;
export const SELECT_VALORES_BAIXA = { valorPago: true, valorJuros: true, valorMulta: true, valorDesconto: true } as const;
export function valoresDaBaixa(b: { valorPago: Decimalish; valorJuros: Decimalish; valorMulta: Decimalish; valorDesconto: Decimalish }): ValoresDaBaixa {
  return {
    valorPago: Number(b.valorPago),
    valorJuros: Number(b.valorJuros),
    valorMulta: Number(b.valorMulta),
    valorDesconto: Number(b.valorDesconto),
  };
}
```

  - `fluxoDeCaixaProjetado.ts`: `return valorAtualizado - totalAbatido(baixasAprovadas);`
  - `avisosDaBaixa.ts`: `totalAprovado: totalAbatido(aprovadas)`; atualizar o comentário de `DadosAvisoBaixa.totalAprovado` para "Soma do valor abatido (pago − juros − multa + desconto) das baixas aprovadas".

- [ ] **Step 4:** rodar os três testes → PASS.

- [ ] **Step 5: chamadores.** Rodar `npx tsc --noEmit` e corrigir cada erro trocando `select: { valorPago: true }` por `select: SELECT_VALORES_BAIXA` e `.map((baixa) => ({ valorPago: Number(baixa.valorPago) }))` por `.map(valoresDaBaixa)`. Onde a query usa `include` com `baixas: { where: ... }` sem `select` (orçamento, fluxo por dimensão, titulo.ts), os campos já vêm: só trocar o `.map`. Em `listarBaixasPendentes` o select fica `{ id: true, statusAprovacao: true, ...SELECT_VALORES_BAIXA }` e, em `aprovacoes/page.tsx`, o `.map` vira `(b) => ({ id: b.id, statusAprovacao: b.statusAprovacao, ...valoresDaBaixa(b) })`. Repetir `tsc` até zerar. Por fim, `grep -rn "valorPago: Number" src/server` não deve achar mais nenhum cálculo de saldo.

- [ ] **Step 6: teste de serviço** em `baixa.test.ts`, dentro de `describe("baixa (fluxo de aprovação)")`:

```ts
test("baixa com desconto, aprovada, deixa a parcela PAGO e o lançamento com o valor pago", async () => {
  const parcela = await criarParcelaDeTeste(fixtureTesouraria, 1000);
  const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
    data: new Date(), valorPago: 950, valorJuros: 0, valorMulta: 0, valorDesconto: 50,
    contaBancariaId: fixtureTesouraria.contaBancariaId,
  });
  await aprovarBaixa(fixtureTesouraria.sessao, baixa.id);

  const atualizada = await prisma.parcela.findUniqueOrThrow({ where: { id: parcela.id } });
  expect(atualizada.status).toBe("PAGO");
  const lancamento = await prisma.lancamentoBancario.findFirstOrThrow({ where: { baixaId: baixa.id } });
  expect(Number(lancamento.valor)).toBe(950);
});
```

Rodar `npx vitest run src/server/services/baixa.test.ts` → PASS.

- [ ] **Step 7:** `npx vitest run src/server src/lib src/app` → tudo verde (testes de dashboard, orçamento, projeção, repasse etc. que montam baixas sem ajustes não mudam de resultado).

- [ ] **Step 8:** commit `fix(parcela): saldo e status usam o valor abatido da baixa`.

---

### Task 3: Migration que corrige o status gravado

**Files:**
- Create: `prisma/migrations/20261125130000_desconto_abate_parcela/migration.sql`

- [ ] **Step 1:** escrever o SQL (só dados; `schema.prisma` não muda):

```sql
-- Desconto abate o saldo da parcela (spec 2026-11-25-desconto-abate-parcela).
-- Recalcula PAGO x PARCIALMENTE_PAGO com o valor abatido das baixas aprovadas:
-- valorPago - valorJuros - valorMulta + valorDesconto. Parcela que fica sem nada
-- abatido é corrigida pela sincronização da lista de títulos.
WITH saldos AS (
  SELECT p."id",
         p."valorAtualizado" - COALESCE(SUM(b."valorPago" - b."valorJuros" - b."valorMulta" + b."valorDesconto"), 0) AS "saldo"
  FROM "parcelas" p
  LEFT JOIN "baixas" b ON b."parcelaId" = p."id" AND b."statusAprovacao" = 'APROVADO'
  WHERE p."status" IN ('PAGO', 'PARCIALMENTE_PAGO')
  GROUP BY p."id"
)
UPDATE "parcelas" p
SET "status" = CASE WHEN s."saldo" <= 0 THEN 'PAGO'::"StatusParcela" ELSE 'PARCIALMENTE_PAGO'::"StatusParcela" END,
    "atualizadoEm" = NOW()
FROM saldos s
WHERE s."id" = p."id"
  AND s."saldo" < p."valorAtualizado"
  AND p."status" <> CASE WHEN s."saldo" <= 0 THEN 'PAGO'::"StatusParcela" ELSE 'PARCIALMENTE_PAGO'::"StatusParcela" END;
```

Conferir em `prisma/schema.prisma` o nome do enum (`StatusParcela`) e do status de aprovação (`APROVADO`) antes de aplicar.

- [ ] **Step 2:** aplicar no banco de desenvolvimento com `npx prisma migrate deploy` e, antes, criar à mão (via `psql` ou script em `.superpowers/tmp/`) uma parcela de 1000 com baixa aprovada 950 + desconto 50 e status `PARCIALMENTE_PAGO`; depois do deploy ela deve estar `PAGO`. Se a migration falhar, corrigir o SQL (não editar migrations antigas).

- [ ] **Step 3:** commit `fix(parcela): migration recalcula o status com o valor abatido`.

---

### Task 4: Prévia no diálogo "Registrar baixa"

**Files:**
- Modify: `src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.ts` (+ `.test.ts`)
- Modify: `src/app/(dashboard)/financeiro/_titulos/titulo-table.tsx` (tipo `ParcelaLinha`, prop `onAbrirBaixa`, botão ~300)
- Modify: `src/app/(dashboard)/financeiro/_titulos/contas-client-panel.tsx`
- Modify: `src/app/(dashboard)/financeiro/_titulos/baixa-dialog.tsx`
- Create: `src/lib/financeiro/previaDaBaixa.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: `valorAbatidoDaBaixa`, `MSG_BAIXA_SEM_ABATIMENTO`, `totalAbatido`.
- Produces:
  - parcela do cliente ganha `saldoEmAberto: number` (valorAtualizado − total abatido das aprovadas).
  - `onAbrirBaixa: (parcela: { id: string; saldoEmAberto: number }) => void`.
  - `BaixaDialog` troca `parcelaId: string | null` por `parcela: { id: string; saldoEmAberto: number } | null`.
  - `previaDaBaixa(saldoEmAberto: number, valores: { valorPago: string; valorJuros: string; valorMulta: string; valorDesconto: string }): { texto: string; erro: boolean } | null` — `null` enquanto o valor pago estiver vazio.

- [ ] **Step 1: testes** `previaDaBaixa.test.ts` (normalizar NBSP como em `avisosDaBaixa.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { previaDaBaixa } from "./previaDaBaixa";

const semNbsp = (t: string) => t.replace(/ /g, " ");
const v = (valorPago: string, valorJuros = "0", valorMulta = "0", valorDesconto = "0") => ({ valorPago, valorJuros, valorMulta, valorDesconto });

describe("previaDaBaixa", () => {
  it("sem valor pago, sem prévia", () => expect(previaDaBaixa(1000, v(""))).toBeNull());
  it("quita com desconto", () =>
    expect(semNbsp(previaDaBaixa(1000, v("950", "0", "0", "50"))!.texto)).toBe("Abate R$ 1.000,00 da parcela · fica R$ 0,00 em aberto"));
  it("parcial", () =>
    expect(semNbsp(previaDaBaixa(1000, v("400"))!.texto)).toBe("Abate R$ 400,00 da parcela · fica R$ 600,00 em aberto"));
  it("acima do saldo", () =>
    expect(semNbsp(previaDaBaixa(1000, v("1100"))!.texto)).toBe("Abate R$ 1.100,00 da parcela · R$ 100,00 acima do saldo"));
  it("não abate nada: erro com a mensagem da recusa", () =>
    expect(previaDaBaixa(1000, v("20", "30"))).toEqual({ texto: "Juros e multa não podem ser maiores que o valor pago mais o desconto", erro: true }));
  it("campo vazio de ajuste conta como zero", () =>
    expect(semNbsp(previaDaBaixa(1000, v("1000", "", "", ""))!.texto)).toBe("Abate R$ 1.000,00 da parcela · fica R$ 0,00 em aberto"));
});
```

- [ ] **Step 2:** rodar → FAIL.

- [ ] **Step 3: implementação** `previaDaBaixa.ts`:

```ts
import { formatarMoeda } from "@/lib/formatacao";
import { MSG_BAIXA_SEM_ABATIMENTO, valorAbatidoDaBaixa } from "./valorAbatido";

type CamposDaBaixa = { valorPago: string; valorJuros: string; valorMulta: string; valorDesconto: string };
const num = (texto: string) => (texto.trim() === "" ? 0 : Number(texto));
const centavos = (valor: number) => Math.round(valor * 100);

/** Texto abaixo dos campos do diálogo: quanto a baixa tira da parcela e o que sobra. */
export function previaDaBaixa(saldoEmAberto: number, campos: CamposDaBaixa): { texto: string; erro: boolean } | null {
  if (campos.valorPago.trim() === "") return null;
  const valores = {
    valorPago: num(campos.valorPago), valorJuros: num(campos.valorJuros),
    valorMulta: num(campos.valorMulta), valorDesconto: num(campos.valorDesconto),
  };
  if (Object.values(valores).some((n) => Number.isNaN(n))) return null;
  const abatido = valorAbatidoDaBaixa(valores);
  if (abatido <= 0) return { texto: MSG_BAIXA_SEM_ABATIMENTO, erro: true };
  const resto = (centavos(saldoEmAberto) - centavos(abatido)) / 100;
  const depois = resto >= 0 ? `fica ${formatarMoeda(resto)} em aberto` : `${formatarMoeda(-resto)} acima do saldo`;
  return { texto: `Abate ${formatarMoeda(abatido)} da parcela · ${depois}`, erro: false };
}
```

- [ ] **Step 4:** rodar → PASS.

- [ ] **Step 5: `saldoEmAberto` no cliente.** Em `titulos-para-cliente.ts`, no map da parcela:

```ts
saldoEmAberto:
  numero(parcela.valorAtualizado) -
  totalAbatido(parcela.baixas.filter((b) => b.statusAprovacao === "APROVADO").map((b) => ({
    valorPago: numero(b.valorPago), valorJuros: numero(b.valorJuros),
    valorMulta: numero(b.valorMulta), valorDesconto: numero(b.valorDesconto),
  }))),
```

No teste existente (`toEqual` da parcela sem baixas) acrescentar `saldoEmAberto: 150.25`, e um teste novo: parcela de `valorAtualizado` 1000 com uma baixa `APROVADO` 950 + desconto 50 e uma `REJEITADO` 999 → `saldoEmAberto: 0`. Rodar o teste → PASS.

- [ ] **Step 6: fiação.** `titulo-table.tsx`: `ParcelaLinha` ganha `saldoEmAberto: number`; a prop vira `onAbrirBaixa: (parcela: { id: string; saldoEmAberto: number }) => void`; o botão chama `onAbrirBaixa({ id: parcela.id, saldoEmAberto: parcela.saldoEmAberto })`. `contas-client-panel.tsx`: `useState<{ id: string; saldoEmAberto: number } | null>(null)` e passa `parcela={parcelaBaixa}`, `aberto={parcelaBaixa !== null}`. `baixa-dialog.tsx`: prop `parcela`, `registrarBaixaAction.bind(null, tipo, parcela?.id ?? "")`.

- [ ] **Step 7: prévia no diálogo.** Em `baixa-dialog.tsx`, guardar os quatro campos em estado (`useState({ valorPago: "", valorJuros: "0", valorMulta: "0", valorDesconto: "0" })`), tornar os `Input` controlados (`value` + `onChange`), zerar o estado ao abrir outra parcela (`key={parcela?.id}` no `<form>` ou reset no `useEffect` de `aberto`), e logo depois da grade de juros/multa/desconto:

```tsx
{previa ? (
  <p data-testid="previa-baixa" className={previa.erro ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
    {previa.texto}
  </p>
) : null}
```

com `const previa = parcela ? previaDaBaixa(parcela.saldoEmAberto, campos) : null;`. O envio continua pelo `formAction` (os `name` ficam).

- [ ] **Step 8:** `npx tsc --noEmit` e `npx vitest run "src/app/(dashboard)/financeiro" src/lib/financeiro` → verdes.

- [ ] **Step 9:** commit `feat(baixa): prévia do que a baixa abate da parcela`.

---

### Task 5: Ajuda, API, backlog e spec

**Files:**
- Modify: `src/ajuda/contas-a-pagar/roteiros.ts` (roteiro `pagar-parcela`, passos `baixa.valorPago` e `baixa.juros`)
- Modify: `src/ajuda/contas-a-receber/roteiros.ts` (roteiro `receber-parcela`, mesmos passos)
- Modify: `src/ajuda/_titulos/cenas.tsx` (`CenaBaixa`), `src/ajuda/_titulos/alvos.ts`, `src/ajuda/_titulos/cenas.test.ts`
- Modify: `docs/api-v1.md` (`POST /baixas`), `docs/backlog.md` (item 1), spec (status)

- [ ] **Step 1: cena.** `alvos.ts`: acrescentar `"baixa.previa"` depois de `"baixa.desconto"`. `CenaBaixa`, logo depois da grade de juros/multa/desconto:

```tsx
{valores["baixa.previa"] ? (
  <Alvo nome="baixa.previa">
    <p className="text-sm text-muted-foreground">{valores["baixa.previa"]}</p>
  </Alvo>
) : null}
```

Teste em `cenas.test.ts`: `html(CenaBaixa, { "baixa.previa": "Abate R$ 1.000,00 da parcela · fica R$ 0,00 em aberto" })` contém o texto e `data-alvo="baixa.previa"`; sem o valor, não contém `baixa.previa`.

- [ ] **Step 2: roteiros de Contas a pagar** (`pagar-parcela`):
  - passo `baixa.valorPago`, nova `dica`: `"Teve desconto? Informe no Valor pago o que de fato saiu da conta e o desconto no campo Desconto: parcela de R$ 1.000,00 paga com R$ 50,00 de desconto fica Valor pago 950,00 e Desconto 50,00. O sistema soma o desconto e a parcela fica paga."`
  - passo `baixa.juros`, nova `explicacao`: `"O sistema usa esses campos para saber quanto da parcela foi quitado: valor pago, menos juros e multa, mais o desconto. No exemplo, R$ 12,00 vão em Juros e a baixa quita os R$ 1.000,00 da parcela. Multa e Desconto ficam em 0 quando não existem. Abaixo dos campos aparece quanto a baixa abate e quanto fica em aberto."` e `preenche: { "baixa.juros": "12,00", "baixa.previa": "Abate R$ 1.000,00 da parcela · fica R$ 0,00 em aberto" }`.
- [ ] **Step 3: roteiros de Contas a receber** (`receber-parcela`), mesmos dois passos com os números do exemplo deles:
  - dica: `"Deu desconto ao cliente? Informe no Valor pago o que de fato entrou na conta e o desconto no campo Desconto: parcela de R$ 15.000,00 recebida com R$ 300,00 de desconto fica Valor pago 14700,00 e Desconto 300,00. O sistema soma o desconto e a parcela fica paga."`
  - explicação de juros: igual à de pagar, com "R$ 60,00 vão em Juros e a baixa quita os R$ 15.000,00 da parcela"; `preenche` com `"baixa.previa": "Abate R$ 15.000,00 da parcela · fica R$ 0,00 em aberto"`.
  - Conferir com `grep -rn "combine com o responsável" src/ajuda` que não sobrou nenhum.
- [ ] **Step 4:** `npx vitest run src/ajuda src/components/ajuda` → verde (há testes que conferem que todo `alvo` de roteiro existe nas cenas).
- [ ] **Step 5: `docs/api-v1.md`**, `POST /baixas`, depois da linha dos opcionais:

```md
- `valorPago` é o total que saiu ou entrou na conta, já com juros e multa e sem o desconto. A baixa aprovada quita da parcela `valorPago − valorJuros − valorMulta + valorDesconto`; o lançamento bancário fica com `valorPago`.
- Se `valorJuros + valorMulta` for maior ou igual a `valorPago + valorDesconto`, responde `400` ("Juros e multa não podem ser maiores que o valor pago mais o desconto").
```

Conferir em `src/server/api/executarRotaApi.ts` que `ZodError` vira 400 com a mensagem; se a mensagem não for repassada, ajustar o texto do doc ao que a API devolve.
- [ ] **Step 6: backlog.** Em `docs/backlog.md`, na seção `### 1. Desconto na baixa não abate o saldo da parcela`, seguir o padrão dos itens 2–5 (que ficam no backlog marcados como feitos): inserir logo abaixo do título `- **Status:** feito na branch \`fix/desconto-abate-parcela\` (2026-11-25, spec \`2026-11-25-desconto-abate-parcela-design.md\`): o saldo e o status usam pago − juros − multa + desconto; baixa que não abate nada é recusada; o diálogo mostra a prévia.`). Na spec, `Status: implementada (2026-11-25)`.
- [ ] **Step 7:** commit `docs(ajuda): desconto abate a parcela — ajuda, API e backlog`.

---

### Task 6: Verificação final

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` → tudo verde; anotar a saída.
- [ ] Navegador (dev server, login local — ver memória do ambiente): em Contas a pagar, abrir uma parcela de R$ 1.000,00, Baixar, digitar 950 e desconto 50 → prévia "Abate R$ 1.000,00 da parcela · fica R$ 0,00 em aberto"; juros 1000 → mensagem em vermelho; registrar com 950/50, aprovar com outro usuário → parcela PAGO, lançamento de R$ 950,00 na Tesouraria, parcela fora do Fluxo projetado.
- [ ] Ajuda: abrir o `?` de Contas a pagar, roteiro de pagar parcela, conferir a prévia na cena.
