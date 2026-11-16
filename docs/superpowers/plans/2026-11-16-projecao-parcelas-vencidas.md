# Parcelas vencidas na projeção — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a projeção de caixa passa a mostrar, numa linha "Em atraso" antes do primeiro mês, as parcelas em aberto vencidas antes da janela, encadeando o saldo dos meses a partir dela.

**Architecture:** a função pura de agregação recebe as atrasadas e devolve `{ emAtraso, periodos }`; o serviço busca as atrasadas só quando a janela contém hoje; tela e export mostram a linha com um rótulo compartilhado.

**Tech Stack:** Next.js (App Router, Server Components), Prisma/Postgres, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-projecao-parcelas-vencidas-design.md`

## Global Constraints

- Status que contam como em aberto: `EM_ABERTO`, `A_VENCER`, `VENCIDO`, `PARCIALMENTE_PAGO` (os mesmos de hoje).
- Saldo da parcela: `saldoRemanescenteParcela(valorAtualizado, baixas APROVADO)` (o mesmo de hoje).
- "Em atraso" = `dataVencimento < inicio da janela`; a linha só existe quando `inicioDaJanela <= agora <= fimDaJanela`.
- A linha existe mesmo zerada (quando a janela contém hoje).
- Com filtro de classificação: acumulado parte de 0 e `alerta: false` também na linha de atraso.
- Rótulo: `Em atraso (venc. até dd/mm/aaaa)`, data = último dia antes da janela.
- Testes Vitest pelo PowerShell: `Set-Location D:\Projetos\nx-control-erp; npx vitest run <arquivo>` (pelo Bash falham).
- Nunca rodar Prettier; formatar à mão, linhas até ~120. Arquivos têm CRLF: usar a ferramenta Edit.

## Review Focus

1. Janela do ano civil corrente: parcela vencida em fevereiro do ano corrente fica na linha de fevereiro e **não** na de atraso (sem contar duas vezes) — teste na Task 1.
2. Janela futura (ano civil do ano seguinte): sem linha de atraso, mesmo havendo parcelas em aberto antes dela — teste na Task 1.
3. Parcela vencida antes da janela já paga (baixa aprovada total) não entra no atraso — teste na Task 1.
4. Outra filial não vaza na linha de atraso — coberto pelo uso do mesmo `where` com `filialId` (teste na Task 1 usa fixture própria e controle positivo).
5. Visão filtrada: a linha de atraso respeita a classificação e não alerta — teste na Task 1.

---

### Task 1: Serviço com a linha de atraso

**Files:**
- Modify: `src/server/services/fluxoDeCaixaProjetado.ts`
- Modify: `src/server/services/fluxoDeCaixaProjetado.test.ts`
- Modify: `src/server/services/classificacaoRelatorios.test.ts:114-125` (passa a ler `.periodos`)
- Modify: `src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/page.tsx:39` e `export/route.ts:53` — só desestruturar `{ periodos }` para compilar; a linha nova entra na Task 2.

**Interfaces:**
- Produces:
  - `type LinhaEmAtraso = { venceuAte: Date; saldoInicial: number; entradasProjetadas: number; saidasProjetadas: number; geracaoLiquida: number; saldoFinal: number; alerta: boolean }`
  - `type FluxoDeCaixaProjetado = { emAtraso: LinhaEmAtraso | null; periodos: PeriodoFluxoDeCaixaProjetado[] }`
  - `calcularPeriodosFluxoDeCaixaProjetado(periodos: SubPeriodo[], parcelas: ParcelaParaProjecao[], saldoInicialAbsoluto: number, atrasadas?: ParcelaParaProjecao[]): FluxoDeCaixaProjetado`
  - `buscarParcelasEmAbertoVencidasAntes(filialId: string, inicio: Date, classificacao?: FiltroClassificacao): Promise<ParcelaParaProjecao[]>`
  - `listarFluxoDeCaixaProjetado(sessao, modo, dataReferencia, opcoes?): Promise<FluxoDeCaixaProjetado>`

- [ ] **Step 1: Ajustar os testes existentes ao novo retorno e escrever os testes novos da função pura**

Nos testes de `calcularPeriodosFluxoDeCaixaProjetado` e nos de integração, trocar `resultado[0]` por `resultado.periodos[0]` (e `periodos` por `(await listar...).periodos`). Novos casos no `describe("calcularPeriodosFluxoDeCaixaProjetado")`:

```ts
test("com atrasadas: linha de atraso soma por tipo e o primeiro mês parte do saldo final dela", () => {
  const atrasadas: ParcelaParaProjecao[] = [
    { dataVencimento: new Date(Date.UTC(2026, 6, 10)), saldo: 400, tipo: "RECEBER" },
    { dataVencimento: new Date(Date.UTC(2026, 7, 20)), saldo: 150, tipo: "PAGAR" },
  ];
  const r = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500, atrasadas);
  expect(r.emAtraso).toMatchObject({
    saldoInicial: 500, entradasProjetadas: 400, saidasProjetadas: 150, geracaoLiquida: 250, saldoFinal: 750, alerta: false,
  });
  expect(r.emAtraso?.venceuAte.toISOString()).toBe("2026-08-31T23:59:59.999Z");
  expect(r.periodos[0].saldoInicial).toBe(750);
});

test("atrasadas vazias geram linha zerada; sem atrasadas, emAtraso é null", () => {
  const vazia = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500, []);
  expect(vazia.emAtraso).toMatchObject({ entradasProjetadas: 0, saidasProjetadas: 0, saldoFinal: 500 });
  expect(calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 500).emAtraso).toBeNull();
});

test("linha de atraso com saldo final negativo marca alerta", () => {
  const r = calcularPeriodosFluxoDeCaixaProjetado(periodos, [], 100, [
    { dataVencimento: new Date(Date.UTC(2026, 7, 1)), saldo: 300, tipo: "PAGAR" },
  ]);
  expect(r.emAtraso).toMatchObject({ saldoFinal: -200, alerta: true });
});
```

(`periodos` do describe começa em setembro/2026, então `venceuAte` = 31/08/2026 23:59:59.999 UTC.)

- [ ] **Step 2: Escrever os testes de integração novos**

Num `describe` próprio com fixture limpa (`criarFixtureFinanceiro("FCPA", "TESOURARIA")`, limpa no `afterAll`), datas relativas a hoje (`const hoje = new Date()`; `mesesAtras(n)` = dia 10 do mês `hoje - n`, UTC). Reusar o helper `criarTituloDeTeste` (mover para fora do describe existente, recebendo a fixture). Casos:

- `"parcela em aberto vencida antes da janela entra no atraso e em nenhum mês"`: PAGAR 4321 vencida há 2 meses → `listar(MOVEL, hoje)`: `emAtraso.saidasProjetadas === 4321`, soma de `saidasProjetadas` dos meses sem ela (`=== 0` nesta fixture), `periodos[0].saldoInicial ≈ emAtraso.saldoFinal`.
- `"parcela vencida antes e paga integralmente não entra"`: RECEBER 777 vencida há 3 meses, baixa de 777 aprovada → `emAtraso.entradasProjetadas === 0`.
- `"ano civil corrente: vencida em mês do ano fica na linha do mês, não no atraso"`: só se `hoje.getUTCMonth() >= 1`; PAGAR 55 vencida no mês anterior do mesmo ano → `listar(ANO_CIVIL, hoje)`: a linha daquele mês tem `saidasProjetadas` 55 e `emAtraso.saidasProjetadas` não inclui os 55 (no máximo o valor das parcelas criadas antes de janeiro neste describe).
- `"janela que não contém hoje não tem linha de atraso"`: `listar(ANO_CIVIL, 1º de janeiro do ano seguinte)` → `emAtraso === null`.
- `"filtro de classificação: atraso só da classificação e sem alerta"`: PAGAR gerencial grande (ex.: 10.000.000) vencida há 2 meses, criada direto por `prisma.titulo.create` com `classificacaoFiscal: "GERENCIAL"` (mesmo padrão do helper `titulo` de `classificacaoRelatorios.test.ts`, parcela `status: "VENCIDO"`) → com `{ classificacao: "GERENCIAL" }`: `emAtraso.saldoInicial === 0`, `saidasProjetadas` inclui o valor, `alerta === false`; com `"FISCAL"` não inclui.

Ajustar o teste existente `"saldoInicial do primeiro mês reflete o saldo em caixa conciliado de hoje..."`: agora `emAtraso.saldoInicial ≈ saldoDireto` e `periodos[0].saldoInicial ≈ emAtraso.saldoFinal`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/fluxoDeCaixaProjetado.test.ts`
Expected: FAIL (`emAtraso` indefinido / `buscarParcelasEmAbertoVencidasAntes` não exportada).

- [ ] **Step 4: Implementar em `fluxoDeCaixaProjetado.ts`**

- `calcularPeriodosFluxoDeCaixaProjetado`: com `atrasadas` definido, monta a linha a partir de `saldoInicialAbsoluto` (mesma soma por tipo e mesmo `alerta: saldoFinal < 0` dos meses), `venceuAte = new Date(periodos[0].inicio.getTime() - 1)`, e começa a cadeia dos meses no `saldoFinal` dela. Extrair a soma por tipo num auxiliar local usado pela linha e pelos meses.
- Extrair `where`/`include`/`map` comuns de `buscarParcelasEmAbertoNoPeriodo` num auxiliar privado que recebe o filtro de `dataVencimento`; `buscarParcelasEmAbertoVencidasAntes` usa `{ lt: inicio }`.
- `listarFluxoDeCaixaProjetado`: `contemHoje = inicioDaJanela <= agora && agora <= fimDaJanela`; busca as atrasadas no mesmo `Promise.all` só se `contemHoje` (senão `undefined`); com classificação, `alerta: false` em `emAtraso` e nos períodos.

- [ ] **Step 5: Ajustar os chamadores ao novo retorno**

`classificacaoRelatorios.test.ts`: `const { periodos: semOpcoes } = await ...` etc. `page.tsx` e `export/route.ts`: `const { periodos } = await listarFluxoDeCaixaProjetado(...)`.

- [ ] **Step 6: Rodar os testes e o typecheck**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/fluxoDeCaixaProjetado.test.ts src/server/services/classificacaoRelatorios.test.ts; npx tsc --noEmit`
Expected: todos PASS, `tsc` sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/fluxoDeCaixaProjetado.ts src/server/services/fluxoDeCaixaProjetado.test.ts src/server/services/classificacaoRelatorios.test.ts "src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado"
git commit -m "feat(financeiro): projeção soma as parcelas vencidas antes da janela"
```

### Task 2: Linha "Em atraso" na tela e no export

**Files:**
- Modify: `src/app/(dashboard)/financeiro/_fluxo-de-caixa/formatar-rotulo-periodo.ts` (+ teste `formatar-rotulo-periodo.test.ts`)
- Modify: `src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/page.tsx`
- Modify: `src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/export/route.ts`

**Interfaces:**
- Consumes: `FluxoDeCaixaProjetado`, `LinhaEmAtraso` (Task 1).
- Produces: `rotuloEmAtraso(venceuAte: Date): string` em `formatar-rotulo-periodo.ts`.

- [ ] **Step 1: Teste do rótulo**

```ts
test("rotuloEmAtraso usa o último dia antes da janela, em UTC", () => {
  expect(rotuloEmAtraso(new Date("2026-10-31T23:59:59.999Z"))).toBe("Em atraso (venc. até 31/10/2026)");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run "src/app/(dashboard)/financeiro/_fluxo-de-caixa/formatar-rotulo-periodo.test.ts"`
Expected: FAIL (`rotuloEmAtraso` não exportada).

- [ ] **Step 3: Implementar `rotuloEmAtraso` com o `dataCurta` existente; rodar o teste — PASS.**

- [ ] **Step 4: Tela (`page.tsx`)**

Primeira linha do `TableBody` quando `emAtraso` não é `null`: rótulo `rotuloEmAtraso(emAtraso.venceuAte)` com `className="text-muted-foreground"` na célula do rótulo; demais células e alerta iguais às linhas de mês. Texto de rodapé (linhas 46-51) passa a ser:

> Projeção calculada a partir do saldo em caixa conciliado de hoje e dos títulos a pagar/receber em aberto. Parcelas em aberto vencidas antes do período entram na linha "Em atraso", e o saldo dos meses parte dela. Não considera contratos recorrentes, financiamentos nem orçamento (ainda não existem no sistema).

- [ ] **Step 5: Export (`export/route.ts`)**

Se `emAtraso` não é `null`, inserir como primeira `LinhaExport` com `mes: rotuloEmAtraso(emAtraso.venceuAte)` e os mesmos campos.

- [ ] **Step 6: Typecheck e lint**

Run: `Set-Location D:\Projetos\nx-control-erp; npx tsc --noEmit; npx eslint "src/app/(dashboard)/financeiro"`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/financeiro"
git commit -m "feat(financeiro): linha Em atraso na tela e no export do fluxo projetado"
```

### Task 3: Docs e conferência no navegador

**Files:**
- Modify: `content/ajuda/passo-a-passo.md` (seção 3.6)
- Modify: `docs/superpowers/specs/2026-09-07-fluxo-caixa-projetado-design.md` (segunda limitação e item do fora de escopo)
- Modify: `docs/backlog.md` (remover o item "Parcelas vencidas em aberto somem da projeção")
- Modify: `docs/fases/fase-4-fluxo-de-caixa.md` (frase "Parcela vencida com vencimento anterior ... não aparece")
- Modify: `docs/superpowers/specs/2026-11-16-projecao-parcelas-vencidas-design.md` (status "implementada (data)")

- [ ] **Step 1: Ajuda 3.6** — acrescentar ao parágrafo: "As parcelas em aberto que venceram antes do primeiro mês aparecem numa linha **Em atraso** no topo; o saldo dos meses parte dela, porque esse dinheiro ainda vai entrar ou sair."
- [ ] **Step 2: Specs, backlog e doc da fase** — marcar "**feito** (2026-11-16, spec `2026-11-16-projecao-parcelas-vencidas`)" na spec de 2026-09-07; trocar a frase do doc da fase 4 por "Parcelas em aberto vencidas antes da janela entram numa linha Em atraso antes do primeiro mês (2026-11-16)."; remover o item do backlog.
- [ ] **Step 3: Conferir no navegador** — cenário por script temporário em `scripts/` (título PAGAR e RECEBER vencidos há 2 meses na filial do admin, modo `limpar` no fim): `/financeiro/fluxo-de-caixa-projetado` mostra a linha "Em atraso" com os valores e o primeiro mês partindo do saldo final dela; ano civil do ano seguinte sem a linha; export Excel com a linha primeiro. Limpar o cenário, apagar o script e a pasta `.playwright-mcp/`.
- [ ] **Step 4: Suíte completa** — `Set-Location D:\Projetos\nx-control-erp; npx vitest run` — PASS.
- [ ] **Step 5: Commit**

```bash
git add content/ajuda/passo-a-passo.md docs
git commit -m "docs(financeiro): parcelas vencidas na projeção na ajuda, specs e backlog"
```
