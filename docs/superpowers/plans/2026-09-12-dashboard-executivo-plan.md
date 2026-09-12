# Dashboard executivo (Fase 6, sub-projeto 6a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `/dashboard-executivo` screen with 9 financial indicators and 3 charts, all consolidated across every filial of the user's empresa, restricted to ADMINISTRADOR/GESTOR/AUDITOR.

**Architecture:** A new service `dashboardExecutivo.ts` reuses existing filial-scoped functions (`buscarSaldoEmCaixaAte`, `saldoRemanescenteParcela`) inside a loop over the empresa's filiais — the exact consolidation pattern already used by `buscarAnoBaseConsolidado` in `fluxoDeCaixaEstrategico.ts` — summing in memory rather than writing new duplicate queries. Charts are rendered with `recharts` (new dependency), through a small local `ChartContainer` wrapper. A new permission action gates the whole screen.

**Tech Stack:** Next.js 16 App Router (Server Components), Prisma 7, PostgreSQL, `recharts`, Vitest with real-Postgres integration tests.

**Spec:** `docs/superpowers/specs/2026-09-12-dashboard-executivo-design.md`

## Global Constraints

- Consolidado por **empresa** (soma todas as filiais de `sessao.empresaId`), não por filial ativa — mesmo padrão de `buscarAnoBaseConsolidado` (`fluxoDeCaixaEstrategico.ts`).
- Acesso restrito a `ADMINISTRADOR`/`GESTOR`/`AUDITOR` via nova ação de permissão `dashboardExecutivo:ler` — não os 6 perfis.
- Rota nova `/dashboard-executivo` — a `/` atual (`src/app/(dashboard)/page.tsx`) não é tocada por este plano.
- Sem cache, sem tabela nova — tudo calculado sob demanda a cada acesso à página.
- "Endividamento" e "necessidade de capital de giro" ficam fora de escopo (sem modelo de dados hoje).
- "Orçado x Realizado" e "Fluxo de caixa por dimensão" (gráficos) ficam fora de escopo (já registrados em `docs/backlog.md`) — não fazem parte deste plano.
- Todo indicador/gráfico usa as mesmas regras já estabelecidas: `saldoRemanescenteParcela` para saldo de parcela; status abertos = `["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"]`; realizado só conta `LancamentoBancario` com `conciliado: true` e `contaBancaria: { ativo: true }`.

---

## Referências de padrão (não editar, só ler)

- `src/server/services/fluxoDeCaixaEstrategico.ts` — `buscarAnoBaseConsolidado` (linhas 90-121) é o molde exato do padrão de consolidação por empresa (loop por filial, soma em memória).
- `src/server/services/fluxoDeCaixa.ts` — `buscarSaldoEmCaixaAte(filialId, data): Promise<number>`, `SubPeriodo`.
- `src/server/services/fluxoDeCaixaProjetado.ts` — `saldoRemanescenteParcela(valorAtualizado, baixasAprovadas): number` (pura, sem I/O).
- `src/server/auth/permissions.ts` — estrutura do `Acao` union e do `PERMISSOES` record.
- `src/app/(dashboard)/page.tsx` — molde do layout de cards (`Card`/`CardHeader`/`CardTitle`/`CardContent`).
- `src/app/(dashboard)/nav-items.ts` — estrutura de `NavSection`/`NavItem`.
- `src/server/services/financeiroTestFixtures.ts` — fixture `criarFixtureFinanceiro`/`limparFixtureFinanceiro` usada pelos testes de integração deste plano. Para testar consolidação entre filiais, criar uma segunda filial na mesma empresa via `prisma.filial.create({ data: { empresaId: fixture.empresaId, nome, cnpj } })` (não uma segunda fixture inteira, que criaria uma empresa nova).

---

### Task 1: Permissão `dashboardExecutivo:ler`

**Files:**
- Modify: `src/server/auth/permissions.ts`
- Test: `src/server/auth/permissions.test.ts`

**Interfaces:**
- Produces: ação de permissão `"dashboardExecutivo:ler"` no union `Acao`, concedida a `GESTOR` e `AUDITOR` (e a `ADMINISTRADOR`, que já é `"TODAS"`). Consumida pelas Tasks 3, 4 e 5.

- [ ] **Step 1: Escrever os testes que fixam quem tem a permissão**

Adicionar ao final de `src/server/auth/permissions.test.ts`:

```ts
describe("permissões de dashboard executivo", () => {
  test("ADMINISTRADOR, GESTOR e AUDITOR podem ler o dashboard executivo", () => {
    for (const perfil of ["ADMINISTRADOR", "GESTOR", "AUDITOR"] as const) {
      expect(() => requirePermission(perfil, "dashboardExecutivo:ler")).not.toThrow();
    }
  });

  test("FINANCEIRO, TESOURARIA e CONSULTA não acessam o dashboard executivo — é dado consolidado de toda a empresa, não só da filial do perfil", () => {
    for (const perfil of ["FINANCEIRO", "TESOURARIA", "CONSULTA"] as const) {
      expect(() => requirePermission(perfil, "dashboardExecutivo:ler")).toThrow(PermissionError);
    }
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/server/auth/permissions.test.ts`
Expected: FAIL — `dashboardExecutivo:ler` não existe no tipo `Acao`, erro de compilação/execução do teste.

- [ ] **Step 3: Adicionar a ação ao union `Acao`**

Em `src/server/auth/permissions.ts`, no `export type Acao = ...`, adicionar ao final da lista (antes do `;`):

```ts
  | "orcamento:escrever"
  | "dashboardExecutivo:ler";
```

(substitui a linha final atual `| "orcamento:escrever";`)

- [ ] **Step 4: Conceder a ação a `GESTOR` e `AUDITOR`**

No `Set` de `GESTOR`, adicionar `"dashboardExecutivo:ler",` (por exemplo, depois de `"orcamento:ler",`):

```ts
  GESTOR: new Set([
    "cadastro:ler",
    "auditoria:ler",
    "titulo:ler",
    "lancamento:ler",
    "conciliacao:ler",
    "planejamentoEstrategico:ler",
    "planejamentoEstrategico:escrever",
    "orcamento:ler",
    "dashboardExecutivo:ler",
  ]),
```

No `Set` de `AUDITOR`, mesma adição:

```ts
  AUDITOR: new Set([
    "cadastro:ler",
    "auditoria:ler",
    "titulo:ler",
    "lancamento:ler",
    "conciliacao:ler",
    "planejamentoEstrategico:ler",
    "orcamento:ler",
    "dashboardExecutivo:ler",
  ]),
```

Não adicionar a `FINANCEIRO`, `TESOURARIA` nem `CONSULTA`. `ADMINISTRADOR` já é `"TODAS"`, não precisa de alteração.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/server/auth/permissions.test.ts`
Expected: PASS — todos os testes do arquivo, incluindo os novos.

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/server/auth/permissions.ts src/server/auth/permissions.test.ts
git commit -m "feat: adicionar permissao dashboardExecutivo:ler"
```

---

### Task 2: Dependência `recharts` e wrapper `ChartContainer`

**Files:**
- Modify: `package.json` (via `npm install recharts`)
- Create: `src/components/ui/chart.tsx`

**Interfaces:**
- Produces: `ChartContainer({ children, className? }): JSX.Element` — wrapper client-side sobre `ResponsiveContainer` do `recharts`. Consumido pela Task 5.

- [ ] **Step 1: Instalar a dependência**

Run: `npm install recharts`
Expected: `recharts` adicionado a `dependencies` em `package.json` e ao lockfile, instalação sem erro.

- [ ] **Step 2: Criar o wrapper**

Criar `src/components/ui/chart.tsx`:

```tsx
"use client";

import { ResponsiveContainer } from "recharts";
import type { ReactElement } from "react";

export function ChartContainer({
  children,
  className = "h-64 w-full",
}: {
  children: ReactElement;
  className?: string;
}) {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}
```

Este arquivo não tem teste dedicado — é um wrapper de UI puro (sem lógica própria), verificado indiretamente pelos 3 gráficos que o consomem na Task 5 e por `tsc`/`lint`. Não existe nenhum arquivo `.test.tsx` neste projeto (todos os testes são de serviço, contra Postgres real) — não introduzir esse padrão aqui.

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/ui/chart.tsx
git commit -m "feat: adicionar recharts e wrapper ChartContainer"
```

---

### Task 3: Serviço — `buscarIndicadoresExecutivos`

**Files:**
- Create: `src/server/services/dashboardExecutivo.ts`
- Test: `src/server/services/dashboardExecutivo.test.ts`

**Interfaces:**
- Consumes: `buscarSaldoEmCaixaAte` de `./fluxoDeCaixa`; `saldoRemanescenteParcela` de `./fluxoDeCaixaProjetado`; `requirePermission` de `@/server/auth/permissions`; `SessaoAtiva` de `@/server/auth/sessao`; `prisma` de `@/server/db/client`.
- Produces:
  - `type IndicadoresExecutivos = { caixaDisponivel: number; contasAPagarEmAberto: number; contasAReceberEmAberto: number; inadimplencia: number; geracaoDeCaixaMesAtual: number; obrigacoes7Dias: number; obrigacoes30Dias: number; recebimentosEsperados30Dias: number; saldoProjetado30Dias: number }`
  - `buscarIndicadoresExecutivos(sessao: SessaoAtiva): Promise<IndicadoresExecutivos>`
  - Consumidos pela Task 5 (UI).

- [ ] **Step 1: Escrever os testes de integração**

Criar `src/server/services/dashboardExecutivo.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import { buscarIndicadoresExecutivos } from "./dashboardExecutivo";

describe("buscarIndicadoresExecutivos (integração)", () => {
  let fixture: FixtureFinanceiro;
  let sessaoGestor: FixtureFinanceiro["sessao"];
  let hoje: Date;
  let em3Dias: Date;
  let em15Dias: Date;
  let em45Dias: Date;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("DASH", "GESTOR");
    sessaoGestor = fixture.sessao;
    hoje = new Date();
    em3Dias = new Date(hoje.getTime() + 3 * 24 * 60 * 60 * 1000);
    em15Dias = new Date(hoje.getTime() + 15 * 24 * 60 * 60 * 1000);
    em45Dias = new Date(hoje.getTime() + 45 * 24 * 60 * 60 * 1000);
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("recusa perfil sem dashboardExecutivo:ler", async () => {
    const sessaoFinanceiro = { ...fixture.sessao, perfil: "FINANCEIRO" as const };
    await expect(buscarIndicadoresExecutivos(sessaoFinanceiro)).rejects.toThrow(PermissionError);
  });

  test("caixaDisponivel soma o saldo conciliado de todas as filiais da empresa", async () => {
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date(hoje.getTime() - 24 * 60 * 60 * 1000),
        tipo: "ENTRADA",
        valor: 1000,
        descricao: "Entrada conciliada",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });

    const outraFilial = await prisma.filial.create({
      data: { empresaId: fixture.empresaId, nome: "Filial DASH 2", cnpj: "44.444.DASH/0002-55" },
    });
    const outraConta = await prisma.contaBancaria.create({
      data: { filialId: outraFilial.id, bancoId: fixture.bancoId, agencia: "0003", conta: "dash-2", saldoInicial: 500 },
    });
    await prisma.lancamentoBancario.create({
      data: {
        filialId: outraFilial.id,
        contaBancariaId: outraConta.id,
        data: new Date(hoje.getTime() - 24 * 60 * 60 * 1000),
        tipo: "SAIDA",
        valor: 200,
        descricao: "Saída conciliada em outra filial",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });

    const indicadores = await buscarIndicadoresExecutivos(sessaoGestor);
    // 1000 (filial 1) + (500 saldoInicial - 200 saída) (filial 2) = 1300
    expect(indicadores.caixaDisponivel).toBe(1300);
  });

  test("contasAPagarEmAberto, obrigacoes7Dias e obrigacoes30Dias separam por janela de vencimento", async () => {
    await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: `DASH-PAG-7D-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: em3Dias, valorOriginal: 100 }],
    });
    await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: `DASH-PAG-30D-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: em15Dias, valorOriginal: 200 }],
    });
    await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: `DASH-PAG-45D-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: em45Dias, valorOriginal: 400 }],
    });

    const indicadores = await buscarIndicadoresExecutivos(sessaoGestor);
    expect(indicadores.contasAPagarEmAberto).toBeGreaterThanOrEqual(700);
    expect(indicadores.obrigacoes7Dias).toBeGreaterThanOrEqual(100);
    expect(indicadores.obrigacoes7Dias).toBeLessThan(300);
    expect(indicadores.obrigacoes30Dias).toBeGreaterThanOrEqual(300);
    expect(indicadores.obrigacoes30Dias).toBeLessThan(700);
  });

  test("inadimplencia só soma parcelas RECEBER com status VENCIDO", async () => {
    const ontem = new Date(hoje.getTime() - 24 * 60 * 60 * 1000);
    const titulo = await criarTitulo(fixture.sessao, "RECEBER", {
      contraparteId: fixture.clienteId,
      documento: `DASH-VENC-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: ontem, valorOriginal: 300 }],
    });
    await prisma.parcela.update({ where: { id: titulo.parcelas[0].id }, data: { status: "VENCIDO" } });

    const indicadores = await buscarIndicadoresExecutivos(sessaoGestor);
    expect(indicadores.inadimplencia).toBeGreaterThanOrEqual(300);
  });

  test("recebimentosEsperados30Dias só considera parcelas RECEBER dentro da janela", async () => {
    await criarTitulo(fixture.sessao, "RECEBER", {
      contraparteId: fixture.clienteId,
      documento: `DASH-REC-30D-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: em15Dias, valorOriginal: 500 }],
    });

    const indicadores = await buscarIndicadoresExecutivos(sessaoGestor);
    expect(indicadores.recebimentosEsperados30Dias).toBeGreaterThanOrEqual(500);
    expect(indicadores.contasAReceberEmAberto).toBeGreaterThanOrEqual(500);
  });

  test("geracaoDeCaixaMesAtual soma entradas menos saídas conciliadas do mês corrente", async () => {
    const dentroDoMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1, 12));
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: dentroDoMes,
        tipo: "ENTRADA",
        valor: 900,
        descricao: "Entrada do mês",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: dentroDoMes,
        tipo: "SAIDA",
        valor: 300,
        descricao: "Saída do mês",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });

    const indicadores = await buscarIndicadoresExecutivos(sessaoGestor);
    expect(indicadores.geracaoDeCaixaMesAtual).toBeGreaterThanOrEqual(600);
  });

  test("saldoProjetado30Dias é caixaDisponivel + recebimentosEsperados30Dias - obrigacoes30Dias", async () => {
    const indicadores = await buscarIndicadoresExecutivos(sessaoGestor);
    expect(indicadores.saldoProjetado30Dias).toBeCloseTo(
      indicadores.caixaDisponivel + indicadores.recebimentosEsperados30Dias - indicadores.obrigacoes30Dias,
      6,
    );
  });

  test("escopo de empresa — indicadores de outra empresa não vazam", async () => {
    const outraFixture = await criarFixtureFinanceiro("DASH2", "GESTOR");
    try {
      await criarTitulo(outraFixture.sessao, "PAGAR", {
        contraparteId: outraFixture.fornecedorId,
        documento: `DASH2-PAG-${Date.now()}`,
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: outraFixture.categoriaFinanceiraId,
        centroCustoId: "",
        centroLucroId: "",
        safraId: "",
        projetoId: "",
        contaBancariaId: outraFixture.contaBancariaId,
        formaPagamento: "",
        parcelas: [{ numero: 1, dataVencimento: em3Dias, valorOriginal: 999999 }],
      });

      const indicadores = await buscarIndicadoresExecutivos(sessaoGestor);
      expect(indicadores.contasAPagarEmAberto).toBeLessThan(999999);
    } finally {
      await limparFixtureFinanceiro(outraFixture);
    }
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/server/services/dashboardExecutivo.test.ts`
Expected: FAIL — `./dashboardExecutivo` não existe.

- [ ] **Step 3: Implementar `buscarIndicadoresExecutivos`**

Criar `src/server/services/dashboardExecutivo.ts`:

```ts
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { buscarSaldoEmCaixaAte } from "./fluxoDeCaixa";
import { saldoRemanescenteParcela } from "./fluxoDeCaixaProjetado";

export type IndicadoresExecutivos = {
  caixaDisponivel: number;
  contasAPagarEmAberto: number;
  contasAReceberEmAberto: number;
  inadimplencia: number;
  geracaoDeCaixaMesAtual: number;
  obrigacoes7Dias: number;
  obrigacoes30Dias: number;
  recebimentosEsperados30Dias: number;
  saldoProjetado30Dias: number;
};

const STATUS_ABERTO = ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"] as const;

function inicioDoMes(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 1));
}

/**
 * Consolida por empresa (soma todas as filiais) — mesmo padrão de
 * `buscarAnoBaseConsolidado` em `fluxoDeCaixaEstrategico.ts`: busca as
 * filiais da empresa e faz um loop reaproveitando funções já existentes,
 * sem duplicar query.
 */
export async function buscarIndicadoresExecutivos(sessao: SessaoAtiva): Promise<IndicadoresExecutivos> {
  requirePermission(sessao.perfil, "dashboardExecutivo:ler");

  const filiais = await prisma.filial.findMany({ where: { empresaId: sessao.empresaId }, select: { id: true } });
  const hoje = new Date();
  const em7Dias = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);
  const em30Dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);
  const inicioMesAtual = inicioDoMes(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1);

  let caixaDisponivel = 0;
  let contasAPagarEmAberto = 0;
  let contasAReceberEmAberto = 0;
  let inadimplencia = 0;
  let geracaoDeCaixaMesAtual = 0;
  let obrigacoes7Dias = 0;
  let obrigacoes30Dias = 0;
  let recebimentosEsperados30Dias = 0;

  for (const filial of filiais) {
    caixaDisponivel += await buscarSaldoEmCaixaAte(filial.id, hoje);

    const parcelasEmAberto = await prisma.parcela.findMany({
      where: {
        titulo: { filialId: filial.id },
        status: { in: STATUS_ABERTO },
      },
      include: {
        titulo: { select: { tipo: true } },
        baixas: { where: { statusAprovacao: "APROVADO" } },
      },
    });

    for (const parcela of parcelasEmAberto) {
      const saldo = saldoRemanescenteParcela(
        Number(parcela.valorAtualizado),
        parcela.baixas.map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
      );
      const dentroDe7Dias = parcela.dataVencimento >= hoje && parcela.dataVencimento <= em7Dias;
      const dentroDe30Dias = parcela.dataVencimento >= hoje && parcela.dataVencimento <= em30Dias;

      if (parcela.titulo.tipo === "PAGAR") {
        contasAPagarEmAberto += saldo;
        if (dentroDe7Dias) obrigacoes7Dias += saldo;
        if (dentroDe30Dias) obrigacoes30Dias += saldo;
      } else {
        contasAReceberEmAberto += saldo;
        if (parcela.status === "VENCIDO") inadimplencia += saldo;
        if (dentroDe30Dias) recebimentosEsperados30Dias += saldo;
      }
    }

    const somasMes = await prisma.lancamentoBancario.groupBy({
      by: ["tipo"],
      where: {
        filialId: filial.id,
        conciliado: true,
        data: { gte: inicioMesAtual, lte: hoje },
        contaBancaria: { ativo: true },
      },
      _sum: { valor: true },
    });
    const entradasMes = Number(somasMes.find((s) => s.tipo === "ENTRADA")?._sum.valor ?? 0);
    const saidasMes = Number(somasMes.find((s) => s.tipo === "SAIDA")?._sum.valor ?? 0);
    geracaoDeCaixaMesAtual += entradasMes - saidasMes;
  }

  const saldoProjetado30Dias = caixaDisponivel + recebimentosEsperados30Dias - obrigacoes30Dias;

  return {
    caixaDisponivel,
    contasAPagarEmAberto,
    contasAReceberEmAberto,
    inadimplencia,
    geracaoDeCaixaMesAtual,
    obrigacoes7Dias,
    obrigacoes30Dias,
    recebimentosEsperados30Dias,
    saldoProjetado30Dias,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/server/services/dashboardExecutivo.test.ts`
Expected: PASS — todos os testes.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/dashboardExecutivo.ts src/server/services/dashboardExecutivo.test.ts
git commit -m "feat: indicadores do dashboard executivo consolidados por empresa"
```

---

### Task 4: Serviço — `buscarGraficosExecutivos`

**Files:**
- Modify: `src/server/services/dashboardExecutivo.ts` (mesmo arquivo da Task 3, só adiciona)
- Test: `src/server/services/dashboardExecutivo.test.ts` (mesmo arquivo da Task 3, só adiciona)

**Interfaces:**
- Consumes: `STATUS_ABERTO` (constante já definida na Task 3, mesmo arquivo); `saldoRemanescenteParcela`, `buscarSaldoEmCaixaAte` (mesmos imports da Task 3).
- Produces:
  - `type FaixaAging = "0-30" | "31-60" | "61-90" | "90+"`
  - `type PontoEntradasSaidas = { mes: string; entradas: number; saidas: number }`
  - `type PontoEvolucaoSaldo = { mes: string; saldo: number }`
  - `type PontoAging = { faixa: FaixaAging; contasAPagar: number; contasAReceber: number }`
  - `type GraficosExecutivos = { entradasSaidas: PontoEntradasSaidas[]; evolucaoSaldo: PontoEvolucaoSaldo[]; aging: PontoAging[] }`
  - `buscarGraficosExecutivos(sessao: SessaoAtiva): Promise<GraficosExecutivos>`
  - Consumidos pela Task 5 (UI).

- [ ] **Step 1: Escrever os testes de integração**

Primeiro, atualizar a linha de import já existente no topo de
`src/server/services/dashboardExecutivo.test.ts` (da Task 3) para incluir
`buscarGraficosExecutivos`:

```ts
import { buscarIndicadoresExecutivos, buscarGraficosExecutivos } from "./dashboardExecutivo";
```

Depois, adicionar ao final do arquivo (não criar um import novo fora do
topo do arquivo):

```ts
describe("buscarGraficosExecutivos (integração)", () => {
  let fixture: FixtureFinanceiro;
  let sessaoGestor: FixtureFinanceiro["sessao"];
  let hoje: Date;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("DASHG", "GESTOR");
    sessaoGestor = fixture.sessao;
    hoje = new Date();
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("recusa perfil sem dashboardExecutivo:ler", async () => {
    const sessaoFinanceiro = { ...fixture.sessao, perfil: "FINANCEIRO" as const };
    await expect(buscarGraficosExecutivos(sessaoFinanceiro)).rejects.toThrow(PermissionError);
  });

  test("entradasSaidas e evolucaoSaldo trazem 6 pontos, um por mês, mais recente por último", async () => {
    const graficos = await buscarGraficosExecutivos(sessaoGestor);
    expect(graficos.entradasSaidas).toHaveLength(6);
    expect(graficos.evolucaoSaldo).toHaveLength(6);
  });

  test("entradasSaidas soma lançamento conciliado do mês corrente", async () => {
    const dentroDoMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1, 12));
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: dentroDoMes,
        tipo: "ENTRADA",
        valor: 700,
        descricao: "Entrada do mês (gráfico)",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });

    const graficos = await buscarGraficosExecutivos(sessaoGestor);
    const pontoDoMesAtual = graficos.entradasSaidas[graficos.entradasSaidas.length - 1];
    expect(pontoDoMesAtual.entradas).toBeGreaterThanOrEqual(700);
  });

  test("aging classifica parcela vencida na faixa certa de dias de atraso", async () => {
    const vencida45DiasAtras = new Date(hoje.getTime() - 45 * 24 * 60 * 60 * 1000);
    await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: `DASHG-AGING-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: vencida45DiasAtras, valorOriginal: 350 }],
    });

    const graficos = await buscarGraficosExecutivos(sessaoGestor);
    const faixa31a60 = graficos.aging.find((p) => p.faixa === "31-60");
    expect(faixa31a60?.contasAPagar).toBeGreaterThanOrEqual(350);
  });

  test("aging não inclui parcela ainda não vencida", async () => {
    const aVencer = new Date(hoje.getTime() + 10 * 24 * 60 * 60 * 1000);
    await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: `DASHG-NAOVENC-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: aVencer, valorOriginal: 5000 }],
    });

    const graficos = await buscarGraficosExecutivos(sessaoGestor);
    const totalAging = graficos.aging.reduce((soma, p) => soma + p.contasAPagar, 0);
    expect(totalAging).toBeLessThan(5000);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/server/services/dashboardExecutivo.test.ts`
Expected: FAIL — `buscarGraficosExecutivos is not a function`.

- [ ] **Step 3: Implementar `buscarGraficosExecutivos`**

Adicionar ao final de `src/server/services/dashboardExecutivo.ts`:

```ts
export type FaixaAging = "0-30" | "31-60" | "61-90" | "90+";
export type PontoEntradasSaidas = { mes: string; entradas: number; saidas: number };
export type PontoEvolucaoSaldo = { mes: string; saldo: number };
export type PontoAging = { faixa: FaixaAging; contasAPagar: number; contasAReceber: number };

export type GraficosExecutivos = {
  entradasSaidas: PontoEntradasSaidas[];
  evolucaoSaldo: PontoEvolucaoSaldo[];
  aging: PontoAging[];
};

function fimDoMes(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999));
}

function rotuloMes(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(data);
}

/**
 * Dias de atraso a partir de `dataVencimento` — não depende do campo
 * `status` estar recalculado (mesma convenção já aceita em
 * `fluxoDeCaixaProjetado.ts`/`fluxoDeCaixaPorDimensao.ts`: `status` só é
 * recalculado quando `listarTitulos` é chamado).
 */
function faixaAging(hoje: Date, dataVencimento: Date): FaixaAging {
  const diasAtraso = Math.floor((hoje.getTime() - dataVencimento.getTime()) / (24 * 60 * 60 * 1000));
  if (diasAtraso <= 30) return "0-30";
  if (diasAtraso <= 60) return "31-60";
  if (diasAtraso <= 90) return "61-90";
  return "90+";
}

async function buscarAgingConsolidado(filiais: { id: string }[], hoje: Date): Promise<PontoAging[]> {
  const buckets: Record<FaixaAging, { contasAPagar: number; contasAReceber: number }> = {
    "0-30": { contasAPagar: 0, contasAReceber: 0 },
    "31-60": { contasAPagar: 0, contasAReceber: 0 },
    "61-90": { contasAPagar: 0, contasAReceber: 0 },
    "90+": { contasAPagar: 0, contasAReceber: 0 },
  };

  for (const filial of filiais) {
    const parcelasVencidas = await prisma.parcela.findMany({
      where: {
        titulo: { filialId: filial.id },
        status: { in: STATUS_ABERTO },
        dataVencimento: { lt: hoje },
      },
      include: {
        titulo: { select: { tipo: true } },
        baixas: { where: { statusAprovacao: "APROVADO" } },
      },
    });

    for (const parcela of parcelasVencidas) {
      const saldo = saldoRemanescenteParcela(
        Number(parcela.valorAtualizado),
        parcela.baixas.map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
      );
      if (saldo <= 0) continue;

      const faixa = faixaAging(hoje, parcela.dataVencimento);
      if (parcela.titulo.tipo === "PAGAR") buckets[faixa].contasAPagar += saldo;
      else buckets[faixa].contasAReceber += saldo;
    }
  }

  return (["0-30", "31-60", "61-90", "90+"] as const).map((faixa) => ({ faixa, ...buckets[faixa] }));
}

/**
 * Últimos 6 meses (o atual incluído, por último no array), consolidado por
 * empresa. `buscarSaldoEmCaixaAte` é reaproveitada tal como está — como
 * ela recalcula o saldo conciliado até uma data qualquer, não precisa de
 * encadeamento mês a mês (diferente do fluxo de caixa projetado, que
 * projeta o futuro a partir de um saldo âncora).
 */
export async function buscarGraficosExecutivos(sessao: SessaoAtiva): Promise<GraficosExecutivos> {
  requirePermission(sessao.perfil, "dashboardExecutivo:ler");

  const filiais = await prisma.filial.findMany({ where: { empresaId: sessao.empresaId }, select: { id: true } });
  const hoje = new Date();

  const entradasSaidas: PontoEntradasSaidas[] = [];
  const evolucaoSaldo: PontoEvolucaoSaldo[] = [];

  for (let i = 5; i >= 0; i--) {
    const ano = hoje.getUTCFullYear();
    const mesAbsoluto = hoje.getUTCMonth() - i;
    const inicio = new Date(Date.UTC(ano, mesAbsoluto, 1));
    const fim = fimDoMes(ano, mesAbsoluto + 1);
    const mes = rotuloMes(inicio);

    let entradas = 0;
    let saidas = 0;
    let saldo = 0;
    for (const filial of filiais) {
      const somas = await prisma.lancamentoBancario.groupBy({
        by: ["tipo"],
        where: {
          filialId: filial.id,
          conciliado: true,
          data: { gte: inicio, lte: fim },
          contaBancaria: { ativo: true },
        },
        _sum: { valor: true },
      });
      entradas += Number(somas.find((s) => s.tipo === "ENTRADA")?._sum.valor ?? 0);
      saidas += Number(somas.find((s) => s.tipo === "SAIDA")?._sum.valor ?? 0);
      saldo += await buscarSaldoEmCaixaAte(filial.id, fim);
    }

    entradasSaidas.push({ mes, entradas, saidas });
    evolucaoSaldo.push({ mes, saldo });
  }

  const aging = await buscarAgingConsolidado(filiais, hoje);

  return { entradasSaidas, evolucaoSaldo, aging };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/server/services/dashboardExecutivo.test.ts`
Expected: PASS — todos os testes do arquivo (Task 3 + Task 4).

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/dashboardExecutivo.ts src/server/services/dashboardExecutivo.test.ts
git commit -m "feat: graficos do dashboard executivo consolidados por empresa"
```

---

### Task 5: Tela `/dashboard-executivo` e nova seção "Gestão" no menu

**Files:**
- Create: `src/app/(dashboard)/dashboard-executivo/page.tsx`
- Create: `src/app/(dashboard)/dashboard-executivo/entradas-saidas-chart.tsx`
- Create: `src/app/(dashboard)/dashboard-executivo/evolucao-saldo-chart.tsx`
- Create: `src/app/(dashboard)/dashboard-executivo/aging-chart.tsx`
- Modify: `src/app/(dashboard)/nav-items.ts`

**Interfaces:**
- Consumes: `buscarIndicadoresExecutivos`, `type IndicadoresExecutivos` (Task 3); `buscarGraficosExecutivos`, `type GraficosExecutivos`, `type PontoEntradasSaidas`, `type PontoEvolucaoSaldo`, `type PontoAging` (Task 4); `ChartContainer` de `@/components/ui/chart` (Task 2); `requireSessaoAtiva` de `@/server/auth/sessao`; `requirePermission` de `@/server/auth/permissions`.
- Produces: rota navegável `/dashboard-executivo` (terminal — nenhuma outra task consome esta).

- [ ] **Step 1: Implementar o gráfico de Entradas x Saídas**

Criar `src/app/(dashboard)/dashboard-executivo/entradas-saidas-chart.tsx`:

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { PontoEntradasSaidas } from "@/server/services/dashboardExecutivo";

export function EntradasSaidasChart({ dados }: { dados: PontoEntradasSaidas[] }) {
  return (
    <ChartContainer>
      <BarChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="mes" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="entradas" fill="#16a34a" name="Entradas" />
        <Bar dataKey="saidas" fill="#dc2626" name="Saídas" />
      </BarChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 2: Implementar o gráfico de Evolução do saldo**

Criar `src/app/(dashboard)/dashboard-executivo/evolucao-saldo-chart.tsx`:

```tsx
"use client";

import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { PontoEvolucaoSaldo } from "@/server/services/dashboardExecutivo";

export function EvolucaoSaldoChart({ dados }: { dados: PontoEvolucaoSaldo[] }) {
  return (
    <ChartContainer>
      <LineChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="mes" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="saldo" stroke="#2563eb" name="Saldo" />
      </LineChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 3: Implementar o gráfico de Aging**

Criar `src/app/(dashboard)/dashboard-executivo/aging-chart.tsx`:

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { PontoAging } from "@/server/services/dashboardExecutivo";

export function AgingChart({ dados }: { dados: PontoAging[] }) {
  return (
    <ChartContainer>
      <BarChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="faixa" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="contasAPagar" fill="#dc2626" name="Contas a pagar" />
        <Bar dataKey="contasAReceber" fill="#16a34a" name="Contas a receber" />
      </BarChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 4: Implementar a página**

Criar `src/app/(dashboard)/dashboard-executivo/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { buscarIndicadoresExecutivos, buscarGraficosExecutivos } from "@/server/services/dashboardExecutivo";
import { EntradasSaidasChart } from "./entradas-saidas-chart";
import { EvolucaoSaldoChart } from "./evolucao-saldo-chart";
import { AgingChart } from "./aging-chart";

function formatarMoeda(valor: number): string {
  return valor.toFixed(2);
}

export default async function DashboardExecutivoPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "dashboardExecutivo:ler");

  const [indicadores, graficos] = await Promise.all([
    buscarIndicadoresExecutivos(sessao),
    buscarGraficosExecutivos(sessao),
  ]);

  const cards = [
    { label: "Caixa disponível", valor: indicadores.caixaDisponivel },
    { label: "Contas a pagar em aberto", valor: indicadores.contasAPagarEmAberto },
    { label: "Contas a receber em aberto", valor: indicadores.contasAReceberEmAberto },
    { label: "Inadimplência", valor: indicadores.inadimplencia },
    { label: "Geração de caixa (mês atual)", valor: indicadores.geracaoDeCaixaMesAtual },
    { label: "Obrigações (7 dias)", valor: indicadores.obrigacoes7Dias },
    { label: "Obrigações (30 dias)", valor: indicadores.obrigacoes30Dias },
    { label: "Recebimentos esperados (30 dias)", valor: indicadores.recebimentosEsperados30Dias },
    { label: "Saldo projetado (30 dias)", valor: indicadores.saldoProjetado30Dias },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Dashboard executivo</h1>
        <p className="text-sm text-muted-foreground">
          Consolidado de todas as filiais da empresa. Restrito a Administrador, Gestor e Auditor.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatarMoeda(card.valor)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Entradas x Saídas (últimos 6 meses)</h2>
          <EntradasSaidasChart dados={graficos.entradasSaidas} />
        </section>
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Evolução do saldo (últimos 6 meses)</h2>
          <EvolucaoSaldoChart dados={graficos.evolucaoSaldo} />
        </section>
        <section className="space-y-2 lg:col-span-2">
          <h2 className="text-base font-semibold">Aging de contas a pagar/receber</h2>
          <AgingChart dados={graficos.aging} />
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Adicionar a nova seção "Gestão" ao menu**

Em `src/app/(dashboard)/nav-items.ts`, adicionar uma nova seção ao array `NAV_SECTIONS`, depois da seção `"Administração"`:

```ts
  {
    titulo: "Gestão",
    itens: [
      { href: "/dashboard-executivo", label: "Dashboard executivo", permitido: ["ADMINISTRADOR", "GESTOR", "AUDITOR"] },
    ],
  },
```

- [ ] **Step 6: Verificar tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros novos (erros pré-existentes e não relacionados a este diff, se houver, não bloqueiam).

- [ ] **Step 7: Rodar a suíte completa de testes**

Run: `npm test`
Expected: PASS — todos os testes do projeto, incluindo os novos das Tasks 1, 3 e 4.

- [ ] **Step 8: Verificação manual**

Sem acesso a browser neste ambiente de execução automatizada — pular este passo e reportar explicitamente que não foi feito, em vez de simular. O controlador (humano ou sessão principal) verifica manualmente depois: `npm run dev`, logar como ADMINISTRADOR/GESTOR/AUDITOR, abrir `/dashboard-executivo`, confirmar os 9 cards e os 3 gráficos renderizando sem erro no console; logar como FINANCEIRO/TESOURARIA/CONSULTA e confirmar que a entrada "Dashboard executivo" não aparece no menu e que acessar a URL diretamente é recusado.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(dashboard)/dashboard-executivo" src/app/(dashboard)/nav-items.ts
git commit -m "feat: tela do dashboard executivo"
```
