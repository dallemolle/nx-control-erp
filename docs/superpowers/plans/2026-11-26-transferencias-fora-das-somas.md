# Transferências fora das entradas e saídas — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** lançamento com `origem: "TRANSFERENCIA"` deixa de contar como entrada e saída no Fluxo de caixa realizado, no Dashboard executivo, no ano-base do Fluxo estratégico e no Fluxo por dimensão, continuando em todo saldo.

**Architecture:** o realizado ganha a coluna "Transferências" (líquido das pernas no período), e o saldo final passa a ser inicial + geração + transferências. As outras telas só tiram as transferências das somas (`origem: { not: "TRANSFERENCIA" }`); a Evolução do saldo do dashboard soma o líquido das transferências para continuar batendo com o caixa.

**Tech Stack:** Next.js (server components, route handler de exportação), Prisma 7 + PostgreSQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-transferencias-fora-das-somas-design.md`

## Global Constraints

- `origem` é `OrigemLancamento` (MANUAL, BAIXA, TRANSFERENCIA), não nulo, default MANUAL: `origem: { not: "TRANSFERENCIA" }` não perde linhas.
- Rótulo da coluna nova: exatamente `Transferências`, entre `Saídas` e `Geração líquida` (tela, exportação e réplica da ajuda).
- `transferencias` = soma das ENTRADAS de transferência − soma das SAÍDAS de transferência do período.
- `geracaoLiquida` = entradas − saídas (sem transferências); `saldoFinal` = `saldoInicial` + `geracaoLiquida` + `transferencias`.
- Na visão filtrada (Fiscal/Gerencial) a coluna continua, sempre zero.
- Todo texto (tela, ajuda, testes, commits) em português do Brasil.
- Rodar testes pelo **PowerShell** (`npx vitest run <arquivo>`); no Git Bash o Vitest quebra. `npx tsc --noEmit` tem 2 erros antigos em `.next/types/validator.ts` — ignorar. Sob carga, alguns testes de outros arquivos podem estourar 5 s: rodá-los isolados antes de concluir que falharam.
- Arquivos CRLF: preservar fins de linha (ferramenta Edit; nunca Prettier; nunca `Get-Content | Set-Content`).
- Toda mensagem de commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Coluna Transferências no Fluxo de caixa realizado

**Files:**
- Modify: `src/server/services/fluxoDeCaixa.ts` (tipos ~linhas 10-18, `calcularPeriodosFluxoDeCaixa` ~linha 89, `listarFluxoDeCaixaRealizado`)
- Modify: `src/app/(dashboard)/financeiro/fluxo-de-caixa/page.tsx` (~linhas 74-95)
- Modify: `src/app/(dashboard)/financeiro/fluxo-de-caixa/export/route.ts`
- Test: `src/server/services/fluxoDeCaixa.test.ts`

**Interfaces:**
- Produces:
  - `export type LancamentoParaFluxo = { data: Date; valor: number; tipo: "ENTRADA" | "SAIDA"; transferencia: boolean }`
  - `PeriodoFluxoDeCaixa` ganha `transferencias: number` (entre `saidas` e `geracaoLiquida`).

- [ ] **Step 1: Testes unitários que falham**

Em `fluxoDeCaixa.test.ts`, os `LancamentoParaFluxo` existentes ganham `transferencia: false`. No `describe("calcularPeriodosFluxoDeCaixa")` acrescente:

```ts
  test("transferência com as duas pernas não entra em Entradas, Saídas nem na geração; coluna fica zero", () => {
    const lancamentos: LancamentoParaFluxo[] = [
      { data: new Date(Date.UTC(2026, 8, 10)), valor: 1000, tipo: "ENTRADA", transferencia: false },
      { data: new Date(Date.UTC(2026, 8, 12)), valor: 2000, tipo: "SAIDA", transferencia: true },
      { data: new Date(Date.UTC(2026, 8, 12)), valor: 2000, tipo: "ENTRADA", transferencia: true },
    ];
    const [setembro] = calcularPeriodosFluxoDeCaixa(periodos, lancamentos, 500);
    expect(setembro).toMatchObject({
      saldoInicial: 500,
      entradas: 1000,
      saidas: 0,
      transferencias: 0,
      geracaoLiquida: 1000,
      saldoFinal: 1500,
    });
  });

  test("só uma perna conciliada: a coluna mostra o líquido e o saldo final fecha", () => {
    const lancamentos: LancamentoParaFluxo[] = [
      // Saque do banco para o Caixa: a perna do Caixa nasce conciliada, a do banco espera o extrato.
      { data: new Date(Date.UTC(2026, 8, 12)), valor: 2000, tipo: "ENTRADA", transferencia: true },
    ];
    const [setembro, outubro] = calcularPeriodosFluxoDeCaixa(periodos, lancamentos, 500);
    expect(setembro).toMatchObject({ entradas: 0, saidas: 0, transferencias: 2000, geracaoLiquida: 0, saldoFinal: 2500 });
    expect(outubro.saldoInicial).toBe(2500);
  });
```

Run (PowerShell): `npx vitest run src/server/services/fluxoDeCaixa.test.ts`
Expected: FAIL (tipo e valores).

- [ ] **Step 2: Implementar**

`fluxoDeCaixa.ts`:

```ts
/** `transferencia`: perna de transferência entre contas (origem TRANSFERENCIA). Não é entrada nem saída, só move o saldo. */
export type LancamentoParaFluxo = { data: Date; valor: number; tipo: "ENTRADA" | "SAIDA"; transferencia: boolean };

export type PeriodoFluxoDeCaixa = SubPeriodo & {
  saldoInicial: number;
  entradas: number;
  saidas: number;
  /** Líquido das transferências entre contas no período: quase sempre 0; ≠ 0 quando só uma perna está conciliada. */
  transferencias: number;
  geracaoLiquida: number;
  saldoFinal: number;
};
```

Em `calcularPeriodosFluxoDeCaixa` (atualize o JSDoc: entradas e saídas sem transferências; saldo final = inicial + geração + transferências):

```ts
  return periodos.map(({ inicio, fim }) => {
    const doPeriodo = lancamentos.filter((l) => l.data >= inicio && l.data <= fim);
    const somar = (lista: LancamentoParaFluxo[], tipo: "ENTRADA" | "SAIDA") =>
      lista.filter((l) => l.tipo === tipo).reduce((soma, l) => soma + l.valor, 0);
    const movimento = doPeriodo.filter((l) => !l.transferencia);
    const pernas = doPeriodo.filter((l) => l.transferencia);
    const entradas = somar(movimento, "ENTRADA");
    const saidas = somar(movimento, "SAIDA");
    const transferencias = somar(pernas, "ENTRADA") - somar(pernas, "SAIDA");
    const geracaoLiquida = entradas - saidas;
    const saldoInicial = saldoCorrente;
    const saldoFinal = saldoInicial + geracaoLiquida + transferencias;
    saldoCorrente = saldoFinal;

    return { inicio, fim, saldoInicial, entradas, saidas, transferencias, geracaoLiquida, saldoFinal };
  });
```

Em `listarFluxoDeCaixaRealizado`, no `map` final: `transferencia: l.origem === "TRANSFERENCIA"`.

- [ ] **Step 3: Teste de integração**

No `describe("buscarSaldoEmCaixaAte / listarFluxoDeCaixaRealizado")` (fixture `FCX`), acrescente um teste num mês ainda não usado pelo arquivo (confira as datas dos outros testes; ex.: março de 2026), com: uma ENTRADA MANUAL conciliada de 700; uma transferência conciliada nos dois lados (SAIDA 2000 + ENTRADA 2000, `origem: "TRANSFERENCIA"`, mesma conta da fixture serve); e uma terceira perna de transferência ENTRADA 300 conciliada sem a SAIDA correspondente. Espere no mês: `entradas` 700, `saidas` 0, `transferencias` 300, `geracaoLiquida` 700, `saldoFinal - saldoInicial` 1000. Limpe esses lançamentos no fim (o `afterAll` já apaga os da filial).

Run (PowerShell): `npx vitest run src/server/services/fluxoDeCaixa.test.ts src/server/services/classificacaoRelatorios.test.ts`
Expected: PASS.

- [ ] **Step 4: Tela e exportação**

`page.tsx`: `<TableHead>Transferências</TableHead>` entre "Saídas" e "Geração líquida", e a célula `<TableCell>{formatarMoeda(periodo.transferencias)}</TableCell>` na mesma posição. Se o texto de descrição da página falar de transferências em Entradas/Saídas, ajuste para: "Transferências entre contas não entram em Entradas e Saídas: aparecem na coluna Transferências, que só fica diferente de zero quando uma das pernas ainda não foi conciliada."

`export/route.ts`: o tipo da linha ganha `transferencias: number`, a coluna `{ rotulo: "Transferências", valor: (l) => l.transferencias }` entre "Saídas" e "Geração líquida", e o mapeamento copia `periodo.transferencias`.

Run: `npx tsc --noEmit` (atenção a `src/ajuda/fluxo-de-caixa/*`: a réplica tem dados próprios e não deve quebrar; ela é ajustada na Task 3).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/fluxoDeCaixa.ts src/server/services/fluxoDeCaixa.test.ts "src/app/(dashboard)/financeiro/fluxo-de-caixa/page.tsx" "src/app/(dashboard)/financeiro/fluxo-de-caixa/export/route.ts"
git commit -m "fix(fluxo): transferências fora de entradas e saídas, com coluna própria

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Dashboard, estratégico e fluxo por dimensão sem transferências

**Files:**
- Modify: `src/server/services/dashboardExecutivo.ts` (`somasConciliadasNoPeriodo` ~linha 50, `totalDoTipo`, `buscarIndicadoresExecutivos`, `buscarGraficosExecutivos` ~linha 262)
- Modify: `src/server/services/fluxoDeCaixaEstrategico.ts` (`buscarAnoBaseConsolidado`)
- Modify: `src/server/services/fluxoDeCaixaPorDimensao.ts` (`somarRealizadoPorDimensao` ~linha 63)
- Test: `src/server/services/dashboardExecutivo.test.ts`, `src/server/services/fluxoDeCaixaEstrategico.test.ts`, `src/server/services/fluxoDeCaixaPorDimensao.test.ts`

**Interfaces:**
- Produces (dashboard, interno): `somasConciliadasNoPeriodo` passa a agrupar por `["tipo", "origem"]`; nova função `totaisDoPeriodo(somas): { entradas: number; saidas: number; transferencias: number }` (entradas/saídas sem TRANSFERENCIA; transferencias = ENTRADA − SAIDA de TRANSFERENCIA) substitui `totalDoTipo`.

- [ ] **Step 1: Testes que falham**

`dashboardExecutivo.test.ts`, no `describe("buscarIndicadoresExecutivos (integração)")`: teste "transferência não entra na geração de caixa do mês" — lê `antes`, cria no mês corrente (data `hoje`) duas pernas conciliadas de transferência (SAIDA 5000 e ENTRADA 3000, `origem: "TRANSFERENCIA"`, conta da fixture), lê `depois`; espera `depois.geracaoDeCaixaMesAtual` ≈ `antes.geracaoDeCaixaMesAtual` e `depois.caixaDisponivel − antes.caixaDisponivel` ≈ −2000 (saldo continua com elas).

No `describe` de gráficos (`buscarGraficosExecutivos (integração)`): teste "transferência fica fora das barras e dentro do saldo" — antes/depois com as mesmas duas pernas no mês corrente; espera a última barra (`entradasSaidas.at(-1)`) com entradas e saídas iguais às de antes e `evolucaoSaldo.at(-1).saldo` − antes ≈ −2000.

`fluxoDeCaixaEstrategico.test.ts`: no `describe` FG5 o `beforeAll` cria `lancar("ENTRADA", 50, null, "TRANSFERENCIA")`. Atualize as expectativas: "sem filtro" passa a `{ receitaBase: 1300, custoBase: 100, saldoCaixaBase: 1250 }` (o saldo continua com a transferência) e o teste "o saldo de partida soma o que aguarda conciliação..." passa a `{ receitaBase: 1300, custoBase: 100, saldoCaixaBase: 1050 }`. Renomeie o primeiro para "sem filtro: movimento sem transferências e o saldo bancário real".

`fluxoDeCaixaPorDimensao.test.ts`: leia os testes do realizado por dimensão e acrescente um que cria duas pernas conciliadas de transferência (sem dimensão) num mês sem outros lançamentos e espera que o grupo `null` ("Não classificado") não tenha entradas nem saídas delas (ou não exista).

Run (PowerShell): `npx vitest run src/server/services/dashboardExecutivo.test.ts src/server/services/fluxoDeCaixaEstrategico.test.ts src/server/services/fluxoDeCaixaPorDimensao.test.ts`
Expected: FAIL nos testes novos/atualizados.

- [ ] **Step 2: Implementar dashboard**

```ts
function somasConciliadasNoPeriodo(filialIds: string[], inicio: Date, fim: Date) {
  return prisma.lancamentoBancario.groupBy({
    by: ["tipo", "origem"],
    where: { filialId: { in: filialIds }, conciliado: true, data: { gte: inicio, lte: fim }, contaBancaria: { ativo: true } },
    _sum: { valor: true },
  });
}

/** Entradas e saídas sem transferências entre contas; o líquido das transferências à parte (só move saldo). */
function totaisDoPeriodo(somas: { tipo: string; origem: string; _sum: { valor: unknown } }[]) {
  const somar = (filtro: (s: { tipo: string; origem: string }) => boolean) =>
    somas.filter(filtro).reduce((total, s) => total + Number(s._sum.valor ?? 0), 0);
  const transferencia = (s: { origem: string }) => s.origem === "TRANSFERENCIA";
  return {
    entradas: somar((s) => s.tipo === "ENTRADA" && !transferencia(s)),
    saidas: somar((s) => s.tipo === "SAIDA" && !transferencia(s)),
    transferencias: somar((s) => s.tipo === "ENTRADA" && transferencia(s)) - somar((s) => s.tipo === "SAIDA" && transferencia(s)),
  };
}
```

`buscarIndicadoresExecutivos`: `const { entradas, saidas } = totaisDoPeriodo(somasMes);` e passa `entradasMes: entradas, saidasMes: saidas`.

`buscarGraficosExecutivos`: no `forEach`, `const { entradas, saidas, transferencias } = totaisDoPeriodo(somasPorMes[indice]); saldo += entradas - saidas + transferencias; entradasSaidas.push({ mes, entradas, saidas });`. Remova `totalDoTipo` se ficar sem uso. Atualize o JSDoc de `calcularIndicadoresExecutivos`/`buscarGraficosExecutivos` onde falarem do movimento do mês ("sem transferências entre contas").

- [ ] **Step 3: Implementar estratégico e dimensão**

`buscarAnoBaseConsolidado`: no `where` do `groupBy`, acrescente `origem: { not: "TRANSFERENCIA" },` e no JSDoc: "Transferências entre contas não entram na receita nem no custo (só movem saldo)."

`somarRealizadoPorDimensao`: no primeiro objeto do `AND`, acrescente `origem: { not: "TRANSFERENCIA" }`, com comentário: "Transferência entre contas não é entrada nem saída de nenhuma dimensão: só move saldo."

- [ ] **Step 4: Rodar**

Run (PowerShell): `npx vitest run src/server/services/dashboardExecutivo.test.ts src/server/services/fluxoDeCaixaEstrategico.test.ts src/server/services/fluxoDeCaixaPorDimensao.test.ts src/server/services/filiaisConsolidadas.test.ts src/server/services/classificacaoRelatorios.test.ts`
Expected: PASS. Depois `npx tsc --noEmit` e `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/dashboardExecutivo.ts src/server/services/fluxoDeCaixaEstrategico.ts src/server/services/fluxoDeCaixaPorDimensao.ts src/server/services/dashboardExecutivo.test.ts src/server/services/fluxoDeCaixaEstrategico.test.ts src/server/services/fluxoDeCaixaPorDimensao.test.ts
git commit -m "fix(relatorios): transferências fora das somas do dashboard, estratégico e dimensão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ajudas

**Files:**
- Modify: `src/ajuda/fluxo-de-caixa/exemplo.ts`, `cenas.tsx`, `roteiros.ts`, `roteiros.test.ts`
- Modify: `src/ajuda/fluxo-por-dimensao/exemplo.ts`, `roteiros.ts` (e o teste, se fixar números)
- Modify: `src/ajuda/dashboard-executivo/index.tsx`
- Modify: `src/ajuda/fluxo-de-caixa-estrategico/roteiros.ts`

- [ ] **Step 1: Fluxo de caixa (realizado)**

O exemplo tem o saque de R$ 2.000,00 do banco para o Caixa em novembro, dentro de Entradas e Saídas (o comentário de `POR_MES_FISCAL` diz isso).
- `exemplo.ts`: `Movimento` ganha `transferencias?: number` (padrão 0). Novembro: `ENTRADAS` 19_400 → 17_400 e `SAIDAS` 20_638 → 18_638. Em `POR_SEMANA`, tire 2_000 das entradas e das saídas da semana de novembro em que o saque cai (escolha a semana de 02/11 a 08/11, que tem os maiores valores: 9_300 → 7_300 e 10_100 → 8_100) e atualize o comentário (as semanas somam o mês sem a transferência). `POR_MES_FISCAL` deixa de precisar tirar a transferência: como ele multiplica por um fator, os valores fiscais de novembro mudam; ajuste `FATOR_FISCAL` de novembro para que o fiscal continue plausível (o roteiro de classificação não cita números fiscais de novembro; confira em `roteiros.ts` e no teste antes) e atualize o comentário ("tira o gerencial").
- `cenas.tsx`: coluna "Transferências" entre "Saídas" e "Geração líquida" (cabeçalho e célula, `moeda(l.transferencias ?? 0)`), saldo encadeado = inicial + entradas − saídas + transferências. Se a réplica tem a descrição da página, copie o texto novo de `page.tsx` (Task 1).
- `roteiros.ts`:
  - passo `col.entradas`: explicação "Soma dos lançamentos conciliados com data dentro do período: recebimentos, pagamentos e lançamentos avulsos. Transferências entre contas da filial não entram: ficam na coluna Transferências." e `dica`: "A coluna Transferências mostra o líquido das transferências do período e quase sempre fica em R$ 0,00 (o saque de R$ 2.000 do banco para o Caixa sai de uma conta e entra na outra). Ela só fica diferente de zero quando uma das pernas ainda não foi conciliada: o saldo final conta essa diferença até o extrato chegar."
  - passo `col.geracao`: "R$ 17.400,00 − R$ 18.638,00 = −R$ 1.238,00".
- `roteiros.test.ts`: os valores que o teste fixa (−R$ 1.238,00 e R$ 48.862,00) não mudam; acrescente que o painel tem o cabeçalho "Transferências".

Run (PowerShell): `npx vitest run src/ajuda/fluxo-de-caixa`

- [ ] **Step 2: Fluxo por dimensão**

- `exemplo.ts`: `POR_CENTRO_DE_CUSTO` "Não classificado" `[25500, 2000, 4000, 0]` → `[23500, 0, 4000, 0]`; `POR_SAFRA` "Não classificado" `[2000, 2045.9, 0, 580]` → `[0, 45.9, 0, 580]`; comentários: o saque não entra (transferência entre contas só move saldo).
- `roteiros.ts`: o passo que diz que o saque cai em "Não classificado" (~linha 89) passa a dizer que transferências entre contas não entram em nenhuma linha; o passo da visão Fiscal (~linha 142) deixa de citar o saque ("Não classificado" perde só a parte gerencial).
- Rode os testes da pasta e ajuste números fixados que mudaram com o exemplo.

Run (PowerShell): `npx vitest run src/ajuda/fluxo-por-dimensao`

- [ ] **Step 3: Dashboard e estratégico**

- `src/ajuda/dashboard-executivo/index.tsx`: a `dica` do passo `grafico.entradasSaidas` passa a: "Transferências entre contas da empresa não entram nas barras: só movem saldo, e a Evolução do saldo continua com elas." O passo da Geração de caixa (`card.geracao`) ganha ao fim da explicação: " Transferências entre contas não entram."
- `src/ajuda/fluxo-de-caixa-estrategico/roteiros.ts`, `dica` do passo do ano-base (~linha 37): "O ano-base soma as entradas e saídas conciliadas, sem as transferências entre contas. Empréstimos recebidos e aportes de sócio lançados como entrada entram como receita: se a fazenda teve muito disso no último ano, a projeção fica distorcida."

Run (PowerShell): `npx vitest run src/ajuda`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ajuda
git commit -m "docs(ajuda): transferências fora de entradas e saídas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Backlog, spec e verificação

**Files:**
- Modify: `docs/backlog.md`, `docs/superpowers/specs/2026-11-26-transferencias-fora-das-somas-design.md`

- [ ] **Step 1: Backlog**

Logo abaixo de `### 10. Transferências entre contas inflam entradas e saídas`:

```markdown
- **Status:** feito na branch `fix/transferencias-fora-das-somas` (2026-11-26,
  spec e plano `2026-11-26-transferencias-fora-das-somas*`): transferências
  fora de entradas e saídas no realizado (coluna Transferências), no
  dashboard (gráfico e geração do mês), no ano-base do estratégico e no fluxo
  por dimensão; saldos continuam com elas.
```

Novo item depois do 62 (antes de `## Controladoria`):

```markdown
### 63. Ano-base do estratégico conta empréstimos e aportes como receita

- **Problema:** `buscarAnoBaseConsolidado` (`src/server/services/fluxoDeCaixaEstrategico.ts`)
  soma todas as entradas e saídas conciliadas dos últimos 12 meses (sem as
  transferências desde 2026-11-26). Empréstimo recebido, aporte de sócio e
  outras entradas avulsas que não são receita entram na `receitaBase`; a
  amortização do empréstimo entra no `custoBase`.
- **Exemplo:** um custeio de R$ 100.000,00 recebido em março aumenta a receita
  do ano-base em R$ 100.000,00; a projeção de 5 anos cresce essa "receita"
  todo ano.
- **Impacto:** projeção estratégica distorcida quando a fazenda se financia.
- **Caminhos:** basear receita e custo nas categorias (RECEITA e DESPESA) dos
  lançamentos e das baixas; mostrar à parte o que ficou sem categoria.
- **Cuidados:** baixa de título sem categoria e lançamento avulso sem
  categoria somem da base; avisar quanto ficou de fora.
```

- [ ] **Step 2: Spec**

`Status: aprovada` → `Status: implementada (2026-11-26)`.

- [ ] **Step 3: Verificação completa**

Run (PowerShell, separados): `npx tsc --noEmit`, `npm run lint`, `npx vitest run`. Testes que estourarem 5 s em arquivos não tocados: rodar isolados e relatar.

- [ ] **Step 4: Commit**

```bash
git add docs/backlog.md docs/superpowers/specs/2026-11-26-transferencias-fora-das-somas-design.md
git commit -m "docs(backlog): item 10 feito; item 63

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Conferir no navegador** (sessão principal): Fluxo de caixa com a coluna Transferências e o CSV; Dashboard (gráfico e geração do mês) com uma transferência de teste; apagar o que for criado.
