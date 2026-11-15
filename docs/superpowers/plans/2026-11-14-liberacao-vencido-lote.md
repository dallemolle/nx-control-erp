# Liberação de lote vencido no lote — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o Gestor libera um lote vencido na tela de Estoque até validade + N dias (N no produto); pedido e OP passam a aceitar o lote liberado sem depender do perfil de quem lança.

**Architecture:** funções puras em `src/lib/producao/liberacaoVencido.ts` (data limite, cobertura, situação para o diálogo); serviço `liberarLoteVencido`/`revogarLiberacaoLote` em `src/server/services/estoque.ts`; `criarPedido` e `adicionarConsumo` trocam a checagem de perfil + motivo por item pela checagem do lote; a permissão `estoque:liberarVencido` substitui `venda:liberarVencido` e `producao:liberarVencido`.

**Tech Stack:** Next.js App Router (server actions), Prisma/Postgres, Zod, Vitest (rodar pelo **PowerShell**: `npx vitest run <arquivo>`).

**Spec:** [docs/superpowers/specs/2026-11-14-liberacao-vencido-lote-design.md](../specs/2026-11-14-liberacao-vencido-lote-design.md)

## Global Constraints

- Datas de lote são datas de calendário em meia-noite UTC; "hoje" = `hojeDeCalendario()` (`src/lib/producao/periodo.ts`).
- `liberadoAte` é inclusivo: o lote movimenta enquanto `data da operação <= liberadoAte`.
- `diasLiberacaoVencido`: inteiro de 1 a 365, opcional; vazio = não pode liberar.
- Mensagens exatas (spec): "O lote X está zerado"; "O lote X ainda não venceu"; "Configure os dias de liberação após vencimento no cadastro do produto"; "O prazo máximo de liberação deste lote terminou em dd/mm/aaaa"; "Informe o motivo da liberação"; "O lote X venceu em dd/mm/aaaa"; "O lote X venceu em dd/mm/aaaa; a liberação vale até dd/mm/aaaa".
- Auditoria: entidade `Lote`, ações `LIBERAR_VENCIDO` e `REVOGAR_LIBERACAO`.
- Arquivos do repo são CRLF; commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Pedido com data **anterior** à validade de um lote liberado: o lote não está vencido naquela data → aceito com motivo **nulo** (não copiar motivo à toa). Teste na Task 4.
2. Gestor com filial somente leitura tenta liberar → `FilialSomenteLeituraError`. Teste na Task 2.
3. Polpa numa OP aberta vencida → liberar recusa com a mensagem de `bloqueioDaProducao`. Teste na Task 2.
4. Revogar depois de vender: o item já gravado mantém o motivo; nova venda é recusada. Teste na Task 4.
5. Mudar N no produto depois de liberar não muda `liberadoAte`. Teste na Task 2.

---

### Task 1: Funções puras da liberação

**Files:**
- Create: `src/lib/producao/liberacaoVencido.ts`
- Test: `src/lib/producao/liberacaoVencido.test.ts`

**Interfaces:**
- Produces:
  - `liberadoAteDoLote(validade: Date, dias: number): Date` — validade + `dias` × 86 400 000 ms.
  - `liberacaoCobre(liberadoAte: Date | null, data: Date): boolean` — `liberadoAte !== null && data <= liberadoAte`.
  - `type SituacaoLiberacao = { tipo: "PODE"; liberadoAte: Date; dias: number } | { tipo: "SEM_PRAZO" } | { tipo: "PRAZO_ENCERRADO"; limite: Date }`
  - `situacaoLiberacao(validade: Date, dias: number | null, hoje: Date): SituacaoLiberacao` — `dias == null` → SEM_PRAZO; limite < hoje → PRAZO_ENCERRADO; senão PODE.
  - `MSG_SEM_PRAZO_LIBERACAO = "Configure os dias de liberação após vencimento no cadastro do produto"`

- [ ] **Step 1: testes** (`const d = (iso) => new Date(\`${iso}T00:00:00.000Z\`)`)
  - `liberadoAteDoLote(d("2026-11-28"), 5)` → `d("2026-12-03")` (vira o mês).
  - `liberacaoCobre(null, d("2026-11-10"))` → false; `liberacaoCobre(d("2026-11-10"), d("2026-11-10"))` → true; `(d("2026-11-10"), d("2026-11-11"))` → false.
  - `situacaoLiberacao(d("2026-11-10"), null, d("2026-11-12"))` → `{ tipo: "SEM_PRAZO" }`.
  - `situacaoLiberacao(d("2026-11-10"), 3, d("2026-11-13"))` → `{ tipo: "PODE", liberadoAte: d("2026-11-13"), dias: 3 }` (no limite).
  - `situacaoLiberacao(d("2026-11-10"), 3, d("2026-11-14"))` → `{ tipo: "PRAZO_ENCERRADO", limite: d("2026-11-13") }`.
- [ ] **Step 2:** `npx vitest run src/lib/producao/liberacaoVencido.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5:** commit `feat(producao): regras puras da liberação de lote vencido`.

### Task 2: Modelo, permissão e serviço de liberar/revogar

**Files:**
- Modify: `prisma/schema.prisma` (Produto, Lote, Usuario) + nova migration `liberacao_vencido_lote`
- Modify: `src/server/auth/permissions.ts` (acrescenta `estoque:liberarVencido` ao tipo `Acao` e ao GESTOR; as antigas saem na Task 5)
- Modify: `src/server/services/estoque.ts`
- Test: `src/server/services/estoque.test.ts` (novo `describe("liberação de lote vencido")`)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - Prisma: `Produto.diasLiberacaoVencido Int?`; `Lote.liberadoAte DateTime?`, `liberadoEm DateTime?`, `liberadoPorId String?` (relação `liberadoPor Usuario? @relation("LoteLiberadoPor", onDelete: SetNull)`; em `Usuario`: `lotesLiberados Lote[] @relation("LoteLiberadoPor")`), `motivoLiberacao String?`.
  - `liberarLoteVencido(sessao: SessaoAtiva, loteId: string, motivo: string, hoje = hojeDeCalendario()): Promise<{ liberadoAte: Date }>`
  - `revogarLiberacaoLote(sessao: SessaoAtiva, loteId: string): Promise<void>`
  - `listarLotes` passa a incluir `produto.diasLiberacaoVencido` e `liberadoPor: { select: { nome: true } }` (os campos do lote já vêm por `include`).

Ordem das recusas em `liberarLoteVencido` (spec): permissão `estoque:liberarVencido` → `requireAlteracaoFilial` → lote da filial ("Lote não encontrado") → recepção `CANCELADA` ("O lote X é de uma recepção excluída") ou `bloqueioDaProducao` → saldo ≤ 0 → `!loteVencidoNaData(validade, hoje)` → `situacaoLiberacao` SEM_PRAZO / PRAZO_ENCERRADO (data com `formatarData`) → motivo aparado vazio. Grava os quatro campos e audita `LIBERAR_VENCIDO` com `anterior` = liberação anterior (ou null) e `novo` = `{ liberadoAte, motivo }`. `revogarLiberacaoLote`: mesma permissão e filial; lote sem `liberadoAte` → "O lote X não está liberado"; limpa os quatro campos; audita `REVOGAR_LIBERACAO`.

- [ ] **Step 1: schema + migration.** Editar `schema.prisma`; `npx prisma migrate dev --name liberacao_vencido_lote` (gera e aplica; depois `npx prisma generate` se o client não atualizar — ver memória de armadilhas).
- [ ] **Step 2: testes** (fixtures de `producaoTestFixtures`; produto de polpa do catálogo recebe `diasLiberacaoVencido: 5` via `prisma.produto.update`; `HOJE = d("2026-11-14")`):
  - `"GESTOR libera lote vencido até validade + N dias"`: lote validade 2026-11-12, 10 kg → `{ liberadoAte: d("2026-11-17") }`; lote gravado com `liberadoPorId = fx.usuarioId`, `motivoLiberacao = "Uso imediato"`, `liberadoEm` não nulo; `auditLog` com `acao: "LIBERAR_VENCIDO"`, `entidadeId: lote.id`.
  - `"recusas ao liberar"`: VENDAS/PRODUCAO → `PermissionError`; GESTOR somente leitura → `FilialSomenteLeituraError`; lote validade 2026-11-14 → "O lote X ainda não venceu"; lote zerado (kg 0) → "O lote X está zerado"; produto sem prazo → `MSG_SEM_PRAZO_LIBERACAO`; validade 2026-11-01 (limite 06/11) → "O prazo máximo de liberação deste lote terminou em 06/11/2026"; motivo `"  "` → "Informe o motivo da liberação"; lote da filial B → "Lote não encontrado".
  - `"polpa em OP aberta não pode ser liberada"` (Review Focus 3): lote de polpa ligado a `ProducaoOP` de OP `ABERTA` → mensagem "O lote X está numa OP aberta". Usar `criarOP`/`adicionarProducao` do serviço de OP, como em `ordemProducao.test.ts`.
  - `"mudar N no produto não muda liberação feita"` (Review Focus 5): libera, atualiza produto para 30, relê lote → `liberadoAte` igual.
  - `"liberar de novo substitui o motivo"`; `"revogar limpa e audita"` (quatro campos nulos, `REVOGAR_LIBERACAO`); revogar sem liberação → "O lote X não está liberado".
- [ ] **Step 3:** `npx vitest run src/server/services/estoque.test.ts` → FAIL.
- [ ] **Step 4:** implementar permissão (`"estoque:liberarVencido"` no tipo e no Set do GESTOR) e as duas funções.
- [ ] **Step 5:** mesmo comando → PASS; `npx tsc --noEmit` sem erros.
- [ ] **Step 6:** commit `feat(producao): liberar e revogar lote vencido no lote`.

### Task 3: Produto com prazo + tela de Estoque

**Files:**
- Modify: `src/lib/schemas/produto.ts`, `src/lib/schemas/produto.test.ts`
- Modify: `src/server/services/produto.ts` (criar/atualizar/auditoria gravam `diasLiberacaoVencido`), `src/server/services/produto.test.ts`
- Modify: `src/app/(dashboard)/cadastros/produtos/produto-dialog-form.tsx`, `.../cadastros/produtos/page.tsx`
- Modify: `src/app/(dashboard)/producao/estoque/actions.ts`, `.../estoque/page.tsx`
- Create: `src/app/(dashboard)/producao/estoque/liberar-lote-dialog.tsx`

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces:
  - `produtoSchema.diasLiberacaoVencido`: `numeroOpcional(z.number().int("Use dias inteiros").min(1, "Mínimo de 1 dia").max(365, "Máximo de 365 dias"))`.
  - Actions: `liberarLoteAction(prev: FormState, formData)` (campos `loteId`, `motivo`) e `revogarLiberacaoAction(prev: FormState, formData)` (campo `loteId`), ambas com `revalidatePath("/producao/estoque")`.
  - `LiberarLoteDialog({ lote: { id, codigo }, situacao: SituacaoLiberacao, podeEditarProduto: boolean })` e `RevogarLiberacaoDialog({ lote: { id, codigo }, liberadoAte: string })` no mesmo arquivo, no padrão de `mover-lote-dialog.tsx` (`useAcaoDoDialogo`).

- [ ] **Step 1: testes de schema:** vazio → `undefined`; `"5"` → 5; `"0"`, `"366"` e `"2.5"` recusados. Teste de serviço: criar com 5 grava 5; atualizar com vazio grava `null`.
- [ ] **Step 2:** `npx vitest run src/lib/schemas/produto.test.ts src/server/services/produto.test.ts` → FAIL; implementar; → PASS.
- [ ] **Step 3: formulário do produto:** campo `diasLiberacaoVencido` (number, min 1, max 365) "Dias de liberação após vencimento (opcional)" com a dica exata "Tolerância máxima após a validade. Vazio = o produto não pode ser liberado."; `page.tsx` passa o valor ao diálogo.
- [ ] **Step 4: Estoque:** em `page.tsx`, `hoje = hojeDeCalendario()`; `podeLiberar = podeExecutar(perfil, "estoque:liberarVencido") && sessao.podeAlterarFilial`; `podeEditarProduto = podeEscreverCadastroProducao(perfil, podeAlterarFilial)`. Na coluna Status, se `liberacaoCobre(lote.liberadoAte, hoje)`: linha `text-xs` "Movimentação liberada até dd/mm/aaaa" com `title` "Liberado por {nome} em {dd/mm/aaaa}: {motivo}". Nas ações: lote com saldo, sem `bloqueio`, `validade < hoje` e `podeLiberar` → se liberação vigente, `RevogarLiberacaoDialog`; senão `LiberarLoteDialog` com `situacaoLiberacao(lote.validade, lote.produto.diasLiberacaoVencido, hoje)`.
- [ ] **Step 5: diálogo:** PODE → "A movimentação ficará liberada até dd/mm/aaaa (validade + N dias)." + `Input name="motivo" required minLength={3}` + botão "Liberar"; SEM_PRAZO → `MSG_SEM_PRAZO_LIBERACAO` + link "Editar produto" (`/cadastros/produtos`) se `podeEditarProduto`, senão "Peça a configuração a quem cadastra produtos."; PRAZO_ENCERRADO → "O prazo máximo de liberação deste lote terminou em dd/mm/aaaa."; nos dois últimos, sem botão. Revogar: "A liberação até dd/mm/aaaa será desfeita e o lote volta a ficar bloqueado." + botão "Revogar".
- [ ] **Step 6:** `npx tsc --noEmit` e `npx eslint` nos arquivos tocados → sem erros.
- [ ] **Step 7:** commit `feat(producao): prazo de liberação no produto e ação na tela de Estoque`.

### Task 4: Pedido de venda usa a liberação do lote

**Files:**
- Modify: `src/lib/schemas/pedidoVenda.ts` (remove `motivoLiberacaoVencido` do item)
- Modify: `src/server/services/pedidoVenda.ts` (`criarPedido`, `lotesParaVenda`)
- Modify: `src/app/(dashboard)/vendas/pedidos/novo/page.tsx`, `.../novo/pedido-form.tsx`
- Test: `src/server/services/pedidoVenda.test.ts`

**Interfaces:**
- Consumes: `liberacaoCobre`, `liberarLoteVencido`, `revogarLiberacaoLote`.
- Produces: `LoteParaVenda` ganha `liberadoAte: Date | null`; `OpcoesPedido` perde `podeLiberarVencido`; lotes do form trazem `liberadoAte: string | null` (`AAAA-MM-DD`).

Regra em `criarPedido`: se `loteVencidoNaData(lote.validade, dados.data)`: sem `liberadoAte` → "O lote X venceu em dd/mm/aaaa"; com `liberadoAte` que não cobre → "O lote X venceu em dd/mm/aaaa; a liberação vale até dd/mm/aaaa"; senão o item grava `motivoLiberacaoVencido = lote.motivoLiberacao`. Não vencido → `null`. Sai `podeExecutar(..., "venda:liberarVencido")`.

- [ ] **Step 1: substituir o teste** `"lote vencido na data do pedido…"` por:
  - `"lote vencido sem liberação é recusado, até para o administrador"`.
  - `"lote liberado: VENDAS vende dentro do prazo e o motivo vem do lote"`: produto com prazo 5, lote validade 2026-11-09, `liberarLoteVencido(fx.sessao("GESTOR"), id, "Cliente ciente", d("2026-11-10"))`; pedido de 2026-11-10 por VENDAS → item com `motivoLiberacaoVencido === "Cliente ciente"`; pedido de 2026-11-15 → "…; a liberação vale até 14/11/2026".
  - `"pedido antes da validade de um lote liberado grava motivo nulo"` (Review Focus 1): pedido com `data: "2026-11-08"`.
  - `"revogar depois de vender mantém o item e bloqueia a próxima venda"` (Review Focus 4).
  - `"validade igual à data do pedido não está vencido"` (mantém o caso do limite, sem motivo).
- [ ] **Step 2:** `npx vitest run src/server/services/pedidoVenda.test.ts` → FAIL; implementar serviço; → PASS.
- [ ] **Step 3: form:** remove `motivo` do `ItemForm` e do JSON; por item vencido na data do pedido: se `liberadoAte && data <= liberadoAte` → `text-sm text-muted-foreground` "Liberado até dd/mm/aaaa"; senão `text-sm text-destructive` "Lote vencido: peça a liberação ao gestor na tela de Estoque.". `page.tsx` deixa de passar `podeLiberarVencido` e converte `liberadoAte` com `paraDataIso`.
- [ ] **Step 4:** `npx tsc --noEmit` → sem erros.
- [ ] **Step 5:** commit `feat(vendas): pedido aceita lote vencido liberado no lote`.

### Task 5: OP usa a liberação do lote; saem as permissões antigas

**Files:**
- Modify: `src/lib/schemas/ordemProducao.ts` (remove `motivoLiberacaoVencido` do `consumoSchema`)
- Modify: `src/server/services/ordemProducao.ts` (`adicionarConsumo`, `lotesParaConsumo`)
- Modify: `src/app/(dashboard)/producao/processamento/[numero]/linhas-op.tsx`, `.../[numero]/page.tsx`
- Modify: `src/server/auth/permissions.ts`, `src/server/auth/permissions.test.ts`
- Test: `src/server/services/ordemProducao.test.ts`; remover `motivoLiberacaoVencido: ""` dos `consumoSchema.parse` em `rastreabilidade.test.ts`, `relatorioProducao/{mensal,painel,processamento}.test.ts`

**Interfaces:**
- Consumes: `liberacaoCobre`, `liberarLoteVencido`.
- Produces: `LoteParaConsumo` e `LoteConsumoOpcao` ganham `liberadoAte` (`Date | null` / `string | null`); `FormConsumo` perde `podeLiberarVencido`. `Acao` perde `venda:liberarVencido` e `producao:liberarVencido`.

Mesma regra da Task 4 com a data da OP; o consumo grava `motivoLiberacaoVencido = lote.motivoLiberacao` e a auditoria `ADICIONAR_CONSUMO` continua levando o motivo.

- [ ] **Step 1: testes:** substituir `"fruto vencido: bloqueado, salvo liberação com motivo"` por `"fruto vencido: recusado sem liberação; PRODUCAO consome o lote liberado com o motivo do lote"` (produto fruto com prazo 3; lote validade 2026-11-09; OP de 2026-11-10; antes de liberar, ADMIN recebe "venceu em 09/11/2026"; depois, PRODUCAO consome e `motivoLiberacaoVencido` = motivo do lote) e manter o caso no limite com motivo nulo. `consumo()` do teste perde o parâmetro `motivo`. Em `permissions.test.ts`: `ACOES_FASE_7` troca as duas ações por `"estoque:liberarVencido"` e `GESTOR: ["producao:ler", "venda:ler", "estoque:liberarVencido"]`.
- [ ] **Step 2:** `npx vitest run src/server/services/ordemProducao.test.ts src/server/auth/permissions.test.ts` → FAIL; implementar; → PASS.
- [ ] **Step 3: UI da OP:** opção do lote mostra " · VENCIDO" ou " · VENCIDO, liberado até dd/mm/aaaa"; ao escolher lote vencido: liberado e cobre → "Liberado até dd/mm/aaaa"; senão a mensagem vermelha da Task 4. Sem campo de motivo.
- [ ] **Step 4:** `npx tsc --noEmit` (não pode sobrar referência às ações antigas) e suíte inteira `npx vitest run` → PASS.
- [ ] **Step 5:** commit `feat(producao): OP aceita fruto vencido liberado no lote`.

### Task 6: Docs, ajuda e conferência no navegador

**Files:**
- Modify: `docs/modulos/producao-estoque-vendas/08-duvidas-decisoes.md` (D-35 nova após D-34; notas em D-03, D-10, D-21; D-17 sem mudança), `03-regras-de-negocio.md` (RN-18 reescrita; RN-09 menciona a liberação), `05-fluxos-telas-permissoes.md` (permissão e ação no Estoque), `README.md` do módulo (Situação)
- Modify: `content/ajuda/passo-a-passo.md` (Estoque: liberar/revogar; pedido e OP sem motivo por item)
- Modify: `docs/backlog.md` (remove "Liberar fruto vencido na OP"), `docs/fases/fase-7-producao-estoque-vendas.md` (liberação no lote; 7d definitivamente cancelada)
- Modify: spec → "Status: implementada (2026-11-14)"

- [ ] **Step 1:** textos acima, com data 2026-11-14.
- [ ] **Step 2: navegador:** script temporário em `scripts/` cria produto com prazo 5, produto sem prazo, lote vencido dentro do prazo e outro fora, e usuários GESTOR, VENDAS e PRODUCAO na filial do admin; conferir com Playwright: Liberar (os três estados do diálogo), texto "Movimentação liberada até", pedido com VENDAS, consumo na OP com PRODUCAO, Revogar; largura 390 px sem rolagem horizontal. Rodar o modo `limpar`, apagar o script e `.playwright-mcp/`.
- [ ] **Step 3:** suíte inteira `npx vitest run` → PASS.
- [ ] **Step 4:** commit `docs(producao): liberação de lote vencido no lote (D-35)`.
