# Fase 7b — Recepção e estoque: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recepção de fruto com lote numerado e conta a pagar, estoque por lote com saldo por movimentos, ajustes e etiqueta em PDF.

**Architecture:** Cálculos puros em `src/lib/producao/` (usados pelo servidor e pelo resumo do formulário). Serviços em `src/server/services/` no padrão da 7a, com toda escrita de estoque passando por `movimentarSaldo` dentro de `$transaction`. A conta a pagar usa o núcleo de `criarTitulo` extraído para `criarTituloInterno`. Telas em `/producao/*`, com seção nova no menu.

**Tech Stack:** Next.js 16, React 19, Prisma 7 + Postgres, Zod 4, Vitest, pdf-lib.

**Spec:** [`docs/superpowers/specs/2026-11-09-fase-7b-recepcao-estoque-design.md`](../specs/2026-11-09-fase-7b-recepcao-estoque-design.md)

## Global Constraints

- kg `Decimal(18,3)`; R$/kg `Decimal(18,4)`; R$ `Decimal(18,2)`.
- Datas de calendário em UTC (`"2026-11-09"` → `2026-11-09T00:00:00.000Z`), como no resto do sistema.
- `Lote.saldoKg` só muda por `movimentarSaldo`, na mesma transação do movimento; nunca abaixo de zero.
- Movimentos nunca são editados nem apagados; número de lote nunca muda nem é reaproveitado.
- Toda escrita: `requirePermission` → `requireAlteracaoFilial` → operação → `registrarAuditoria` (com `tx` quando dentro de transação).
- Escopo por `filialId` da sessão (lote, recepção, ajuste, local, talhão); produto, fruta, fornecedor por `empresaId`.
- Mensagem sem categoria: "Configure a categoria de compra de fruto em Administração → Configuração de produção".
- Sem dados reais da Hortitex em testes, seed ou docs.
- Commits convencionais terminando em `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Depois de mudar o schema: `npx prisma migrate dev` **e** `npx prisma generate` (o Prisma 7 não gera sozinho), e reiniciar o `npm run dev` se estiver rodando.

## Review Focus

1. **Data perto da meia-noite:** recepção com data `2026-11-09` e validade de 1 dia gera `FA-261109-01` e validade `2026-11-10`, sem deslocar um dia por fuso. → Task 2 e Task 5.
2. **Rasa fracionada:** 2,5 rasas de 14 kg = 35 kg; preço por rasa sobre fração dá o valor certo. → Task 2.
3. **Descarte igual ao bruto:** líquido 0 é recusado ("O peso líquido precisa ser maior que zero"), nada é gravado. → Task 2 e Task 5.
4. **Terceiro com preço 0:** cria lote, não cria título e não exige categoria configurada. → Task 5.
5. **Unidade comercial em produto sem fator:** recepção em "rasa" de produto que só tem kg é recusada. → Task 5.

---

### Task 1: Schema, migration e campos financeiros da configuração

**Files:**
- Modify: `prisma/schema.prisma`; Create: `prisma/migrations/<ts>_fase_7b_recepcao_estoque/`
- Modify: `src/server/services/configuracaoProducao.ts`, `src/lib/schemas/configuracaoProducao.ts`, `src/server/services/configuracaoProducao.test.ts`
- Modify: `src/app/(dashboard)/configuracao-producao/{page.tsx,configuracao-form.tsx}`
- Modify: `src/server/services/producaoTestFixtures.ts`

**Interfaces:**
- Produces: models `Lote`, `MovimentoEstoque`, `AjusteEstoque`, `RecepcaoFruto` e os enums da spec §1, exatamente como lá; `ConfiguracaoProducao.categoriaCompraFrutoId String?` (relação com `CategoriaFinanceira`, `onDelete: SetNull`) e `prazoPagamentoProdutorDias Int @default(0)`.
- Produces: `ConfiguracaoProducaoValores` ganha `categoriaCompraFrutoId: string | null` e `prazoPagamentoProdutorDias: number`; padrões `null` e `0`.
- Produces: `FixtureProducao` ganha `limpar()` que também apaga, nesta ordem, auditLog → movimentos → ajustes → recepções → títulos da filial → lotes → produtos/talhões/locais → empresas.
- Produces (fixture): `criarCatalogoDeTeste(fx): Promise<{ frutaId; produtoFrutoId (código "FA", validade 1, rasa 14); produtoPolpaId; talhaoId; localRecepcaoId; localCamaraId; fornecedorId; categoriaCompraId (DESPESA) }>` na filial A.

- [ ] **Step 1: Testes que falham** em `configuracaoProducao.test.ts`:
  - `salvar grava categoria de compra e prazo` → `obterConfiguracaoProducao` devolve `{ categoriaCompraFrutoId: <id>, prazoPagamentoProdutorDias: 7 }`.
  - `recusa categoria de outra filial` → rejects "Categoria de compra de fruto inválida".
  - `recusa categoria de receita` → mesma mensagem.
  - schema: `prazoPagamentoProdutorDias: "-1"` falha; `categoriaCompraFrutoId: "__nenhum__"` vira `null`.
- [ ] **Step 2:** `npx vitest run src/server/services/configuracaoProducao.test.ts` → FAIL.
- [ ] **Step 3: Implementar** o schema Prisma (spec §1), migration + generate, os dois campos no schema Zod e no serviço. Validar a categoria em `salvarConfiguracaoProducao` com `categoriaFinanceira.findFirst({ id, filialId, tipo: "DESPESA" })`. No formulário: card "Compra de fruto" com Select de categorias DESPESA ativas da filial (opção "Nenhuma" = `SEM_VALOR`) e input de prazo em dias (`min 0`, `step 1`), com ajuda "Vencimento padrão da conta a pagar da compra de fruto. Pode ser mudado em cada recepção."
- [ ] **Step 4:** testes do arquivo PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 5:** commit `feat(producao): modelo de lote, movimentos e recepção; configuração da compra de fruto`.

---

### Task 2: Cálculos puros

**Files:**
- Create: `src/lib/producao/{unidade.ts,recepcao.ts,lote.ts,statusLote.ts}` e um `*.test.ts` para cada.

**Interfaces:**
- Produces:
  - `paraKg(quantidade: number, fatorUnidadeKg: number | null): number` (3 casas).
  - `precoPorKg(preco: number, fatorUnidadeKg: number | null): number` (4 casas).
  - `calcularRecepcao({ bruto, descarte, preco, fatorUnidadeKg }: { bruto: number; descarte: number; preco: number; fatorUnidadeKg: number | null }): { brutoKg; descarteKg; liquidoKg; percentualDescarte; precoKg; valorTotal }` — entrada na unidade digitada; `valorTotal = round2((bruto − descarte) × preco)`; lança `Error` com "O descarte não pode ser negativo", "O descarte não pode ser maior que o peso bruto", "O peso líquido precisa ser maior que zero".
  - `calcularValidade(data: Date, validadeDias: number): Date` (soma em UTC).
  - `prefixoDoLote(codigoProduto: string, data: Date): string` → `"FA-261109"`.
  - `proximoCodigoDeLote(prefixo: string, codigosExistentes: string[]): string` → maior NN + 1, 2 dígitos (3 a partir de 100).
  - `type StatusLote = "OK" | "VENCENDO" | "VENCIDO" | "ZERADO"`; `diasParaVencer(validade: Date, referencia: Date): number`; `statusDoLote({ saldoKg, validade, conservacao }, referencia, { alertaVencimentoCongeladoDias, alertaVencimentoResfriadoDias }): StatusLote`.
  - `ROTULOS_STATUS_LOTE: Record<StatusLote, string>` = OK "OK", VENCENDO "Vencendo", VENCIDO "Vencido", ZERADO "Zerado".

- [ ] **Step 1: Testes que falham**, com estes valores:
  - `paraKg(4, 14) === 56`; `paraKg(2.5, 14) === 35`; `paraKg(10.5, null) === 10.5`.
  - `precoPorKg(60, 14) === 4.2857`; `precoPorKg(4, null) === 4`.
  - `calcularRecepcao({ bruto: 4, descarte: 0, preco: 60, fatorUnidadeKg: 14 })` → `{ liquidoKg: 56, valorTotal: 240, precoKg: 4.2857 }`.
  - `calcularRecepcao({ bruto: 56, descarte: 3, preco: 4, fatorUnidadeKg: null })` → `{ liquidoKg: 53, valorTotal: 212, percentualDescarte ≈ 0.0536 }`.
  - `calcularRecepcao({ bruto: 2.5, descarte: 0, preco: 60, fatorUnidadeKg: 14 })` → `{ liquidoKg: 35, valorTotal: 150 }`.
  - descarte > bruto, descarte negativo e descarte = bruto lançam as três mensagens.
  - `calcularValidade(new Date("2026-11-09"), 1).toISOString().slice(0,10) === "2026-11-10"`; com 365 → `"2027-11-09"`.
  - `prefixoDoLote("FA", new Date("2026-11-09")) === "FA-261109"`.
  - `proximoCodigoDeLote("FA-261109", []) === "FA-261109-01"`; com `["FA-261109-01","FA-261109-09"]` → `"-10"`; com `-99` → `"-100"`.
  - status: saldo 0 → ZERADO mesmo vencido; validade ontem → VENCIDO; congelado com 30 dias → VENCENDO e 31 → OK; in natura com 1 dia → VENCENDO, 2 → OK; resfriado segue o alerta de resfriado.
- [ ] **Step 2:** `npx vitest run src/lib/producao` → FAIL.
- [ ] **Step 3:** implementar. Arredondamento com `Math.round(x * 10^n) / 10^n` sobre o valor já calculado na unidade digitada.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(producao): cálculos de recepção, validade, número de lote e status`.

---

### Task 3: Núcleo de criação de título sem checagem de perfil

**Files:**
- Modify: `src/server/services/titulo.ts`
- Test: `src/server/services/titulo.test.ts`

**Interfaces:**
- Produces: `type ContextoTitulo = { empresaId: string; filialId: string; usuarioId: string }`; `criarTituloInterno(contexto: ContextoTitulo, tipo: TipoTitulo, dados: TituloFormValues, db: ClientePrisma): Promise<Titulo & { parcelas: Parcela[] }>`, com o corpo atual de `criarTitulo` a partir de `validarReferenciasDoTitulo`. `validarReferenciasDoTitulo` passa a receber `ContextoTitulo` (a `SessaoAtiva` satisfaz o tipo). `criarTitulo` mantém as duas checagens e delega.

- [ ] **Step 1: Teste que falha** `criarTituloInterno cria título sem exigir titulo:escrever`: com `criarFixtureFinanceiro("INTERNO", "CONSULTA")`, chamar `criarTituloInterno({ empresaId, filialId, usuarioId }, "PAGAR", dadosValidos, prisma)` → título criado com 1 parcela e um `auditLog` `CRIAR` de `Titulo`.
- [ ] **Step 2:** FAIL (função não existe).
- [ ] **Step 3:** extrair.
- [ ] **Step 4:** `npx vitest run src/server/services/titulo.test.ts src/server/services/tituloClassificacao.test.ts` PASS, com os testes existentes intactos.
- [ ] **Step 5:** commit `refactor(titulo): núcleo de criação reutilizável por outros módulos`.

---

### Task 4: Núcleo do estoque

**Files:**
- Create: `src/server/services/estoque.ts`, `src/server/services/estoque.test.ts`
- Modify: `src/server/services/producaoTestFixtures.ts`

**Interfaces:**
- Consumes: Task 2 (`statusDoLote`, `diasParaVencer`), `obterConfiguracaoProducao`.
- Produces:
  - `movimentarSaldo(tx: Prisma.TransactionClient, loteId: string, deltaKg: number): Promise<void>` — `updateMany({ where: { id, saldoKg: { gte: -delta } } , data: { saldoKg: { increment: delta } } })` para saída; para entrada, sem condição; `count === 0` → `Error("Saldo insuficiente no lote <codigo>")`.
  - `registrarMovimento(tx, { filialId, loteId, data, tipo, quantidadeKg, usuarioId, ajusteId? }): Promise<MovimentoEstoque>` — cria o movimento **e** chama `movimentarSaldo`.
  - `type FiltroLotes = { produtoId?: string; localId?: string; status?: StatusLote; incluirZerados?: boolean }`.
  - `listarLotes(filialId: string, filtros: FiltroLotes, referencia: Date): Promise<LoteListado[]>`, `LoteListado` = lote + `produto { codigo, descricao, conservacao }` + `local { nome }` + `dias`, `status`, `valor` (number).
  - `resumoProdutoLocal(filialId: string): Promise<{ linhas: { produtoId; produto; localId; local; saldoKg; valor }[]; locais: { localId; nome; capacidadeKg: number | null; saldoKg; ocupacao: number | null }[] }>` — agregação com `groupBy` em `saldoKg > 0`.
  - `moverLote(sessao: SessaoAtiva, loteId: string, localId: string): Promise<void>` — `producao:escrever`; local da filial e ativo; auditoria `Lote` / `MOVER` com local anterior e novo.
  - Fixture: `criarLoteDeTeste(fx, { produtoId, localId, kg, custoKg?, data?, validade?, codigo? }): Promise<Lote>` — cria lote + movimento `ENTRADA` pela função `registrarMovimento`.

- [ ] **Step 1: Testes que falham:**
  - `saída maior que o saldo é recusada e nada muda` → rejects "Saldo insuficiente no lote"; `saldoKg` intacto.
  - `duas saídas simultâneas que juntas passam do saldo: só uma passa` — lote 10 kg, `Promise.allSettled` de duas transações de −7 → exatamente 1 fulfilled; saldo final 3.
  - `saldoKg é sempre a soma dos movimentos` — após entrada + saídas + entrada: `aggregate(_sum)` = `saldoKg`.
  - `listarLotes`: ordena por validade; oculta zerados por padrão e mostra com `incluirZerados`; filtro por `status: "VENCIDO"`; `valor = saldo × custo`; não traz lote de outra filial.
  - `resumoProdutoLocal`: soma por produto × local; ocupação `= saldo ÷ capacidade` no local com capacidade e `null` sem capacidade.
  - `moverLote`: muda o local e audita; recusa local de outra filial; VENDAS recebe `PermissionError`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** PASS; tsc limpo.
- [ ] **Step 5:** commit `feat(producao): saldo por movimentos, consulta de lotes e mudança de local`.

---

### Task 5: Serviço de recepção

**Files:**
- Create: `src/lib/schemas/recepcao.ts`, `src/server/services/recepcaoFruto.ts`, `src/server/services/recepcaoFruto.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `UNIDADE_RECEPCAO = ["KG", "COMERCIAL"] as const`.
  - `recepcaoSchema` → `RecepcaoFormValues`: `data` (date), `produtoId`, `origem` (`PROPRIA|TERCEIRO`), `talhaoId?`, `fornecedorId?`, `localId`, `unidade`, `pesoBruto` (> 0), `descarte` (≥ 0, padrão 0), `preco?` (≥ 0; obrigatório para TERCEIRO), `qualidade?` (`A|B|C` ou `SEM_VALOR`), `documento?`, `observacao?`, `safraId?`, `dataVencimento?` (date), `classificacaoFiscal?` (`FISCAL|GERENCIAL`), `numeroNotaProdutor?`. `superRefine`: PROPRIA exige talhão ("Selecione o talhão"); TERCEIRO exige fornecedor ("Selecione o fornecedor") e preço ("Informe o preço"); FISCAL exige `numeroNotaProdutor` ("Informe o número da nota do produtor").
  - `criarRecepcao(sessao, dados: RecepcaoFormValues): Promise<{ recepcaoId: string; loteId: string; codigoLote: string; tituloId: string | null }>`.
  - `atualizarDadosRecepcao(sessao, id, { qualidade, documento, observacao }): Promise<void>`.
  - `cancelarRecepcao(sessao, id, motivo: string): Promise<void>` (motivo com ≥ 3 caracteres).
  - `situacaoParaCancelar(recepcaoId): Promise<{ podeCancelar: boolean; motivo?: string }>` — usada pela tela para desabilitar o botão com explicação.
  - `listarRecepcoes(filialId, { inicio: Date; fim: Date; frutaId?: string; origem?: OrigemRecepcao }): Promise<RecepcaoListada[]>` com lote (código), produto (descrição, fruta), talhão/fornecedor (nome).

Regras na criação (spec §3): validações com estas mensagens:

| Caso | Mensagem |
|---|---|
| produto não é FRUTO, inativo ou de outra empresa | "Produto de fruto não encontrado ou inativo" |
| local de outra filial ou inativo | "Local de armazenamento não encontrado ou inativo" |
| talhão de outra filial, inativo ou de outra fruta | "Talhão não encontrado, inativo ou de outra fruta" |
| fornecedor de outra empresa ou inativo | "Fornecedor não encontrado ou inativo" |
| `unidade: "COMERCIAL"` sem fator no produto | "Este produto não tem unidade comercial; lance em kg" |
| terceiro, valor > 0, sem categoria | mensagem das Global Constraints |

Custo: PROPRIA → `fruta.custoPadraoKg` como preço por kg (unidade ignorada para preço); TERCEIRO → `calcularRecepcao`. Título só para TERCEIRO com `valorTotal > 0`, campos da tabela da spec §3 (`tipoComprovante` `NF_PRODUTOR` + `numeroDocumentoFiscal` quando FISCAL; `RECIBO` quando GERENCIAL; classificação omitida usa o padrão do fornecedor; vencimento padrão `data + prazoPagamentoProdutorDias`). Retry: até 3 tentativas da transação inteira quando o P2002 vier do código do lote.

- [ ] **Step 1: Testes que falham** (usar `criarCatalogoDeTeste`):
  - `própria: cria lote com custo-padrão, movimento ENTRADA e sem título` — fruta com custo 1.5; `lote.custoKg = 1.5`, `saldoKg = quantidadeInicialKg = líquido`, `tituloId null`.
  - `data 2026-11-09 com validade 1 dia gera FA-261109-01 e validade 2026-11-10` (Review Focus 1); a segunda do mesmo dia → `FA-261109-02`.
  - `terceiro em rasas: 4 rasas a R$ 60 gera 56 kg, R$ 240,00 e título a pagar` — título PAGAR, `valorOriginal 240`, categoria = configurada, documento `RF-FA-261109-0N` quando sem documento, vencimento = data + prazo configurado (7), classificação GERENCIAL / RECIBO para fornecedor sem padrão.
  - `terceiro fiscal grava NF_PRODUTOR com o número informado`.
  - `PRODUCAO cria recepção de terceiro sem titulo:escrever`.
  - `terceiro com preço 0 não cria título nem exige categoria` (Review Focus 4) — sem categoria configurada, resolve; `tituloId null`.
  - `terceiro com valor e sem categoria é recusado` com a mensagem.
  - `descarte igual ao bruto é recusado e nada é gravado` (Review Focus 3) — contagem de lotes inalterada.
  - `unidade COMERCIAL em produto sem fator é recusada` (Review Focus 5).
  - `falha no título não deixa lote, movimento nem recepção` — nota de produtor duplicada (mesmo fornecedor, mesmo número) na segunda recepção fiscal → rejects; contagens iguais às de antes.
  - `recusas de cadastro` — produto POLPA, talhão de outra fruta, fornecedor de outra empresa: as mensagens da tabela.
  - `cancelar zera o lote, cancela as parcelas e marca a recepção` — movimento `ESTORNO_RECEPCAO` de −líquido; parcelas `CANCELADO`; status `CANCELADA`; `situacaoParaCancelar` depois → `podeCancelar false`.
  - `cancelar é recusado com ajuste no lote` → "O lote já teve movimentação; não é possível excluir a recepção".
  - `cancelar é recusado com baixa não rejeitada` → "A conta a pagar já tem pagamento registrado; não é possível excluir a recepção".
  - `atualizarDadosRecepcao muda só qualidade, documento e observação, com auditoria`.
  - `VENDAS e CONSULTA não criam; filial somente leitura recusa`.
  - `listarRecepcoes` filtra por período, fruta e origem e não traz de outra filial.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** PASS; tsc limpo.
- [ ] **Step 5:** commit `feat(producao): recepção de fruto com lote, estoque e conta a pagar`.

---

### Task 6: Serviço de ajuste

**Files:**
- Create: `src/lib/schemas/ajusteEstoque.ts`, `src/server/services/ajusteEstoque.ts`, `src/server/services/ajusteEstoque.test.ts`
- Modify: `src/lib/schemas/enums.ts` (`MOTIVO_AJUSTE_ESTOQUE`, `ROTULOS_MOTIVO_AJUSTE`: Vencido, Avaria/quebra, Amostra (ADEPARA/laboratório), Inventário, Consumo interno, Outro; `QUALIDADE_FRUTO`; `ORIGEM_RECEPCAO` + `ROTULOS_ORIGEM_RECEPCAO`: Própria, Terceiro)

**Interfaces:**
- Produces: `ajusteSchema` → `AjusteFormValues = { loteId; data: Date; sentido: "ENTRADA" | "SAIDA"; quantidadeKg: number (> 0); motivo; observacao: string | null }`; `criarAjuste(sessao, dados): Promise<AjusteEstoque>` (grava `quantidadeKg` com sinal); `listarAjustes(filialId, { inicio, fim, motivo? })` com lote (código), produto (descrição), usuário (nome).

- [ ] **Step 1: Testes que falham:** saída de 3 kg em lote de 10 → saldo 7, ajuste −3, movimento `AJUSTE` ligado pelo `ajusteId`; saída de 11 recusada ("Saldo insuficiente"); entrada em lote zerado (inventário) → saldo sobe; PRODUCAO ajusta, VENDAS e FINANCEIRO não (`estoque:ajustar`); lote de outra filial → rejects; auditoria com motivo; `listarAjustes` filtra por período e motivo.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(producao): ajustes de estoque`.

---

### Task 7: Tela de recepção e seção Produção no menu

**Files:**
- Modify: `src/app/(dashboard)/nav-items.ts` (+ teste)
- Create: `src/app/(dashboard)/producao/recepcao/{page.tsx,actions.ts,recepcao-dialog-form.tsx,recepcao-acoes.tsx,export/route.ts}`
- Create: `src/app/(dashboard)/producao/_shared/filtro-periodo.tsx` (se nenhum componente de período existente servir; checar `src/app/(dashboard)/_shared` antes)

**Interfaces:**
- Consumes: Tasks 2, 5.
- Produces: seção `{ titulo: "Produção", itens: [Recepção de fruto `/producao/recepcao`, Estoque `/producao/estoque`, Ajustes de estoque `/producao/ajustes`] }` com `acao: "producao:ler"`, entre Controladoria e Cadastros.

- [ ] **Step 1: Teste que falha** em `nav-items.test.ts`: PRODUCAO, VENDAS e CONSULTA veem a seção "Produção" com os 3 itens; `secoesVisiveis` de um perfil sem `producao:ler` não existe hoje, então só esses asserts.
- [ ] **Step 2:** FAIL. **Step 3:** item de menu.
- [ ] **Step 4: Tela**, conforme spec §4:
  - filtros na URL `?inicio=&fim=&fruta=&origem=` (padrão: mês atual);
  - `ExportarLinks baseHref="/producao/recepcao/export"` com a mesma query;
  - colunas da spec.
  - O formulário é client component: o resumo usa `calcularRecepcao`, `calcularValidade` e `paraKg`/`precoPorKg` ao vivo. Mostra "—" enquanto faltar dado e a mensagem do erro de cálculo em vermelho.
  - Talhões filtrados pela fruta do produto escolhido.
  - O seletor de unidade só aparece se o produto tiver unidade comercial.
  - Campos de terceiro (preço, vencimento, classificação, nº da nota) só com origem TERCEIRO.
  - Vencimento inicial = data + prazo da configuração.
  - Classificação inicial = padrão do fornecedor (passar o mapa fornecedor → padrão para o cliente).
  - Depois de salvar, um toast (sonner, já instalado) mostra "Lote FA-… criado", com link para a etiqueta.
  - Ações por linha: Etiqueta (link), Editar (diálogo com qualidade, documento, observação) e Excluir (diálogo com motivo; desabilitado com `title` = motivo de `situacaoParaCancelar`).
  - `DialogContent className="max-h-[90vh] overflow-y-auto"`.
- [ ] **Step 5: Export:** colunas Data · Lote · Produto · Fruta · Origem · Talhão/Fornecedor · Bruto (kg) · Descarte (kg) · Descarte (%) `tipo: "percentual"` · Líquido (kg) · R$/kg · Valor · Qualidade · Documento · Status. Exige `producao:ler` (403 sem). PDF com `cabecalhoDoRelatorio` e filtros de período/fruta/origem.
- [ ] **Step 6:** `npx tsc --noEmit` e `npx vitest run "src/app/(dashboard)/nav-items.test.ts"` limpos.
- [ ] **Step 7:** commit `feat(producao): tela de recepção de fruto`.

---

### Task 8: Telas de estoque e ajustes

**Files:**
- Create: `src/app/(dashboard)/producao/estoque/{page.tsx,actions.ts,mover-lote-dialog.tsx,export/route.ts}`
- Create: `src/app/(dashboard)/producao/ajustes/{page.tsx,actions.ts,ajuste-dialog-form.tsx,export/route.ts}`

**Interfaces:**
- Consumes: Tasks 4, 6.

- [ ] **Step 1: Estoque:**
  - `?visao=lotes|resumo`, `?produto=&local=&status=&zerados=1&referencia=YYYY-MM-DD`.
  - Badge de status: VENCIDO `destructive`, VENCENDO `secondary` com o texto "Vencendo", OK `default`, ZERADO `outline`.
  - Ações: Etiqueta e Mover (só com `producao:escrever` + filial alterável).
  - Resumo com tabela produto × local e tabela de locais com ocupação em %.
  - Export das linhas por lote: Lote · Produto · Local · Data · Validade · Dias (`inteiro`) · Status · Saldo (kg) · Custo/kg · Valor.
- [ ] **Step 2: Ajustes:**
  - Lista com filtros `?inicio=&fim=&motivo=`.
  - O formulário lista os lotes com saldo em ordem FEFO ("FA-261109-01 · 53,000 kg · vence 10/11"). Lotes zerados só aparecem quando o sentido é ENTRADA.
  - Export: Data · Lote · Produto · Quantidade (kg) · Motivo · Observação · Usuário.
  - Botão "Novo ajuste" só com `estoque:ajustar` + filial alterável.
- [ ] **Step 3:** `npx tsc --noEmit` limpo.
- [ ] **Step 4:** commit `feat(producao): telas de estoque e de ajustes`.

---

### Task 9: Etiqueta do lote

**Files:**
- Create: `src/lib/export/etiqueta.ts`, `src/lib/export/etiqueta.test.ts`
- Create: `src/app/(dashboard)/producao/lotes/[id]/etiqueta/route.ts`

**Interfaces:**
- Produces: `type DadosEtiqueta = { empresa: string; produto: string; codigoLote: string; rotuloData: "Fabricação" | "Recepção"; data: Date; validade: Date; armazenamento: string | null; pesoLiquidoKg: number; registroAdepara: string | null }`; `gerarEtiquetaPdf(dados: DadosEtiqueta): Promise<Uint8Array>` — 1 página de 100 × 70 mm (283,46 × 198,43 pt), Helvetica, texto passado pelo sanitizador WinAnsi já usado em `src/lib/export/pdf.ts` (exportar `criarSanitizador` se ainda não for exportado).

- [ ] **Step 1: Testes que falham:** o PDF gerado, relido com `PDFDocument.load`, tem 1 página de largura ≈ 283,46 e altura ≈ 198,43; produto com "Açaí – congelada" e "−18 °C" não lança; `registroAdepara: null` não lança.
- [ ] **Step 2:** FAIL. **Step 3:** implementar o gerador e a rota:
  - `producao:ler` (403);
  - lote da filial ativa (404);
  - `rotuloData` pela origem do lote;
  - `Content-Disposition: inline; filename="etiqueta-<codigo>.pdf"`.
- [ ] **Step 4:** PASS; tsc limpo.
- [ ] **Step 5:** commit `feat(producao): etiqueta do lote em PDF`.

---

### Task 10: Ajuda, verificação e docs

- [ ] **Step 1:** `content/ajuda/passo-a-passo.md`: seção nova "Produção":
  - recepção (própria × terceiro, rasa, resumo, número do lote, conta a pagar e onde configurar a categoria e o prazo, excluir e relançar);
  - estoque (status, data de referência, mover);
  - ajustes;
  - etiqueta.
  - Glossário: Lote, FEFO.
- [ ] **Step 2:** `npm test`, `npm run lint`, `npm run build` limpos.
- [ ] **Step 3: Navegador** (reiniciar o dev após o generate; login admin → Empresa Demonstração → Matriz):
  - configurar a categoria de compra e prazo 7;
  - recepção própria em kg;
  - recepção de terceiro em rasas, conferindo a conta a pagar em Financeiro → Contas a pagar;
  - etiqueta abre;
  - ajuste de saída e saída acima do saldo recusada;
  - mover lote;
  - excluir recepção (e o bloqueio depois de um ajuste);
  - estoque nas duas abas;
  - export CSV/Excel/PDF das três telas;
  - 390px sem rolagem horizontal da página;
  - usuário Produção temporário consegue tudo, exceto o que não tem permissão; remover depois;
  - apagar `.playwright-mcp`.
- [ ] **Step 4:** `docs/fases/fase-7-producao-estoque-vendas.md` (7b concluída) e spec com `Status: implementada`. Commit `docs(producao): Fase 7b concluída`.
