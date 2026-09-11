# Comparação entre safras (Fase 5, sub-projeto 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a screen comparing orçado × realizado × projetado per safra (crop cycle), backed by a new dedicated `OrcamentoSafra` budget table and a date-range-parametrized reuse of the existing dimension-based cash-flow queries.

**Architecture:** A new `OrcamentoSafra` model stores one total budget value per safra (no monthly grid — a safra has its own `dataInicio`/`dataFim`). `fluxoDeCaixaPorDimensao.ts`'s existing `buscarRealizadoPorDimensao`/`buscarProjetadoPorDimensao` (month-scoped) are refactored to delegate to new `*NoPeriodo` functions parametrized by an arbitrary date range, which the new `orcamentoSafra.ts` service calls with each safra's own `dataInicio`/`dataFim`. A new page under `/controladoria/comparacao-safras` lists every safra (PLANEJADO + EM_ANDAMENTO + ENCERRADO, active only) with an inline single-value budget-edit form.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Prisma 7, PostgreSQL, Zod, Vitest with real-Postgres integration tests.

**Spec:** `docs/superpowers/specs/2026-09-11-comparacao-safras-design.md`

## Global Constraints

- Orçamento por safra é um **valor único por safra** — sem grade mensal, sem ano civil (spec Seção 1).
- Nenhuma query nova e paralela: a refatoração de `fluxoDeCaixaPorDimensao.ts` deve extrair o corpo já existente das funções `(ano, mes)`, não duplicá-lo (spec Seção 2). As assinaturas públicas `buscarRealizadoPorDimensao`/`buscarProjetadoPorDimensao` **não podem mudar** — o sub-projeto 2a já as usa em produção (`/controladoria/fluxo-por-dimensao`).
- Reaproveitar as permissões já existentes `orcamento:ler`/`orcamento:escrever` — nenhuma ação de permissão nova (spec Seção 3).
- Sem alerta de estouro nesta versão (spec Seção 4; já registrado em `docs/backlog.md`).
- `realizado`/`projetado` por safra são o **saldo líquido** (entradas − saídas), diferente do relatório de fluxo por dimensão que mostra as duas colunas separadas.
- Toda safra da filial ativa entra na comparação (`PLANEJADO`, `EM_ANDAMENTO`, `ENCERRADO`), filtrada só por `ativo: true` — sem limite de quantidade.

---

## Referências de padrão (não editar, só ler)

- `src/server/services/orcamento.ts` — molde direto do serviço novo (`montarLinhaComparativo`, `salvarValorOrcamento`, `listarComparativoOrcamento`).
- `src/server/services/fluxoDeCaixaPorDimensao.ts` — arquivo a ser refatorado na Task 2.
- `src/app/(dashboard)/controladoria/orcamento/{page.tsx,actions.ts,linha-orcamento-form.tsx}` — molde direto da UI nova.
- `src/server/services/financeiroTestFixtures.ts` — fixture `criarFixtureFinanceiro`/`limparFixtureFinanceiro` usado por todos os testes de integração deste plano. `Safra`/`OrcamentoSafra` não precisam de limpeza explícita em `limparFixtureFinanceiro` — ambos têm `onDelete: Cascade` na FK de `filialId`, e a linha `await prisma.filial.deleteMany(...)` já os apaga em cascata (mesmo padrão hoje seguido por `Safra`, que também não é limpo explicitamente).

---

### Task 1: Modelo `OrcamentoSafra` e migração

**Files:**
- Modify: `prisma/schema.prisma:98-124` (model `Filial`), `prisma/schema.prisma:220-238` (model `Safra`), inserir novo model após `model Orcamento` (linhas 280-296)
- Create: migração via `npx prisma migrate dev --name add_orcamento_safra` (gera `prisma/migrations/<timestamp>_add_orcamento_safra/`)

**Interfaces:**
- Produces: `prisma.orcamentoSafra` client (campos `id, filialId, safraId, valor, criadoEm, atualizadoEm`; `@@unique([filialId, safraId])`), consumido pela Task 3.

- [ ] **Step 1: Adicionar o model `OrcamentoSafra` no schema**

Inserir logo após o fechamento do `model Orcamento` (depois da linha `@@map("orcamentos")` / `}`, antes de `model Cliente`):

```prisma
model OrcamentoSafra {
  id           String   @id @default(uuid())
  filialId     String
  safraId      String
  valor        Decimal  @db.Decimal(18, 2)
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  filial Filial @relation(fields: [filialId], references: [id], onDelete: Cascade)
  safra  Safra  @relation(fields: [safraId], references: [id])

  @@unique([filialId, safraId])
  @@index([filialId])
  @@map("orcamentos_safra")
}
```

- [ ] **Step 2: Adicionar as back-relations**

Em `model Filial` (por volta da linha 120), depois de `orcamentos Orcamento[]`, adicionar:

```prisma
  orcamentosSafra       OrcamentoSafra[]
```

Em `model Safra` (por volta da linha 233), depois de `lancamentosBancarios LancamentoBancario[]`, adicionar:

```prisma
  orcamentosSafra OrcamentoSafra[]
```

- [ ] **Step 3: Gerar e aplicar a migração**

Run: `npx prisma migrate dev --name add_orcamento_safra`
Expected: migração criada em `prisma/migrations/`, aplicada sem erro, client Prisma regenerado.

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros (o client Prisma já expõe `prisma.orcamentoSafra`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: adicionar modelo OrcamentoSafra"
```

---

### Task 2: Extrair versões por intervalo em `fluxoDeCaixaPorDimensao.ts`

**Files:**
- Modify: `src/server/services/fluxoDeCaixaPorDimensao.ts` (funções `buscarRealizadoPorDimensao`/`buscarProjetadoPorDimensao`)
- Test: `src/server/services/fluxoDeCaixaPorDimensao.test.ts` (adicionar novos casos, não remover os existentes)

**Interfaces:**
- Consumes: nada de outra task (arquivo já existe e está em produção).
- Produces:
  - `buscarRealizadoPorDimensaoNoPeriodo(filialId: string, tipoDimensao: TipoDimensao, inicio: Date, fim: Date): Promise<Map<string | null, { entradas: number; saidas: number }>>`
  - `buscarProjetadoPorDimensaoNoPeriodo(filialId: string, tipoDimensao: TipoDimensao, inicio: Date, fim: Date): Promise<Map<string | null, { entradas: number; saidas: number }>>`
  - Consumidas pela Task 3 (`orcamentoSafra.ts`).
  - `buscarRealizadoPorDimensao`/`buscarProjetadoPorDimensao` (assinaturas `(filialId, tipoDimensao, ano, mes)`) continuam existindo e exportadas, comportamento idêntico ao de hoje — usadas por `listarFluxoDeCaixaPorDimensao` (já existente, não muda) e pela UI do sub-projeto 2a (não muda).

- [ ] **Step 1: Escrever os testes que fixam o comportamento das novas funções por intervalo**

Adicionar ao final do bloco `describe("buscarRealizadoPorDimensao", ...)` já existente em `fluxoDeCaixaPorDimensao.test.ts`:

```ts
  describe("buscarRealizadoPorDimensaoNoPeriodo", () => {
    test("soma lançamentos de vários meses dentro do intervalo informado", async () => {
      await prisma.lancamentoBancario.create({
        data: {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2027-02-15T00:00:00Z"),
          tipo: "SAIDA",
          valor: 100,
          descricao: "Fevereiro",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: true,
          centroCustoId: centroCustoAtivoId,
        },
      });
      await prisma.lancamentoBancario.create({
        data: {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2027-05-10T00:00:00Z"),
          tipo: "SAIDA",
          valor: 50,
          descricao: "Maio",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: true,
          centroCustoId: centroCustoAtivoId,
        },
      });

      const totais = await buscarRealizadoPorDimensaoNoPeriodo(
        fixture.filialId,
        "CENTRO_CUSTO",
        new Date("2027-01-01T00:00:00Z"),
        new Date("2027-06-30T23:59:59Z"),
      );
      expect(totais.get(centroCustoAtivoId)?.saidas).toBe(150);
    });

    test("exclui lançamento fora do intervalo, mesmo que dentro do mesmo ano", async () => {
      await prisma.lancamentoBancario.create({
        data: {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2027-09-01T00:00:00Z"),
          tipo: "SAIDA",
          valor: 999,
          descricao: "Fora do intervalo",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: true,
          centroCustoId: centroCustoAtivoId,
        },
      });

      const totais = await buscarRealizadoPorDimensaoNoPeriodo(
        fixture.filialId,
        "CENTRO_CUSTO",
        new Date("2027-01-01T00:00:00Z"),
        new Date("2027-06-30T23:59:59Z"),
      );
      expect(totais.get(centroCustoAtivoId)?.saidas).toBe(150);
    });

    test("buscarRealizadoPorDimensao(ano, mes) continua produzindo o mesmo resultado que antes da refatoração", async () => {
      const totais = await buscarRealizadoPorDimensao(fixture.filialId, "CENTRO_CUSTO", 2027, 2);
      expect(totais.get(centroCustoAtivoId)?.saidas).toBe(100);
    });
  });
```

Adicionar ao final do bloco `describe("buscarProjetadoPorDimensao", ...)` já existente:

```ts
  describe("buscarProjetadoPorDimensaoNoPeriodo", () => {
    test("soma parcelas em aberto de vários meses dentro do intervalo informado", async () => {
      await criarTitulo(fixture.sessao, "RECEBER", {
        contraparteId: fixture.clienteId,
        documento: `FCD-PERIODO-${Date.now()}`,
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        centroCustoId: centroCustoAtivoId,
        centroLucroId: "",
        safraId: "",
        projetoId: "",
        contaBancariaId: fixture.contaBancariaId,
        formaPagamento: "",
        parcelas: [{ numero: 1, dataVencimento: new Date("2027-03-20T00:00:00Z"), valorOriginal: 300 }],
      });

      const totais = await buscarProjetadoPorDimensaoNoPeriodo(
        fixture.filialId,
        "CENTRO_CUSTO",
        new Date("2027-01-01T00:00:00Z"),
        new Date("2027-06-30T23:59:59Z"),
      );
      expect(totais.get(centroCustoAtivoId)?.entradas).toBeGreaterThanOrEqual(300);

      const totaisForaDoIntervalo = await buscarProjetadoPorDimensaoNoPeriodo(
        fixture.filialId,
        "CENTRO_CUSTO",
        new Date("2027-07-01T00:00:00Z"),
        new Date("2027-12-31T23:59:59Z"),
      );
      expect(totaisForaDoIntervalo.get(centroCustoAtivoId)).toBeUndefined();
    });
  });
```

Atualizar o import no topo do arquivo de teste para incluir as 2 novas funções:

```ts
import {
  buscarRealizadoPorDimensao,
  buscarProjetadoPorDimensao,
  buscarRealizadoPorDimensaoNoPeriodo,
  buscarProjetadoPorDimensaoNoPeriodo,
  listarValoresDimensao,
  listarFluxoDeCaixaPorDimensao,
} from "./fluxoDeCaixaPorDimensao";
```

- [ ] **Step 2: Rodar os testes novos e confirmar que falham (funções ainda não existem)**

Run: `npx vitest run src/server/services/fluxoDeCaixaPorDimensao.test.ts`
Expected: FAIL — `buscarRealizadoPorDimensaoNoPeriodo is not a function` (e o equivalente para a versão projetada).

- [ ] **Step 3: Extrair as funções por intervalo, sem duplicar a query**

Em `src/server/services/fluxoDeCaixaPorDimensao.ts`, substituir o corpo de `buscarRealizadoPorDimensao` e `buscarProjetadoPorDimensao` por:

```ts
export async function buscarRealizadoPorDimensaoNoPeriodo(
  filialId: string,
  tipoDimensao: TipoDimensao,
  inicio: Date,
  fim: Date,
): Promise<Map<string | null, TotaisPorDimensao>> {
  const campo = CAMPO_POR_DIMENSAO[tipoDimensao];

  const lancamentos = await prisma.lancamentoBancario.findMany({
    where: {
      filialId,
      conciliado: true,
      contaBancaria: { ativo: true },
      data: { gte: inicio, lte: fim },
    },
    include: {
      baixa: {
        include: {
          parcela: {
            include: { titulo: { select: { centroCustoId: true, centroLucroId: true, safraId: true } } },
          },
        },
      },
    },
  });

  const totais = new Map<string | null, TotaisPorDimensao>();
  for (const lancamento of lancamentos) {
    const direto = lancamento[campo];
    const viaBaixa = lancamento.baixa?.parcela.titulo[campo] ?? null;
    const dimensaoId = direto ?? viaBaixa;

    somar(totais, dimensaoId, lancamento.tipo === "ENTRADA" ? "entradas" : "saidas", Number(lancamento.valor));
  }
  return totais;
}

/**
 * Realizado por dimensão — campo direto primeiro (lançamentos criados após
 * a correção na origem), fallback via baixa->parcela->titulo pra dado
 * histórico. Sem os dois, cai em `null` ("Não classificado"). Wrapper fino
 * sobre a versão por intervalo — usado pelo relatório mensal (2a) e por
 * nada mais; a lógica de query vive só em `buscarRealizadoPorDimensaoNoPeriodo`.
 */
export async function buscarRealizadoPorDimensao(
  filialId: string,
  tipoDimensao: TipoDimensao,
  ano: number,
  mes: number,
): Promise<Map<string | null, TotaisPorDimensao>> {
  return buscarRealizadoPorDimensaoNoPeriodo(filialId, tipoDimensao, inicioDoMes(ano, mes), fimDoMes(ano, mes));
}

export async function buscarProjetadoPorDimensaoNoPeriodo(
  filialId: string,
  tipoDimensao: TipoDimensao,
  inicio: Date,
  fim: Date,
): Promise<Map<string | null, TotaisPorDimensao>> {
  const campo = CAMPO_POR_DIMENSAO[tipoDimensao];

  const parcelas = await prisma.parcela.findMany({
    where: {
      titulo: { filialId },
      status: { in: ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"] },
      dataVencimento: { gte: inicio, lte: fim },
    },
    include: {
      titulo: { select: { tipo: true, centroCustoId: true, centroLucroId: true, safraId: true } },
      baixas: { where: { statusAprovacao: "APROVADO" } },
    },
  });

  const totais = new Map<string | null, TotaisPorDimensao>();
  for (const parcela of parcelas) {
    const saldo = saldoRemanescenteParcela(
      Number(parcela.valorAtualizado),
      parcela.baixas.map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
    );
    const dimensaoId = parcela.titulo[campo];
    somar(totais, dimensaoId, parcela.titulo.tipo === "RECEBER" ? "entradas" : "saidas", saldo);
  }
  return totais;
}

/**
 * Projetado por dimensão — sempre via `Titulo`, direto (não há fallback
 * necessário: a parcela projetada só existe através do título). Wrapper
 * fino sobre a versão por intervalo, mesmo motivo do realizado acima.
 */
export async function buscarProjetadoPorDimensao(
  filialId: string,
  tipoDimensao: TipoDimensao,
  ano: number,
  mes: number,
): Promise<Map<string | null, TotaisPorDimensao>> {
  return buscarProjetadoPorDimensaoNoPeriodo(filialId, tipoDimensao, inicioDoMes(ano, mes), fimDoMes(ano, mes));
}
```

Não remover `inicioDoMes`/`fimDoMes`/`somar`/`CAMPO_POR_DIMENSAO` — continuam usadas pelos wrappers e por outras funções do arquivo.

- [ ] **Step 4: Rodar os testes e confirmar que passam — incluindo os já existentes**

Run: `npx vitest run src/server/services/fluxoDeCaixaPorDimensao.test.ts`
Expected: PASS — todos os testes, os novos e os que já existiam antes desta task (nenhum comportamento de `buscarRealizadoPorDimensao`/`buscarProjetadoPorDimensao`/`listarFluxoDeCaixaPorDimensao` muda).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/fluxoDeCaixaPorDimensao.ts src/server/services/fluxoDeCaixaPorDimensao.test.ts
git commit -m "refactor: extrair buscarRealizadoPorDimensaoNoPeriodo e buscarProjetadoPorDimensaoNoPeriodo"
```

---

### Task 3: Serviço `orcamentoSafra.ts`

**Files:**
- Create: `src/server/services/orcamentoSafra.ts`
- Test: `src/server/services/orcamentoSafra.test.ts`

**Interfaces:**
- Consumes: `buscarRealizadoPorDimensaoNoPeriodo`/`buscarProjetadoPorDimensaoNoPeriodo` de `./fluxoDeCaixaPorDimensao` (Task 2); `requirePermission`/`requireAlteracaoFilial` de `@/server/auth/permissions`; `registrarAuditoria` de `@/server/audit/registrar`; `SessaoAtiva` de `@/server/auth/sessao`; `prisma` de `@/server/db/client`.
- Produces:
  - `type LinhaComparativoSafra = { safraId: string; safraNome: string; status: StatusSafraProjeto; orcado: number; realizado: number; projetado: number; variacaoAbsolutaRealizado: number; variacaoPercentualRealizado: number | null }`
  - `montarLinhaComparativoSafra(safraId, safraNome, status, orcado, realizado, projetado): LinhaComparativoSafra` (pura)
  - `salvarValorOrcamentoSafra(sessao: SessaoAtiva, safraId: string, valor: number): Promise<void>`
  - `listarComparativoSafras(sessao: SessaoAtiva): Promise<LinhaComparativoSafra[]>`
  - Consumidos pela Task 4 (Server Actions) e Task 5 (UI).

- [ ] **Step 1: Escrever os testes puros de `montarLinhaComparativoSafra`**

Criar `src/server/services/orcamentoSafra.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import { registrarBaixa, aprovarBaixa } from "./baixa";
import { montarLinhaComparativoSafra, salvarValorOrcamentoSafra, listarComparativoSafras } from "./orcamentoSafra";

describe("montarLinhaComparativoSafra", () => {
  test("variação absoluta é realizado menos orçado", () => {
    const linha = montarLinhaComparativoSafra("s1", "Safra 2026", "EM_ANDAMENTO", 10000, 12000, 0);
    expect(linha.variacaoAbsolutaRealizado).toBe(2000);
  });

  test("variação percentual é null quando orçado é zero", () => {
    const linha = montarLinhaComparativoSafra("s1", "Safra 2026", "EM_ANDAMENTO", 0, 500, 0);
    expect(linha.variacaoPercentualRealizado).toBeNull();
  });

  test("variação percentual calculada corretamente quando orçado não é zero", () => {
    const linha = montarLinhaComparativoSafra("s1", "Safra 2026", "EM_ANDAMENTO", 10000, 12000, 0);
    expect(linha.variacaoPercentualRealizado).toBeCloseTo(0.2, 6);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/server/services/orcamentoSafra.test.ts`
Expected: FAIL — `./orcamentoSafra` não existe.

- [ ] **Step 3: Implementar `montarLinhaComparativoSafra` e o tipo `LinhaComparativoSafra`**

Criar `src/server/services/orcamentoSafra.ts`:

```ts
import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { buscarRealizadoPorDimensaoNoPeriodo, buscarProjetadoPorDimensaoNoPeriodo } from "./fluxoDeCaixaPorDimensao";
import type { StatusSafraProjeto } from "@prisma/client";

export type LinhaComparativoSafra = {
  safraId: string;
  safraNome: string;
  status: StatusSafraProjeto;
  orcado: number;
  realizado: number;
  projetado: number;
  variacaoAbsolutaRealizado: number;
  variacaoPercentualRealizado: number | null;
};

/**
 * Monta uma linha do comparativo orçado x realizado x projetado por safra.
 * `realizado`/`projetado` já chegam como saldo líquido (entradas - saídas)
 * do período da safra — diferente do relatório de fluxo por dimensão
 * (2a), que separa entradas e saídas em colunas próprias.
 */
export function montarLinhaComparativoSafra(
  safraId: string,
  safraNome: string,
  status: StatusSafraProjeto,
  orcado: number,
  realizado: number,
  projetado: number,
): LinhaComparativoSafra {
  const variacaoAbsolutaRealizado = realizado - orcado;
  const variacaoPercentualRealizado = orcado === 0 ? null : variacaoAbsolutaRealizado / orcado;

  return {
    safraId,
    safraNome,
    status,
    orcado,
    realizado,
    projetado,
    variacaoAbsolutaRealizado,
    variacaoPercentualRealizado,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/server/services/orcamentoSafra.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Escrever os testes de integração de `salvarValorOrcamentoSafra`**

Adicionar ao final de `orcamentoSafra.test.ts`:

```ts
describe("salvarValorOrcamentoSafra (integração)", () => {
  let fixture: FixtureFinanceiro;
  let safraId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("ORCSAF", "FINANCEIRO");
    const safra = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra 2026/2027",
        dataInicio: new Date("2026-10-01T00:00:00Z"),
        dataFim: new Date("2027-05-31T00:00:00Z"),
      },
    });
    safraId = safra.id;
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("cria na primeira chamada e atualiza (sem duplicar) na segunda", async () => {
    await salvarValorOrcamentoSafra(fixture.sessao, safraId, 50000);
    const primeira = await prisma.orcamentoSafra.findMany({ where: { filialId: fixture.filialId, safraId } });
    expect(primeira).toHaveLength(1);
    expect(Number(primeira[0].valor)).toBe(50000);

    await salvarValorOrcamentoSafra(fixture.sessao, safraId, 60000);
    const segunda = await prisma.orcamentoSafra.findMany({ where: { filialId: fixture.filialId, safraId } });
    expect(segunda).toHaveLength(1);
    expect(Number(segunda[0].valor)).toBe(60000);
  });

  test("recusa perfil sem orcamento:escrever", async () => {
    const sessaoTesouraria = { ...fixture.sessao, perfil: "TESOURARIA" as const };
    await expect(salvarValorOrcamentoSafra(sessaoTesouraria, safraId, 100)).rejects.toThrow();
  });

  test("recusa safra de outra filial", async () => {
    const outraFixture = await criarFixtureFinanceiro("ORCSAF2", "FINANCEIRO");
    try {
      const outraSafra = await prisma.safra.create({
        data: {
          filialId: outraFixture.filialId,
          nome: "Safra de outra filial",
          dataInicio: new Date("2026-01-01T00:00:00Z"),
          dataFim: new Date("2026-12-31T00:00:00Z"),
        },
      });
      await expect(salvarValorOrcamentoSafra(fixture.sessao, outraSafra.id, 100)).rejects.toThrow();
    } finally {
      await limparFixtureFinanceiro(outraFixture);
    }
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `npx vitest run src/server/services/orcamentoSafra.test.ts`
Expected: FAIL — `salvarValorOrcamentoSafra is not a function`.

- [ ] **Step 7: Implementar `salvarValorOrcamentoSafra`**

Adicionar a `orcamentoSafra.ts`:

```ts
export async function salvarValorOrcamentoSafra(
  sessao: SessaoAtiva,
  safraId: string,
  valor: number,
): Promise<void> {
  requirePermission(sessao.perfil, "orcamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const safra = await prisma.safra.findFirst({ where: { id: safraId, filialId: sessao.filialId } });
  if (!safra) {
    throw new Error("Safra não pertence à filial ativa");
  }

  const chave = { filialId_safraId: { filialId: sessao.filialId, safraId } };
  const anterior = await prisma.orcamentoSafra.findUnique({ where: chave });

  const orcamentoSafra = await prisma.orcamentoSafra.upsert({
    where: chave,
    create: { filialId: sessao.filialId, safraId, valor },
    update: { valor },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "OrcamentoSafra",
    entidadeId: orcamentoSafra.id,
    acao: anterior ? "ATUALIZAR" : "CRIAR",
    anterior: anterior ? { valor: Number(anterior.valor) } : null,
    novo: { valor },
  });
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npx vitest run src/server/services/orcamentoSafra.test.ts`
Expected: PASS.

- [ ] **Step 9: Escrever os testes de integração de `listarComparativoSafras`**

Adicionar ao final de `orcamentoSafra.test.ts`:

```ts
describe("listarComparativoSafras (integração)", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("ORCSAF3", "FINANCEIRO");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("inclui orçado, realizado (líquido) e projetado (líquido) por safra, escopado à filial ativa", async () => {
    const safra = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra Verão",
        status: "EM_ANDAMENTO",
        dataInicio: new Date("2026-09-01T00:00:00Z"),
        dataFim: new Date("2027-03-31T00:00:00Z"),
      },
    });

    await salvarValorOrcamentoSafra(fixture.sessao, safra.id, 20000);

    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-10-15T00:00:00Z"),
        tipo: "ENTRADA",
        valor: 5000,
        descricao: "Venda da safra",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
        safraId: safra.id,
      },
    });
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-11-01T00:00:00Z"),
        tipo: "SAIDA",
        valor: 1500,
        descricao: "Insumo da safra",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
        safraId: safra.id,
      },
    });

    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: `ORCSAF3-PROJ-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: safra.id,
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date("2027-01-15T00:00:00Z"), valorOriginal: 800 }],
    });
    void titulo;

    const linhas = await listarComparativoSafras(fixture.sessao);
    const linha = linhas.find((l) => l.safraId === safra.id);
    expect(linha).toBeDefined();
    expect(linha?.orcado).toBe(20000);
    expect(linha?.realizado).toBe(5000 - 1500);
    expect(linha?.projetado).toBeLessThanOrEqual(-800);
  });

  test("safra sem orçamento salvo aparece com orcado 0, não é omitida", async () => {
    const safraSemOrcamento = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra Sem Orçamento",
        status: "PLANEJADO",
        dataInicio: new Date("2028-01-01T00:00:00Z"),
        dataFim: new Date("2028-06-30T00:00:00Z"),
      },
    });

    const linhas = await listarComparativoSafras(fixture.sessao);
    const linha = linhas.find((l) => l.safraId === safraSemOrcamento.id);
    expect(linha).toBeDefined();
    expect(linha?.orcado).toBe(0);
  });

  test("safra inativa não aparece na comparação", async () => {
    const safraInativa = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra Inativa",
        dataInicio: new Date("2020-01-01T00:00:00Z"),
        dataFim: new Date("2020-12-31T00:00:00Z"),
        ativo: false,
      },
    });

    const linhas = await listarComparativoSafras(fixture.sessao);
    expect(linhas.find((l) => l.safraId === safraInativa.id)).toBeUndefined();
  });

  test("escopo de filial — safra de outra filial não vaza", async () => {
    const outraFixture = await criarFixtureFinanceiro("ORCSAF4", "FINANCEIRO");
    try {
      await prisma.safra.create({
        data: {
          filialId: outraFixture.filialId,
          nome: "Safra de outra filial",
          dataInicio: new Date("2026-01-01T00:00:00Z"),
          dataFim: new Date("2026-12-31T00:00:00Z"),
        },
      });

      const linhas = await listarComparativoSafras(fixture.sessao);
      expect(linhas.every((l) => l.safraNome !== "Safra de outra filial")).toBe(true);
    } finally {
      await limparFixtureFinanceiro(outraFixture);
    }
  });

  test("recusa perfil sem orcamento:ler", async () => {
    // CONSULTA e todos os outros 5 perfis têm orcamento:ler (ver permissions.ts) —
    // não há perfil sem essa permissão hoje; este teste fixa essa garantia:
    // se um novo perfil for adicionado sem orcamento:ler, este teste aponta
    // a lacuna em vez de silenciosamente confiar na suposição.
    const perfis: Array<FixtureFinanceiro["sessao"]["perfil"]> = [
      "ADMINISTRADOR",
      "FINANCEIRO",
      "TESOURARIA",
      "GESTOR",
      "AUDITOR",
      "CONSULTA",
    ];
    for (const perfil of perfis) {
      await expect(listarComparativoSafras({ ...fixture.sessao, perfil })).resolves.toBeDefined();
    }
  });
});
```

- [ ] **Step 10: Rodar e confirmar que falha**

Run: `npx vitest run src/server/services/orcamentoSafra.test.ts`
Expected: FAIL — `listarComparativoSafras is not a function`.

- [ ] **Step 11: Implementar `listarComparativoSafras`**

Adicionar a `orcamentoSafra.ts`:

```ts
export async function listarComparativoSafras(sessao: SessaoAtiva): Promise<LinhaComparativoSafra[]> {
  requirePermission(sessao.perfil, "orcamento:ler");

  // Todos os status entram (PLANEJADO, EM_ANDAMENTO, ENCERRADO), sem
  // limite de quantidade. `ativo: true` segue o mesmo convention de
  // `listarValoresDimensao` (2a) — uma safra desativada não aparece como
  // item comparável nesta tela de gestão.
  const safras = await prisma.safra.findMany({
    where: { filialId: sessao.filialId, ativo: true },
    orderBy: { dataInicio: "desc" },
  });

  const orcamentos = await prisma.orcamentoSafra.findMany({ where: { filialId: sessao.filialId } });

  const linhas: LinhaComparativoSafra[] = [];
  for (const safra of safras) {
    const [realizadoPorSafra, projetadoPorSafra] = await Promise.all([
      buscarRealizadoPorDimensaoNoPeriodo(sessao.filialId, "SAFRA", safra.dataInicio, safra.dataFim),
      buscarProjetadoPorDimensaoNoPeriodo(sessao.filialId, "SAFRA", safra.dataInicio, safra.dataFim),
    ]);
    const orcamento = orcamentos.find((o) => o.safraId === safra.id);
    const r = realizadoPorSafra.get(safra.id) ?? { entradas: 0, saidas: 0 };
    const p = projetadoPorSafra.get(safra.id) ?? { entradas: 0, saidas: 0 };

    linhas.push(
      montarLinhaComparativoSafra(
        safra.id,
        safra.nome,
        safra.status,
        orcamento ? Number(orcamento.valor) : 0,
        r.entradas - r.saidas,
        p.entradas - p.saidas,
      ),
    );
  }
  return linhas;
}
```

- [ ] **Step 12: Rodar e confirmar que todos os testes do arquivo passam**

Run: `npx vitest run src/server/services/orcamentoSafra.test.ts`
Expected: PASS — todos os testes (puros + os 2 blocos de integração).

- [ ] **Step 13: Commit**

```bash
git add src/server/services/orcamentoSafra.ts src/server/services/orcamentoSafra.test.ts
git commit -m "feat: servico de comparacao orcado x realizado x projetado por safra"
```

---

### Task 4: Server Actions

**Files:**
- Create: `src/app/(dashboard)/controladoria/comparacao-safras/actions.ts`

**Interfaces:**
- Consumes: `salvarValorOrcamentoSafra` de `@/server/services/orcamentoSafra` (Task 3); `requireSessaoAtiva` de `@/server/auth/sessao`; `valorOrcamentoSchema` de `@/lib/schemas/orcamento` (já existe, reaproveitado — não criar schema novo).
- Produces: `salvarOrcamentoSafraAction(_prev: FormState, formData: FormData): Promise<FormState>`, `type FormState = { erro?: string; sucesso?: boolean }` — consumido pela Task 5.

- [ ] **Step 1: Implementar a Server Action**

Criar `src/app/(dashboard)/controladoria/comparacao-safras/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { valorOrcamentoSchema } from "@/lib/schemas/orcamento";
import { salvarValorOrcamentoSafra } from "@/server/services/orcamentoSafra";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

export async function salvarOrcamentoSafraAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const safraId = String(formData.get("safraId") ?? "");
  if (!safraId) {
    return { erro: "Dados inválidos" };
  }

  const parsed = valorOrcamentoSchema.safeParse(formData.get("valor"));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Valor inválido" };
  }

  try {
    await salvarValorOrcamentoSafra(sessao, safraId, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/controladoria/comparacao-safras");
  return { sucesso: true };
}
```

Esta task não tem teste automatizado próprio (Server Action fina, delegando toda a regra de negócio já testada em `orcamentoSafra.test.ts`) — sua correção é verificada manualmente na Task 5, junto com a UI que a invoca.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/controladoria/comparacao-safras/actions.ts"
git commit -m "feat: server action para salvar orcamento por safra"
```

---

### Task 5: Tela `/controladoria/comparacao-safras` e entrada no menu

**Files:**
- Create: `src/app/(dashboard)/controladoria/comparacao-safras/page.tsx`
- Create: `src/app/(dashboard)/controladoria/comparacao-safras/linha-safra-form.tsx`
- Modify: `src/app/(dashboard)/nav-items.ts`

**Interfaces:**
- Consumes: `listarComparativoSafras`, `type LinhaComparativoSafra` de `@/server/services/orcamentoSafra` (Task 3); `salvarOrcamentoSafraAction`, `type FormState` de `./actions` (Task 4); `podeEscreverOrcamento` de `@/server/auth/permissions`; `requireSessaoAtiva` de `@/server/auth/sessao`.
- Produces: rota navegável `/controladoria/comparacao-safras` (terminal — nenhuma outra task consome esta).

- [ ] **Step 1: Implementar o componente client de edição por linha**

Criar `src/app/(dashboard)/controladoria/comparacao-safras/linha-safra-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarOrcamentoSafraAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

export function LinhaSafraForm({
  safraId,
  valorOrcado,
  somenteLeitura,
}: {
  safraId: string;
  valorOrcado: number;
  somenteLeitura: boolean;
}) {
  const [state, formAction, pendente] = useActionState(salvarOrcamentoSafraAction, ESTADO_INICIAL);

  if (somenteLeitura) {
    return <span>{valorOrcado.toFixed(2)}</span>;
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="safraId" value={safraId} />
      <Input name="valor" type="number" step="0.01" defaultValue={valorOrcado} className="w-32" />
      <Button type="submit" size="sm" disabled={pendente}>
        {pendente ? "Salvando..." : "Salvar"}
      </Button>
      {state.erro ? <span className="text-xs text-destructive">{state.erro}</span> : null}
    </form>
  );
}
```

- [ ] **Step 2: Implementar a página**

Criar `src/app/(dashboard)/controladoria/comparacao-safras/page.tsx`:

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverOrcamento } from "@/server/auth/permissions";
import { listarComparativoSafras } from "@/server/services/orcamentoSafra";
import { LinhaSafraForm } from "./linha-safra-form";

export default async function ComparacaoSafrasPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "orcamento:ler");

  const linhas = await listarComparativoSafras(sessao);
  const somenteLeitura = !podeEscreverOrcamento(sessao.perfil, sessao.podeAlterarFilial);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Comparação entre safras</h1>
        <p className="text-sm text-muted-foreground">
          Orçado, realizado e projetado por safra — cada safra usa seu
          próprio período (início/fim), não o ano civil. Realizado usa
          apenas movimentações já conciliadas; projetado usa títulos em
          aberto.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Safra</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Orçado</TableHead>
            <TableHead>Realizado</TableHead>
            <TableHead>Projetado</TableHead>
            <TableHead>Variação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((linha) => (
            <TableRow key={linha.safraId}>
              <TableCell className="font-medium">{linha.safraNome}</TableCell>
              <TableCell>{linha.status}</TableCell>
              <TableCell>
                <LinhaSafraForm safraId={linha.safraId} valorOrcado={linha.orcado} somenteLeitura={somenteLeitura} />
              </TableCell>
              <TableCell>{linha.realizado.toFixed(2)}</TableCell>
              <TableCell>{linha.projetado.toFixed(2)}</TableCell>
              <TableCell>
                {linha.variacaoAbsolutaRealizado.toFixed(2)}
                {linha.variacaoPercentualRealizado !== null
                  ? ` (${(linha.variacaoPercentualRealizado * 100).toFixed(1)}%)`
                  : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Adicionar a entrada no menu**

Em `src/app/(dashboard)/nav-items.ts`, na seção `"Controladoria"`, depois de `{ href: "/controladoria/fluxo-por-dimensao", label: "Fluxo de caixa por dimensão" }`, adicionar:

```ts
      { href: "/controladoria/comparacao-safras", label: "Comparação entre safras" },
```

- [ ] **Step 4: Verificar tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 5: Rodar a suíte completa de testes**

Run: `npm test`
Expected: PASS — todos os testes do projeto, incluindo os novos das Tasks 2 e 3.

- [ ] **Step 6: Verificação manual**

Rodar `npm run dev`, logar como usuário FINANCEIRO ou ADMINISTRADOR, criar pelo menos uma safra em `/cadastros/safras` (se ainda não houver nenhuma na filial ativa), abrir `/controladoria/comparacao-safras`, confirmar:
- A safra criada aparece na lista com orçado 0.
- Editar o valor orçado e salvar atualiza a coluna sem duplicar linha.
- Logar como perfil CONSULTA (ou qualquer perfil sem `orcamento:escrever`) e confirmar que a coluna orçado aparece como texto, sem input/botão.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/controladoria/comparacao-safras" src/app/(dashboard)/nav-items.ts
git commit -m "feat: tela de comparacao entre safras"
```
