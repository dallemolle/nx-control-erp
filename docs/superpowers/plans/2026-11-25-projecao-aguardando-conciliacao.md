# Projeção considera o que aguarda conciliação — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a projeção (Fluxo de caixa projetado, cards do Dashboard executivo e Fluxo estratégico) parte do saldo contábil — conciliado + o que foi lançado e aguarda conciliação —, para que um pagamento aprovado e ainda não conciliado deixe de sumir da conta.

**Architecture:** uma função nova em `fluxoDeCaixa.ts` soma os lançamentos não conciliados (entradas e saídas). O projetado mostra essa soma numa linha própria, "Aguardando conciliação", antes de "Em atraso". O dashboard e o estratégico somam o aguardando ao saldo conciliado. O saldo projetado em 30 dias passa a incluir os atrasados. O realizado (Fluxo de caixa, Evolução do saldo, Geração de caixa do mês, ano-base do estratégico) continua só com conciliados.

**Tech Stack:** Next.js (App Router, server components), Prisma 7 + PostgreSQL, Vitest (testes de integração usam o banco local), TypeScript.

**Spec:** `docs/superpowers/specs/2026-11-25-projecao-aguardando-conciliacao-design.md`

## Global Constraints

- Todo texto de tela, ajuda, teste e commit em português do Brasil.
- Rótulo da linha nova: exatamente `Aguardando conciliação`.
- Aguardando conciliação = lançamentos com `conciliado: false` em contas com `ativo: true`, **sem corte de data**.
- O saldo conciliado (`buscarSaldoEmCaixaAteDasFiliais`) não muda.
- Na visão filtrada por classificação (Fiscal/Gerencial), não há linha de aguardando (`aguardandoConciliacao: null`) e o saldo de partida continua 0.
- A API REST não muda (o dashboard não é exposto); `docs/api-v1.md` não muda.
- Rodar um arquivo de teste: `npx vitest run <caminho>`. Os testes de integração precisam do Postgres local (`.env` já configurado); se o Prisma reclamar de client desatualizado, rode `npx prisma generate`.
- Antes de cada commit: `npx tsc --noEmit` sem erros nos arquivos tocados.
- Toda mensagem de commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Soma do que aguarda conciliação

**Files:**
- Modify: `src/server/services/fluxoDeCaixa.ts` (logo depois de `buscarSaldoEmCaixaAteDasFiliais`, ~linha 133)
- Test: `src/server/services/fluxoDeCaixa.test.ts` (novo `describe` no fim do arquivo)

**Interfaces:**
- Produces:
  - `export type AguardandoConciliacao = { entradas: number; saidas: number };`
  - `export async function buscarAguardandoConciliacaoDasFiliais(filialIds: string[]): Promise<AguardandoConciliacao>`
  - `export async function buscarAguardandoConciliacao(filialId: string): Promise<AguardandoConciliacao>`
  - `export function saldoComAguardando(saldoConciliado: number, aguardando: AguardandoConciliacao): number` — `saldoConciliado + entradas − saidas`.

- [ ] **Step 1: Escrever o teste que falha**

No fim de `src/server/services/fluxoDeCaixa.test.ts`, adicione `buscarAguardandoConciliacaoDasFiliais` e `saldoComAguardando` ao `import` de `./fluxoDeCaixa` e acrescente:

```ts
describe("saldoComAguardando", () => {
  test("soma as entradas e tira as saídas aguardando do saldo conciliado", () => {
    expect(saldoComAguardando(1000, { entradas: 300, saidas: 1012 })).toBe(288);
  });
});

describe("buscarAguardandoConciliacaoDasFiliais (integração)", () => {
  let fixture: FixtureFinanceiro;
  let contaInativaId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("FCA", "TESOURARIA");
    const contaInativa = await prisma.contaBancaria.create({
      data: {
        filialId: fixture.filialId,
        bancoId: fixture.bancoId,
        agencia: "0001",
        conta: "FCA-inativa",
        saldoInicial: 0,
        ativo: false,
      },
    });
    contaInativaId = contaInativa.id;
    const base = {
      filialId: fixture.filialId,
      origem: "MANUAL" as const,
      usuarioId: fixture.usuarioId,
    };
    await prisma.lancamentoBancario.createMany({
      data: [
        { ...base, contaBancariaId: fixture.contaBancariaId, data: new Date("2026-09-10T00:00:00Z"), tipo: "ENTRADA", valor: 300, descricao: "Não conciliada", conciliado: false },
        { ...base, contaBancariaId: fixture.contaBancariaId, data: new Date("2099-01-10T00:00:00Z"), tipo: "SAIDA", valor: 120, descricao: "Não conciliada com data futura: entra (sem corte de data)", conciliado: false },
        { ...base, contaBancariaId: fixture.contaBancariaId, data: new Date("2026-09-11T00:00:00Z"), tipo: "ENTRADA", valor: 999, descricao: "Conciliada: não entra", conciliado: true },
        { ...base, contaBancariaId: contaInativaId, data: new Date("2026-09-12T00:00:00Z"), tipo: "SAIDA", valor: 5000, descricao: "Conta inativa: não entra", conciliado: false },
      ],
    });
  });

  afterAll(async () => {
    await prisma.lancamentoBancario.deleteMany({ where: { filialId: fixture.filialId } });
    await prisma.contaBancaria.delete({ where: { id: contaInativaId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("soma só os não conciliados de contas ativas, sem corte de data, separando entradas e saídas", async () => {
    expect(await buscarAguardandoConciliacaoDasFiliais([fixture.filialId])).toEqual({ entradas: 300, saidas: 120 });
  });

  test("filial sem nada aguardando devolve zeros", async () => {
    const outra = await criarFixtureFinanceiro("FCA2", "TESOURARIA");
    try {
      expect(await buscarAguardandoConciliacaoDasFiliais([outra.filialId])).toEqual({ entradas: 0, saidas: 0 });
    } finally {
      await limparFixtureFinanceiro(outra);
    }
  });
});
```

Confira em `financeiroTestFixtures.ts` que `FixtureFinanceiro` expõe `bancoId` (o teste do dashboard já usa `fixture.bancoId`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/fluxoDeCaixa.test.ts`
Expected: FAIL — `saldoComAguardando` / `buscarAguardandoConciliacaoDasFiliais` não existem.

- [ ] **Step 3: Implementar**

Em `src/server/services/fluxoDeCaixa.ts`, depois de `buscarSaldoEmCaixaAteDasFiliais`:

```ts
/** Entradas e saídas lançadas que o extrato ainda não confirmou (`conciliado: false`). */
export type AguardandoConciliacao = { entradas: number; saidas: number };

/**
 * O que foi lançado e ainda aguarda conciliação, nas contas ativas das filiais. Sem corte de data, como o saldo
 * contábil da Tesouraria: saldo conciliado + isto = saldo contábil. Usado pelas projeções (o realizado continua só
 * com conciliados).
 */
export async function buscarAguardandoConciliacaoDasFiliais(filialIds: string[]): Promise<AguardandoConciliacao> {
  const somas = await prisma.lancamentoBancario.groupBy({
    by: ["tipo"],
    where: { filialId: { in: filialIds }, conciliado: false, contaBancaria: { ativo: true } },
    _sum: { valor: true },
  });
  return {
    entradas: Number(somas.find((s) => s.tipo === "ENTRADA")?._sum.valor ?? 0),
    saidas: Number(somas.find((s) => s.tipo === "SAIDA")?._sum.valor ?? 0),
  };
}

export async function buscarAguardandoConciliacao(filialId: string): Promise<AguardandoConciliacao> {
  return buscarAguardandoConciliacaoDasFiliais([filialId]);
}

/** Saldo contábil: o conciliado mais o que aguarda conciliação. */
export function saldoComAguardando(saldoConciliado: number, aguardando: AguardandoConciliacao): number {
  return saldoConciliado + aguardando.entradas - aguardando.saidas;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/services/fluxoDeCaixa.test.ts`
Expected: PASS (todos, inclusive os antigos).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/fluxoDeCaixa.ts src/server/services/fluxoDeCaixa.test.ts
git commit -m "feat(fluxo): soma do que aguarda conciliação

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Linha "Aguardando conciliação" no Fluxo de caixa projetado

**Files:**
- Modify: `src/server/services/fluxoDeCaixaProjetado.ts` (tipos ~linhas 23-51, `agregar` ~linha 83, `calcularPeriodosFluxoDeCaixaProjetado` ~linha 103, `listarFluxoDeCaixaProjetado` ~linha 198)
- Modify: `src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/page.tsx`
- Modify: `src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/export/route.ts`
- Test: `src/server/services/fluxoDeCaixaProjetado.test.ts`

**Interfaces:**
- Consumes (Task 1): `AguardandoConciliacao`, `buscarAguardandoConciliacao(filialId)` de `./fluxoDeCaixa`.
- Produces:
  - `export type LinhaAguardandoConciliacao = Omit<LinhaEmAtraso, "venceuAte">;`
  - `FluxoDeCaixaProjetado` ganha `aguardandoConciliacao: LinhaAguardandoConciliacao | null` (primeiro campo).
  - `ParcelasAntesDaJanela` ganha `aguardandoConciliacao?: AguardandoConciliacao`.

- [ ] **Step 1: Escrever os testes unitários que falham**

Em `src/server/services/fluxoDeCaixaProjetado.test.ts`, dentro de `describe("calcularPeriodosFluxoDeCaixaProjetado", ...)` (que já define `periodos` e `venceuAte`), acrescente:

```ts
  test("com aguardando conciliação: a linha parte do saldo conciliado e Em atraso parte do saldo final dela", () => {
    const atrasadas: ParcelaParaProjecao[] = [
      { dataVencimento: new Date(Date.UTC(2026, 6, 10)), saldo: 400, tipo: "RECEBER" },
    ];
    const r = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500, {
      aguardandoConciliacao: { entradas: 100, saidas: 1012 },
      atrasadas: { parcelas: atrasadas, venceuAte },
    });
    expect(r.aguardandoConciliacao).toEqual({
      saldoInicial: 500,
      entradasProjetadas: 100,
      saidasProjetadas: 1012,
      geracaoLiquida: -912,
      saldoFinal: -412,
      alerta: true,
    });
    expect(r.emAtraso?.saldoInicial).toBe(-412);
    expect(r.emAtraso?.saldoFinal).toBe(-12);
    expect(r.periodos[0].saldoInicial).toBe(-12);
  });

  test("sem aguardando, a linha é null e nada muda", () => {
    const r = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500, {});
    expect(r.aguardandoConciliacao).toBeNull();
    expect(r.periodos[0].saldoInicial).toBe(500);
  });

  test("aguardando zerado gera linha zerada", () => {
    const r = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500, { aguardandoConciliacao: { entradas: 0, saidas: 0 } });
    expect(r.aguardandoConciliacao).toMatchObject({ saldoInicial: 500, geracaoLiquida: 0, saldoFinal: 500, alerta: false });
  });
```

O teste existente "atrasadas vazias geram linha zerada; sem anteriores, as duas linhas são null" usa `toMatchObject`/`toBeNull` por campo e não precisa mudar.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/fluxoDeCaixaProjetado.test.ts -t "aguardando"`
Expected: FAIL — `aguardandoConciliacao` é `undefined`.

- [ ] **Step 3: Implementar o cálculo**

Em `fluxoDeCaixaProjetado.ts`:

1. Import: `import { buscarAguardandoConciliacao, buscarSaldoEmCaixaAte, calcularJanela, fimDoDiaUTC, type AguardandoConciliacao, type SubPeriodo } from "./fluxoDeCaixa";`
2. Tipos — depois de `LinhaAVencerAntes`:

```ts
/** Lançamentos ainda não conciliados: liga o saldo conciliado (saldo inicial) ao saldo contábil (saldo final). */
export type LinhaAguardandoConciliacao = Omit<LinhaEmAtraso, "venceuAte">;
```

   `FluxoDeCaixaProjetado` passa a ser:

```ts
export type FluxoDeCaixaProjetado = {
  aguardandoConciliacao: LinhaAguardandoConciliacao | null;
  emAtraso: LinhaEmAtraso | null;
  aVencerAntes: LinhaAVencerAntes | null;
  periodos: PeriodoFluxoDeCaixaProjetado[];
};
```

   `ParcelasAntesDaJanela` ganha `aguardandoConciliacao?: AguardandoConciliacao;` (comentário: "lançado e não conciliado; presente = linha existe, mesmo zerada").

3. Troque `agregar` por duas funções:

```ts
/** Uma linha da projeção a partir das entradas e saídas, encadeando de `saldoInicial`. */
function linha(entradasProjetadas: number, saidasProjetadas: number, saldoInicial: number) {
  const geracaoLiquida = entradasProjetadas - saidasProjetadas;
  const saldoFinal = saldoInicial + geracaoLiquida;
  return { saldoInicial, entradasProjetadas, saidasProjetadas, geracaoLiquida, saldoFinal, alerta: saldoFinal < 0 };
}

/** Soma as parcelas por tipo e encadeia o saldo a partir de `saldoInicial`. */
function agregar(parcelas: ParcelaParaProjecao[], saldoInicial: number) {
  const entradas = parcelas.filter((p) => p.tipo === "RECEBER").reduce((soma, p) => soma + p.saldo, 0);
  const saidas = parcelas.filter((p) => p.tipo === "PAGAR").reduce((soma, p) => soma + p.saldo, 0);
  return linha(entradas, saidas, saldoInicial);
}
```

4. Em `calcularPeriodosFluxoDeCaixaProjetado`, atualize o JSDoc ("Antes dos meses, na ordem: 'Aguardando conciliação' (se `anteriores.aguardandoConciliacao` vier), 'Em atraso' e 'A vencer até'...") e o começo do corpo:

```ts
  const aguardandoConciliacao = anteriores.aguardandoConciliacao
    ? linha(anteriores.aguardandoConciliacao.entradas, anteriores.aguardandoConciliacao.saidas, saldoInicialAbsoluto)
    : null;
  const saldoDePartida = aguardandoConciliacao?.saldoFinal ?? saldoInicialAbsoluto;
  const emAtraso = anteriores.atrasadas
    ? { venceuAte: anteriores.atrasadas.venceuAte, ...agregar(anteriores.atrasadas.parcelas, saldoDePartida) }
    : null;
  const aVencerAntes = anteriores.aVencerAntes
    ? {
        venceAte: new Date(periodos[0].inicio.getTime() - 1),
        ...agregar(anteriores.aVencerAntes, emAtraso ? emAtraso.saldoFinal : saldoDePartida),
      }
    : null;
  let saldoCorrente = aVencerAntes?.saldoFinal ?? emAtraso?.saldoFinal ?? saldoDePartida;
```

   e o retorno: `return { aguardandoConciliacao, emAtraso, aVencerAntes, periodos: meses };`

- [ ] **Step 4: Rodar os unitários**

Run: `npx vitest run src/server/services/fluxoDeCaixaProjetado.test.ts -t "calcularPeriodosFluxoDeCaixaProjetado"`
Expected: PASS.

- [ ] **Step 5: Testes de integração que falham**

No `describe("buscarParcelasEmAbertoNoPeriodo / listarFluxoDeCaixaProjetado (integração)")`:

(a) Troque o teste "saldoInicial do primeiro mês reflete o saldo em caixa conciliado de hoje, e encadeia para o mês seguinte" (título e asserções) por:

```ts
  test("Aguardando conciliação parte do saldo conciliado de hoje, e Em atraso e os meses encadeiam a partir dela", async () => {
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date(Date.now() - 24 * 60 * 60 * 1000),
        tipo: "ENTRADA",
        valor: 5000,
        descricao: "Saldo conciliado de teste — ancora do fluxo projetado",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });

    const agora = new Date();
    const [{ aguardandoConciliacao, emAtraso, periodos }, saldoDireto] = await Promise.all([
      listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", agora),
      buscarSaldoEmCaixaAte(fixture.filialId, agora),
    ]);

    expect(saldoDireto).toBeGreaterThanOrEqual(5000);
    expect(aguardandoConciliacao!.saldoInicial).toBeCloseTo(saldoDireto, 2);
    expect(emAtraso!.saldoInicial).toBeCloseTo(aguardandoConciliacao!.saldoFinal, 2);
    expect(periodos[0].saldoInicial).toBeCloseTo(emAtraso!.saldoFinal, 2);
    expect(periodos[1].saldoInicial).toBeCloseTo(periodos[0].saldoFinal, 2);
  });
```

(b) Acrescente, no mesmo `describe`:

```ts
  test("baixa aprovada e não conciliada: vai para Aguardando conciliação e o saldo final dos meses não muda", async () => {
    const agora = new Date();
    const vencimento = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() + 10));
    const titulo = await criarTituloDeTeste("PAGAR", 1012, vencimento);
    const antes = await listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", agora);

    const baixa = await registrarBaixa(fixture.sessao, titulo.parcelas[0].id, {
      data: agora,
      valorPago: 1012,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });
    await aprovarBaixa(fixture.sessao, baixa.id);
    const depois = await listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", agora);

    expect(depois.aguardandoConciliacao!.saidasProjetadas - antes.aguardandoConciliacao!.saidasProjetadas).toBeCloseTo(1012, 2);
    expect(depois.periodos.at(-1)!.saldoFinal).toBeCloseTo(antes.periodos.at(-1)!.saldoFinal, 2);
  });

  test("visão filtrada não tem a linha Aguardando conciliação", async () => {
    const r = await listarFluxoDeCaixaProjetado(fixture.sessao, "MOVEL", new Date(), { classificacao: "FISCAL" });
    expect(r.aguardandoConciliacao).toBeNull();
  });
```

(A conta da fixture é CORRENTE, então o lançamento da baixa nasce `conciliado: false`.)

Run: `npx vitest run src/server/services/fluxoDeCaixaProjetado.test.ts`
Expected: FAIL nos testes novos (o serviço ainda não busca o aguardando).

- [ ] **Step 6: Implementar no serviço**

Em `listarFluxoDeCaixaProjetado`:

```ts
  const [saldoInicialAbsoluto, aguardandoConciliacao, parcelas, atrasadas, aVencerAntes] = await Promise.all([
    opcoes.classificacao ? Promise.resolve(0) : buscarSaldoEmCaixaAte(sessao.filialId, agora),
    opcoes.classificacao ? Promise.resolve(undefined) : buscarAguardandoConciliacao(sessao.filialId),
    buscarParcelasEmAbertoNoPeriodo(sessao.filialId, inicioDaJanela, fimDaJanela, opcoes.classificacao),
    buscarParcelasEmAbertoVencidasAntes(sessao.filialId, corte, opcoes.classificacao),
    janelaFutura
      ? buscarParcelasEmAbertoVencendoEntre(sessao.filialId, inicioDeHoje, inicioDaJanela, opcoes.classificacao)
      : Promise.resolve(undefined),
  ]);

  const resultado = calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, saldoInicialAbsoluto, {
    aguardandoConciliacao,
    atrasadas: { parcelas: atrasadas, venceuAte: new Date(corte.getTime() - 1) },
    aVencerAntes,
  });
  if (!opcoes.classificacao) return resultado;
  return {
    aguardandoConciliacao: null,
    emAtraso: resultado.emAtraso && { ...resultado.emAtraso, alerta: false },
    aVencerAntes: resultado.aVencerAntes && { ...resultado.aVencerAntes, alerta: false },
    periodos: resultado.periodos.map((periodo) => ({ ...periodo, alerta: false })),
  };
```

Atualize o JSDoc da função: "Tudo parte do saldo em caixa conciliado de hoje; a linha 'Aguardando conciliação' soma o que foi lançado e o extrato ainda não confirmou e chega ao saldo contábil, de onde partem as demais."

Run: `npx vitest run src/server/services/fluxoDeCaixaProjetado.test.ts src/server/services/classificacaoRelatorios.test.ts`
Expected: PASS.

- [ ] **Step 7: Tela e exportação**

`page.tsx`:
- Desestruture `aguardandoConciliacao` também e ponha a linha antes de "Em atraso":

```ts
  const { aguardandoConciliacao, emAtraso, aVencerAntes, periodos } = await listarFluxoDeCaixaProjetado(sessao, modo, dataReferencia, {
    classificacao,
  });
  const linhas = [
    ...(aguardandoConciliacao
      ? [{ chave: "aguardando-conciliacao", rotulo: "Aguardando conciliação", atraso: true, ...aguardandoConciliacao }]
      : []),
    ...(emAtraso ? [{ chave: "em-atraso", rotulo: rotuloEmAtraso(emAtraso.venceuAte), atraso: true, ...emAtraso }] : []),
    // (resto igual)
```

- Troque o parágrafo de descrição por:

```tsx
        <p className="text-sm text-muted-foreground">
          Projeção calculada a partir do saldo em caixa conciliado de hoje e
          dos títulos a pagar/receber em aberto. A linha &quot;Aguardando
          conciliação&quot; soma o que já foi lançado (baixas aprovadas,
          lançamentos manuais, transferências) e o extrato ainda não
          confirmou, e termina no saldo contábil da Tesouraria. Parcelas em
          aberto vencidas antes do período (ou antes de hoje, num período
          futuro) entram na linha &quot;Em atraso&quot;; num período futuro, o
          que vence de hoje até o início dele entra na linha &quot;A vencer
          até&quot;. O saldo dos meses parte da última dessas linhas. Não
          considera contratos recorrentes, financiamentos nem orçamento (ainda
          não existem no sistema).
        </p>
```

`export/route.ts`: desestruture `aguardandoConciliacao` e ponha `...(aguardandoConciliacao ? [paraLinha("Aguardando conciliação", aguardandoConciliacao)] : []),` como primeiro item de `linhas`.

Run: `npx tsc --noEmit`
Expected: sem erros novos. (Erros em `src/ajuda/fluxo-de-caixa-projetado/*` não são esperados: a ajuda usa dados próprios.)

- [ ] **Step 8: Commit**

```bash
git add src/server/services/fluxoDeCaixaProjetado.ts src/server/services/fluxoDeCaixaProjetado.test.ts "src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/page.tsx" "src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/export/route.ts"
git commit -m "fix(projecao): linha Aguardando conciliação no fluxo projetado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Dashboard executivo — caixa contábil e saldo projetado igual à tela

**Files:**
- Modify: `src/server/services/dashboardExecutivo.ts` (`IndicadoresExecutivos` ~linha 12, `calcularIndicadoresExecutivos` ~linha 80, `buscarIndicadoresExecutivos` ~linha 146)
- Modify: `src/app/(dashboard)/dashboard-executivo/page.tsx` (cards)
- Modify: `src/ajuda/dashboard-executivo/index.tsx` e `src/ajuda/dashboard-executivo/dashboard-executivo.test.ts` (o teste da ajuda chama `calcularIndicadoresExecutivos` e quebra com a assinatura nova)
- Test: `src/server/services/dashboardExecutivo.test.ts`

**Interfaces:**
- Consumes (Task 1): `AguardandoConciliacao`, `buscarAguardandoConciliacaoDasFiliais`, `saldoComAguardando`.
- Produces:
  - `IndicadoresExecutivos` ganha `aguardandoConciliacao: number` (entradas − saídas aguardando), logo depois de `caixaDisponivel`.
  - `calcularIndicadoresExecutivos(dados: { hoje: Date; caixaConciliado: number; aguardandoConciliacao: AguardandoConciliacao; parcelas: readonly ParcelaParaIndicadores[]; entradasMes: number; saidasMes: number })`.

- [ ] **Step 1: Testes unitários que falham**

Em `dashboardExecutivo.test.ts`, no `describe("calcularIndicadoresExecutivos e calcularAging")`:

(a) No teste "inadimplência é a receber vencida pela data...", troque `caixaDisponivel: 1000,` na entrada por `caixaConciliado: 1000, aguardandoConciliacao: { entradas: 0, saidas: 0 },` e o `toEqual` por:

```ts
    expect(indicadores).toEqual({
      caixaDisponivel: 1000,
      aguardandoConciliacao: 0,
      contasAPagarEmAberto: 1199,
      contasAReceberEmAberto: 530,
      inadimplencia: 450,
      geracaoDeCaixaMesAtual: 300,
      obrigacoes7Dias: 100,
      obrigacoes30Dias: 200,
      recebimentosEsperados30Dias: 80,
      // 1000 + 450 a receber vencido − 0 a pagar vencido + 80 − 200
      saldoProjetado30Dias: 1330,
    });
```

(b) Acrescente:

```ts
  test("caixa disponível é o contábil; saldo projetado soma atrasados e o que aguarda conciliação, como o projetado", () => {
    const indicadores = calcularIndicadoresExecutivos({
      hoje,
      caixaConciliado: 10000,
      aguardandoConciliacao: { entradas: 200, saidas: 1012 },
      entradasMes: 0,
      saidasMes: 0,
      parcelas: [
        { tipo: "PAGAR", dataVencimento: dia("2026-11-10"), saldo: 600 }, // a pagar vencido
        { tipo: "RECEBER", dataVencimento: dia("2026-11-01"), saldo: 450 }, // a receber vencido
        { tipo: "RECEBER", dataVencimento: dia("2026-12-01"), saldo: 300 },
        { tipo: "PAGAR", dataVencimento: dia("2026-12-01"), saldo: 100 },
      ],
    });
    expect(indicadores.caixaDisponivel).toBe(9188);
    expect(indicadores.aguardandoConciliacao).toBe(-812);
    expect(indicadores.obrigacoes30Dias).toBe(100);
    expect(indicadores.recebimentosEsperados30Dias).toBe(300);
    // 9188 + 450 − 600 + 300 − 100
    expect(indicadores.saldoProjetado30Dias).toBe(9238);
  });
```

Run: `npx vitest run src/server/services/dashboardExecutivo.test.ts -t "calcularIndicadoresExecutivos"`
Expected: FAIL.

- [ ] **Step 2: Implementar o cálculo**

Em `dashboardExecutivo.ts`:
- Import: `import { buscarAguardandoConciliacaoDasFiliais, buscarSaldoEmCaixaAteDasFiliais, fimDoDiaUTC, saldoComAguardando, type AguardandoConciliacao } from "./fluxoDeCaixa";`
- `IndicadoresExecutivos`: acrescente `aguardandoConciliacao: number;` depois de `caixaDisponivel`.
- `calcularIndicadoresExecutivos`:

```ts
/**
 * Os cards do dashboard a partir do caixa, das parcelas em aberto e do movimento conciliado do mês. `hoje` é a data
 * de calendário (meia-noite UTC). Inadimplência = a receber com vencimento antes de hoje, pela data (o `status`
 * gravado só é recalculado quando alguém abre a lista de títulos, e a parcela vencida paga em parte também conta).
 *
 * Caixa disponível é o saldo contábil (conciliado + o que aguarda conciliação), como na Tesouraria. O saldo projetado
 * em 30 dias é a mesma conta do Fluxo de caixa projetado: caixa disponível + atrasados (a receber − a pagar) + o que
 * vence nos próximos 30 dias (a receber − a pagar).
 */
export function calcularIndicadoresExecutivos(dados: {
  hoje: Date;
  caixaConciliado: number;
  aguardandoConciliacao: AguardandoConciliacao;
  parcelas: readonly ParcelaParaIndicadores[];
  entradasMes: number;
  saidasMes: number;
}): IndicadoresExecutivos {
```

  Declare `let aPagarVencido = 0;` junto dos outros acumuladores; no `if (tipo === "PAGAR")` acrescente `if (vencida) aPagarVencido += saldo;`. No retorno:

```ts
  const caixaDisponivel = saldoComAguardando(dados.caixaConciliado, dados.aguardandoConciliacao);
  return {
    caixaDisponivel,
    aguardandoConciliacao: dados.aguardandoConciliacao.entradas - dados.aguardandoConciliacao.saidas,
    contasAPagarEmAberto,
    contasAReceberEmAberto,
    inadimplencia,
    geracaoDeCaixaMesAtual: dados.entradasMes - dados.saidasMes,
    obrigacoes7Dias,
    obrigacoes30Dias,
    recebimentosEsperados30Dias,
    saldoProjetado30Dias:
      caixaDisponivel + inadimplencia - aPagarVencido + recebimentosEsperados30Dias - obrigacoes30Dias,
  };
```

- `buscarIndicadoresExecutivos`:

```ts
  const [caixaConciliado, aguardandoConciliacao, parcelasEmAberto, somasMes] = await Promise.all([
    buscarSaldoEmCaixaAteDasFiliais(filialIds, fimDeHoje),
    buscarAguardandoConciliacaoDasFiliais(filialIds),
    buscarParcelasEmAbertoDasFiliais(filialIds),
    somasConciliadasNoPeriodo(filialIds, inicioMesAtual, fimDeHoje),
  ]);

  return calcularIndicadoresExecutivos({
    hoje,
    caixaConciliado,
    aguardandoConciliacao,
    parcelas: paraIndicadores(parcelasEmAberto),
    entradasMes: totalDoTipo(somasMes, "ENTRADA"),
    saidasMes: totalDoTipo(somasMes, "SAIDA"),
  });
```

Run: `npx vitest run src/server/services/dashboardExecutivo.test.ts -t "calcularIndicadoresExecutivos"`
Expected: PASS.

- [ ] **Step 3: Testes de integração**

No `describe("buscarIndicadoresExecutivos (integração)")`, troque o teste "saldoProjetado30Dias é caixaDisponivel + recebimentosEsperados30Dias - obrigacoes30Dias" por:

```ts
  test("lançamento não conciliado entra no caixa disponível, no aguardando e no saldo projetado", async () => {
    const antes = await buscarIndicadoresExecutivos(sessaoGestor);
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: hoje,
        tipo: "SAIDA",
        valor: 1012,
        descricao: "Baixa aprovada, ainda não conciliada",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: false,
      },
    });
    const depois = await buscarIndicadoresExecutivos(sessaoGestor);
    expect(depois.caixaDisponivel - antes.caixaDisponivel).toBeCloseTo(-1012, 2);
    expect(depois.aguardandoConciliacao - antes.aguardandoConciliacao).toBeCloseTo(-1012, 2);
    expect(depois.saldoProjetado30Dias - antes.saldoProjetado30Dias).toBeCloseTo(-1012, 2);
    expect(depois.geracaoDeCaixaMesAtual).toBeCloseTo(antes.geracaoDeCaixaMesAtual, 2);
  });
```

O teste "caixaDisponivel soma o saldo conciliado de todas as filiais da empresa" continua valendo (não há não conciliados antes dele); renomeie para "caixaDisponivel soma o saldo de todas as filiais da empresa".

Run: `npx vitest run src/server/services/dashboardExecutivo.test.ts`
Expected: PASS.

- [ ] **Step 4: Cards da tela**

Em `src/app/(dashboard)/dashboard-executivo/page.tsx`, os cards ganham uma nota opcional:

```ts
  const cards: { label: string; valor: number; nota?: string }[] = [
    {
      label: "Caixa disponível",
      valor: indicadores.caixaDisponivel,
      nota:
        Math.abs(indicadores.aguardandoConciliacao) >= 0.005
          ? `${formatarMoeda(indicadores.aguardandoConciliacao)} aguardando conciliação`
          : undefined,
    },
    // ... os sete do meio iguais ...
    {
      label: "Saldo projetado (30 dias)",
      valor: indicadores.saldoProjetado30Dias,
      nota: "Inclui atrasados e o que aguarda conciliação",
    },
  ];
```

e no `CardContent`:

```tsx
            <CardContent>
              <p className="text-2xl font-semibold">{formatarMoeda(card.valor)}</p>
              {card.nota && <p className="mt-1 text-xs text-muted-foreground">{card.nota}</p>}
            </CardContent>
```

- [ ] **Step 5: Ajuda do Dashboard executivo**

Em `src/ajuda/dashboard-executivo/index.tsx`:

1. No JSDoc do exemplo, acrescente: "A parcela 2 do adubo (R$ 1.012,00) foi paga e aprovada em 19/11 e ainda aguarda conciliação."
2. Troque `export const CAIXA_DISPONIVEL = 52300;` por:

```ts
/** Saldo conciliado das contas em 22/11 (o fim da evolução do saldo). */
export const CAIXA_CONCILIADO = 52300;

/** A parcela 2 do adubo, paga e aprovada em 19/11, que o extrato ainda não confirmou. */
export const AGUARDANDO_CONCILIACAO = { entradas: 0, saidas: 1012 } as const;
```

3. `INDICADORES`: `caixaDisponivel: 51288,` + `aguardandoConciliacao: -1012,` (logo depois) e `saldoProjetado30Dias: 60908,` (51.288 + 730 − 600 + 15.700 − 6.210). Os demais valores não mudam.
4. `CARDS` ganha `nota?: string` no tipo; Caixa disponível com `nota: \`${formatarMoeda(INDICADORES.aguardandoConciliacao)} aguardando conciliação\``, Saldo projetado com `nota: "Inclui atrasados e o que aguarda conciliação"`. Na `CenaPainel`, dentro do `CardValor`, depois do valor: `{card.nota && <p className="mt-1 text-xs text-muted-foreground">{card.nota}</p>}`.
5. Roteiro `ler-indicadores`:
   - passo `card.caixa`:
     ```ts
          explicacao:
            `Saldo de todas as contas das filiais ativas em ${HOJE}, o mesmo saldo contábil da Tesouraria: o que o ` +
            `extrato já confirmou (${moeda(CAIXA_CONCILIADO)}) mais o que foi lançado e ainda aguarda conciliação. No ` +
            `exemplo, a parcela 2 do adubo, paga e aprovada em 19/11: ${moeda(INDICADORES.caixaDisponivel)}.`,
          dica: "A linha embaixo do valor mostra quanto ainda aguarda conciliação. Ela some quando tudo está conciliado.",
     ```
   - passo `card.projetado`:
     ```ts
          explicacao:
            "A mesma conta do Fluxo de caixa projetado: caixa disponível + atrasados (a receber − a pagar) + " +
            `recebimentos esperados − obrigações de 30 dias: ${moeda(INDICADORES.caixaDisponivel)} + ` +
            `${moeda(INDICADORES.inadimplencia)} − R$ 600,00 + ${moeda(INDICADORES.recebimentosEsperados30Dias)} − ` +
            `${moeda(INDICADORES.obrigacoes30Dias)} = ${moeda(INDICADORES.saldoProjetado30Dias)}.`,
          dica:
            "Os atrasados entram porque esse dinheiro ainda vai entrar ou sair. Para ver mês a mês, use o Fluxo de " +
            "caixa projetado.",
     ```
   - passo `grafico.saldo` (roteiro `ler-graficos`):
     ```ts
          explicacao:
            "O saldo conciliado de todas as contas no fim de cada mês. O mês atual vai até o último dia: sem " +
            `lançamento com data futura, é o caixa conciliado (${moeda(CAIXA_CONCILIADO)}). O Caixa disponível ` +
            "soma a isso o que aguarda conciliação.",
     ```
   Confira que `moeda` existe no arquivo (já é usado nos roteiros) e importe `CAIXA_CONCILIADO` onde for usado (está no mesmo arquivo).

Em `dashboard-executivo.test.ts`: troque o import `CAIXA_DISPONIVEL` por `CAIXA_CONCILIADO, AGUARDANDO_CONCILIACAO`; na chamada troque `caixaDisponivel: CAIXA_DISPONIVEL,` por `caixaConciliado: CAIXA_CONCILIADO, aguardandoConciliacao: AGUARDANDO_CONCILIACAO,`; o teste "o saldo de novembro fecha com o caixa disponível" vira "o saldo de novembro fecha com o caixa conciliado" e compara com `CAIXA_CONCILIADO`.

Run: `npx vitest run src/ajuda/dashboard-executivo src/server/services/dashboardExecutivo.test.ts && npx tsc --noEmit`
Expected: PASS, sem erros de tipo.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/dashboardExecutivo.ts src/server/services/dashboardExecutivo.test.ts "src/app/(dashboard)/dashboard-executivo/page.tsx" src/ajuda/dashboard-executivo
git commit -m "fix(dashboard): caixa contábil e saldo projetado igual ao fluxo projetado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Fluxo estratégico parte do saldo contábil

**Files:**
- Modify: `src/server/services/fluxoDeCaixaEstrategico.ts` (`buscarAnoBaseConsolidado`, ~linha 100)
- Modify: `src/ajuda/fluxo-de-caixa-estrategico/exemplo.ts` (comentário do `ANO_BASE`) e `src/ajuda/fluxo-de-caixa-estrategico/roteiros.ts` (passo `BASE.linha.saldo`)
- Test: `src/server/services/fluxoDeCaixaEstrategico.test.ts`

**Interfaces:**
- Consumes (Task 1): `buscarAguardandoConciliacaoDasFiliais`, `saldoComAguardando`.

- [ ] **Step 1: Teste que falha**

No fim do `describe("buscarAnoBaseConsolidado / listarProjecaoEstrategica com classificação (FG5)")` (depois de "a projeção filtrada acumula a partir de zero"):

```ts
  test("o saldo de partida soma o que aguarda conciliação; o ano-base continua só conciliado", async () => {
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date(),
        tipo: "SAIDA",
        valor: 200,
        descricao: "FG5 não conciliado",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: false,
        classificacaoFiscal: "GERENCIAL",
      },
    });
    expect(await buscarAnoBaseConsolidado(fixture.empresaId)).toEqual({
      receitaBase: 1350,
      custoBase: 100,
      saldoCaixaBase: 1050,
    });
    expect((await buscarAnoBaseConsolidado(fixture.empresaId, { classificacao: "GERENCIAL" })).saldoCaixaBase).toBe(0);
  });
```

Run: `npx vitest run src/server/services/fluxoDeCaixaEstrategico.test.ts`
Expected: FAIL (`saldoCaixaBase` 1250).

- [ ] **Step 2: Implementar**

Import: `import { buscarAguardandoConciliacaoDasFiliais, buscarSaldoEmCaixaAteDasFiliais, saldoComAguardando } from "./fluxoDeCaixa";`. Em `buscarAnoBaseConsolidado`, troque a primeira promessa do `Promise.all` por:

```ts
    opcoes.classificacao
      ? Promise.resolve(0)
      : Promise.all([
          buscarSaldoEmCaixaAteDasFiliais(filialIds, hoje),
          buscarAguardandoConciliacaoDasFiliais(filialIds),
        ]).then(([conciliado, aguardando]) => saldoComAguardando(conciliado, aguardando)),
```

e acrescente ao JSDoc: "O saldo de partida é o saldo contábil de hoje (conciliado + o que aguarda conciliação), o mesmo de onde parte o Fluxo de caixa projetado; o ano-base continua só com conciliados."

Run: `npx vitest run src/server/services/fluxoDeCaixaEstrategico.test.ts`
Expected: PASS.

- [ ] **Step 3: Ajuda do estratégico**

- `exemplo.ts`: comentário do `ANO_BASE` vira `/** Ano-base: realizado conciliado dos últimos 12 meses; saldo em caixa de hoje (conciliado + aguardando conciliação, o mesmo de onde parte o Fluxo de caixa projetado). */` (o valor 47.850 já é o saldo contábil do exemplo do projetado).
- `roteiros.ts`, passo `BASE.linha.saldo`:

```ts
        explicacao:
          "Parte do saldo em caixa de hoje (o conciliado mais o que foi lançado e aguarda conciliação, o mesmo " +
          "saldo contábil da Tesouraria) e soma a geração líquida de cada ano (receita − custo − CAPEX + dívida " +
          "nova − juros). Fica vermelho quando é negativo.",
```

Run: `npx vitest run src/ajuda/fluxo-de-caixa-estrategico`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/services/fluxoDeCaixaEstrategico.ts src/server/services/fluxoDeCaixaEstrategico.test.ts src/ajuda/fluxo-de-caixa-estrategico
git commit -m "fix(estrategico): saldo de partida contábil

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ajuda do Fluxo de caixa projetado

**Files:**
- Modify: `src/ajuda/fluxo-de-caixa-projetado/exemplo.ts`, `cenas.tsx`, `alvos.ts`, `roteiros.ts`
- Test: `src/ajuda/fluxo-de-caixa-projetado/roteiros.test.ts`

**Interfaces:**
- Produces (dentro da ajuda): `SALDO_CONCILIADO`, `AGUARDANDO: Linha`, `Linha.tipo` aceita `"aguardando"`, alvo `linha.aguardando`.

- [ ] **Step 1: Testes que falham**

Em `roteiros.test.ts`, acrescente:

```ts
  test("a linha Aguardando conciliação liga o saldo conciliado ao saldo de hoje, e a visão filtrada não tem", () => {
    const html = renderToStaticMarkup(createElement(cenas.painel, { valores: {} }));
    expect(html).toContain("Aguardando conciliação");
    expect(html).toContain("R$ 48.862,00");
    expect(html).toContain("R$ 47.850,00");
    const fiscal = renderToStaticMarkup(createElement(cenas.painel, { valores: { "painel.classificacao": "Fiscal" } }));
    expect(fiscal).not.toContain("Aguardando conciliação");
  });
```

Run: `npx vitest run src/ajuda/fluxo-de-caixa-projetado`
Expected: FAIL.

- [ ] **Step 2: Exemplo**

Em `exemplo.ts`:
- `export type Linha = { rotulo: string; entradas: number; saidas: number; tipo?: "aguardando" | "atraso" | "aVencer" };`
- Troque o bloco do `SALDO_DE_HOJE` por:

```ts
/** Saldo conciliado de hoje. */
export const SALDO_CONCILIADO = 48_862;

/** A parcela 2 do adubo, paga e aprovada em 19/11, que o extrato ainda não confirmou. */
export const AGUARDANDO: Linha = { rotulo: "Aguardando conciliação", entradas: 0, saidas: 1_012, tipo: "aguardando" };

/** Saldo de hoje, contábil: o conciliado mais o que aguarda conciliação. As visões partem daqui. */
export const SALDO_DE_HOJE = SALDO_CONCILIADO + AGUARDANDO.entradas - AGUARDANDO.saidas; // 47.850
```

  As listas `MOVEL`, `FUTURA`, `ANO_CIVIL`, `MOVEL_FISCAL` não mudam (o saldo de partida dos meses continua 47.850, então os testes de -R$ 5.450,00 e R$ 50.850,00 continuam valendo, e o `ANO_BASE.saldoCaixa` do estratégico, 47.850, continua batendo). `SALDO_DE_HOJE` só é usado em `cenas.tsx`, que deixa de importá-lo no Step 3; mantê-lo exportado documenta o 47.850.

- [ ] **Step 3: Cena e alvos**

`alvos.ts`: acrescente `"linha.aguardando",` antes de `"linha.atraso",`.

`cenas.tsx`:
- Import: `import { AGUARDANDO, ANO_CIVIL, FUTURA, MOVEL, MOVEL_FISCAL, SALDO_CONCILIADO, type Linha } from "./exemplo";` (sai `SALDO_DE_HOJE`).
- Em `CenaPainel`:

```ts
  const visao = modo === "Ano civil" ? ANO_CIVIL : futura ? FUTURA : MOVEL;
  const linhas = filtro ? encadear(MOVEL_FISCAL, 0, false) : encadear([AGUARDANDO, ...visao], SALDO_CONCILIADO, true);
```

  (remova as linhas antigas de `base` e `linhas`).
- `alvoLinha`:

```ts
              const alvoLinha =
                l.tipo === "aguardando"
                  ? "linha.aguardando"
                  : l.tipo === "atraso"
                    ? "linha.atraso"
                    : l.tipo === "aVencer"
                      ? "linha.aVencer"
                      : null;
```

- Parágrafo de descrição: o mesmo texto novo do `page.tsx` da Task 2, Step 7 (copie igual, em uma `<p>` com as mesmas classes).

- [ ] **Step 4: Roteiro `ler-projecao`**

Em `roteiros.ts`:
- Passo `col.saldoInicial`:

```ts
        instrucao: "O ponto de partida é o saldo conciliado de hoje",
        explicacao:
          "O saldo inicial da primeira linha é o saldo em caixa de hoje que o extrato já confirmou, somando todas " +
          "as contas ativas da filial (o mesmo do Fluxo de caixa).",
```

- Novo passo, logo depois dele:

```ts
      {
        cena: "painel",
        alvo: "linha.aguardando",
        instrucao: "Aguardando conciliação: o que já foi lançado e o extrato ainda não confirmou",
        explicacao:
          "Baixas aprovadas, lançamentos manuais e transferências que ainda não foram conciliados. No exemplo, a " +
          "parcela 2 do adubo, R$ 1.012,00, paga e aprovada em 19/11. O saldo final desta linha é o saldo " +
          "contábil da Tesouraria (R$ 47.850,00), e é dele que as outras linhas partem.",
        dica: "Conciliar não muda a projeção: o valor só sai desta linha e entra no saldo conciliado.",
      },
```

- Passo `col.entradas`, troque a `dica` por:

```ts
        dica:
          "Uma baixa só sai da projeção depois de aprovada. A partir daí, o pagamento aparece na linha Aguardando " +
          "conciliação até o extrato confirmar.",
```

- [ ] **Step 5: Rodar**

Run: `npx vitest run src/ajuda`
Expected: PASS (inclui "o alvo de cada passo aparece na cena" para `linha.aguardando`).

- [ ] **Step 6: Commit**

```bash
git add src/ajuda/fluxo-de-caixa-projetado
git commit -m "docs(ajuda): linha Aguardando conciliação no fluxo projetado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Backlog, spec e verificação final

**Files:**
- Modify: `docs/backlog.md` (item 13, ~linha 411)
- Modify: `docs/superpowers/specs/2026-11-25-projecao-aguardando-conciliacao-design.md` (linha de status)

- [ ] **Step 1: Backlog**

Logo abaixo de `### 13. Baixa aprovada e não conciliada some da projeção`, no mesmo formato dos itens 1 a 5:

```markdown
- **Status:** feito na branch `fix/projecao-aguardando-conciliacao` (2026-11-25, spec
  e plano `2026-11-25-projecao-aguardando-conciliacao*`): linha "Aguardando
  conciliação" no projetado (saldo conciliado → saldo contábil); Caixa
  disponível do dashboard é o contábil; saldo projetado em 30 dias igual à
  tela (com atrasados); estratégico parte do contábil.
```

- [ ] **Step 2: Spec**

Troque `Data: 2026-11-25 · Status: aprovada` por `Data: 2026-11-25 · Status: implementada (2026-11-25)`.

- [ ] **Step 3: Verificação completa**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: tudo verde. Se algum teste de outro arquivo falhar por causa do campo novo `aguardandoConciliacao` (ex.: `toEqual` no resultado de `listarFluxoDeCaixaProjetado`), ajuste o teste para incluir o campo.

- [ ] **Step 4: Commit**

```bash
git add docs/backlog.md docs/superpowers/specs/2026-11-25-projecao-aguardando-conciliacao-design.md
git commit -m "docs(backlog): item 13 feito

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Conferir no navegador** (sessão principal, não subagente)

Com `npm run dev`: registrar e aprovar uma baixa em conta bancária (não Caixa); no Fluxo de caixa projetado, ver a saída na linha "Aguardando conciliação" e o saldo final dela igual ao saldo contábil da Tesouraria; no Dashboard executivo, ver o Caixa disponível com a nota e o Saldo projetado com a nota; exportar o projetado em CSV e ver a linha nova.
