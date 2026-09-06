# Fluxo de Caixa Realizado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar o fluxo de caixa realizado (saldo inicial, entradas, saídas, geração de caixa, saldo final) por dia/semana/mês/ano, calculado sob demanda a partir dos `LancamentoBancario` já conciliados.

**Architecture:** Duas funções puras (`calcularJanela` recorta a janela de sub-períodos de cada granularidade; `calcularPeriodosFluxoDeCaixa` agrega os lançamentos em cada sub-período, encadeando saldo) somadas a duas funções async (`buscarSaldoEmCaixaAte`, `listarFluxoDeCaixaRealizado`) num único service novo. UI nova em `/financeiro/fluxo-de-caixa` com seletor de granularidade + navegação anterior/próximo via `searchParams`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7, Vitest (Postgres real pra integração, funções puras sem banco pra unidade). Sem dependência nova — datas com `Date`/UTC nativo, mesmo padrão já usado em `ofxParser.ts`/`conciliacao.ts`.

**Spec:** `docs/superpowers/specs/2026-09-03-fluxo-caixa-realizado-design.md`

## Global Constraints

- Sem tabela nova, sem cache — tudo calculado sob demanda a partir de `LancamentoBancario`/`ContaBancaria` já existentes.
- Só `LancamentoBancario` com `conciliado: true` entra na conta — nunca lançamentos não conciliados.
- Escopo é sempre a filial ativa da sessão (`sessao.filialId`) — sem consolidação por empresa.
- Sem ação de permissão nova — reaproveita `lancamento:ler` (todo perfil já tem).
- Janela por granularidade: `DIA`/`SEMANA` → mês de `dataReferencia`; `MES` → ano de `dataReferencia`; `ANO` → últimos 5 anos civis até o ano de `dataReferencia`.
- Datas em UTC (`Date.UTC(...)`), nunca `new Date(ano, mes, dia)` local — mesmo motivo de `ofxParser.ts` (evita deslocamento de fuso).

---

### Task 1: Motor de cálculo (funções puras)

**Files:**
- Create: `src/server/services/fluxoDeCaixa.ts`
- Test: `src/server/services/fluxoDeCaixa.test.ts`

**Interfaces:**
- Produces: `type Granularidade = "DIA" | "SEMANA" | "MES" | "ANO"`; `type SubPeriodo = { inicio: Date; fim: Date }`; `type LancamentoParaFluxo = { data: Date; valor: number; tipo: "ENTRADA" | "SAIDA" }`; `type PeriodoFluxoDeCaixa = SubPeriodo & { saldoInicial: number; entradas: number; saidas: number; geracaoLiquida: number; saldoFinal: number }`; `function calcularJanela(granularidade: Granularidade, dataReferencia: Date): SubPeriodo[]`; `function calcularPeriodosFluxoDeCaixa(periodos: SubPeriodo[], lancamentos: LancamentoParaFluxo[], saldoInicialAbsoluto: number): PeriodoFluxoDeCaixa[]`.

- [ ] **Step 1: Escrever o teste**

```ts
// src/server/services/fluxoDeCaixa.test.ts
import { describe, expect, test } from "vitest";
import { calcularJanela, calcularPeriodosFluxoDeCaixa, type LancamentoParaFluxo } from "./fluxoDeCaixa";

describe("calcularJanela", () => {
  test("DIA: devolve todos os dias do mês de referência", () => {
    const periodos = calcularJanela("DIA", new Date(Date.UTC(2026, 1, 15))); // fevereiro/2026 (28 dias)
    expect(periodos).toHaveLength(28);
    expect(periodos[0].inicio.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(periodos[27].inicio.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(periodos[27].fim.toISOString()).toBe("2026-02-28T23:59:59.999Z");
  });

  test("SEMANA: primeira semana começa na segunda-feira que contém o dia 1 do mês", () => {
    // setembro/2026 começa numa terça-feira (2026-09-01)
    const periodos = calcularJanela("SEMANA", new Date(Date.UTC(2026, 8, 15)));
    expect(periodos[0].inicio.toISOString()).toBe("2026-08-31T00:00:00.000Z"); // segunda anterior
    expect(periodos[0].fim.toISOString()).toBe("2026-09-06T23:59:59.999Z");
  });

  test("MES: devolve os 12 meses do ano de referência", () => {
    const periodos = calcularJanela("MES", new Date(Date.UTC(2026, 5, 1)));
    expect(periodos).toHaveLength(12);
    expect(periodos[0].inicio.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(periodos[11].fim.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });

  test("ANO: devolve os últimos 5 anos civis até o ano de referência", () => {
    const periodos = calcularJanela("ANO", new Date(Date.UTC(2026, 0, 1)));
    expect(periodos).toHaveLength(5);
    expect(periodos[0].inicio.getUTCFullYear()).toBe(2022);
    expect(periodos[4].inicio.getUTCFullYear()).toBe(2026);
  });
});

describe("calcularPeriodosFluxoDeCaixa", () => {
  const periodos = [
    { inicio: new Date(Date.UTC(2026, 8, 1)), fim: new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999)) },
    { inicio: new Date(Date.UTC(2026, 9, 1)), fim: new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999)) },
  ];

  test("soma entradas e saídas de cada sub-período e encadeia o saldo", () => {
    const lancamentos: LancamentoParaFluxo[] = [
      { data: new Date(Date.UTC(2026, 8, 10)), valor: 1000, tipo: "ENTRADA" },
      { data: new Date(Date.UTC(2026, 8, 20)), valor: 300, tipo: "SAIDA" },
      { data: new Date(Date.UTC(2026, 9, 5)), valor: 200, tipo: "ENTRADA" },
    ];

    const resultado = calcularPeriodosFluxoDeCaixa(periodos, lancamentos, 500);

    expect(resultado[0]).toMatchObject({ saldoInicial: 500, entradas: 1000, saidas: 300, geracaoLiquida: 700, saldoFinal: 1200 });
    expect(resultado[1]).toMatchObject({ saldoInicial: 1200, entradas: 200, saidas: 0, geracaoLiquida: 200, saldoFinal: 1400 });
  });

  test("sub-período sem lançamento nenhum mantém o saldo inicial como saldo final", () => {
    const resultado = calcularPeriodosFluxoDeCaixa(periodos, [], 500);
    expect(resultado[0]).toMatchObject({ entradas: 0, saidas: 0, geracaoLiquida: 0, saldoFinal: 500 });
    expect(resultado[1]).toMatchObject({ saldoInicial: 500, saldoFinal: 500 });
  });

  test("lançamento fora do intervalo dos sub-períodos é ignorado", () => {
    const lancamentos: LancamentoParaFluxo[] = [
      { data: new Date(Date.UTC(2026, 7, 15)), valor: 999, tipo: "ENTRADA" },
    ];
    const resultado = calcularPeriodosFluxoDeCaixa(periodos, lancamentos, 500);
    expect(resultado[0].entradas).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/server/services/fluxoDeCaixa.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// src/server/services/fluxoDeCaixa.ts

export type Granularidade = "DIA" | "SEMANA" | "MES" | "ANO";

export type SubPeriodo = { inicio: Date; fim: Date };

export type LancamentoParaFluxo = { data: Date; valor: number; tipo: "ENTRADA" | "SAIDA" };

export type PeriodoFluxoDeCaixa = SubPeriodo & {
  saldoInicial: number;
  entradas: number;
  saidas: number;
  geracaoLiquida: number;
  saldoFinal: number;
};

function fimDoDiaUTC(ano: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes, dia, 23, 59, 59, 999));
}

/**
 * Recorta a janela natural de cada granularidade em sub-períodos —
 * ver "Granularidades e janela exibida" na spec. Datas sempre em UTC
 * (meia-noite pro início, 23:59:59.999 pro fim), mesmo padrão de
 * `ofxParser.ts`, pra evitar deslocamento por fuso horário.
 */
export function calcularJanela(granularidade: Granularidade, dataReferencia: Date): SubPeriodo[] {
  const ano = dataReferencia.getUTCFullYear();
  const mes = dataReferencia.getUTCMonth();

  if (granularidade === "DIA") {
    const diasNoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    return Array.from({ length: diasNoMes }, (_, i) => ({
      inicio: new Date(Date.UTC(ano, mes, i + 1)),
      fim: fimDoDiaUTC(ano, mes, i + 1),
    }));
  }

  if (granularidade === "SEMANA") {
    const primeiroDiaMes = new Date(Date.UTC(ano, mes, 1));
    const ultimoDiaMes = new Date(Date.UTC(ano, mes + 1, 0));
    const diaDaSemana = primeiroDiaMes.getUTCDay(); // 0=domingo .. 6=sábado
    const deslocamentoSegunda = diaDaSemana === 0 ? 6 : diaDaSemana - 1;

    const inicioPrimeiraSemana = new Date(primeiroDiaMes);
    inicioPrimeiraSemana.setUTCDate(inicioPrimeiraSemana.getUTCDate() - deslocamentoSegunda);

    const periodos: SubPeriodo[] = [];
    let cursor = inicioPrimeiraSemana;
    while (cursor <= ultimoDiaMes) {
      const fimSemana = new Date(cursor);
      fimSemana.setUTCDate(fimSemana.getUTCDate() + 6);
      fimSemana.setUTCHours(23, 59, 59, 999);
      periodos.push({ inicio: new Date(cursor), fim: fimSemana });

      const proximoInicio = new Date(cursor);
      proximoInicio.setUTCDate(proximoInicio.getUTCDate() + 7);
      cursor = proximoInicio;
    }
    return periodos;
  }

  if (granularidade === "MES") {
    return Array.from({ length: 12 }, (_, i) => ({
      inicio: new Date(Date.UTC(ano, i, 1)),
      fim: fimDoDiaUTC(ano, i + 1, 0),
    }));
  }

  // ANO — últimos 5 anos civis até o ano de referência
  return Array.from({ length: 5 }, (_, i) => {
    const anoPeriodo = ano - 4 + i;
    return {
      inicio: new Date(Date.UTC(anoPeriodo, 0, 1)),
      fim: fimDoDiaUTC(anoPeriodo, 11, 31),
    };
  });
}

/**
 * Agrega os lançamentos (já filtrados pra `conciliado: true` e escopados
 * por filial pelo chamador) em cada sub-período, encadeando o saldo final
 * de um como saldo inicial do próximo — nunca recalcula do zero a cada
 * sub-período.
 */
export function calcularPeriodosFluxoDeCaixa(
  periodos: SubPeriodo[],
  lancamentos: LancamentoParaFluxo[],
  saldoInicialAbsoluto: number,
): PeriodoFluxoDeCaixa[] {
  let saldoCorrente = saldoInicialAbsoluto;

  return periodos.map(({ inicio, fim }) => {
    const doPeriodo = lancamentos.filter((l) => l.data >= inicio && l.data <= fim);
    const entradas = doPeriodo.filter((l) => l.tipo === "ENTRADA").reduce((soma, l) => soma + l.valor, 0);
    const saidas = doPeriodo.filter((l) => l.tipo === "SAIDA").reduce((soma, l) => soma + l.valor, 0);
    const geracaoLiquida = entradas - saidas;
    const saldoInicial = saldoCorrente;
    const saldoFinal = saldoInicial + geracaoLiquida;
    saldoCorrente = saldoFinal;

    return { inicio, fim, saldoInicial, entradas, saidas, geracaoLiquida, saldoFinal };
  });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/server/services/fluxoDeCaixa.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/fluxoDeCaixa.ts src/server/services/fluxoDeCaixa.test.ts
git commit -m "Adicionar motor de calculo do fluxo de caixa realizado (funcoes puras)"
```

---

### Task 2: Leitura com banco (saldo absoluto + listagem)

**Files:**
- Modify: `src/server/services/fluxoDeCaixa.ts`
- Modify: `src/server/services/fluxoDeCaixa.test.ts`

**Interfaces:**
- Consumes: `calcularJanela`, `calcularPeriodosFluxoDeCaixa`, `Granularidade` (Task 1).
- Produces: `async function buscarSaldoEmCaixaAte(filialId: string, data: Date): Promise<number>`; `async function listarFluxoDeCaixaRealizado(sessao: SessaoAtiva, granularidade: Granularidade, dataReferencia: Date): Promise<PeriodoFluxoDeCaixa[]>`.

- [ ] **Step 1: Escrever os testes**

Adicionar ao final de `src/server/services/fluxoDeCaixa.test.ts` (os `describe`s da Task 1 continuam no topo, sem alteração):

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { buscarSaldoEmCaixaAte, listarFluxoDeCaixaRealizado } from "./fluxoDeCaixa";

describe("buscarSaldoEmCaixaAte / listarFluxoDeCaixaRealizado", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("FCX", "TESOURARIA");
  });

  afterAll(async () => {
    await prisma.lancamentoBancario.deleteMany({ where: { filialId: fixture.filialId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("só soma lançamentos conciliados até a data informada", async () => {
    await prisma.lancamentoBancario.createMany({
      data: [
        {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-09-10T00:00:00Z"),
          tipo: "ENTRADA",
          valor: 1000,
          descricao: "Conciliado antes",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: true,
        },
        {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-09-05T00:00:00Z"),
          tipo: "SAIDA",
          valor: 200,
          descricao: "Não conciliado — não deve contar",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: false,
        },
        {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-09-20T00:00:00Z"),
          tipo: "ENTRADA",
          valor: 5000,
          descricao: "Depois da data de corte — não deve contar",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: true,
        },
      ],
    });

    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });

    const saldo = await buscarSaldoEmCaixaAte(fixture.filialId, new Date("2026-09-15T00:00:00Z"));
    expect(saldo).toBe(Number(conta.saldoInicial) + 1000);
  });

  test("listarFluxoDeCaixaRealizado escopa por filial — lançamento de outra filial não vaza", async () => {
    const outraFixture = await criarFixtureFinanceiro("FCX2", "TESOURARIA");
    try {
      await prisma.lancamentoBancario.create({
        data: {
          filialId: outraFixture.filialId,
          contaBancariaId: outraFixture.contaBancariaId,
          data: new Date("2026-09-10T00:00:00Z"),
          tipo: "ENTRADA",
          valor: 999999,
          descricao: "De outra filial",
          origem: "MANUAL",
          usuarioId: outraFixture.usuarioId,
          conciliado: true,
        },
      });

      const periodos = await listarFluxoDeCaixaRealizado(fixture.sessao, "MES", new Date("2026-09-01T00:00:00Z"));
      const totalEntradas = periodos.reduce((soma, p) => soma + p.entradas, 0);
      // Só os lançamentos conciliados da fixture (teste anterior): 1000 (Sep10) + 5000 (Sep20).
      // Se o filtro de filial vazasse, o valor da outra filial (999999) apareceria aqui.
      expect(totalEntradas).toBe(6000);
    } finally {
      await prisma.lancamentoBancario.deleteMany({ where: { filialId: outraFixture.filialId } });
      await limparFixtureFinanceiro(outraFixture);
    }
  });

  test("saldoFinal do último sub-período bate com buscarSaldoEmCaixaAte calculado direto pra mesma data", async () => {
    const periodos = await listarFluxoDeCaixaRealizado(fixture.sessao, "MES", new Date("2026-09-01T00:00:00Z"));
    const ultimoPeriodo = periodos[periodos.length - 1];
    const saldoDireto = await buscarSaldoEmCaixaAte(fixture.filialId, ultimoPeriodo.fim);
    expect(ultimoPeriodo.saldoFinal).toBeCloseTo(saldoDireto, 2);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run src/server/services/fluxoDeCaixa.test.ts`
Expected: FAIL — `buscarSaldoEmCaixaAte`/`listarFluxoDeCaixaRealizado` não existem.

- [ ] **Step 3: Implementar, adicionando ao final de `src/server/services/fluxoDeCaixa.ts`**

```ts
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";

export async function buscarSaldoEmCaixaAte(filialId: string, data: Date): Promise<number> {
  const contas = await prisma.contaBancaria.findMany({ where: { filialId, ativo: true } });
  const saldoInicialTotal = contas.reduce((soma, conta) => soma + Number(conta.saldoInicial), 0);

  const somas = await prisma.lancamentoBancario.groupBy({
    by: ["tipo"],
    where: { filialId, conciliado: true, data: { lte: data } },
    _sum: { valor: true },
  });

  const entradas = Number(somas.find((s) => s.tipo === "ENTRADA")?._sum.valor ?? 0);
  const saidas = Number(somas.find((s) => s.tipo === "SAIDA")?._sum.valor ?? 0);

  return saldoInicialTotal + entradas - saidas;
}

export async function listarFluxoDeCaixaRealizado(
  sessao: SessaoAtiva,
  granularidade: Granularidade,
  dataReferencia: Date,
): Promise<PeriodoFluxoDeCaixa[]> {
  requirePermission(sessao.perfil, "lancamento:ler");

  const periodos = calcularJanela(granularidade, dataReferencia);
  const inicioDaJanela = periodos[0].inicio;
  const fimDaJanela = periodos[periodos.length - 1].fim;

  const [saldoInicialAbsoluto, lancamentos] = await Promise.all([
    buscarSaldoEmCaixaAte(sessao.filialId, new Date(inicioDaJanela.getTime() - 1)),
    prisma.lancamentoBancario.findMany({
      where: {
        filialId: sessao.filialId,
        conciliado: true,
        data: { gte: inicioDaJanela, lte: fimDaJanela },
      },
    }),
  ]);

  return calcularPeriodosFluxoDeCaixa(
    periodos,
    lancamentos.map((l) => ({ data: l.data, valor: Number(l.valor), tipo: l.tipo })),
    saldoInicialAbsoluto,
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx vitest run src/server/services/fluxoDeCaixa.test.ts`
Expected: PASS (todos, incluindo os 7 da Task 1 + os 3 novos).

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: todos os arquivos passam.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/fluxoDeCaixa.ts src/server/services/fluxoDeCaixa.test.ts
git commit -m "Adicionar leitura do fluxo de caixa realizado (saldo absoluto e listagem escopada por filial)"
```

---

### Task 3: UI — tela de fluxo de caixa

**Files:**
- Create: `src/app/(dashboard)/financeiro/fluxo-de-caixa/page.tsx`
- Create: `src/app/(dashboard)/financeiro/fluxo-de-caixa/seletor-periodo.tsx`
- Create: `src/app/(dashboard)/financeiro/fluxo-de-caixa/formatar-rotulo-periodo.ts`
- Create: `src/app/(dashboard)/financeiro/fluxo-de-caixa/formatar-rotulo-periodo.test.ts`
- Modify: `src/app/(dashboard)/nav-items.ts`

**Interfaces:**
- Consumes: `listarFluxoDeCaixaRealizado`, `Granularidade`, `PeriodoFluxoDeCaixa` de `@/server/services/fluxoDeCaixa` (Tasks 1-2).

- [ ] **Step 1: Adicionar a entrada de navegação**

Em `src/app/(dashboard)/nav-items.ts`, no array `itens` da seção "Financeiro", depois de `"/financeiro/conciliacao"` (última linha do array hoje):

```ts
      { href: "/financeiro/fluxo-de-caixa", label: "Fluxo de caixa" },
```

- [ ] **Step 2: Escrever o teste do formatador de rótulo**

```ts
// src/app/(dashboard)/financeiro/fluxo-de-caixa/formatar-rotulo-periodo.test.ts
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

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/app/\(dashboard\)/financeiro/fluxo-de-caixa/formatar-rotulo-periodo.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar o formatador**

```ts
// src/app/(dashboard)/financeiro/fluxo-de-caixa/formatar-rotulo-periodo.ts
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

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/app/\(dashboard\)/financeiro/fluxo-de-caixa/formatar-rotulo-periodo.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Criar o componente de seleção de período**

```tsx
// src/app/(dashboard)/financeiro/fluxo-de-caixa/seletor-periodo.tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Granularidade } from "@/server/services/fluxoDeCaixa";

const GRANULARIDADES: Granularidade[] = ["DIA", "SEMANA", "MES", "ANO"];
const LABEL: Record<Granularidade, string> = { DIA: "Dia", SEMANA: "Semana", MES: "Mês", ANO: "Ano" };

function deslocarData(data: Date, granularidade: Granularidade, direcao: 1 | -1): Date {
  const nova = new Date(data);
  if (granularidade === "MES") {
    nova.setUTCFullYear(nova.getUTCFullYear() + direcao);
  } else if (granularidade === "ANO") {
    nova.setUTCFullYear(nova.getUTCFullYear() + direcao * 5);
  } else {
    nova.setUTCMonth(nova.getUTCMonth() + direcao);
  }
  return nova;
}

export function SeletorPeriodo({
  granularidade,
  dataReferencia,
}: {
  granularidade: Granularidade;
  dataReferencia: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function atualizar(novaGranularidade: Granularidade, novaData: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("granularidade", novaGranularidade);
    params.set("data", novaData);
    router.push(`${pathname}?${params.toString()}`);
  }

  function navegar(direcao: 1 | -1) {
    const nova = deslocarData(new Date(dataReferencia), granularidade, direcao);
    atualizar(granularidade, nova.toISOString().slice(0, 10));
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={granularidade} onValueChange={(valor) => valor && atualizar(valor as Granularidade, dataReferencia)}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GRANULARIDADES.map((g) => (
            <SelectItem key={g} value={g}>
              {LABEL[g]}
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

- [ ] **Step 7: Criar a página**

```tsx
// src/app/(dashboard)/financeiro/fluxo-de-caixa/page.tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarFluxoDeCaixaRealizado, type Granularidade } from "@/server/services/fluxoDeCaixa";
import { SeletorPeriodo } from "./seletor-periodo";
import { formatarRotuloPeriodo } from "./formatar-rotulo-periodo";

const GRANULARIDADES_VALIDAS: Granularidade[] = ["DIA", "SEMANA", "MES", "ANO"];

function granularidadeValida(valor: string | undefined): Granularidade {
  return GRANULARIDADES_VALIDAS.includes(valor as Granularidade) ? (valor as Granularidade) : "MES";
}

export default async function FluxoDeCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ granularidade?: string; data?: string }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "lancamento:ler");

  const params = await searchParams;
  const granularidade = granularidadeValida(params.granularidade);
  const dataReferencia = params.data ? new Date(`${params.data}T00:00:00Z`) : new Date();

  const periodos = await listarFluxoDeCaixaRealizado(sessao, granularidade, dataReferencia);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Fluxo de caixa</h1>
        <p className="text-sm text-muted-foreground">
          Movimentações bancárias já conciliadas, por período.
        </p>
      </div>

      <SeletorPeriodo granularidade={granularidade} dataReferencia={dataReferencia.toISOString().slice(0, 10)} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Período</TableHead>
            <TableHead>Saldo inicial</TableHead>
            <TableHead>Entradas</TableHead>
            <TableHead>Saídas</TableHead>
            <TableHead>Geração de caixa</TableHead>
            <TableHead>Saldo final</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {periodos.map((periodo) => (
            <TableRow key={periodo.inicio.toISOString()}>
              <TableCell>{formatarRotuloPeriodo(granularidade, periodo.inicio, periodo.fim)}</TableCell>
              <TableCell>{periodo.saldoInicial.toFixed(2)}</TableCell>
              <TableCell>{periodo.entradas.toFixed(2)}</TableCell>
              <TableCell>{periodo.saidas.toFixed(2)}</TableCell>
              <TableCell>{periodo.geracaoLiquida.toFixed(2)}</TableCell>
              <TableCell>{periodo.saldoFinal.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 8: Verificar compilação e build**

Run: `npx tsc --noEmit`
Run: `npm run build`
Expected: sem erros; rota `/financeiro/fluxo-de-caixa` aparece na saída do build.

- [ ] **Step 9: Rodar a suíte inteira uma última vez**

Run: `npm test`
Expected: todos os arquivos passam.

- [ ] **Step 10: Commit**

```bash
git add src/app/\(dashboard\)/financeiro/fluxo-de-caixa/ src/app/\(dashboard\)/nav-items.ts
git commit -m "Adicionar tela de fluxo de caixa realizado"
```

---

## Verificação final

1. `npm test` — suíte completa passa, incluindo os novos `fluxoDeCaixa.test.ts` e `formatar-rotulo-periodo.test.ts`.
2. `npx tsc --noEmit` — sem erros.
3. `npm run build` — sem erros; `/financeiro/fluxo-de-caixa` aparece nas rotas.
4. Manual: abrir `/financeiro/fluxo-de-caixa`, conferir a tabela em granularidade Mês (padrão); trocar pra Dia/Semana/Ano e conferir que a janela muda de tamanho; clicar Anterior/Próximo e conferir que a janela desloca corretamente pra cada granularidade; comparar o saldo final do último período com a tela de Tesouraria (saldo contábil da(s) conta(s)) — devem bater se todos os lançamentos estiverem conciliados.
