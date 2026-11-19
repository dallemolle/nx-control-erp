# Projeção em janelas que não contêm hoje — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fazer o fluxo de caixa projetado mostrar um saldo correto em qualquer janela. Numa janela passada ou futura entram, em linhas próprias antes dos meses, as parcelas em aberto que vencem antes dela.

**Architecture:** a função pura `calcularPeriodosFluxoDeCaixaProjetado` passa a encadear até duas linhas antes dos meses: "Em atraso" e "A vencer até". `listarFluxoDeCaixaProjetado` troca a regra `contemHoje` por um *corte* = menor entre o início da janela e o início de hoje (UTC). Tela e export mostram a linha nova.

**Tech Stack:** Next.js (App Router, server components), TypeScript, Prisma, Vitest (testes de integração usam o banco de teste local).

**Spec:** `docs/superpowers/specs/2026-11-19-projecao-janela-fora-de-hoje-design.md`

## Global Constraints

- Rótulos exatos: `Em atraso (venc. até dd/mm/aaaa)` (já existe) e `A vencer até dd/mm/aaaa` (novo), com as datas formatadas em pt-BR e UTC.
- "Hoje" = início do dia em UTC: `Date.UTC(ano, mês, dia)` de `new Date()`.
- Intervalos disjuntos: atraso `< corte`; a vencer `>= início de hoje` e `< início da janela`; meses dentro da janela.
- "Em atraso" passa a existir sempre (mesmo zerada). "A vencer até" só existe quando `início da janela > início de hoje`, também mesmo zerada.
- Com filtro de classificação: acumulado parte de 0 e `alerta: false` em todas as linhas.
- Textos de interface e de docs em português.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Rodar testes com `npx vitest run <arquivo>`. Se o Prisma Client reclamar, rodar `npx prisma generate` antes.

## Arquivos

- Modificar: `src/app/(dashboard)/financeiro/_fluxo-de-caixa/formatar-rotulo-periodo.ts` (rótulo novo)
- Modificar: `src/app/(dashboard)/financeiro/_fluxo-de-caixa/formatar-rotulo-periodo.test.ts`
- Modificar: `src/server/services/fluxoDeCaixaProjetado.ts` (função pura, nova busca, regra do corte)
- Modificar: `src/server/services/fluxoDeCaixaProjetado.test.ts`
- Modificar: `src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/page.tsx`
- Modificar: `src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/export/route.ts`
- Modificar (docs): `content/ajuda/passo-a-passo.md`, `docs/fases/fase-4-fluxo-de-caixa.md`, `docs/backlog.md`, `docs/superpowers/specs/2026-11-16-projecao-parcelas-vencidas-design.md`, `docs/superpowers/specs/2026-11-19-projecao-janela-fora-de-hoje-design.md`

---

### Task 1: Rótulo "A vencer até"

**Files:**
- Modify: `src/app/(dashboard)/financeiro/_fluxo-de-caixa/formatar-rotulo-periodo.ts`
- Test: `src/app/(dashboard)/financeiro/_fluxo-de-caixa/formatar-rotulo-periodo.test.ts`

**Interfaces:**
- Produces: `rotuloAVencerAntes(venceAte: Date): string`, que devolve `"A vencer até dd/mm/aaaa"`.

- [ ] **Step 1: Teste que falha**

No `formatar-rotulo-periodo.test.ts`, trocar o import da linha 2 por:

```ts
import { formatarRotuloPeriodo, rotuloAVencerAntes, rotuloEmAtraso } from "./formatar-rotulo-periodo";
```

e acrescentar ao fim do arquivo:

```ts
describe("rotuloAVencerAntes", () => {
  test("mostra a véspera da janela", () => {
    expect(rotuloAVencerAntes(new Date("2026-12-31T23:59:59.999Z"))).toBe("A vencer até 31/12/2026");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "src/app/(dashboard)/financeiro/_fluxo-de-caixa/formatar-rotulo-periodo.test.ts"`
Expected: FAIL, `rotuloAVencerAntes is not a function` (ou erro de import).

- [ ] **Step 3: Implementar**

No fim de `formatar-rotulo-periodo.ts`:

```ts
/** Rótulo da linha de parcelas que vencem entre hoje e a véspera de uma janela futura. */
export function rotuloAVencerAntes(venceAte: Date): string {
  return `A vencer até ${dataCurta(venceAte)}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run "src/app/(dashboard)/financeiro/_fluxo-de-caixa/formatar-rotulo-periodo.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/financeiro/_fluxo-de-caixa/formatar-rotulo-periodo.ts" "src/app/(dashboard)/financeiro/_fluxo-de-caixa/formatar-rotulo-periodo.test.ts"
git commit -m "feat(financeiro): rótulo da linha A vencer até do fluxo projetado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Função pura encadeia "Em atraso" → "A vencer até" → meses

**Files:**
- Modify: `src/server/services/fluxoDeCaixaProjetado.ts:21-105` (tipos e `calcularPeriodosFluxoDeCaixaProjetado`) e `:163-191` (adaptação mínima de `listarFluxoDeCaixaProjetado`)
- Test: `src/server/services/fluxoDeCaixaProjetado.test.ts:114-143`

**Interfaces:**
- Produces:
  ```ts
  export type LinhaAVencerAntes = Omit<LinhaEmAtraso, "venceuAte"> & { venceAte: Date };
  export type FluxoDeCaixaProjetado = {
    emAtraso: LinhaEmAtraso | null;
    aVencerAntes: LinhaAVencerAntes | null;
    periodos: PeriodoFluxoDeCaixaProjetado[];
  };
  export type ParcelasAntesDaJanela = {
    atrasadas?: { parcelas: ParcelaParaProjecao[]; venceuAte: Date };
    aVencerAntes?: ParcelaParaProjecao[];
  };
  export function calcularPeriodosFluxoDeCaixaProjetado(
    periodos: SubPeriodo[],
    parcelas: ParcelaParaProjecao[],
    saldoInicialAbsoluto: number,
    anteriores?: ParcelasAntesDaJanela,
  ): FluxoDeCaixaProjetado;
  ```
  `aVencerAntes.venceAte` = `periodos[0].inicio − 1 ms`. `emAtraso.venceuAte` vem do chamador.

- [ ] **Step 1: Ajustar os testes da função pura**

Em `fluxoDeCaixaProjetado.test.ts`, substituir os três testes das linhas 114–143 (`"com atrasadas: ..."`, `"atrasadas vazias ..."` e `"linha de atraso com saldo final negativo ..."`) por:

```ts
  const venceuAte = new Date("2026-08-31T23:59:59.999Z");

  test("com atrasadas: linha de atraso soma por tipo e o primeiro mês parte do saldo final dela", () => {
    const atrasadas: ParcelaParaProjecao[] = [
      { dataVencimento: new Date(Date.UTC(2026, 6, 10)), saldo: 400, tipo: "RECEBER" },
      { dataVencimento: new Date(Date.UTC(2026, 7, 20)), saldo: 150, tipo: "PAGAR" },
    ];
    const r = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500, { atrasadas: { parcelas: atrasadas, venceuAte } });
    expect(r.emAtraso).toMatchObject({
      saldoInicial: 500,
      entradasProjetadas: 400,
      saidasProjetadas: 150,
      geracaoLiquida: 250,
      saldoFinal: 750,
      alerta: false,
    });
    expect(r.emAtraso?.venceuAte).toBe(venceuAte);
    expect(r.aVencerAntes).toBeNull();
    expect(r.periodos[0].saldoInicial).toBe(750);
  });

  test("atrasadas vazias geram linha zerada; sem anteriores, as duas linhas são null", () => {
    const vazia = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500, { atrasadas: { parcelas: [], venceuAte } });
    expect(vazia.emAtraso).toMatchObject({ entradasProjetadas: 0, saidasProjetadas: 0, saldoFinal: 500 });
    const sem = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500);
    expect(sem.emAtraso).toBeNull();
    expect(sem.aVencerAntes).toBeNull();
  });

  test("linha de atraso com saldo final negativo marca alerta", () => {
    const r = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 100, {
      atrasadas: { parcelas: [{ dataVencimento: new Date(Date.UTC(2026, 7, 1)), saldo: 300, tipo: "PAGAR" }], venceuAte },
    });
    expect(r.emAtraso).toMatchObject({ saldoFinal: -200, alerta: true });
  });

  test("encadeia atraso → a vencer antes → meses", () => {
    const r = calcularPeriodosFluxoDeCaixaProjetado(
      periodos,
      [{ dataVencimento: new Date(Date.UTC(2026, 8, 5)), saldo: 50, tipo: "RECEBER" }],
      500,
      {
        atrasadas: { parcelas: [{ dataVencimento: new Date(Date.UTC(2026, 5, 1)), saldo: 100, tipo: "PAGAR" }], venceuAte },
        aVencerAntes: [
          { dataVencimento: new Date(Date.UTC(2026, 7, 10)), saldo: 300, tipo: "RECEBER" },
          { dataVencimento: new Date(Date.UTC(2026, 7, 20)), saldo: 20, tipo: "PAGAR" },
        ],
      },
    );
    expect(r.emAtraso).toMatchObject({ saldoInicial: 500, saldoFinal: 400 });
    expect(r.aVencerAntes).toMatchObject({
      saldoInicial: 400,
      entradasProjetadas: 300,
      saidasProjetadas: 20,
      geracaoLiquida: 280,
      saldoFinal: 680,
      alerta: false,
    });
    expect(r.aVencerAntes?.venceAte.toISOString()).toBe("2026-08-31T23:59:59.999Z");
    expect(r.periodos[0]).toMatchObject({ saldoInicial: 680, entradasProjetadas: 50, saldoFinal: 730 });
  });

  test("sem atrasadas, a linha A vencer parte do saldo inicial; vazia gera linha zerada", () => {
    const r = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500, { aVencerAntes: [] });
    expect(r.emAtraso).toBeNull();
    expect(r.aVencerAntes).toMatchObject({ saldoInicial: 500, entradasProjetadas: 0, saidasProjetadas: 0, saldoFinal: 500 });
    expect(r.periodos[0].saldoInicial).toBe(500);
  });

  test("linha A vencer com saldo final negativo marca alerta", () => {
    const r = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 100, {
      aVencerAntes: [{ dataVencimento: new Date(Date.UTC(2026, 7, 1)), saldo: 300, tipo: "PAGAR" }],
    });
    expect(r.aVencerAntes).toMatchObject({ saldoFinal: -200, alerta: true });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/fluxoDeCaixaProjetado.test.ts -t "calcularPeriodosFluxoDeCaixaProjetado"`
Expected: FAIL nos testes novos e alterados (`aVencerAntes` undefined, `emAtraso` null com o objeto no 4º argumento).

- [ ] **Step 3: Implementar a função pura**

Em `fluxoDeCaixaProjetado.ts`, trocar a linha 33 (`export type FluxoDeCaixaProjetado = ...`) por:

```ts
/** Parcelas em aberto que vencem entre hoje e a véspera de uma janela futura. */
export type LinhaAVencerAntes = Omit<LinhaEmAtraso, "venceuAte"> & {
  /** Véspera da janela, para o rótulo "A vencer até". */
  venceAte: Date;
};

export type FluxoDeCaixaProjetado = {
  emAtraso: LinhaEmAtraso | null;
  aVencerAntes: LinhaAVencerAntes | null;
  periodos: PeriodoFluxoDeCaixaProjetado[];
};

/** Parcelas que vencem antes da janela, cada grupo na sua linha (presente = linha existe, mesmo vazia). */
export type ParcelasAntesDaJanela = {
  atrasadas?: { parcelas: ParcelaParaProjecao[]; venceuAte: Date };
  aVencerAntes?: ParcelaParaProjecao[];
};
```

Ajustar o comentário de `LinhaEmAtraso.venceuAte` (linha 23) para:

```ts
  /** Último instante do atraso (véspera do corte) — para o rótulo "venc. até". */
```

E substituir o comentário e o corpo de `calcularPeriodosFluxoDeCaixaProjetado` (linhas 75–105) por:

```ts
/**
 * Agrega as parcelas em aberto (já filtradas por status e escopadas por
 * filial pelo chamador) em cada sub-período, encadeando o saldo final de
 * um como saldo inicial do próximo — mesmo princípio de
 * `calcularPeriodosFluxoDeCaixa` no fluxo realizado, mas agrupando por
 * `tipo` de título (RECEBER/PAGAR) em vez de tipo de lançamento.
 *
 * Antes dos meses, na ordem: a linha "Em atraso" (se `anteriores.atrasadas`
 * vier) e a linha "A vencer até" (se `anteriores.aVencerAntes` vier). Cada
 * uma parte do saldo final da anterior, e os meses partem da última.
 */
export function calcularPeriodosFluxoDeCaixaProjetado(
  periodos: SubPeriodo[],
  parcelas: ParcelaParaProjecao[],
  saldoInicialAbsoluto: number,
  anteriores: ParcelasAntesDaJanela = {},
): FluxoDeCaixaProjetado {
  const emAtraso = anteriores.atrasadas
    ? { venceuAte: anteriores.atrasadas.venceuAte, ...agregar(anteriores.atrasadas.parcelas, saldoInicialAbsoluto) }
    : null;
  const aVencerAntes = anteriores.aVencerAntes
    ? {
        venceAte: new Date(periodos[0].inicio.getTime() - 1),
        ...agregar(anteriores.aVencerAntes, emAtraso ? emAtraso.saldoFinal : saldoInicialAbsoluto),
      }
    : null;
  let saldoCorrente = aVencerAntes?.saldoFinal ?? emAtraso?.saldoFinal ?? saldoInicialAbsoluto;

  const meses = periodos.map(({ inicio, fim }) => {
    const doPeriodo = parcelas.filter((p) => p.dataVencimento >= inicio && p.dataVencimento <= fim);
    const linha = agregar(doPeriodo, saldoCorrente);
    saldoCorrente = linha.saldoFinal;
    return { inicio, fim, ...linha };
  });

  return { emAtraso, aVencerAntes, periodos: meses };
}
```

- [ ] **Step 4: Adaptar `listarFluxoDeCaixaProjetado` sem mudar o comportamento**

Ainda com a regra `contemHoje` (a Task 3 troca a regra). Substituir as linhas 185–190 por:

```ts
  const resultado = calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, saldoInicialAbsoluto, {
    atrasadas: atrasadas && { parcelas: atrasadas, venceuAte: new Date(inicioDaJanela.getTime() - 1) },
  });
  if (!opcoes.classificacao) return resultado;
  return {
    emAtraso: resultado.emAtraso && { ...resultado.emAtraso, alerta: false },
    aVencerAntes: resultado.aVencerAntes && { ...resultado.aVencerAntes, alerta: false },
    periodos: resultado.periodos.map((periodo) => ({ ...periodo, alerta: false })),
  };
```

- [ ] **Step 5: Rodar o arquivo inteiro e o typecheck**

Run: `npx vitest run src/server/services/fluxoDeCaixaProjetado.test.ts`
Expected: PASS (a integração ainda passa, porque o comportamento não mudou).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/fluxoDeCaixaProjetado.ts src/server/services/fluxoDeCaixaProjetado.test.ts
git commit -m "feat(financeiro): linha A vencer antes da janela no cálculo do fluxo projetado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Regra do corte em `listarFluxoDeCaixaProjetado`

**Files:**
- Modify: `src/server/services/fluxoDeCaixaProjetado.ts:136-191`
- Test: `src/server/services/fluxoDeCaixaProjetado.test.ts` (substituir o teste da linha 219 e acrescentar um `describe` novo)

**Interfaces:**
- Consumes: `calcularPeriodosFluxoDeCaixaProjetado(..., { atrasadas, aVencerAntes })` da Task 2.
- Produces: `buscarParcelasEmAbertoVencendoEntre(filialId: string, de: Date, ate: Date, classificacao?: FiltroClassificacao): Promise<ParcelaParaProjecao[]>` (`gte: de, lt: ate`). `listarFluxoDeCaixaProjetado` devolve `emAtraso` sempre preenchida e `aVencerAntes` preenchida só em janela futura.

- [ ] **Step 1: Testes de integração que falham**

Em `fluxoDeCaixaProjetado.test.ts`, apagar o teste `"janela que não contém hoje não tem linha de atraso"` (linhas 219–223). No teste `"parcela em aberto vencida antes da janela entra no atraso e em nenhum mês"` (linha 181), trocar a desestruturação da linha 184 por:

```ts
    const { emAtraso, aVencerAntes, periodos } = await listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", hoje);
```

e acrescentar ao fim do teste:

```ts
    expect(aVencerAntes).toBeNull();
```

Logo depois do `describe("linha Em atraso (integração)", ...)` (depois da linha 253), acrescentar:

```ts
describe("janelas que não contêm hoje (integração)", () => {
  let fixture: FixtureFinanceiro;
  const agora = new Date();
  const ano = agora.getUTCFullYear();
  const inicioDeHoje = new Date(Date.UTC(ano, agora.getUTCMonth(), agora.getUTCDate()));

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("FCPJ", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
  });

  test("ano civil seguinte: atrasada em Em atraso, a vencer até 31/12 na linha nova, nada disso nos meses", async () => {
    await criarTituloNaFixture(fixture, "PAGAR", 111, mesesAtras(2));
    await criarTituloNaFixture(fixture, "RECEBER", 222, inicioDeHoje);
    await criarTituloNaFixture(fixture, "RECEBER", 333, new Date(Date.UTC(ano + 1, 0, 15)));

    const { emAtraso, aVencerAntes, periodos } = await listarFluxoDeCaixaProjetado(
      fixture.sessao,
      "ANO_CIVIL",
      new Date(Date.UTC(ano + 1, 0, 1)),
    );

    expect(emAtraso?.saidasProjetadas).toBe(111);
    expect(emAtraso?.entradasProjetadas).toBe(0);
    expect(emAtraso?.venceuAte.getTime()).toBe(inicioDeHoje.getTime() - 1);
    expect(aVencerAntes?.entradasProjetadas).toBe(222);
    expect(aVencerAntes?.saidasProjetadas).toBe(0);
    expect(aVencerAntes?.venceAte.toISOString()).toBe(`${ano}-12-31T23:59:59.999Z`);
    expect(aVencerAntes!.saldoInicial).toBeCloseTo(emAtraso!.saldoFinal, 2);
    expect(periodos[0].saldoInicial).toBeCloseTo(aVencerAntes!.saldoFinal, 2);
    expect(periodos[0].entradasProjetadas).toBe(333);
    expect(periodos.reduce((soma, p) => soma + p.saidasProjetadas, 0)).toBe(0);
  });

  test("ano civil anterior: o que venceu antes da janela fica em Em atraso, o do ano no mês, sem linha A vencer", async () => {
    await criarTituloNaFixture(fixture, "PAGAR", 444, new Date(Date.UTC(ano - 2, 5, 10)));
    await criarTituloNaFixture(fixture, "PAGAR", 555, new Date(Date.UTC(ano - 1, 5, 10)));

    const { emAtraso, aVencerAntes, periodos } = await listarFluxoDeCaixaProjetado(
      fixture.sessao,
      "ANO_CIVIL",
      new Date(Date.UTC(ano - 1, 0, 1)),
    );

    expect(emAtraso?.saidasProjetadas).toBe(444);
    expect(emAtraso?.venceuAte.toISOString()).toBe(`${ano - 2}-12-31T23:59:59.999Z`);
    expect(aVencerAntes).toBeNull();
    expect(periodos[5].saidasProjetadas).toBe(555);
    expect(periodos[0].saldoInicial).toBeCloseTo(emAtraso!.saldoFinal, 2);
  });

  test("filtro de classificação: linha A vencer só da classificação e sem alerta", async () => {
    const valor = 10_000_000;
    await prisma.titulo.create({
      data: {
        filialId: fixture.filialId,
        tipo: "PAGAR",
        fornecedorId: fixture.fornecedorId,
        documento: `AVENCER-GER-${Date.now()}`,
        dataEmissao: inicioDeHoje,
        dataCompetencia: inicioDeHoje,
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        classificacaoFiscal: "GERENCIAL",
        parcelas: {
          create: [
            { numero: 1, dataVencimento: inicioDeHoje, valorOriginal: valor, valorAtualizado: valor, status: "A_VENCER" },
          ],
        },
      },
    });
    const anoQueVem = new Date(Date.UTC(ano + 1, 0, 1));

    const gerencial = await listarFluxoDeCaixaProjetado(fixture.sessao, "ANO_CIVIL", anoQueVem, { classificacao: "GERENCIAL" });
    expect(gerencial.emAtraso).toMatchObject({ saldoInicial: 0, alerta: false });
    expect(gerencial.aVencerAntes).toMatchObject({ alerta: false });
    expect(gerencial.aVencerAntes!.saidasProjetadas).toBeGreaterThanOrEqual(valor);

    const fiscal = await listarFluxoDeCaixaProjetado(fixture.sessao, "ANO_CIVIL", anoQueVem, { classificacao: "FISCAL" });
    expect(fiscal.aVencerAntes!.saidasProjetadas).toBeLessThan(valor);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/fluxoDeCaixaProjetado.test.ts -t "janelas que não contêm hoje"`
Expected: FAIL. `emAtraso` vem `null` nas janelas que não contêm hoje, e `aVencerAntes` também.

- [ ] **Step 3: Implementar**

Em `fluxoDeCaixaProjetado.ts`, logo depois de `buscarParcelasEmAbertoVencidasAntes` (depois da linha 152), acrescentar:

```ts
/** Parcelas em aberto com vencimento em `[de, ate)` — a linha "A vencer até" de uma janela futura. */
export function buscarParcelasEmAbertoVencendoEntre(
  filialId: string,
  de: Date,
  ate: Date,
  classificacao?: FiltroClassificacao,
): Promise<ParcelaParaProjecao[]> {
  return buscarParcelasEmAberto(filialId, { gte: de, lt: ate }, classificacao);
}
```

(`buscarParcelasEmAberto` já aceita `{ gte?: Date; lte?: Date; lt?: Date }`, então a combinação `gte` + `lt` não exige mudança nele.)

Substituir o comentário e o corpo de `listarFluxoDeCaixaProjetado` (linhas 154–191) por:

```ts
/**
 * Com `opcoes.classificacao`: só parcelas de títulos daquela classificação,
 * partindo de 0 (acumulado — o saldo bancário não se divide) e sem alerta de
 * saldo negativo, que não faz sentido sobre um acumulado parcial.
 *
 * Tudo parte do saldo em caixa de hoje. O corte do atraso é o menor entre o
 * início da janela e o início de hoje: "Em atraso" (sempre presente) soma as
 * parcelas em aberto vencidas antes dele. Numa janela que começa depois de
 * hoje, "A vencer até" soma as que vencem de hoje até a véspera da janela.
 * Os três intervalos (atraso, a vencer, meses) não se sobrepõem.
 */
export async function listarFluxoDeCaixaProjetado(
  sessao: SessaoAtiva,
  modo: ModoJanelaProjetado,
  dataReferencia: Date,
  opcoes: { classificacao?: FiltroClassificacao } = {},
): Promise<FluxoDeCaixaProjetado> {
  requirePermission(sessao.perfil, "titulo:ler");

  const periodos = calcularJanelaProjetada(modo, dataReferencia);
  const inicioDaJanela = periodos[0].inicio;
  const fimDaJanela = periodos[periodos.length - 1].fim;
  const agora = new Date();
  const inicioDeHoje = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
  const corte = inicioDaJanela < inicioDeHoje ? inicioDaJanela : inicioDeHoje;
  const janelaFutura = inicioDaJanela > inicioDeHoje;

  const [saldoInicialAbsoluto, parcelas, atrasadas, aVencerAntes] = await Promise.all([
    opcoes.classificacao ? Promise.resolve(0) : buscarSaldoEmCaixaAte(sessao.filialId, agora),
    buscarParcelasEmAbertoNoPeriodo(sessao.filialId, inicioDaJanela, fimDaJanela, opcoes.classificacao),
    buscarParcelasEmAbertoVencidasAntes(sessao.filialId, corte, opcoes.classificacao),
    janelaFutura
      ? buscarParcelasEmAbertoVencendoEntre(sessao.filialId, inicioDeHoje, inicioDaJanela, opcoes.classificacao)
      : Promise.resolve(undefined),
  ]);

  const resultado = calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, saldoInicialAbsoluto, {
    atrasadas: { parcelas: atrasadas, venceuAte: new Date(corte.getTime() - 1) },
    aVencerAntes,
  });
  if (!opcoes.classificacao) return resultado;
  return {
    emAtraso: resultado.emAtraso && { ...resultado.emAtraso, alerta: false },
    aVencerAntes: resultado.aVencerAntes && { ...resultado.aVencerAntes, alerta: false },
    periodos: resultado.periodos.map((periodo) => ({ ...periodo, alerta: false })),
  };
}
```

- [ ] **Step 4: Rodar o arquivo inteiro e os relatórios por classificação**

Run: `npx vitest run src/server/services/fluxoDeCaixaProjetado.test.ts src/server/services/classificacaoRelatorios.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/fluxoDeCaixaProjetado.ts src/server/services/fluxoDeCaixaProjetado.test.ts
git commit -m "feat(financeiro): projeção soma o que vence antes de janelas passadas e futuras

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Tela e export mostram a linha "A vencer até"

**Files:**
- Modify: `src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/page.tsx:7,39-48,54-60`
- Modify: `src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/export/route.ts:4,53-66`

**Interfaces:**
- Consumes: `aVencerAntes: LinhaAVencerAntes | null` de `listarFluxoDeCaixaProjetado` (Task 3) e `rotuloAVencerAntes` (Task 1).

- [ ] **Step 1: `page.tsx`**

Import da linha 7:

```ts
import { formatarRotuloPeriodo, rotuloAVencerAntes, rotuloEmAtraso } from "../_fluxo-de-caixa/formatar-rotulo-periodo";
```

Linhas 39–48:

```tsx
  const { emAtraso, aVencerAntes, periodos } = await listarFluxoDeCaixaProjetado(sessao, modo, dataReferencia, {
    classificacao,
  });
  const linhas = [
    ...(emAtraso ? [{ chave: "em-atraso", rotulo: rotuloEmAtraso(emAtraso.venceuAte), atraso: true, ...emAtraso }] : []),
    ...(aVencerAntes
      ? [{ chave: "a-vencer-antes", rotulo: rotuloAVencerAntes(aVencerAntes.venceAte), atraso: true, ...aVencerAntes }]
      : []),
    ...periodos.map((periodo) => ({
      chave: periodo.inicio.toISOString(),
      rotulo: formatarRotuloPeriodo("MES", periodo.inicio, periodo.fim),
      atraso: false,
      ...periodo,
    })),
  ];
```

(`atraso: true` só controla o tom discreto do rótulo, e as duas linhas antes dos meses usam esse tom.)

Texto das linhas 54–60:

```tsx
        <p className="text-sm text-muted-foreground">
          Projeção calculada a partir do saldo em caixa conciliado de hoje e
          dos títulos a pagar/receber em aberto. Parcelas em aberto vencidas
          antes do período (ou antes de hoje, num período futuro) entram na
          linha &quot;Em atraso&quot;; num período futuro, o que vence de hoje
          até o início dele entra na linha &quot;A vencer até&quot;. O saldo
          dos meses parte da última dessas linhas. Não considera contratos
          recorrentes, financiamentos nem orçamento (ainda não existem no
          sistema).
        </p>
```

- [ ] **Step 2: `export/route.ts`**

Import da linha 4:

```ts
import { formatarRotuloPeriodo, rotuloAVencerAntes, rotuloEmAtraso } from "../../_fluxo-de-caixa/formatar-rotulo-periodo";
```

Linha 53: `const { emAtraso, aVencerAntes, periodos } = await listarFluxoDeCaixaProjetado(sessao, modo, dataReferencia, { classificacao });`

Montagem das linhas (63–66):

```ts
  const linhas: LinhaExport[] = [
    ...(emAtraso ? [paraLinha(rotuloEmAtraso(emAtraso.venceuAte), emAtraso)] : []),
    ...(aVencerAntes ? [paraLinha(rotuloAVencerAntes(aVencerAntes.venceAte), aVencerAntes)] : []),
    ...periodos.map((periodo) => paraLinha(formatarRotuloPeriodo("MES", periodo.inicio, periodo.fim), periodo)),
  ];
```

- [ ] **Step 3: Typecheck e lint**

Run: `npx tsc --noEmit` e `npx eslint "src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado"`
Expected: sem erros.

- [ ] **Step 4: Conferir no navegador**

Com `npm run dev`, abrir `/financeiro/fluxo-de-caixa-projetado` e conferir:
- `?modo=ANO_CIVIL&data=<ano+1>-01-01`: linhas "Em atraso (venc. até <ontem>)" e "A vencer até 31/12/<ano>" antes de janeiro, e o saldo inicial de janeiro igual ao saldo final da segunda.
- `?modo=ANO_CIVIL&data=<ano-1>-01-01`: só "Em atraso (venc. até 31/12/<ano-2>)".
- Modo móvel atual: igual a antes (só "Em atraso").
- Exportar em CSV na janela do ano seguinte: as duas linhas no topo.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/page.tsx" "src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/export/route.ts"
git commit -m "feat(financeiro): linha A vencer até na tela e no export do fluxo projetado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Docs, ajuda e backlog

**Files:**
- Modify: `content/ajuda/passo-a-passo.md` (seção 3.6)
- Modify: `docs/fases/fase-4-fluxo-de-caixa.md` (seção do fluxo projetado)
- Modify: `docs/superpowers/specs/2026-11-16-projecao-parcelas-vencidas-design.md` (decisão 4 e "fora do escopo")
- Modify: `docs/superpowers/specs/2026-11-19-projecao-janela-fora-de-hoje-design.md` (status)
- Modify: `docs/backlog.md` (remover item)

- [ ] **Step 1: Ajuda**

Na seção 3.6 de `content/ajuda/passo-a-passo.md`, trocar a frase "As parcelas em aberto que venceram antes do primeiro mês aparecem numa linha **Em atraso** no topo; o saldo dos meses parte dela, porque esse dinheiro ainda vai entrar ou sair." por:

```markdown
As parcelas em aberto que venceram antes do primeiro mês aparecem numa linha **Em atraso** no topo, porque esse dinheiro ainda vai entrar ou sair. Ao navegar para um período futuro, o atraso vai até ontem, e uma segunda linha, **A vencer até**, soma o que vence de hoje até a véspera do período; o saldo dos meses parte da última dessas linhas. Num período passado, os meses mostram o que daquele período continua em aberto, como se o atraso fosse quitado até o fim dele.
```

- [ ] **Step 2: Fase 4**

Em `docs/fases/fase-4-fluxo-de-caixa.md`, no item que termina com "entram numa linha Em atraso antes do primeiro mês (2026-11-16).", acrescentar logo depois, dentro do mesmo item:

```markdown
  Em janelas que não contêm hoje, o atraso vai até o menor entre o início
  da janela e hoje, e numa janela futura uma linha "A vencer até" soma o
  que vence entre hoje e a véspera dela (2026-11-19).
```

- [ ] **Step 3: Spec de 2026-11-16**

Em `docs/superpowers/specs/2026-11-16-projecao-parcelas-vencidas-design.md`:
- no fim da decisão 4 (a que começa "**A linha só existe quando a janela contém hoje:**"), acrescentar: ` **Feito** (2026-11-19, [spec](2026-11-19-projecao-janela-fora-de-hoje-design.md)): a linha passou a existir em qualquer janela.`
- no "Fora do escopo", trocar o item "Linha de atraso em janelas que não contêm hoje — **descartado:** pertence ao item "meses invisíveis", já no backlog." por "Linha de atraso em janelas que não contêm hoje — **feito** (2026-11-19, [spec](2026-11-19-projecao-janela-fora-de-hoje-design.md))." (manter a quebra de linha do arquivo).

- [ ] **Step 4: Status da spec nova e backlog**

- Em `2026-11-19-projecao-janela-fora-de-hoje-design.md`, trocar `Status: aprovada para implementação` por `Status: implementada (2026-11-19)`.
- Em `docs/backlog.md`, apagar o item "**Reconstrução da cadeia de saldo em janelas fora do intervalo visível**" e o título `## Fluxo de caixa projetado`, que fica vazio.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add content/ajuda/passo-a-passo.md docs/fases/fase-4-fluxo-de-caixa.md docs/backlog.md docs/superpowers/specs/2026-11-16-projecao-parcelas-vencidas-design.md docs/superpowers/specs/2026-11-19-projecao-janela-fora-de-hoje-design.md
git commit -m "docs(financeiro): ajuda, fase 4 e backlog da projeção fora de hoje

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
