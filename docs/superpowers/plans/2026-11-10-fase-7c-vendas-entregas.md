# Fase 7c — Vendas e entregas: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pedido de venda com itens por lote, conta a receber criada junto (já paga quando à vista), cancelamento com estorno, entregas e recibo em PDF.

**Architecture:** Cálculos puros em `src/lib/producao/venda.ts` (usados pelo servidor e pelo formulário). Serviços em `src/server/services/` no padrão da 7b: tudo numa `$transaction`, estoque só por `registrarMovimento`, título por `criarTituloInterno`, baixa à vista por `efetivarBaixa` (extraída de `aprovarBaixa`). Telas em `/vendas/*`, com seção nova **Vendas** no menu.

**Tech Stack:** Next.js 16, React 19, Prisma 7 + Postgres, Zod 4, Vitest, pdf-lib.

**Spec:** [`docs/superpowers/specs/2026-11-10-fase-7c-vendas-entregas-design.md`](../specs/2026-11-10-fase-7c-vendas-entregas-design.md)

## Global Constraints

- kg `Decimal(18,3)`; R$/kg `Decimal(18,4)`; R$ `Decimal(18,2)`.
- Datas de calendário em UTC (`"2026-11-10"` → `2026-11-10T00:00:00.000Z`); "hoje" é `hojeDeCalendario()` de `src/lib/producao/periodo.ts`.
- `Lote.saldoKg` só muda por `registrarMovimento`; movimentos nunca são editados nem apagados; número do pedido nunca muda nem é reaproveitado.
- Toda escrita: `requirePermission` → `requireAlteracaoFilial` → operação → `registrarAuditoria` (com `tx` dentro de transação).
- Escopo: pedido, lote, conta, categoria, entrega por `filialId` da sessão; cliente por `empresaId`.
- Permissões (sem mudar a matriz): `venda:ler`, `venda:escrever`, `venda:cancelar`, `venda:liberarVencido`. A venda cria título e baixa **sem** `titulo:escrever`/`titulo:aprovar`.
- Mensagens de configuração, exatas:
  - "Configure a categoria de venda em Administração → Configuração de produção"
  - "Configure a conta de recebimento padrão em Administração → Configuração de produção"
  - "Configure a conta Caixa padrão em Administração → Configuração de produção"
- Itens não são editados; pedido errado é cancelado com motivo e refeito. Observação e dados da entrega são editáveis sempre.
- Sem dados reais da Hortitex em testes, seed ou docs.
- Antes de escrever código de página/rota/action, ler o guia correspondente em `node_modules/next/dist/docs/` (AGENTS.md): `params`/`searchParams` como Promise, `notFound`, `redirect` em Server Action.
- Depois de mudar o schema: `npx prisma migrate dev` **e** `npx prisma generate`; reiniciar o `npm run dev` se estiver rodando.
- Arquivos com CRLF: editar com a ferramenta Edit, não com scripts de `replace`.
- Commits convencionais terminando em `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Falha no meio não grava nada:** pedido com 2 itens, o segundo acima do saldo → "Saldo insuficiente no lote X"; nenhum pedido, item, movimento, título ou baixa gravado; o próximo pedido recebe o número que seria usado. → Task 4.
2. **Vencido é relativo à data do pedido:** lote com `validade = data` é aceito; `validade = data − 1` é bloqueado. → Task 4.
3. **Cancelar venda em dinheiro:** o lançamento na conta Caixa nasce `conciliado: true` mas **sem linha de extrato** — o cancelamento é permitido e apaga baixa e lançamento. Só a linha de extrato bloqueia. → Task 5.
4. **Perfil VENDAS:** cria venda à vista com baixa aprovada e lançamento, sem nenhuma permissão `titulo:*`. → Task 4.
5. **Numeração simultânea:** dois pedidos em paralelo recebem números distintos (retry em P2002). → Task 4.

---

### Task 1: Schema, migration, configuração de vendas e fixtures

**Files:**
- Modify: `prisma/schema.prisma`; Create: `prisma/migrations/<ts>_fase_7c_vendas/`
- Modify: `src/server/services/configuracaoProducao.ts`, `src/lib/schemas/configuracaoProducao.ts`, `src/server/services/configuracaoProducao.test.ts`
- Modify: `src/app/(dashboard)/configuracao-producao/{page.tsx,configuracao-form.tsx}`
- Modify: `src/server/services/producaoTestFixtures.ts`
- Modify: `src/lib/schemas/enums.ts`

**Interfaces:**
- Produces (Prisma): enums `FormaPagamentoVenda`, `StatusPedidoVenda`, `StatusEntrega`; `TipoMovimentoEstoque` += `VENDA`, `ESTORNO_VENDA`; models `PedidoVenda`, `ItemPedidoVenda`, `Entrega`; `MovimentoEstoque.itemPedidoId`; `ConfiguracaoProducao.{categoriaVendaId, contaRecebimentoPadraoId, contaCaixaPadraoId}`.
- Produces: `ConfiguracaoProducaoValores` ganha `categoriaVendaId: string | null`, `contaRecebimentoPadraoId: string | null`, `contaCaixaPadraoId: string | null` (padrão `null`).
- Produces (enums.ts):
  - `FORMA_PAGAMENTO_VENDA = ["DINHEIRO", "PIX", "TRANSFERENCIA", "CARTAO", "A_PRAZO"] as const`; `ROTULOS_FORMA_PAGAMENTO_VENDA`: Dinheiro, Pix, Transferência, Cartão, A prazo.
  - `STATUS_PEDIDO_VENDA = ["CONFIRMADO", "CANCELADO"] as const`; `ROTULOS_STATUS_PEDIDO_VENDA`: Confirmado, Cancelado.
  - `STATUS_ENTREGA = ["PENDENTE", "EM_ROTA", "ENTREGUE", "CANCELADA"] as const`; `ROTULOS_STATUS_ENTREGA`: Pendente, Em rota, Entregue, Cancelada.
- Produces (fixture):
  - `FixtureProducao.limpar()` apaga também, antes do que já apaga: `linhaExtrato` → `extratoImportado` → `lancamentoBancario` → `movimentoEstoque` → `pedidoVenda` (itens e entrega em cascata) — e, no fim, os bancos de teste com `codigo` começando por `fx.prefixoBanco`.
  - `FixtureProducao.prefixoBanco: string` (`T${d}`).
  - `criarCadastrosDeVenda(fx): Promise<{ clienteId; clienteFiscalId; categoriaVendaId; contaCaixaId; contaCorrenteId }>` na filial A: cliente "Cliente exemplo" sem classificação padrão, `canalVenda: "ATACADO"`, `enderecoEntrega: "Rua A, 10"`, `retiraNaPropriedade: false`; cliente "Cliente fiscal" com `classificacaoFiscalPadrao: "FISCAL"`; categoria RECEITA "Venda de produtos"; conta CAIXA (banco de `obterBancoCaixa()`, agência `"-"`, conta "Caixa teste"); conta CORRENTE num banco `${fx.prefixoBanco}1`.
  - `configurarVendas(fx, cad)`: upsert da configuração da filial A com os três campos apontando para o cadastro.

- [ ] **Step 1: Testes que falham** em `configuracaoProducao.test.ts` (usar `criarCadastrosDeVenda` com a fixture do arquivo; se o arquivo usar outra fixture, criar uma `criarFixtureProducao` no `describe` novo):
  - `salva categoria de venda e contas padrão` → `obterConfiguracaoProducao` devolve os três ids.
  - `recusa categoria de despesa como categoria de venda` → "Categoria de venda inválida".
  - `recusa conta Caixa como conta de recebimento` → "Conta de recebimento padrão inválida".
  - `recusa conta corrente como conta Caixa padrão` → "Conta Caixa padrão inválida".
  - `recusa conta de outra filial` (conta criada na filial B) → "Conta de recebimento padrão inválida".
  - schema: os três campos com `"__nenhum__"` viram `null`.
- [ ] **Step 2:** `npx vitest run src/server/services/configuracaoProducao.test.ts` → FAIL.
- [ ] **Step 3: Schema Prisma** (spec §1), acrescentando as relações:

```prisma
enum FormaPagamentoVenda {
  DINHEIRO
  PIX
  TRANSFERENCIA
  CARTAO
  A_PRAZO
}

enum StatusPedidoVenda {
  CONFIRMADO
  CANCELADO
}

enum StatusEntrega {
  PENDENTE
  EM_ROTA
  ENTREGUE
  CANCELADA
}

// TipoMovimentoEstoque: acrescentar VENDA e ESTORNO_VENDA

model PedidoVenda {
  id                    String              @id @default(uuid())
  filialId              String
  numero                Int
  data                  DateTime
  clienteId             String
  canal                 CanalVenda?
  formaPagamento        FormaPagamentoVenda
  vencimento            DateTime?
  contaBancariaId       String?
  retiraNaPropriedade   Boolean             @default(false)
  numeroDocumentoFiscal String?
  observacao            String?
  status                StatusPedidoVenda   @default(CONFIRMADO)
  motivoCancelamento    String?
  canceladoEm           DateTime?
  tituloId              String?             @unique
  baixaAutomaticaId     String?             @unique
  usuarioId             String
  criadoEm              DateTime            @default(now())
  atualizadoEm          DateTime            @updatedAt

  filial          Filial            @relation(fields: [filialId], references: [id], onDelete: Cascade)
  cliente         Cliente           @relation(fields: [clienteId], references: [id], onDelete: Restrict)
  contaBancaria   ContaBancaria?    @relation(fields: [contaBancariaId], references: [id], onDelete: Restrict)
  titulo          Titulo?           @relation(fields: [tituloId], references: [id], onDelete: SetNull)
  baixaAutomatica Baixa?            @relation(fields: [baixaAutomaticaId], references: [id], onDelete: SetNull)
  usuario         Usuario           @relation(fields: [usuarioId], references: [id])
  itens           ItemPedidoVenda[]
  entrega         Entrega?

  @@unique([filialId, numero])
  @@index([filialId, data])
  @@map("pedidos_venda")
}

model ItemPedidoVenda {
  id                     String  @id @default(uuid())
  pedidoId               String
  loteId                 String
  quantidadeKg           Decimal @db.Decimal(18, 3)
  precoKg                Decimal @db.Decimal(18, 4)
  custoKg                Decimal @db.Decimal(18, 4)
  motivoLiberacaoVencido String?

  pedido     PedidoVenda        @relation(fields: [pedidoId], references: [id], onDelete: Cascade)
  lote       Lote               @relation(fields: [loteId], references: [id], onDelete: Restrict)
  movimentos MovimentoEstoque[]

  @@index([pedidoId])
  @@index([loteId])
  @@map("itens_pedido_venda")
}

model Entrega {
  pedidoId      String        @id
  dataPrevista  DateTime
  dataRealizada DateTime?
  endereco      String?
  responsavel   String?
  recebidoPor   String?
  observacao    String?
  status        StatusEntrega @default(PENDENTE)
  atualizadoEm  DateTime      @updatedAt

  pedido PedidoVenda @relation(fields: [pedidoId], references: [id], onDelete: Cascade)

  @@index([status, dataPrevista])
  @@map("entregas")
}
```

  - `MovimentoEstoque`: `itemPedidoId String?`, `itemPedido ItemPedidoVenda? @relation(fields: [itemPedidoId], references: [id])`, `@@index([itemPedidoId])`.
  - `ConfiguracaoProducao`: os três campos com relações `onDelete: SetNull`. Como passam a existir **duas** relações para `CategoriaFinanceira` e duas para `ContaBancaria`, nomear todas: `@relation("CategoriaCompraFruto", …)` (a existente; o nome não muda o banco), `"CategoriaVenda"`, `"ContaRecebimentoPadrao"`, `"ContaCaixaPadrao"`, com os campos de volta nomeados nos dois models.
  - Campos de volta: `Filial.pedidosVenda`, `Cliente.pedidosVenda`, `ContaBancaria.pedidosVenda`, `Titulo.pedidoVenda PedidoVenda?`, `Baixa.pedidoVenda PedidoVenda?`, `Usuario.pedidosVenda`, `Lote.itensPedidoVenda`.
  - `npx prisma migrate dev --name fase_7c_vendas` e `npx prisma generate`. Conferir no SQL gerado que nada existente é alterado além de `ADD VALUE` no enum, `ADD COLUMN` e FKs novas.
- [ ] **Step 4: Configuração.** Zod: os três campos `z.string().trim().optional()` com o mesmo transform de `categoriaCompraFrutoId` (`SEM_VALOR`/vazio → `null`). Serviço, em `salvarConfiguracaoProducao`:

```ts
if (dados.categoriaVendaId) {
  const ok = await prisma.categoriaFinanceira.findFirst({
    where: { id: dados.categoriaVendaId, filialId: sessao.filialId, tipo: "RECEITA" },
    select: { id: true },
  });
  if (!ok) throw new Error("Categoria de venda inválida");
}
if (dados.contaRecebimentoPadraoId) {
  const ok = await prisma.contaBancaria.findFirst({
    where: { id: dados.contaRecebimentoPadraoId, filialId: sessao.filialId, ativo: true, tipo: { not: "CAIXA" } },
    select: { id: true },
  });
  if (!ok) throw new Error("Conta de recebimento padrão inválida");
}
if (dados.contaCaixaPadraoId) {
  const ok = await prisma.contaBancaria.findFirst({
    where: { id: dados.contaCaixaPadraoId, filialId: sessao.filialId, ativo: true, tipo: "CAIXA" },
    select: { id: true },
  });
  if (!ok) throw new Error("Conta Caixa padrão inválida");
}
```

  `obterConfiguracaoProducao` devolve os três campos. Na página, carregar também categorias RECEITA ativas e contas ativas da filial (`include: { banco: true }`, rótulo `banco.nome · ag agencia · conta`, ou só `conta` para CAIXA). No formulário, card **Vendas** ("Usados pelo pedido de venda para criar a conta a receber e o recebimento à vista.") com três Selects (`defaultValue` = valor ou `SEM_VALOR`, opção "Nenhuma"): Categoria de venda (RECEITA), Conta de recebimento (Pix, transferência, cartão) — só contas não CAIXA, Conta Caixa (dinheiro) — só CAIXA.
- [ ] **Step 5: Fixture.** `prefixoBanco`, `limpar()` ampliado (ordem acima; `banco.deleteMany({ where: { codigo: { startsWith: prefixoBanco } } })` depois de apagar as empresas), `criarCadastrosDeVenda` e `configurarVendas`. Enums e rótulos em `enums.ts`.
- [ ] **Step 6:** testes do arquivo PASS; `npx vitest run src/server/services/recepcaoFruto.test.ts src/server/services/estoque.test.ts` continuam PASS (fixture alterada); `npx tsc --noEmit` limpo.
- [ ] **Step 7:** commit `feat(vendas): modelo de pedido, itens e entrega; configuração de vendas`.

---

### Task 2: Cálculos puros da venda

**Files:**
- Create: `src/lib/producao/venda.ts`, `src/lib/producao/venda.test.ts`

**Interfaces:**
- Produces:
  - `calcularItem({ quantidadeKg, precoKg, custoKg }: { quantidadeKg: number; precoKg: number; custoKg: number }): { valor: number; custo: number; margem: number }`.
  - `calcularPedido(itens: { quantidadeKg: number; precoKg: number; custoKg: number }[]): { valor: number; custo: number; margem: number; margemPercentual: number }` — `margemPercentual` é fração (0,65 = 65%), 0 quando `valor` é 0.
  - `atrasoEntregaDias(entrega: { status: StatusEntrega; dataPrevista: Date; dataRealizada: Date | null }, hoje: Date): number | null`.
  - `type SituacaoPagamento = "PAGO" | "EM_ABERTO" | "VENCIDO" | "CANCELADO"`; `situacaoPagamento(parcelas: { status: StatusParcela; dataVencimento: Date }[], hoje: Date): SituacaoPagamento`.
  - `ROTULOS_SITUACAO_PAGAMENTO: Record<SituacaoPagamento, string>` = Pago, Em aberto, Vencido, Cancelado.
  - `loteVencidoNaData(validade: Date, data: Date): boolean` → `validade < data`.

- [ ] **Step 1: Testes que falham:**

```ts
import { describe, expect, test } from "vitest";
import {
  atrasoEntregaDias,
  calcularItem,
  calcularPedido,
  loteVencidoNaData,
  situacaoPagamento,
} from "./venda";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("calcularItem", () => {
  test("arredonda valor, custo e margem a 2 casas no fim", () => {
    expect(calcularItem({ quantidadeKg: 10.5, precoKg: 4.3333, custoKg: 1.5 })).toEqual({
      valor: 45.5,
      custo: 15.75,
      margem: 29.75,
    });
  });
  test("margem negativa quando o preço é menor que o custo", () => {
    expect(calcularItem({ quantidadeKg: 2, precoKg: 1, custoKg: 1.5 }).margem).toBe(-1);
  });
});

describe("calcularPedido", () => {
  test("soma os itens e calcula a margem %", () => {
    const r = calcularPedido([
      { quantidadeKg: 10.5, precoKg: 4.3333, custoKg: 1.5 },
      { quantidadeKg: 2, precoKg: 3, custoKg: 1 },
    ]);
    expect(r).toMatchObject({ valor: 51.5, custo: 17.75, margem: 33.75 });
    expect(r.margemPercentual).toBeCloseTo(0.6553, 4);
  });
  test("margem % é 0 quando o valor é 0", () => {
    expect(calcularPedido([]).margemPercentual).toBe(0);
  });
});

describe("atrasoEntregaDias", () => {
  const hoje = d("2026-11-13");
  test("entregue: realizada − prevista", () => {
    expect(atrasoEntregaDias({ status: "ENTREGUE", dataPrevista: d("2026-11-10"), dataRealizada: d("2026-11-12") }, hoje)).toBe(2);
  });
  test("entregue antes do previsto: 0", () => {
    expect(atrasoEntregaDias({ status: "ENTREGUE", dataPrevista: d("2026-11-10"), dataRealizada: d("2026-11-08") }, hoje)).toBe(0);
  });
  test("pendente: hoje − prevista", () => {
    expect(atrasoEntregaDias({ status: "PENDENTE", dataPrevista: d("2026-11-10"), dataRealizada: null }, hoje)).toBe(3);
  });
  test("em rota com previsão futura: 0", () => {
    expect(atrasoEntregaDias({ status: "EM_ROTA", dataPrevista: d("2026-11-20"), dataRealizada: null }, hoje)).toBe(0);
  });
  test("cancelada: null", () => {
    expect(atrasoEntregaDias({ status: "CANCELADA", dataPrevista: d("2026-11-01"), dataRealizada: null }, hoje)).toBeNull();
  });
});

describe("situacaoPagamento", () => {
  const hoje = d("2026-11-13");
  test("todas pagas: PAGO", () => {
    expect(situacaoPagamento([{ status: "PAGO", dataVencimento: d("2026-11-01") }], hoje)).toBe("PAGO");
  });
  test("em aberto no prazo: EM_ABERTO", () => {
    expect(situacaoPagamento([{ status: "A_VENCER", dataVencimento: d("2026-11-15") }], hoje)).toBe("EM_ABERTO");
  });
  test("vencimento passado, mesmo com status gravado desatualizado: VENCIDO", () => {
    expect(situacaoPagamento([{ status: "EM_ABERTO", dataVencimento: d("2026-11-12") }], hoje)).toBe("VENCIDO");
  });
  test("parcialmente paga e vencida: VENCIDO", () => {
    expect(situacaoPagamento([{ status: "PARCIALMENTE_PAGO", dataVencimento: d("2026-11-01") }], hoje)).toBe("VENCIDO");
  });
  test("todas canceladas: CANCELADO", () => {
    expect(situacaoPagamento([{ status: "CANCELADO", dataVencimento: d("2026-11-01") }], hoje)).toBe("CANCELADO");
  });
});

describe("loteVencidoNaData", () => {
  test("validade igual à data não está vencido; um dia antes está", () => {
    expect(loteVencidoNaData(d("2026-11-10"), d("2026-11-10"))).toBe(false);
    expect(loteVencidoNaData(d("2026-11-09"), d("2026-11-10"))).toBe(true);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/producao/venda.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar:**

```ts
import type { StatusEntrega, StatusParcela } from "@prisma/client";
import { arredondar } from "./arredondar";

const UM_DIA_MS = 86_400_000;

export type ItemParaCalculo = { quantidadeKg: number; precoKg: number; custoKg: number };

/** Valor, custo e margem do item (RN-22), arredondados a 2 casas no fim. */
export function calcularItem({ quantidadeKg, precoKg, custoKg }: ItemParaCalculo) {
  const valor = arredondar(quantidadeKg * precoKg, 2);
  const custo = arredondar(quantidadeKg * custoKg, 2);
  return { valor, custo, margem: arredondar(valor - custo, 2) };
}

/** Totais do pedido: soma dos itens já arredondados (é o valor do título). */
export function calcularPedido(itens: ItemParaCalculo[]) {
  let valor = 0;
  let custo = 0;
  for (const item of itens) {
    const r = calcularItem(item);
    valor += r.valor;
    custo += r.custo;
  }
  valor = arredondar(valor, 2);
  custo = arredondar(custo, 2);
  const margem = arredondar(valor - custo, 2);
  return { valor, custo, margem, margemPercentual: valor === 0 ? 0 : margem / valor };
}

function diasEntre(inicio: Date, fim: Date): number {
  return Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / UM_DIA_MS));
}

/** Atraso da entrega em dias (RN-24); nunca negativo; cancelada não tem atraso. */
export function atrasoEntregaDias(
  entrega: { status: StatusEntrega; dataPrevista: Date; dataRealizada: Date | null },
  hoje: Date,
): number | null {
  if (entrega.status === "CANCELADA") return null;
  const fim = entrega.status === "ENTREGUE" ? (entrega.dataRealizada ?? hoje) : hoje;
  return diasEntre(entrega.dataPrevista, fim);
}

export type SituacaoPagamento = "PAGO" | "EM_ABERTO" | "VENCIDO" | "CANCELADO";

export const ROTULOS_SITUACAO_PAGAMENTO: Record<SituacaoPagamento, string> = {
  PAGO: "Pago",
  EM_ABERTO: "Em aberto",
  VENCIDO: "Vencido",
  CANCELADO: "Cancelado",
};

/** Situação do pedido lida das parcelas do título (RN-26). */
export function situacaoPagamento(
  parcelas: { status: StatusParcela; dataVencimento: Date }[],
  hoje: Date,
): SituacaoPagamento {
  const ativas = parcelas.filter((p) => p.status !== "CANCELADO" && p.status !== "RENEGOCIADO");
  if (ativas.length === 0) return "CANCELADO";
  if (ativas.every((p) => p.status === "PAGO")) return "PAGO";
  const vencida = ativas.some((p) => p.status !== "PAGO" && (p.status === "VENCIDO" || p.dataVencimento < hoje));
  return vencida ? "VENCIDO" : "EM_ABERTO";
}

/** D-03: o lote está vencido na data da venda quando a validade é anterior a ela. */
export function loteVencidoNaData(validade: Date, data: Date): boolean {
  return validade.getTime() < data.getTime();
}
```

- [ ] **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(vendas): cálculos de margem, atraso de entrega e situação de pagamento`.

---

### Task 3: `efetivarBaixa` — aprovação de baixa sem checagem de perfil

**Files:**
- Modify: `src/server/services/baixa.ts`
- Test: `src/server/services/baixa.test.ts`

**Interfaces:**
- Consumes: `ContextoTitulo` de `./titulo`.
- Produces: `efetivarBaixa(tx: Prisma.TransactionClient, contexto: ContextoTitulo, baixaId: string): Promise<{ baixa: Baixa; lancamentoId: string }>` — confere que a baixa está `PENDENTE` (lê dentro da `tx`), aprova, recalcula a parcela, cria o lançamento (`conciliado: conta.tipo === "CAIXA"`) e audita `APROVAR`. `aprovarBaixa` mantém `titulo:aprovar` + filial com alteração + escopo da filial e delega.

- [ ] **Step 1: Teste que falha** em `baixa.test.ts`: `efetivarBaixa aprova sem exigir titulo:aprovar` — com a fixture do arquivo, criar título a receber e baixa pendente (via `registrarBaixa` com a sessão que já é usada no arquivo); chamar `prisma.$transaction((tx) => efetivarBaixa(tx, { empresaId, filialId, usuarioId }, baixa.id))`; esperar baixa `APROVADO`, parcela `PAGO` e um `lancamentoBancario` `ENTRADA` com `baixaId`. Segundo teste: chamar de novo na mesma baixa → rejects "Esta baixa já foi avaliada".
- [ ] **Step 2:** FAIL (função não existe).
- [ ] **Step 3: Extrair:**

```ts
export async function efetivarBaixa(tx: Prisma.TransactionClient, contexto: ContextoTitulo, baixaId: string) {
  const anterior = await tx.baixa.findUniqueOrThrow({ where: { id: baixaId } });
  garantirBaixaPendente(anterior.statusAprovacao);
  const parcela = await tx.parcela.findUniqueOrThrow({ where: { id: anterior.parcelaId }, include: { titulo: true } });
  const baixa = await tx.baixa.update({
    where: { id: baixaId },
    data: { statusAprovacao: "APROVADO", avaliadoPorId: contexto.usuarioId, avaliadoEm: new Date() },
  });
  await recalcularEPersistirStatusParcela(anterior.parcelaId, tx);
  const conta = await tx.contaBancaria.findUniqueOrThrow({ where: { id: anterior.contaBancariaId }, select: { tipo: true } });
  const lancamento = await tx.lancamentoBancario.create({ data: { /* exatamente os campos de hoje, com contexto.filialId e contexto.usuarioId */ } });
  await registrarAuditoria({ /* igual a hoje, com contexto */ }, tx);
  return { baixa, lancamentoId: lancamento.id };
}

export async function aprovarBaixa(sessao: SessaoAtiva, baixaId: string) {
  requirePermission(sessao.perfil, "titulo:aprovar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  await buscarBaixaDaFilial(sessao.filialId, baixaId);
  const { baixa } = await prisma.$transaction((tx) => efetivarBaixa(tx, sessao, baixaId));
  return baixa;
}
```

  O bloco `lancamentoBancario.create` e a auditoria são movidos sem mudança de campos (só `sessao.` → `contexto.`). Manter o comentário da conta Caixa.
- [ ] **Step 4:** `npx vitest run src/server/services/baixa.test.ts src/server/services/contaCaixa.test.ts src/server/services/conciliacao.test.ts` PASS, testes existentes intactos.
- [ ] **Step 5:** commit `refactor(baixa): núcleo de aprovação reutilizável pela venda à vista`.

---

### Task 4: Criação do pedido, lotes para venda, lista e detalhe

**Files:**
- Create: `src/lib/schemas/pedidoVenda.ts`, `src/server/services/pedidoVenda.ts`, `src/server/services/pedidoVenda.test.ts`
- Modify: `src/server/services/estoque.ts` (`NovoMovimento.itemPedidoId?: string`)

**Interfaces:**
- Consumes: Tasks 1–3; `registrarMovimento`, `criarTituloInterno`, `obterConfiguracaoProducao`, `podeExecutar`.
- Produces (schema):
  - `itemPedidoSchema` → `{ loteId: string; quantidadeKg: number (> 0, "Informe a quantidade"); precoKg: number (> 0, "Informe o preço"); motivoLiberacaoVencido?: string }`.
  - `pedidoVendaSchema` → `PedidoVendaFormValues`: `data` (date), `clienteId` ("Selecione o cliente"), `canal?` (`CANAL_VENDA`; vazio/`SEM_VALOR` → `undefined`), `formaPagamento` (`FORMA_PAGAMENTO_VENDA`), `vencimento?` (date opcional), `contaBancariaId?` (id opcional), `retiraNaPropriedade: boolean` (`"true"`/`"on"` → true), `classificacaoFiscal?` (`FISCAL|GERENCIAL`, vazio → `undefined`), `numeroDocumentoFiscal?`, `observacao?`, `entregaDataPrevista?` (date opcional), `entregaEndereco?`, `itens` (string JSON → array via `z.preprocess`, `.min(1, "Inclua ao menos um item")`). `superRefine`: `A_PRAZO` sem vencimento → path `vencimento`, "Informe o vencimento".
  - `dadosEditaveisPedidoSchema` → `{ observacao?: string }`.
- Produces (serviço):
  - `MSG_SEM_CATEGORIA_VENDA`, `MSG_SEM_CONTA_RECEBIMENTO`, `MSG_SEM_CONTA_CAIXA` (textos das Global Constraints).
  - `criarPedido(sessao: SessaoAtiva, dados: PedidoVendaFormValues): Promise<{ pedidoId: string; numero: number; tituloId: string }>`.
  - `lotesParaVenda(filialId: string, data: Date): Promise<LoteParaVenda[]>`, `LoteParaVenda = { id; codigo; saldoKg: number; custoKg: number; validade: Date; vencido: boolean; produto: { id; codigo; descricao; unidadeComercial: string | null; fatorUnidadeKg: number | null; precoReferenciaKg: number | null } }`, ordem `validade asc, codigo asc` (FEFO).
  - `type FiltroPedidos = { inicio: Date; fim: Date; clienteId?: string; status?: StatusPedidoVenda; situacao?: SituacaoPagamento }`.
  - `listarPedidos(filialId: string, filtros: FiltroPedidos, hoje: Date): Promise<PedidoListado[]>` — `PedidoListado` = pedido + `cliente { nome }` + `entrega { status, dataPrevista } | null` + `valor`, `custo`, `margem`, `margemPercentual` (de `calcularPedido` sobre os itens) + `situacao: SituacaoPagamento`. Ordem `data desc, numero desc`.
  - `obterPedido(filialId: string, numero: number): Promise<PedidoDetalhado | null>` — pedido + `cliente` + `contaBancaria { conta, tipo, banco { nome } }` + `itens` (com `lote { codigo, validade, produto { codigo, descricao } }` e o cálculo de cada item) + `titulo { id, classificacaoFiscal, parcelas }` + `entrega` + `usuario { nome }` + totais + `situacao`.

Regras de `criarPedido` (spec §3), mensagens:

| Caso | Mensagem |
|---|---|
| cliente de outra empresa ou inativo | "Cliente não encontrado ou inativo" |
| sem categoria de venda na configuração | `MSG_SEM_CATEGORIA_VENDA` |
| à vista sem conta no pedido e sem a padrão da forma | `MSG_SEM_CONTA_CAIXA` (dinheiro) / `MSG_SEM_CONTA_RECEBIMENTO` (demais) |
| conta de outra filial ou inativa | "Conta não encontrada ou inativa" |
| dinheiro em conta que não é CAIXA | "Venda em dinheiro entra numa conta Caixa" |
| Pix/transferência/cartão em conta CAIXA | "Pix, transferência e cartão não entram na conta Caixa" |
| lote repetido | "O lote X aparece mais de uma vez no pedido" |
| lote não encontrado na filial | "Lote não encontrado" |
| lote de recepção cancelada | "O lote X é de uma recepção excluída" |
| lote vencido sem (`venda:liberarVencido` e motivo) | "O lote X venceu em dd/mm/aaaa" |
| kg acima do saldo | "Saldo insuficiente no lote X" (de `movimentarSaldo`) |

Esqueleto (a validação acima vem antes, fora da transação; checagem de repetição usa os `loteId` e, para a mensagem, o código buscado):

```ts
const vencidos = new Set<string>(); // loteIds vencidos na data, com liberação válida
const podeLiberar = podeExecutar(sessao.perfil, "venda:liberarVencido");
for (const item of dados.itens) {
  const lote = lotesPorId.get(item.loteId)!;
  if (loteVencidoNaData(lote.validade, dados.data)) {
    if (!podeLiberar || !item.motivoLiberacaoVencido) {
      throw new Error(`O lote ${lote.codigo} venceu em ${formatarData(lote.validade)}`);
    }
    vencidos.add(lote.id);
  }
}
const totais = calcularPedido(dados.itens.map((i) => ({ ...i, custoKg: Number(lotesPorId.get(i.loteId)!.custoKg) })));
const classificacao: ClassificacaoFiscal =
  dados.classificacaoFiscal ?? cliente.classificacaoFiscalPadrao ?? (dados.numeroDocumentoFiscal ? "FISCAL" : "GERENCIAL");
const numeroNota = classificacao === "FISCAL" ? (dados.numeroDocumentoFiscal ?? null) : null;

for (let tentativa = 1; ; tentativa++) {
  try {
    return await prisma.$transaction(async (tx) => {
      const { _max } = await tx.pedidoVenda.aggregate({ where: { filialId: sessao.filialId }, _max: { numero: true } });
      const numero = (_max.numero ?? 0) + 1;
      const pedido = await tx.pedidoVenda.create({ data: { /* cabeçalho; canal = dados.canal ?? cliente.canalVenda; numeroDocumentoFiscal: numeroNota; contaBancariaId: contaId (null a prazo); vencimento só A_PRAZO */ } });
      for (const item of dados.itens) {
        const lote = lotesPorId.get(item.loteId)!;
        const criado = await tx.itemPedidoVenda.create({ data: {
          pedidoId: pedido.id, loteId: lote.id, quantidadeKg: item.quantidadeKg, precoKg: item.precoKg,
          custoKg: lote.custoKg, motivoLiberacaoVencido: vencidos.has(lote.id) ? item.motivoLiberacaoVencido! : null,
        } });
        await registrarMovimento(tx, { filialId: sessao.filialId, loteId: lote.id, data: dados.data, tipo: "VENDA",
          quantidadeKg: -item.quantidadeKg, usuarioId: sessao.usuarioId, itemPedidoId: criado.id });
      }
      const titulo = await criarTituloInterno(sessao, "RECEBER", {
        contraparteId: cliente.id,
        documento: numeroNota ?? `PV-${numero}`,
        dataEmissao: dados.data,
        dataCompetencia: dados.data,
        categoriaFinanceiraId: configuracao.categoriaVendaId!,
        contaBancariaId: contaId ?? "",
        formaPagamento: ROTULOS_FORMA_PAGAMENTO_VENDA[dados.formaPagamento],
        classificacaoFiscal: classificacao,
        tipoComprovante: classificacao === "FISCAL" ? "NFE" : "RECIBO",
        numeroDocumentoFiscal: numeroNota ?? "",
        parcelas: [{ numero: 1, dataVencimento: aVista ? dados.data : dados.vencimento!, valorOriginal: totais.valor }],
      }, tx);
      let baixaAutomaticaId: string | null = null;
      if (aVista) {
        const baixa = await tx.baixa.create({ data: {
          parcelaId: titulo.parcelas[0].id, data: dados.data, valorPago: totais.valor,
          contaBancariaId: contaId!, usuarioId: sessao.usuarioId, statusAprovacao: "PENDENTE",
        } });
        await efetivarBaixa(tx, sessao, baixa.id);
        baixaAutomaticaId = baixa.id;
      }
      await tx.pedidoVenda.update({ where: { id: pedido.id }, data: { tituloId: titulo.id, baixaAutomaticaId } });
      if (!dados.retiraNaPropriedade) {
        await tx.entrega.create({ data: { pedidoId: pedido.id, dataPrevista: dados.entregaDataPrevista ?? dados.data,
          endereco: dados.entregaEndereco ?? cliente.enderecoEntrega ?? null } });
      }
      await registrarAuditoria({ /* entidade "PedidoVenda", acao "CRIAR", novo: { numero, cliente, forma, valor, itens: [{ lote, kg, precoKg, custoKg, motivoLiberacaoVencido }], tituloId, baixaAutomaticaId } */ }, tx);
      return { pedidoId: pedido.id, numero, tituloId: titulo.id };
    });
  } catch (erro) {
    const conflito = erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002";
    if (!conflito || tentativa >= TENTATIVAS_NUMERACAO) throw erro;
  }
}
```

  `aVista = dados.formaPagamento !== "A_PRAZO"`. `lotesParaVenda`: `saldoKg > 0` e `OR: [{ recepcao: { is: null } }, { recepcao: { is: { status: "ATIVA" } } }]`.

- [ ] **Step 1: Testes que falham** em `pedidoVenda.test.ts`. Setup: `criarFixtureProducao("venda")`, `criarCatalogoDeTeste`, `criarCadastrosDeVenda`; `beforeEach` → `configurarVendas`. Lotes com `criarLoteDeTeste(fx, { produtoId: cat.produtoPolpaId, localId: cat.localCamaraId, kg: 100, custoKg: 2, data: d("2026-11-01"), validade: d("2027-11-01") })`. Helper:

```ts
const pedido = (extra: Record<string, unknown> = {}, itens: unknown[] = [{ loteId: lote.id, quantidadeKg: 10, precoKg: 5 }]) =>
  pedidoVendaSchema.parse({
    data: "2026-11-10", clienteId: cad.clienteId, formaPagamento: "A_PRAZO", vencimento: "2026-12-10",
    retiraNaPropriedade: "true", itens: JSON.stringify(itens), ...extra,
  });
```

  Casos (nesta ordem; o primeiro depende da filial ainda sem pedidos):
  - `a prazo: número 1 e depois 2, estoque baixado, título a receber sem baixa` — `numero` 1 e 2; `saldoKg` 80 após os dois; um movimento `VENDA` de −10 com `itemPedidoId` por item; `item.custoKg` = 2; título `RECEBER`, `clienteId`, `documento "PV-1"`, categoria = `cad.categoriaVendaId`, 1 parcela de 50 vencendo `2026-12-10`, `GERENCIAL`/`RECIBO`; nenhuma baixa; `baixaAutomaticaId` null.
  - `dinheiro: baixa aprovada e lançamento conciliado na conta Caixa` — `formaPagamento: "DINHEIRO"`; baixa `APROVADO` na `contaCaixaId`; lançamento `ENTRADA` 50 `conciliado: true`; parcela `PAGO` com vencimento = data; `pedido.baixaAutomaticaId` preenchido.
  - `Pix: lançamento não conciliado na conta de recebimento` — conta = `contaCorrenteId`, `conciliado: false`.
  - `VENDAS cria venda à vista com baixa sem permissões de título` (Review Focus 4) — `fx.sessao("VENDAS")`, `DINHEIRO` → resolve; baixa `APROVADO`.
  - `recusas de configuração` — sem `categoriaVendaId` → `MSG_SEM_CATEGORIA_VENDA`; `PIX` sem `contaRecebimentoPadraoId` e sem conta no pedido → `MSG_SEM_CONTA_RECEBIMENTO`; `DINHEIRO` sem `contaCaixaPadraoId` → `MSG_SEM_CONTA_CAIXA`; `A_PRAZO` sem nenhuma conta configurada → resolve (a prazo não usa conta).
  - `dinheiro em conta corrente e Pix na conta Caixa são recusados`.
  - `falha no segundo item não grava nada` (Review Focus 1) — dois lotes, o segundo com 5 kg e item de 6 kg → rejects "Saldo insuficiente no lote"; contagens de `pedidoVenda`, `itemPedidoVenda`, `movimentoEstoque`, `titulo`, `baixa` da filial iguais às de antes; saldo do primeiro lote intacto.
  - `lote repetido, lote de recepção excluída e lote de outra filial são recusados` — o lote de recepção excluída: `criarRecepcao` + `cancelarRecepcao` (o saldo zera; o teste usa um movimento `AJUSTE` de entrada via `registrarMovimento` para dar saldo e provar que a regra é a recepção, não o saldo); o de outra filial: lote criado direto com `filialId: fx.filialBId` → "Lote não encontrado".
  - `lote vencido` (Review Focus 2) — lote com validade `2026-11-09`, pedido de `2026-11-10`: ADMINISTRADOR sem motivo → "O lote X venceu em 09/11/2026"; VENDAS com motivo → mesma mensagem; ADMINISTRADOR com motivo → resolve e `item.motivoLiberacaoVencido` = motivo; lote com validade `2026-11-10` → resolve sem motivo e um motivo enviado é descartado (`null`).
  - `numeração simultânea` (Review Focus 5) — `Promise.all` de dois `criarPedido` → números distintos e consecutivos.
  - `classificação` — cliente fiscal sem nota → título `FISCAL`/`NFE` sem número; cliente sem padrão com `numeroDocumentoFiscal: "123"` → `FISCAL`, `numeroDocumentoFiscal "123"`, `documento "123"`; sem nota → `GERENCIAL`/`RECIBO`; `classificacaoFiscal: "GERENCIAL"` com número digitado → número descartado.
  - `entrega` — `retiraNaPropriedade: "false"` sem data/endereço → entrega `PENDENTE`, `dataPrevista` = data, `endereco` "Rua A, 10"; com `"true"` → sem entrega.
  - `canal herdado do cliente` → `ATACADO`; informado no pedido → o informado.
  - `permissões` — CONSULTA e PRODUCAO → `PermissionError`; filial somente leitura → `FilialSomenteLeituraError`.
  - `lotesParaVenda` — FEFO; sem zerados; sem lote de recepção excluída; `vencido` relativo à data passada.
  - `listarPedidos` — filtra por período, cliente, status e situação (`PAGO` só traz o de dinheiro); totais `valor 50, custo 20, margem 30`.
  - `obterPedido` — por número; número de outra filial → `null`.
- [ ] **Step 2:** `npx vitest run src/server/services/pedidoVenda.test.ts` → FAIL.
- [ ] **Step 3:** implementar schema e serviço.
- [ ] **Step 4:** PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 5:** commit `feat(vendas): pedido de venda com baixa de estoque e conta a receber`.

---

### Task 5: Cancelamento do pedido e edição da observação

**Files:**
- Modify: `src/server/services/pedidoVenda.ts`, `src/server/services/pedidoVenda.test.ts`

**Interfaces:**
- Produces:
  - `type SituacaoCancelamentoPedido = { pode: true } | { pode: false; motivo: string }`.
  - `situacaoParaCancelar(pedido: { status: StatusPedidoVenda; tituloId: string | null; baixaAutomaticaId: string | null }, db: ClientePrisma = prisma): Promise<SituacaoCancelamentoPedido>`.
  - `cancelarPedido(sessao: SessaoAtiva, id: string, motivo: string): Promise<void>`.
  - `atualizarDadosPedido(sessao: SessaoAtiva, id: string, dados: { observacao?: string }): Promise<void>`.

```ts
export async function situacaoParaCancelar(pedido, db: ClientePrisma = prisma): Promise<SituacaoCancelamentoPedido> {
  if (pedido.status === "CANCELADO") return { pode: false, motivo: "O pedido já está cancelado" };
  if (pedido.tituloId) {
    const outras = await db.baixa.count({
      where: {
        parcela: { tituloId: pedido.tituloId },
        statusAprovacao: { in: ["PENDENTE", "APROVADO"] },
        ...(pedido.baixaAutomaticaId ? { id: { not: pedido.baixaAutomaticaId } } : {}),
      },
    });
    if (outras > 0) return { pode: false, motivo: "O financeiro registrou um recebimento neste pedido" };
  }
  if (pedido.baixaAutomaticaId) {
    const conciliadas = await db.linhaExtrato.count({ where: { lancamentoBancario: { baixaId: pedido.baixaAutomaticaId } } });
    if (conciliadas > 0) {
      return { pode: false, motivo: "O recebimento já foi conciliado com o extrato. Desconcilie na Conciliação antes de cancelar" };
    }
  }
  return { pode: true };
}
```

  `cancelarPedido`: `venda:cancelar` + filial com alteração; `motivo.trim().length < 3` → "Informe o motivo do cancelamento". Na transação: `findFirstOrThrow({ where: { id, filialId }, include: { itens: true } })`; `situacaoParaCancelar(pedido, tx)` → se não pode, `throw new Error(motivo)`; se há baixa automática: `lancamentoBancario.deleteMany({ where: { baixaId } })` e `baixa.delete`; `parcela.updateMany({ where: { tituloId }, data: { status: "CANCELADO" } })`; por item `registrarMovimento` `ESTORNO_VENDA` com `+quantidadeKg` e `itemPedidoId`; `entrega.updateMany({ where: { pedidoId: id }, data: { status: "CANCELADA" } })`; pedido `CANCELADO`, `motivoCancelamento`, `canceladoEm: new Date()`, `baixaAutomaticaId: null`; auditoria `CANCELAR` com motivo, `baixaAutomaticaId` e `lancamentosApagados`.

  `atualizarDadosPedido`: `venda:escrever` + filial com alteração; vale também para pedido cancelado; auditoria `ATUALIZAR` com a observação anterior e a nova.

- [ ] **Step 1: Testes que falham:**
  - `a prazo sem baixa: estoque volta, parcelas e entrega canceladas` — pedido sem "retira"; após cancelar: saldo de volta a 100; movimentos do item `[VENDA −10, ESTORNO_VENDA +10]`; parcelas `CANCELADO`; entrega `CANCELADA`; pedido `CANCELADO` com motivo e `canceladoEm`; `situacaoParaCancelar` depois → "O pedido já está cancelado".
  - `à vista em Pix: baixa e lançamento apagados` — contagem de `baixa` e `lancamentoBancario` com aquele `baixaId` = 0; parcela `CANCELADO`.
  - `dinheiro: lançamento conciliado sem extrato não impede` (Review Focus 3) — cancela; lançamento apagado.
  - `recusado com baixa manual do financeiro` — pedido a prazo; `registrarBaixa(fx.sessao("FINANCEIRO"), parcelaId, …)` pendente → "O financeiro registrou um recebimento neste pedido"; nada muda (saldo e status).
  - `recusado com baixa automática conciliada com extrato` — pedido Pix; criar `extratoImportado` + `linhaExtrato` (status `CONCILIADO`, `lancamentoBancarioId` = lançamento da venda) direto pelo Prisma → mensagem de conciliação.
  - `baixa rejeitada não impede` — baixa manual rejeitada com `rejeitarBaixa` → cancela.
  - `permissão e motivo` — VENDAS → `PermissionError`; FINANCEIRO com motivo "" → "Informe o motivo do cancelamento".
  - `atualizarDadosPedido muda só a observação, com auditoria, inclusive em pedido cancelado`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS; tsc limpo.
- [ ] **Step 5:** commit `feat(vendas): cancelamento do pedido com estorno de estoque e recebimento`.

---

### Task 6: Serviço de entregas

**Files:**
- Create: `src/lib/schemas/entrega.ts`, `src/server/services/entrega.ts`, `src/server/services/entrega.test.ts`

**Interfaces:**
- Produces:
  - `STATUS_ENTREGA_EDITAVEL = ["PENDENTE", "EM_ROTA", "ENTREGUE"] as const`.
  - `entregaSchema` → `DadosEntrega` (todos opcionais; o serviço completa com o valor atual): `dataPrevista?: Date`, `endereco?: string | null`, `responsavel?: string | null`, `observacao?: string | null`, `status?: (typeof STATUS_ENTREGA_EDITAVEL)[number]`, `dataRealizada?: Date`, `recebidoPor?: string | null`. Campo de texto enviado vazio vira `null` (apaga); ausente fica `undefined` (mantém).
  - `atualizarEntrega(sessao: SessaoAtiva, pedidoId: string, dados: DadosEntrega): Promise<void>` — `venda:escrever` + filial com alteração; entrega por `{ pedidoId, pedido: { filialId } }` (inexistente → "Entrega não encontrada"); `CANCELADA` → "Entrega cancelada não pode ser alterada". Status final `ENTREGUE` → `dataRealizada = dados.dataRealizada ?? atual.dataRealizada ?? hojeDeCalendario()`; outro status → `dataRealizada: null`, `recebidoPor: null`. Auditoria `Entrega` / `ATUALIZAR` com anterior e novo.
  - `type FiltroEntregas = { status?: StatusEntrega[]; inicio?: Date; fim?: Date }`.
  - `listarEntregas(filialId: string, filtros: FiltroEntregas, hoje: Date): Promise<EntregaListada[]>` — status padrão `["PENDENTE", "EM_ROTA"]`; período sobre `dataPrevista` (só se informado); inclui `pedido { numero, cliente { nome } }`; acrescenta `atraso: number | null` (`atrasoEntregaDias`); ordem `dataPrevista asc`.

- [ ] **Step 1: Testes que falham** (pedidos criados com `criarPedido`, sem "retira"):
  - `marcar ENTREGUE sem data grava hoje; com data e recebido por grava os dois`.
  - `voltar para EM_ROTA limpa data realizada e recebido por`.
  - `edita data prevista, endereço, responsável e observação; campo omitido não muda`.
  - `entrega de pedido cancelado não muda` → "Entrega cancelada não pode ser alterada".
  - `VENDAS edita; CONSULTA recebe PermissionError; entrega de outra filial → "Entrega não encontrada"`.
  - `listarEntregas` — padrão traz pendente e em rota e não traz entregue; filtro `["ENTREGUE"]`; período; atraso de pendente vencida = dias até `hoje`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS; tsc limpo.
- [ ] **Step 5:** commit `feat(vendas): entregas com status e atraso`.

---

### Task 7: Menu Vendas e lista de pedidos

**Files:**
- Modify: `src/app/(dashboard)/nav-items.ts`, `src/app/(dashboard)/nav-items.test.ts`
- Create: `src/app/(dashboard)/vendas/pedidos/{page.tsx,filtros.ts,export/route.ts}`

**Interfaces:**
- Consumes: Tasks 2, 4.
- Produces: seção `{ titulo: "Vendas", itens: [Pedidos `/vendas/pedidos`, Entregas `/vendas/entregas`] }`, ambos `acao: "venda:ler"`, logo depois de "Produção".
- Produces: `filtrosDePedidos(sp: Record<string, string | undefined>): FiltroPedidos` em `filtros.ts` (período por `periodoDaUrl`, `cliente`, `status` validado contra `STATUS_PEDIDO_VENDA`, `situacao` contra as chaves de `ROTULOS_SITUACAO_PAGAMENTO`) — usada pela página e pelo export.

- [ ] **Step 1: Teste que falha** em `nav-items.test.ts`: VENDAS, PRODUCAO e CONSULTA veem a seção "Vendas" com os 2 itens.
- [ ] **Step 2:** FAIL. **Step 3:** item de menu; PASS.
- [ ] **Step 4: Página** `/vendas/pedidos` (`venda:ler`):
  - `BarraDeFiltros` com De, Até, Cliente (clientes da empresa), Status, Situação; `ExportarLinks baseHref="/vendas/pedidos/export"` com a mesma query.
  - Colunas: Nº (link para `/vendas/pedidos/<numero>`), Data, Cliente, Canal (`ROTULOS_CANAL_VENDA`), Forma, Valor, Margem (R$ e %), Situação (badge: Pago `default`, Em aberto `secondary`, Vencido `destructive`, Cancelado `outline`), Status (badge "Cancelado" `destructive` quando cancelado), Entrega ("Retira" quando sem entrega; senão o rótulo do status).
  - Botão **Novo pedido** (`Link` para `/vendas/pedidos/novo`) só com `venda:escrever` + `sessao.podeAlterarFilial`.
  - Linha de totais (valor, custo, margem) no rodapé, só dos pedidos confirmados.
  - Tabela dentro de `div.overflow-x-auto`.
- [ ] **Step 5: Export:** Nº (`inteiro`) · Data · Cliente · Canal · Forma · Valor · Custo · Margem · Margem (%) `percentual` · Situação · Status · Entrega · Nota fiscal. `venda:ler` (403 sem). PDF com `cabecalhoDoRelatorio`, filtros de período, cliente, status e situação.
- [ ] **Step 6:** `npx tsc --noEmit` limpo.
- [ ] **Step 7:** commit `feat(vendas): menu de vendas e lista de pedidos`.

---

### Task 8: Novo pedido

**Files:**
- Create: `src/app/(dashboard)/vendas/pedidos/novo/{page.tsx,pedido-form.tsx}`, `src/app/(dashboard)/vendas/pedidos/actions.ts`

**Interfaces:**
- Consumes: Tasks 2, 4.
- Produces: `criarPedidoAction(prev: FormState, formData: FormData): Promise<FormState>` — parse com `pedidoVendaSchema`; erro → `{ erro }`; sucesso → `revalidatePath` de `/vendas/pedidos`, `/vendas/entregas`, `/producao/estoque` e `redirect(`/vendas/pedidos/${numero}`)` **fora** do `try`.
- Produces: `type OpcoesPedido = { hoje: string; clientes: { id; nome; canalVenda; classificacaoFiscalPadrao; enderecoEntrega; retiraNaPropriedade }[]; contas: { id; rotulo; tipo }[]; lotes: LoteParaVenda[] (validade como string ISO); contaCaixaPadraoId: string | null; contaRecebimentoPadraoId: string | null; podeLiberarVencido: boolean }`.

- [ ] **Step 1: Página** (server): `venda:escrever` + filial com alteração (senão `requirePermission` lança / mensagem "Você não tem permissão de alteração nesta filial"); carrega `OpcoesPedido` com `lotesParaVenda(filialId, hojeDeCalendario())` e clientes ativos da empresa. Se a configuração não tiver categoria de venda, mostrar aviso com a mensagem e link para `/configuracao-producao` (o formulário continua visível; o servidor recusa).
- [ ] **Step 2: Formulário** (client, `useActionState`), página inteira, uma coluna no celular e duas em `sm:`:
  - Cabeçalho: Data (hoje); Cliente (Select controlado; ao escolher, preenche canal, classificação, "retira" e endereço); Canal (Select controlado, "Não informado"); Forma de pagamento (Select controlado); Conta (só à vista; contas filtradas: CAIXA para dinheiro, não CAIXA para as demais; pré-seleciona a padrão da forma ao trocar a forma); Vencimento (só a prazo); Classificação (Fiscal/Gerencial, controlado) e Nº da nota (só Fiscal); "Retira na propriedade" (checkbox); Data prevista e Endereço da entrega (só sem "retira"); Observação.
  - Itens (estado `ItemForm[]`, começa com uma linha vazia; botão "Adicionar item"; remover linha): Lote (Select controlado; rótulo `"AGC-261101-01 · Polpa de açaí grosso · 100 kg · vence 01/11/2027"`, com " · VENCIDO" quando `validade < data` do cabeçalho; lotes já escolhidos em outra linha ficam fora da lista), Unidade (kg ou a unidade comercial do produto, só se o produto tiver fator), Quantidade (convertida com `paraKg`; mostra o equivalente em kg ao lado), Preço/kg (sugestão `precoReferenciaKg` ao escolher o lote), Motivo da liberação (só se o lote estiver vencido na data e `podeLiberarVencido`; se vencido e não pode, texto "Lote vencido: só gestor ou administrador libera" em vermelho). Aviso em vermelho quando kg > saldo do lote.
  - Cada linha mostra Valor, Custo e Margem (`calcularItem`, custo do lote); rodapé com totais e margem % (`calcularPedido`).
  - Os itens vão num `<input type="hidden" name="itens" value={JSON.stringify(itens em kg)} />`; `retiraNaPropriedade` em hidden `"true"/"false"`.
  - Erro do servidor acima do botão **Salvar pedido** (desabilitado enquanto pendente).
  - Selects controlados como na recepção (`value={x || null}`, `onValueChange={(v) => set(v ?? "")}`), com `name` para postar.
- [ ] **Step 3:** `npx tsc --noEmit` limpo.
- [ ] **Step 4:** commit `feat(vendas): tela de novo pedido`.

---

### Task 9: Detalhe do pedido e recibo em PDF

**Files:**
- Create: `src/lib/export/recibo.ts`, `src/lib/export/recibo.test.ts`
- Create: `src/app/(dashboard)/vendas/pedidos/[numero]/{page.tsx,pedido-acoes.tsx,recibo/route.ts}`
- Create: `src/app/(dashboard)/vendas/_shared/entrega-acoes.tsx`, `src/app/(dashboard)/vendas/entregas/actions.ts`
- Modify: `src/app/(dashboard)/vendas/pedidos/actions.ts`

**Interfaces:**
- Produces:
  - `type DadosRecibo = { empresa: string; documentoEmpresa: string | null; numero: number; data: Date; cliente: string; documentoCliente: string | null; itens: { produto: string; lote: string; quantidadeKg: number; precoKg: number; valor: number }[]; total: number; formaPagamento: string; situacao: string; cancelado: boolean; observacao: string | null }`.
  - `gerarReciboPdf(dados: DadosRecibo): Promise<Uint8Array>` — A4 (595,28 × 841,89 pt), Helvetica, `criarSanitizador`; nova página quando a tabela de itens passa da margem inferior; "CANCELADO" grande em vermelho abaixo do cabeçalho quando `cancelado`.
  - Actions: `cancelarPedidoAction`, `editarObservacaoAction` (em `pedidos/actions.ts`); `atualizarEntregaAction(prev, formData)` em `entregas/actions.ts` (lê `pedidoId` e os campos presentes no form; revalida `/vendas/entregas` e `/vendas/pedidos/[numero]` via `revalidatePath("/vendas", "layout")`).
  - `EntregaAcoes({ entrega: { pedidoId; status; dataPrevista: string; endereco; responsavel; observacao; recebidoPor }, podeEscrever })` — botões "Em rota" (form com `status=EM_ROTA`), "Entregue" (diálogo com data realizada, padrão hoje, e recebido por) e "Editar" (diálogo com data prevista, endereço, responsável, observação); nada quando `CANCELADA` ou sem permissão.

- [ ] **Step 1: Testes que falham** em `recibo.test.ts`: PDF relido com `PDFDocument.load` tem 1 página de ≈ 595,28 × 841,89; com 80 itens tem mais de 1 página; cliente "Açaí & Cia – Ltda" e `cancelado: true` não lançam.
- [ ] **Step 2:** FAIL. **Step 3:** implementar `gerarReciboPdf`. **Step 4:** PASS.
- [ ] **Step 5: Página de detalhe** (`venda:ler`; `numero` inválido ou `obterPedido` null → `notFound()`):
  - Cabeçalho: nº, data, cliente, canal, forma, conta (à vista), vencimento (a prazo), nota fiscal, usuário, status (e motivo/data do cancelamento).
  - Itens: produto, lote, kg, preço/kg, valor, custo, margem; totais e margem %; motivo da liberação de vencido quando houver.
  - Pagamento: situação (badge) e link "Ver em Contas a receber" → `/financeiro/contas-a-receber?contraparte=<clienteId>` (só se o perfil tiver `titulo:ler`).
  - Entrega (se houver): status, datas, endereço, responsável, recebido por, atraso; `EntregaAcoes`.
  - Observação editável (textarea + Salvar) com `venda:escrever` + filial com alteração.
  - Botões: **Recibo (PDF)** (link `target="_blank"` para `./recibo`) e **Cancelar** (`venda:cancelar` + filial com alteração; diálogo com motivo obrigatório; desabilitado com `title` = motivo de `situacaoParaCancelar` quando não pode).
- [ ] **Step 6: Rota do recibo:** `venda:ler` (403); pedido da filial ativa por número (404); `Content-Disposition: inline; filename="recibo-pedido-<numero>.pdf"`, `Cache-Control: no-store`.
- [ ] **Step 7:** `npx tsc --noEmit` limpo.
- [ ] **Step 8:** commit `feat(vendas): detalhe do pedido, cancelamento e recibo em PDF`.

---

### Task 10: Tela de entregas

**Files:**
- Create: `src/app/(dashboard)/vendas/entregas/{page.tsx,filtros.ts,export/route.ts}`

**Interfaces:**
- Consumes: Tasks 6, 9 (`EntregaAcoes`, `atualizarEntregaAction`).
- Produces: `filtrosDeEntregas(sp): FiltroEntregas` — `status` vazio → padrão (pendente + em rota); `TODAS` → os quatro; um dos `STATUS_ENTREGA` → só ele; `inicio`/`fim` só se presentes na URL (sem padrão de mês).

- [ ] **Step 1: Página** (`venda:ler`): `BarraDeFiltros` com Status (`rotuloTodos: "Pendentes e em rota"`, opções: cada status + `TODAS` "Todas"), De, Até. Colunas: Data prevista, Pedido (link), Cliente, Endereço, Responsável, Status, Atraso (dias; `text-destructive font-medium` quando > 0; "—" quando null), Ações (`EntregaAcoes`, com `venda:escrever` + filial com alteração). `ExportarLinks`.
- [ ] **Step 2: Export:** Data prevista · Pedido (`inteiro`) · Cliente · Endereço · Responsável · Status · Data realizada · Recebido por · Atraso (dias) (`inteiro`). `venda:ler` (403). PDF com filtros.
- [ ] **Step 3:** `npx tsc --noEmit` limpo.
- [ ] **Step 4:** commit `feat(vendas): tela de entregas`.

---

### Task 11: Ajuda, verificação e docs

- [ ] **Step 1:** `content/ajuda/passo-a-passo.md`, seção nova "Vendas":
  - configurar categoria de venda, conta de recebimento e conta Caixa;
  - novo pedido (cliente preenche canal/retira, à vista × a prazo, lote FEFO, quantidade em kg ou na unidade, margem);
  - lote vencido (bloqueio e liberação com motivo);
  - o que acontece no financeiro (conta a receber; à vista já recebida; dinheiro no Caixa);
  - cancelar (motivo, estorno, quando é recusado e o que fazer);
  - entregas (status, atraso) e recibo.
  - Glossário: Margem, Retira na propriedade.
- [ ] **Step 2:** `npm test`, `npm run lint`, `npm run build` limpos.
- [ ] **Step 3: Navegador** (reiniciar o dev após o generate; login admin → Empresa Demonstração → Matriz):
  - configurar categoria de venda, conta de recebimento e conta Caixa (criar conta Caixa se não houver);
  - recepção de um lote para ter saldo;
  - pedido a prazo com entrega; conferir em Contas a receber e no estoque;
  - pedido em dinheiro; conferir parcela paga e lançamento no Caixa;
  - lote vencido: bloqueado e liberado pelo admin com motivo;
  - cancelar o pedido em dinheiro e o a prazo; conferir estoque e financeiro;
  - entregas: em rota, entregue, editar; atraso;
  - recibo abre (também de pedido cancelado);
  - export CSV/Excel/PDF de pedidos e entregas;
  - 390 px no novo pedido e no detalhe, sem rolagem horizontal da página;
  - usuário VENDAS temporário cria pedido à vista, não cancela, não libera vencido; remover depois;
  - apagar do banco de dev os dados criados no teste e a pasta `.playwright-mcp`.
- [ ] **Step 4:** `docs/fases/fase-7-producao-estoque-vendas.md` (7c concluída) e spec com `Status: implementada`. Commit `docs(vendas): Fase 7c concluída`.
