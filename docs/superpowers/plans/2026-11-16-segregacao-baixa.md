# Segregação de funções na baixa — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** com a opção da empresa ligada (padrão), quem registrou uma baixa não consegue aprová-la — no serviço e na tela de Aprovações.

**Architecture:** campo booleano na `Empresa` (migração aditiva, padrão `true`), editado no cadastro da empresa; `aprovarBaixa` lê o campo e compara `baixa.usuarioId` com a sessão; a página de Aprovações usa o mesmo dado para desabilitar o botão.

**Tech Stack:** Next.js (App Router, Server Actions), Prisma/Postgres, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-segregacao-baixa-design.md`

## Global Constraints

- Campo: `Empresa.exigirAprovacaoPorOutro Boolean @default(true)`.
- Mensagem do erro: `Quem registrou a baixa não pode aprová-la. Peça a outra pessoa com permissão de aprovação.`
- Rótulo no cadastro: `Exigir que a baixa seja aprovada por outra pessoa`; explicação: `Quem registra uma baixa não pode aprová-la. Desmarque se a empresa tem uma pessoa só no financeiro.`
- Nota na tela de Aprovações: `Registrada por você: outra pessoa precisa aprovar`.
- Rejeitar a própria baixa continua permitido; `efetivarBaixa` (venda à vista) não muda.
- Testes Vitest pelo PowerShell: `Set-Location D:\Projetos\nx-control-erp; npx vitest run <arquivo>`.
- Depois de `npx prisma migrate dev`, rodar `npx prisma generate`. Nunca rodar Prettier; Edit em arquivos existentes (CRLF).

## Review Focus

1. Formulário de edição da empresa sem a caixa marcada grava `false` (checkbox ausente no FormData) — teste do schema na Task 1.
2. Criar empresa por código sem informar o campo (seed, testes, `criarEmpresa` com `dados` sem o campo) fica com `true` (padrão do banco) — teste na Task 1.
3. Baixa registrada por A, aprovada por B na mesma empresa com a regra ligada passa — teste na Task 2.
4. Tentativa recusada não deixa rastro: baixa segue `PENDENTE`, nenhum `LancamentoBancario` — teste na Task 2.
5. O botão desabilitado não é a única barreira: o form da página posta direto para a action, e o serviço recusa — coberto pelo teste de serviço da Task 2.

---

### Task 1: Campo na empresa e no cadastro

**Files:**
- Modify: `prisma/schema.prisma` (model `Empresa`) + nova migração `prisma/migrations/<timestamp>_exigir_aprovacao_por_outro/`
- Modify: `src/lib/schemas/empresa.ts` (+ `src/lib/schemas/empresa.test.ts`)
- Modify: `src/server/services/empresa.ts` (`atualizarEmpresa`: auditoria `anterior` inclui o campo) (+ `empresa.test.ts`)
- Modify: `src/app/(dashboard)/empresas/empresa-dialog-form.tsx` (caixa + prop `exigirAprovacaoPorOutro` no tipo da empresa) e quem passa a empresa ao form (`page.tsx` da lista, se seleciona campos)
- Modify: `src/server/services/financeiroTestFixtures.ts` (`prisma.empresa.create` com `exigirAprovacaoPorOutro: false`)

**Interfaces:**
- Produces: `Empresa.exigirAprovacaoPorOutro: boolean`; `EmpresaFormValues.exigirAprovacaoPorOutro?: boolean`.

- [ ] **Step 1: Migração** — adicionar o campo ao model e rodar `npx prisma migrate dev --name exigir_aprovacao_por_outro; npx prisma generate`. Expected: migração com `ALTER TABLE "empresas" ADD COLUMN "exigirAprovacaoPorOutro" BOOLEAN NOT NULL DEFAULT true`.

- [ ] **Step 2: Testes que falham**

`empresa.test.ts` do schema:
```ts
test("exigirAprovacaoPorOutro: checkbox marcado é true, ausente é false", () => {
  expect(empresaSchema.parse({ ...BASE, corPrimaria: "", exigirAprovacaoPorOutro: "true" }).exigirAprovacaoPorOutro).toBe(true);
  expect(empresaSchema.parse({ ...BASE, corPrimaria: "" }).exigirAprovacaoPorOutro).toBe(false);
});
```
`empresa.test.ts` do serviço: `criarEmpresa` sem o campo → empresa no banco com `exigirAprovacaoPorOutro === true`; `atualizarEmpresa` com `exigirAprovacaoPorOutro: false` → banco `false` e o `AuditLog` `ATUALIZAR` tem `anterior.exigirAprovacaoPorOutro === true` e `novo.exigirAprovacaoPorOutro === false`.

Ruling previsto: como o schema transforma ausente em `false`, `criarEmpresa` chamado pelo form sem a caixa grava `false` — é o comportamento certo (o form da criação vem com a caixa marcada por padrão).

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run src/lib/schemas/empresa.test.ts src/server/services/empresa.test.ts`. Expected: FAIL nos casos novos.

- [ ] **Step 4: Implementar** — schema com `exigirAprovacaoPorOutro: checkboxSchema`; `atualizarEmpresa` inclui `exigirAprovacaoPorOutro: anterior.exigirAprovacaoPorOutro` no `anterior` da auditoria; caixa no form (`name="exigirAprovacaoPorOutro" value="true"`, `defaultChecked={empresa?.exigirAprovacaoPorOutro ?? true}`, explicação em `text-sm text-muted-foreground`); fixture financeira com `false`.

- [ ] **Step 5: Rodar** — os dois arquivos de teste + `npx tsc --noEmit`. Expected: PASS, sem erros.

- [ ] **Step 6: Commit** — `feat(empresas): opção de exigir aprovação da baixa por outra pessoa`.

### Task 2: Regra na aprovação e na tela de Aprovações

**Files:**
- Modify: `src/server/services/baixa.ts` (`aprovarBaixa`)
- Modify: `src/server/services/baixa.test.ts`
- Modify: `src/app/(dashboard)/financeiro/aprovacoes/page.tsx`

**Interfaces:**
- Consumes: `Empresa.exigirAprovacaoPorOutro` (Task 1).

- [ ] **Step 1: Testes que falham** — novo `describe("segregação na aprovação")` em `baixa.test.ts`, com fixture própria `criarFixtureFinanceiro("BXS", "TESOURARIA")` e `prisma.empresa.update({ exigirAprovacaoPorOutro: true })` no `beforeAll`; parcela criada com `fx.sessaoAdmin` (helper `criarParcelaDeTeste` existente):
  - `"quem registrou não aprova: erro, baixa segue PENDENTE e sem lançamento"` — `registrarBaixa(fx.sessao)` e `aprovarBaixa(fx.sessao)` rejeita com a mensagem da Global Constraints; `baixa.statusAprovacao === "PENDENTE"`; `lancamentoBancario.count({ where: { baixaId } }) === 0`.
  - `"outra pessoa aprova"` — registra com `fx.sessao`, aprova com `fx.sessaoAdmin` → `APROVADO`.
  - `"vale também para o Administrador"` — registra e aprova com `fx.sessaoAdmin` → rejeita.
  - `"com a regra desligada, a mesma pessoa aprova"` — `update(false)`, registra e aprova com `fx.sessao` → `APROVADO`; volta `true` no fim.
  - `"rejeitar a própria baixa é permitido"` — registra e `rejeitarBaixa(fx.sessao, id, "desisti")` → `REJEITADO`.

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/server/services/baixa.test.ts`. Expected: FAIL nos casos "não aprova" e "Administrador".

- [ ] **Step 3: Implementar em `aprovarBaixa`** — depois de `garantirBaixaPendente`, `prisma.empresa.findUniqueOrThrow({ where: { id: sessao.empresaId }, select: { exigirAprovacaoPorOutro: true } })`; se ligado e `anterior.usuarioId === sessao.usuarioId`, lançar o erro.

- [ ] **Step 4: Rodar** — `baixa.test.ts` PASS.

- [ ] **Step 5: Tela** — `page.tsx` busca `exigirAprovacaoPorOutro` da empresa da sessão; para `baixa.usuarioId === sessao.usuarioId` com regra ligada: `<Button disabled>` e, abaixo do nome em "Registrado por", a nota da Global Constraints em `text-xs text-muted-foreground`. `RejeitarBaixaForm` sem mudança.

- [ ] **Step 6: Typecheck e lint** — `npx tsc --noEmit; npx eslint "src/app/(dashboard)/financeiro/aprovacoes" src/server/services/baixa.ts`. Expected: sem erros.

- [ ] **Step 7: Commit** — `feat(financeiro): quem registra a baixa não pode aprová-la`.

### Task 3: Docs e conferência no navegador

**Files:**
- Modify: `content/ajuda/passo-a-passo.md` (3.2 e 8.1)
- Modify: `docs/backlog.md` (remover "Segregação de funções na baixa")
- Modify: `docs/superpowers/specs/2026-08-31-financeiro-titulos-design.md` (item da segregação no fora do escopo → `**feito** (2026-11-16, spec 2026-11-16-segregacao-baixa)`)
- Modify: `docs/superpowers/specs/2026-11-16-segregacao-baixa-design.md` (status implementada)

- [ ] **Step 1: Ajuda** — 3.2: parágrafo "Se a empresa exige aprovação por outra pessoa (padrão), quem registrou a baixa vê o Aprovar desabilitado com a nota *Registrada por você* e precisa de outra pessoa com permissão de aprovação; pode rejeitar a própria baixa. Empresa com uma pessoa só no financeiro desmarca a opção no cadastro da empresa." 8.1: frase sobre a opção.
- [ ] **Step 2: Backlog e specs** — conforme Files.
- [ ] **Step 3: Navegador** — com o admin do seed na Empresa Demonstração (regra ligada pela migração): registrar uma baixa numa parcela e abrir Aprovações → Aprovar desabilitado com a nota; desmarcar a opção no cadastro da empresa → Aprovar habilitado; aprovar ou rejeitar e remarcar a opção. Remover a baixa/lançamento de teste se gerou (ou rejeitar), apagar `.playwright-mcp/`, parar o servidor.
- [ ] **Step 4: Suíte completa** — `npx vitest run` — PASS.
- [ ] **Step 5: Commit** — `docs(financeiro): segregação na baixa na ajuda, specs e backlog`.
