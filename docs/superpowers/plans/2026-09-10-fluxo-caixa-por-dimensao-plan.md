# Fluxo de caixa por dimensão (Fase 5, sub-projeto 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o furo de dados em que `LancamentoBancario` nunca carrega centro de custo/lucro/safra/projeto, e entregar um relatório de fluxo de caixa (realizado + projetado) quebrado por centro de custo, centro de lucro ou safra.

**Architecture:** Migração aditiva adiciona 4 colunas opcionais em `LancamentoBancario`. Três caminhos de escrita existentes (lançamento manual, lançamento criado na conciliação, baixa aprovada) passam a gravar essas colunas — os dois primeiros ganham seletores novos na UI, o terceiro copia do título automaticamente. Um novo serviço de leitura (`fluxoDeCaixaPorDimensao.ts`) lê o campo direto quando presente e cai para `lancamento.baixa.parcela.titulo.<dimensão>` como fallback pra dado histórico anterior a esta correção — mesmo padrão já usado no Orçamento (Fase 5, sub-projeto 1) pra categoria financeira.

**Tech Stack:** Next.js 16 App Router (server components + Server Actions), Prisma 7 (migração obrigatória), TypeScript, Zod, Vitest (Postgres real nos testes de integração).

**Spec:** `docs/superpowers/specs/2026-09-10-fluxo-caixa-por-dimensao-design.md`

## Global Constraints

- Migração puramente aditiva: 4 colunas opcionais (`centroCustoId`, `centroLucroId`, `safraId`, `projetoId`) em `LancamentoBancario`, 4 novas FKs, sem `ALTER`/`DROP` de coluna existente.
- Nenhuma das 4 dimensões é obrigatória em `Titulo` nem nos formulários de lançamento — tudo opcional, mesmo padrão de `categoriaFinanceiraId`.
- Todo id de dimensão informado num formulário deve ser validado contra a filial ativa antes de persistir (mesmo padrão de `validarReferenciasDoTitulo` em `titulo.ts`) — nunca confiar só na FK do banco.
- `realizado` e `projetado` são sempre magnitudes positivas — sem inversão de sinal por `ENTRADA`/`SAIDA` ou `RECEBER`/`PAGAR`.
- Leitura por dimensão usa campo direto primeiro, fallback via `lancamento.baixa?.parcela.titulo.<dimensão>` depois — nunca só um dos dois.
- A linha "Não classificado" (`dimensaoId: null`) **sempre aparece** no relatório, mesmo com todos os valores zerados — nunca omitida condicionalmente.
- Centro de custo é hierárquico — **sem rollup**: cada centro de custo ativo é sua própria linha, filho não soma no pai.
- Relatório cobre só 3 dimensões (`CENTRO_CUSTO`, `CENTRO_LUCRO`, `SAFRA`) — Projeto ganha a captura de dado nesta entrega, mas não tem tela de relatório.
- Nenhuma permissão nova — leitura reaproveita `titulo:ler` (já concedida aos 6 perfis); escrita nas telas de lançamento manual/conciliação continua atrás de `lancamento:escrever`/`conciliacao:escrever`, já existentes.
- Sem migração de backfill de dado histórico — resolvido por fallback na leitura.

---

### Task 1: Migração + captura de dimensão no lançamento manual

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/schemas/lancamentoBancario.ts`
- Modify: `src/server/services/lancamentoBancario.ts`
- Modify: `src/server/services/lancamentoBancario.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 2-3, 7): as colunas `centroCustoId`/`centroLucroId`/`safraId`/`projetoId` no model `LancamentoBancario` (via migração), e as relações inversas `lancamentosBancarios LancamentoBancario[]` em `CentroCusto`/`CentroLucro`/`Safra`/`Projeto`.

- [ ] **Step 1: Adicionar as 4 colunas e relações ao schema**

Em `prisma/schema.prisma`, no `model LancamentoBancario`, logo após a linha
`categoriaFinanceiraId String?`:

```prisma
  centroCustoId         String?
  centroLucroId         String?
  safraId               String?
  projetoId             String?
```

E logo após a linha `categoriaFinanceira CategoriaFinanceira? @relation(fields: [categoriaFinanceiraId], references: [id])`:

```prisma
  centroCusto         CentroCusto?         @relation(fields: [centroCustoId], references: [id])
  centroLucro         CentroLucro?         @relation(fields: [centroLucroId], references: [id])
  safra               Safra?               @relation(fields: [safraId], references: [id])
  projeto             Projeto?             @relation(fields: [projetoId], references: [id])
```

No `model CentroCusto`, logo após a linha `titulos Titulo[]`, adicionar:

```prisma
  lancamentosBancarios LancamentoBancario[]
```

No `model CentroLucro`, mesma coisa, logo após `titulos Titulo[]`:

```prisma
  lancamentosBancarios LancamentoBancario[]
```

No `model Safra`, mesma coisa, logo após `titulos Titulo[]`:

```prisma
  lancamentosBancarios LancamentoBancario[]
```

No `model Projeto`, mesma coisa, logo após `titulos Titulo[]`:

```prisma
  lancamentosBancarios LancamentoBancario[]
```

- [ ] **Step 2: Rodar a migração**

Run: `npx prisma migrate dev --name add_dimensoes_lancamento_bancario`
Expected: migração aplica limpo (puramente aditiva — 4 colunas novas, 4 FKs
novas em tabelas já existentes, sem `ALTER`/`DROP` de coluna existente). Se
pedir confirmação de mudança destrutiva, PARE, não confirme, reporte
BLOCKED com o texto exato do prompt.

- [ ] **Step 3: Escrever os testes que falham**

Leia `src/server/services/lancamentoBancario.test.ts` primeiro — ele já usa
`criarFixtureFinanceiro`/`limparFixtureFinanceiro` e `fixtureTesouraria`.
Adicione este `describe` ao final do arquivo:

```ts
describe("dimensões analíticas em criarLancamentoManual", () => {
  let fixture: FixtureFinanceiro;
  let centroCustoId: string;
  let centroLucroId: string;
  let safraId: string;
  let projetoId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("LBD", "TESOURARIA");

    const centroCusto = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Administrativo", codigo: "ADM" },
    });
    centroCustoId = centroCusto.id;

    const centroLucro = await prisma.centroLucro.create({
      data: { filialId: fixture.filialId, nome: "Unidade 1", codigo: "U1" },
    });
    centroLucroId = centroLucro.id;

    const safra = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra 2026",
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2026-12-31"),
      },
    });
    safraId = safra.id;

    const projeto = await prisma.projeto.create({
      data: { filialId: fixture.filialId, nome: "Expansão", codigo: "EXP" },
    });
    projetoId = projeto.id;
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("grava as 4 dimensões quando informadas", async () => {
    const lancamento = await criarLancamentoManual(fixture.sessao, {
      contaBancariaId: fixture.contaBancariaId,
      data: new Date(),
      tipo: "SAIDA",
      valor: 80,
      descricao: "Compra de insumo",
      categoriaFinanceiraId: "__nenhum__",
      centroCustoId,
      centroLucroId,
      safraId,
      projetoId,
    });

    expect(lancamento.centroCustoId).toBe(centroCustoId);
    expect(lancamento.centroLucroId).toBe(centroLucroId);
    expect(lancamento.safraId).toBe(safraId);
    expect(lancamento.projetoId).toBe(projetoId);
  });

  test("aceita omitir as 4 dimensões (todas opcionais)", async () => {
    const lancamento = await criarLancamentoManual(fixture.sessao, {
      contaBancariaId: fixture.contaBancariaId,
      data: new Date(),
      tipo: "SAIDA",
      valor: 20,
      descricao: "Sem dimensão",
      categoriaFinanceiraId: "__nenhum__",
    });

    expect(lancamento.centroCustoId).toBeNull();
    expect(lancamento.centroLucroId).toBeNull();
    expect(lancamento.safraId).toBeNull();
    expect(lancamento.projetoId).toBeNull();
  });

  test("recusa centro de custo que não pertence à filial ativa", async () => {
    const outraFixture = await criarFixtureFinanceiro("LBD2", "TESOURARIA");
    try {
      const centroCustoDeOutraFilial = await prisma.centroCusto.create({
        data: { filialId: outraFixture.filialId, nome: "De outra filial", codigo: "OUT" },
      });

      await expect(
        criarLancamentoManual(fixture.sessao, {
          contaBancariaId: fixture.contaBancariaId,
          data: new Date(),
          tipo: "SAIDA",
          valor: 10,
          descricao: "Cross-tenant",
          categoriaFinanceiraId: "__nenhum__",
          centroCustoId: centroCustoDeOutraFilial.id,
        }),
      ).rejects.toThrow(/não pertence à filial ativa/);
    } finally {
      await limparFixtureFinanceiro(outraFixture);
    }
  });
});
```

- [ ] **Step 4: Rodar pra confirmar que falha**

Run: `npx vitest run src/server/services/lancamentoBancario.test.ts`
Expected: FALHA — `lancamentoManualSchema`/`criarLancamentoManual` ainda não
aceitam `centroCustoId`/`centroLucroId`/`safraId`/`projetoId`.

- [ ] **Step 5: Estender o schema Zod**

Em `src/lib/schemas/lancamentoBancario.ts`, o `lancamentoManualSchema`
atual é:

```ts
export const lancamentoManualSchema = z.object({
  contaBancariaId: z.string().trim().min(1, "Selecione a conta bancária"),
  data: z.coerce.date(),
  tipo: z.enum(TIPO_LANCAMENTO),
  valor: z.coerce.number().positive("Informe um valor maior que zero"),
  descricao: z.string().trim().min(2, "Informe uma descrição"),
  categoriaFinanceiraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
});
```

Troque por (adiciona os 4 campos novos, mesmo formato de `categoriaFinanceiraId`):

```ts
export const lancamentoManualSchema = z.object({
  contaBancariaId: z.string().trim().min(1, "Selecione a conta bancária"),
  data: z.coerce.date(),
  tipo: z.enum(TIPO_LANCAMENTO),
  valor: z.coerce.number().positive("Informe um valor maior que zero"),
  descricao: z.string().trim().min(2, "Informe uma descrição"),
  categoriaFinanceiraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  centroCustoId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  centroLucroId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  safraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  projetoId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
});
```

- [ ] **Step 6: Adicionar a validação de filial e usar no serviço**

Em `src/server/services/lancamentoBancario.ts`, logo após a função
`buscarContaDaFilial`, adicione (mesmo padrão de
`validarReferenciasDoTitulo` em `titulo.ts`):

```ts
async function validarDimensoesDaFilial(
  filialId: string,
  dimensoes: {
    centroCustoId: string | null;
    centroLucroId: string | null;
    safraId: string | null;
    projetoId: string | null;
  },
): Promise<void> {
  const referencias: [string, string | null, () => Promise<unknown>][] = [
    ["Centro de custo", dimensoes.centroCustoId, () =>
      prisma.centroCusto.findFirst({ where: { id: dimensoes.centroCustoId ?? "", filialId } }),
    ],
    ["Centro de lucro", dimensoes.centroLucroId, () =>
      prisma.centroLucro.findFirst({ where: { id: dimensoes.centroLucroId ?? "", filialId } }),
    ],
    ["Safra", dimensoes.safraId, () =>
      prisma.safra.findFirst({ where: { id: dimensoes.safraId ?? "", filialId } }),
    ],
    ["Projeto", dimensoes.projetoId, () =>
      prisma.projeto.findFirst({ where: { id: dimensoes.projetoId ?? "", filialId } }),
    ],
  ];

  for (const [rotulo, valor, buscar] of referencias) {
    if (valor === null) continue;
    if (!(await buscar())) {
      throw new Error(`${rotulo} não pertence à filial ativa`);
    }
  }
}
```

Então altere `criarLancamentoManual` (a função inteira, de:)

```ts
export async function criarLancamentoManual(sessao: SessaoAtiva, dados: LancamentoManualFormValues) {
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await buscarContaDaFilial(sessao.filialId, dados.contaBancariaId);

  const dadosNormalizados = {
    filialId: sessao.filialId,
    contaBancariaId: dados.contaBancariaId,
    data: dados.data,
    tipo: dados.tipo,
    valor: dados.valor,
    descricao: dados.descricao,
    origem: "MANUAL" as const,
    categoriaFinanceiraId: normalizarOpcional(dados.categoriaFinanceiraId),
    usuarioId: sessao.usuarioId,
  };

  const lancamento = await prisma.lancamentoBancario.create({ data: dadosNormalizados });
```

para:

```ts
export async function criarLancamentoManual(sessao: SessaoAtiva, dados: LancamentoManualFormValues) {
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await buscarContaDaFilial(sessao.filialId, dados.contaBancariaId);

  const centroCustoId = normalizarOpcional(dados.centroCustoId);
  const centroLucroId = normalizarOpcional(dados.centroLucroId);
  const safraId = normalizarOpcional(dados.safraId);
  const projetoId = normalizarOpcional(dados.projetoId);
  await validarDimensoesDaFilial(sessao.filialId, { centroCustoId, centroLucroId, safraId, projetoId });

  const dadosNormalizados = {
    filialId: sessao.filialId,
    contaBancariaId: dados.contaBancariaId,
    data: dados.data,
    tipo: dados.tipo,
    valor: dados.valor,
    descricao: dados.descricao,
    origem: "MANUAL" as const,
    categoriaFinanceiraId: normalizarOpcional(dados.categoriaFinanceiraId),
    centroCustoId,
    centroLucroId,
    safraId,
    projetoId,
    usuarioId: sessao.usuarioId,
  };

  const lancamento = await prisma.lancamentoBancario.create({ data: dadosNormalizados });
```

(O resto da função — `registrarAuditoria` e `return lancamento` — não muda.)

- [ ] **Step 7: Rodar pra confirmar que passa**

Run: `npx vitest run src/server/services/lancamentoBancario.test.ts`
Expected: PASSA (testes antigos + os 3 novos).

- [ ] **Step 8: `tsc` e suíte completa**

Run: `npx tsc --noEmit && npm run test`
Expected: ambos limpos.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/schemas/lancamentoBancario.ts src/server/services/lancamentoBancario.ts src/server/services/lancamentoBancario.test.ts
git commit -m "feat: adicionar dimensoes analiticas em LancamentoBancario e captura no lancamento manual"
```

---

### Task 2: Captura de dimensão no lançamento criado via conciliação

**Files:**
- Modify: `src/lib/schemas/conciliacao.ts`
- Modify: `src/server/services/conciliacao.ts`
- Modify: `src/server/services/conciliacao.test.ts`

**Interfaces:**
- Consumes: as 4 colunas de `LancamentoBancario` e a migração (Task 1) — já aplicadas.
- Produces: `criarLancamentoDaLinha` aceita `centroCustoId`/`centroLucroId`/`safraId`/`projetoId` (todos `string | null`) no parâmetro `dados`.

- [ ] **Step 1: Escrever os testes que falham**

Leia `src/server/services/conciliacao.test.ts` primeiro — o `describe("criarLancamentoDaLinha", ...)` já existe perto do final do arquivo, usando `fixture` (perfil TESOURARIA), `importarExtratoOfx`, `arquivoOfx`, `OFX_DUAS_TRANSACOES`. Adicione este teste dentro desse `describe`, após o teste "cria o lançamento e já concilia a linha atomicamente":

```ts
  test("grava as 4 dimensões quando informadas", async () => {
    const centroCusto = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Operacional", codigo: "OPE" },
    });
    const centroLucro = await prisma.centroLucro.create({
      data: { filialId: fixture.filialId, nome: "Unidade 2", codigo: "U2" },
    });
    const safra = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra Conciliação",
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2026-12-31"),
      },
    });
    const projeto = await prisma.projeto.create({
      data: { filialId: fixture.filialId, nome: "Projeto Conciliação", codigo: "PJC" },
    });

    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("CRIA-DIM-1", "CRIA-DIM-2")),
    );
    const linha = await prisma.linhaExtrato.findFirstOrThrow({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "CRIA-DIM-1" },
    });

    const lancamento = await criarLancamentoDaLinha(fixture.sessao, linha.id, {
      descricao: "Tarifa com dimensões",
      categoriaFinanceiraId: null,
      centroCustoId: centroCusto.id,
      centroLucroId: centroLucro.id,
      safraId: safra.id,
      projetoId: projeto.id,
    });

    expect(lancamento.centroCustoId).toBe(centroCusto.id);
    expect(lancamento.centroLucroId).toBe(centroLucro.id);
    expect(lancamento.safraId).toBe(safra.id);
    expect(lancamento.projetoId).toBe(projeto.id);
  });
```

- [ ] **Step 2: Rodar pra confirmar que falha**

Run: `npx vitest run src/server/services/conciliacao.test.ts`
Expected: FALHA — erro de tipo/runtime, `criarLancamentoDaLinha` ainda não
aceita esses 4 campos.

- [ ] **Step 3: Estender o schema Zod**

Em `src/lib/schemas/conciliacao.ts`, o `lancamentoDaLinhaSchema` atual é:

```ts
export const lancamentoDaLinhaSchema = z.object({
  linhaExtratoId: z.string().trim().min(1),
  descricao: z.string().trim().min(2, "Informe uma descrição"),
  categoriaFinanceiraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
});
```

Troque por:

```ts
export const lancamentoDaLinhaSchema = z.object({
  linhaExtratoId: z.string().trim().min(1),
  descricao: z.string().trim().min(2, "Informe uma descrição"),
  categoriaFinanceiraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  centroCustoId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  centroLucroId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  safraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  projetoId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
});
```

- [ ] **Step 4: Estender o serviço**

Em `src/server/services/conciliacao.ts`, importe a validação de filial —
adicione ao topo do arquivo, junto aos outros imports:

```ts
import { prisma } from "@/server/db/client";
```

(se já não estiver importado sob esse nome — confira antes de duplicar).

Adicione esta função auxiliar em algum ponto do arquivo antes de
`criarLancamentoDaLinha` (mesmo corpo de `validarDimensoesDaFilial` da
Task 1 — repetido aqui porque `conciliacao.ts` e `lancamentoBancario.ts`
não compartilham um módulo de validação hoje; extrair um helper comum é
uma limpeza futura fora do escopo desta entrega):

```ts
async function validarDimensoesDaFilial(
  filialId: string,
  dimensoes: {
    centroCustoId: string | null;
    centroLucroId: string | null;
    safraId: string | null;
    projetoId: string | null;
  },
): Promise<void> {
  const referencias: [string, string | null, () => Promise<unknown>][] = [
    ["Centro de custo", dimensoes.centroCustoId, () =>
      prisma.centroCusto.findFirst({ where: { id: dimensoes.centroCustoId ?? "", filialId } }),
    ],
    ["Centro de lucro", dimensoes.centroLucroId, () =>
      prisma.centroLucro.findFirst({ where: { id: dimensoes.centroLucroId ?? "", filialId } }),
    ],
    ["Safra", dimensoes.safraId, () =>
      prisma.safra.findFirst({ where: { id: dimensoes.safraId ?? "", filialId } }),
    ],
    ["Projeto", dimensoes.projetoId, () =>
      prisma.projeto.findFirst({ where: { id: dimensoes.projetoId ?? "", filialId } }),
    ],
  ];

  for (const [rotulo, valor, buscar] of referencias) {
    if (valor === null) continue;
    if (!(await buscar())) {
      throw new Error(`${rotulo} não pertence à filial ativa`);
    }
  }
}
```

Troque a assinatura e o corpo de `criarLancamentoDaLinha`, de:

```ts
export async function criarLancamentoDaLinha(
  sessao: SessaoAtiva,
  linhaExtratoId: string,
  dados: { descricao: string; categoriaFinanceiraId: string | null },
) {
  requirePermission(sessao.perfil, "conciliacao:escrever");
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const linha = await prisma.linhaExtrato.findFirst({
    where: { id: linhaExtratoId, contaBancaria: { filialId: sessao.filialId } },
  });
  if (!linha) {
    throw new Error("Linha de extrato não pertence à filial ativa");
  }
  if (linha.lancamentoBancarioId) {
    throw new Error("Esta linha já está conciliada");
  }

  const lancamento = await prisma.$transaction(async (tx) => {
    const criado = await tx.lancamentoBancario.create({
      data: {
        filialId: sessao.filialId,
        contaBancariaId: linha.contaBancariaId,
        data: linha.data,
        tipo: linha.tipo,
        valor: linha.valor,
        descricao: dados.descricao,
        origem: "MANUAL",
        categoriaFinanceiraId: dados.categoriaFinanceiraId,
        usuarioId: sessao.usuarioId,
        conciliado: true,
      },
    });
```

para:

```ts
export async function criarLancamentoDaLinha(
  sessao: SessaoAtiva,
  linhaExtratoId: string,
  dados: {
    descricao: string;
    categoriaFinanceiraId: string | null;
    centroCustoId: string | null;
    centroLucroId: string | null;
    safraId: string | null;
    projetoId: string | null;
  },
) {
  requirePermission(sessao.perfil, "conciliacao:escrever");
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const linha = await prisma.linhaExtrato.findFirst({
    where: { id: linhaExtratoId, contaBancaria: { filialId: sessao.filialId } },
  });
  if (!linha) {
    throw new Error("Linha de extrato não pertence à filial ativa");
  }
  if (linha.lancamentoBancarioId) {
    throw new Error("Esta linha já está conciliada");
  }

  await validarDimensoesDaFilial(sessao.filialId, {
    centroCustoId: dados.centroCustoId,
    centroLucroId: dados.centroLucroId,
    safraId: dados.safraId,
    projetoId: dados.projetoId,
  });

  const lancamento = await prisma.$transaction(async (tx) => {
    const criado = await tx.lancamentoBancario.create({
      data: {
        filialId: sessao.filialId,
        contaBancariaId: linha.contaBancariaId,
        data: linha.data,
        tipo: linha.tipo,
        valor: linha.valor,
        descricao: dados.descricao,
        origem: "MANUAL",
        categoriaFinanceiraId: dados.categoriaFinanceiraId,
        centroCustoId: dados.centroCustoId,
        centroLucroId: dados.centroLucroId,
        safraId: dados.safraId,
        projetoId: dados.projetoId,
        usuarioId: sessao.usuarioId,
        conciliado: true,
      },
    });
```

(O resto da função — `tx.linhaExtrato.update`, `return criado`, o
`registrarAuditoria` fora da transação — não muda.)

Todo teste já existente que chama `criarLancamentoDaLinha` com um objeto
`{ descricao, categoriaFinanceiraId }` sem os 4 campos novos vai continuar
compilando, porque em TypeScript um objeto literal só é checado
estruturalmente contra o tipo esperado nos call sites — como este é um
parâmetro de função (não uma variável com tipo explícito), campos que o
tipo declara como `string | null` mas o literal omite causam erro de
tipo. **Portanto**, atualize também as duas chamadas já existentes no
arquivo de teste (`"cria o lançamento e já concilia..."` e `"perfil sem
lancamento:escrever..."`) pra incluir os 4 campos como `null`:

```ts
    const lancamento = await criarLancamentoDaLinha(fixture.sessao, linha.id, {
      descricao: "Tarifa bancária (criada via conciliação)",
      categoriaFinanceiraId: null,
      centroCustoId: null,
      centroLucroId: null,
      safraId: null,
      projetoId: null,
    });
```

e:

```ts
      await expect(
        criarLancamentoDaLinha(fixtureFinanceiro.sessao, linha.id, {
          descricao: "X",
          categoriaFinanceiraId: null,
          centroCustoId: null,
          centroLucroId: null,
          safraId: null,
          projetoId: null,
        }),
      ).rejects.toThrow(PermissionError);
```

E na action que chama esse serviço, `src/app/(dashboard)/financeiro/conciliacao/actions.ts`
— veja Task 5, que atualiza essa action junto com a UI.

- [ ] **Step 5: Rodar pra confirmar que passa**

Run: `npx vitest run src/server/services/conciliacao.test.ts`
Expected: PASSA. (A `criarLancamentoDaLinhaAction` em `actions.ts` ainda
não repassa os 4 campos novos — isso só quebra `tsc` se a action também
não for atualizada; ela é atualizada na Task 5. Se `tsc` reclamar antes
da Task 5, isso é esperado e será resolvido lá.)

- [ ] **Step 6: `tsc` e suíte completa**

Run: `npx vitest run src/server/services/conciliacao.test.ts && npm run test`
Expected: testes limpos. (Pule `tsc --noEmit` nesta task se a action
`actions.ts` ainda não compilar por faltar os 4 campos — resolvido na
Task 5; anote isso no relatório se acontecer.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/schemas/conciliacao.ts src/server/services/conciliacao.ts src/server/services/conciliacao.test.ts
git commit -m "feat: capturar dimensoes analiticas no lancamento criado via conciliacao"
```

---

### Task 3: `aprovarBaixa` copia as 4 dimensões do título

**Files:**
- Modify: `src/server/services/baixa.ts`
- Modify: `src/server/services/baixa.test.ts`

**Interfaces:**
- Consumes: as 4 colunas de `LancamentoBancario` (Task 1).
- Produces: nenhuma interface nova — `aprovarBaixa` mantém a mesma assinatura, só passa a gravar mais 4 campos.

- [ ] **Step 1: Escrever o teste que falha**

Leia `src/server/services/baixa.test.ts` primeiro — ele já tem
`fixtureTesouraria`, `criarParcelaDeTeste(fx, valor, tipo?)` (que hoje
sempre cria o título com `centroCustoId: "", centroLucroId: "", safraId:
"", projetoId: ""`, ou seja, sem dimensão) e um teste existente
`"aprovarBaixa copia a categoria do titulo para o lancamento bancario
gerado"`. Adicione este novo teste, que cria o título diretamente (não
via `criarParcelaDeTeste`) pra poder informar dimensões reais:

```ts
test("aprovarBaixa copia centro de custo, centro de lucro, safra e projeto do titulo", async () => {
  const centroCusto = await prisma.centroCusto.create({
    data: { filialId: fixtureTesouraria.filialId, nome: "Centro Baixa", codigo: "CXB" },
  });
  const centroLucro = await prisma.centroLucro.create({
    data: { filialId: fixtureTesouraria.filialId, nome: "Lucro Baixa", codigo: "LXB" },
  });
  const safra = await prisma.safra.create({
    data: {
      filialId: fixtureTesouraria.filialId,
      nome: "Safra Baixa",
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-12-31"),
    },
  });
  const projeto = await prisma.projeto.create({
    data: { filialId: fixtureTesouraria.filialId, nome: "Projeto Baixa", codigo: "PXB" },
  });

  const titulo = await criarTitulo(fixtureTesouraria.sessaoAdmin, "PAGAR", {
    contraparteId: fixtureTesouraria.fornecedorId,
    documento: `NF-DIM-${Date.now()}`,
    dataEmissao: new Date(),
    dataCompetencia: new Date(),
    categoriaFinanceiraId: fixtureTesouraria.categoriaFinanceiraId,
    centroCustoId: centroCusto.id,
    centroLucroId: centroLucro.id,
    safraId: safra.id,
    projetoId: projeto.id,
    contaBancariaId: fixtureTesouraria.contaBancariaId,
    formaPagamento: "",
    parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 350 }],
  });
  const parcela = titulo.parcelas[0];

  const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
    data: new Date(),
    valorPago: 350,
    valorJuros: 0,
    valorMulta: 0,
    valorDesconto: 0,
    contaBancariaId: fixtureTesouraria.contaBancariaId,
  });
  await aprovarBaixa(fixtureTesouraria.sessao, baixa.id);

  const lancamento = await prisma.lancamentoBancario.findFirstOrThrow({ where: { baixaId: baixa.id } });
  expect(lancamento.centroCustoId).toBe(centroCusto.id);
  expect(lancamento.centroLucroId).toBe(centroLucro.id);
  expect(lancamento.safraId).toBe(safra.id);
  expect(lancamento.projetoId).toBe(projeto.id);
});
```

Se `criarTitulo` não estiver importado no arquivo, adicione ao topo:
`import { criarTitulo } from "./titulo";`.

- [ ] **Step 2: Rodar pra confirmar que falha**

Run: `npx vitest run src/server/services/baixa.test.ts -t "copia centro de custo"`
Expected: FALHA — `lancamento.centroCustoId` (e os outros 3) vêm `null`.

- [ ] **Step 3: Copiar as 4 dimensões em `aprovarBaixa`**

Em `src/server/services/baixa.ts`, dentro de `aprovarBaixa`, o
`tx.lancamentoBancario.create` atual é:

```ts
    const lancamento = await tx.lancamentoBancario.create({
      data: {
        filialId: sessao.filialId,
        contaBancariaId: anterior.contaBancariaId,
        data: anterior.data,
        tipo: parcela.titulo.tipo === "RECEBER" ? "ENTRADA" : "SAIDA",
        valor: anterior.valorPago,
        descricao: `Baixa aprovada — parcela nº ${parcela.numero}`,
        categoriaFinanceiraId: parcela.titulo.categoriaFinanceiraId,
        origem: "BAIXA",
        baixaId: baixaAtualizada.id,
        usuarioId: sessao.usuarioId,
      },
    });
```

Troque por (adiciona as 4 linhas depois de `categoriaFinanceiraId`):

```ts
    const lancamento = await tx.lancamentoBancario.create({
      data: {
        filialId: sessao.filialId,
        contaBancariaId: anterior.contaBancariaId,
        data: anterior.data,
        tipo: parcela.titulo.tipo === "RECEBER" ? "ENTRADA" : "SAIDA",
        valor: anterior.valorPago,
        descricao: `Baixa aprovada — parcela nº ${parcela.numero}`,
        categoriaFinanceiraId: parcela.titulo.categoriaFinanceiraId,
        centroCustoId: parcela.titulo.centroCustoId,
        centroLucroId: parcela.titulo.centroLucroId,
        safraId: parcela.titulo.safraId,
        projetoId: parcela.titulo.projetoId,
        origem: "BAIXA",
        baixaId: baixaAtualizada.id,
        usuarioId: sessao.usuarioId,
      },
    });
```

(`parcela` já vem de `tx.parcela.findUniqueOrThrow({ ..., include: { titulo: true } })`
mais acima na mesma função — nenhuma consulta nova é necessária.)

- [ ] **Step 4: Rodar pra confirmar que passa**

Run: `npx vitest run src/server/services/baixa.test.ts`
Expected: PASSA (todos os testes do arquivo, incluindo o novo).

- [ ] **Step 5: `tsc` e suíte completa**

Run: `npx tsc --noEmit && npm run test`
Expected: ambos limpos. (Se `tsc` ainda reclamar de `conciliacao/actions.ts`
por causa da Task 2, isso é esperado até a Task 5 — anote no relatório.)

- [ ] **Step 6: Commit**

```bash
git add src/server/services/baixa.ts src/server/services/baixa.test.ts
git commit -m "feat: aprovarBaixa copia centro de custo, centro de lucro, safra e projeto do titulo"
```

---

### Task 4: UI — seletores de dimensão no lançamento manual (Tesouraria)

**Files:**
- Modify: `src/app/(dashboard)/financeiro/tesouraria/page.tsx`
- Modify: `src/app/(dashboard)/financeiro/tesouraria/lancamento-dialog-form.tsx`

**Interfaces:**
- Consumes: `listarCentrosCusto(filialId)`, `listarCentrosLucro(filialId)`, `listarSafras(filialId)`, `listarProjetos(filialId)` (já existem, cada um retorna registros com pelo menos `{ id, nome }`); `lancamentoManualSchema` estendido (Task 1) — a action já parseia `Object.fromEntries(formData)` direto contra o schema, sem extração manual de campo.

- [ ] **Step 1: Buscar as 4 dimensões em `page.tsx`**

Em `src/app/(dashboard)/financeiro/tesouraria/page.tsx`, adicione aos
imports:

```ts
import { listarCentrosCusto } from "@/server/services/centroCusto";
import { listarCentrosLucro } from "@/server/services/centroLucro";
import { listarSafras } from "@/server/services/safra";
import { listarProjetos } from "@/server/services/projeto";
```

Localize o bloco atual (linhas 23-27 do arquivo):

```ts
  const [resumoContas, lancamentos, categorias] = await Promise.all([
    listarResumoContas(sessao.filialId),
    listarLancamentos(sessao.filialId),
    listarCategoriasFinanceiras(sessao.filialId),
  ]);
```

Troque por:

```ts
  const [resumoContas, lancamentos, categorias, centrosCusto, centrosLucro, safras, projetos] = await Promise.all([
    listarResumoContas(sessao.filialId),
    listarLancamentos(sessao.filialId),
    listarCategoriasFinanceiras(sessao.filialId),
    listarCentrosCusto(sessao.filialId),
    listarCentrosLucro(sessao.filialId),
    listarSafras(sessao.filialId),
    listarProjetos(sessao.filialId),
  ]);
```

No JSX (linha 45 do arquivo atual), troque:

```tsx
            <LancamentoDialogForm contasBancarias={opcoesContasBancarias} categorias={categorias} />
```

por:

```tsx
<LancamentoDialogForm
  contasBancarias={opcoesContasBancarias}
  categorias={categorias}
  centrosCusto={centrosCusto}
  centrosLucro={centrosLucro}
  safras={safras}
  projetos={projetos}
/>
```

- [ ] **Step 2: Adicionar os 4 seletores no diálogo**

Em `src/app/(dashboard)/financeiro/tesouraria/lancamento-dialog-form.tsx`,
troque a assinatura da função de:

```tsx
export function LancamentoDialogForm({
  contasBancarias,
  categorias,
}: {
  contasBancarias: { id: string; nome: string }[];
  categorias: { id: string; nome: string }[];
}) {
```

para:

```tsx
export function LancamentoDialogForm({
  contasBancarias,
  categorias,
  centrosCusto,
  centrosLucro,
  safras,
  projetos,
}: {
  contasBancarias: { id: string; nome: string }[];
  categorias: { id: string; nome: string }[];
  centrosCusto: { id: string; nome: string }[];
  centrosLucro: { id: string; nome: string }[];
  safras: { id: string; nome: string }[];
  projetos: { id: string; nome: string }[];
}) {
```

Logo após o bloco do seletor de categoria financeira (o `<div
className="space-y-2">` que contém `Label htmlFor="categoriaFinanceiraId"`
e o `Select name="categoriaFinanceiraId"`), adicione 4 blocos idênticos em
estrutura, um por dimensão:

```tsx
          <div className="space-y-2">
            <Label htmlFor="centroCustoId">Centro de custo</Label>
            <Select name="centroCustoId" defaultValue={SEM_VALOR}>
              <SelectTrigger id="centroCustoId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhum</SelectItem>
                {centrosCusto.map((centro) => (
                  <SelectItem key={centro.id} value={centro.id}>
                    {centro.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="centroLucroId">Centro de lucro</Label>
            <Select name="centroLucroId" defaultValue={SEM_VALOR}>
              <SelectTrigger id="centroLucroId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhum</SelectItem>
                {centrosLucro.map((centro) => (
                  <SelectItem key={centro.id} value={centro.id}>
                    {centro.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="safraId">Safra</Label>
            <Select name="safraId" defaultValue={SEM_VALOR}>
              <SelectTrigger id="safraId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhuma</SelectItem>
                {safras.map((safra) => (
                  <SelectItem key={safra.id} value={safra.id}>
                    {safra.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="projetoId">Projeto</Label>
            <Select name="projetoId" defaultValue={SEM_VALOR}>
              <SelectTrigger id="projetoId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhum</SelectItem>
                {projetos.map((projeto) => (
                  <SelectItem key={projeto.id} value={projeto.id}>
                    {projeto.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
```

`SEM_VALOR` já está importado no topo do arquivo (`import { SEM_VALOR }
from "@/lib/schemas/enums";`) — não precisa adicionar de novo.

- [ ] **Step 3: `tsc` e suíte completa**

Run: `npx tsc --noEmit && npm run test`
Expected: ambos limpos.

- [ ] **Step 4: Checagem manual**

Rode `npm run dev`, logue como TESOURARIA ou ADMINISTRADOR, abra
`/financeiro/tesouraria`, clique em "Novo lançamento". Confirme que
aparecem 4 novos seletores (Centro de custo, Centro de lucro, Safra,
Projeto) além do de Categoria financeira, todos com "Nenhum"/"Nenhuma"
como opção padrão. Salve um lançamento escolhendo um valor em cada um dos
4 e confirme que não dá erro.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/financeiro/tesouraria/page.tsx" "src/app/(dashboard)/financeiro/tesouraria/lancamento-dialog-form.tsx"
git commit -m "feat: seletores de dimensao analitica no lancamento manual da tesouraria"
```

---

### Task 5: UI — seletores de dimensão no lançamento criado via conciliação

**Files:**
- Modify: `src/app/(dashboard)/financeiro/conciliacao/page.tsx`
- Modify: `src/app/(dashboard)/financeiro/conciliacao/linha-extrato-actions.tsx`
- Modify: `src/app/(dashboard)/financeiro/conciliacao/criar-lancamento-dialog-form.tsx`
- Modify: `src/app/(dashboard)/financeiro/conciliacao/actions.ts`

**Interfaces:**
- Consumes: `listarCentrosCusto`, `listarCentrosLucro`, `listarSafras`, `listarProjetos` (mesmas funções da Task 4); `criarLancamentoDaLinha` estendido (Task 2).

`categorias` percorre 3 arquivos até chegar no formulário:
`page.tsx` busca e passa pra `LinhaExtratoActions` (`linha-extrato-actions.tsx`),
que repassa pra `CriarLancamentoDialogForm`. Os 4 campos novos seguem o
mesmo caminho, arquivo por arquivo.

- [ ] **Step 1: Buscar as 4 dimensões em `page.tsx`**

Em `src/app/(dashboard)/financeiro/conciliacao/page.tsx`, adicione aos
imports:

```ts
import { listarCentrosCusto } from "@/server/services/centroCusto";
import { listarCentrosLucro } from "@/server/services/centroLucro";
import { listarSafras } from "@/server/services/safra";
import { listarProjetos } from "@/server/services/projeto";
```

Localize o bloco atual (linhas 35-39 do arquivo):

```ts
  const [linhas, contasBancarias, categorias] = await Promise.all([
    listarLinhasExtrato(sessao.filialId, undefined, statusFiltro),
    listarContasBancarias(sessao.filialId),
    listarCategoriasFinanceiras(sessao.filialId),
  ]);
```

Troque por:

```ts
  const [linhas, contasBancarias, categorias, centrosCusto, centrosLucro, safras, projetos] = await Promise.all([
    listarLinhasExtrato(sessao.filialId, undefined, statusFiltro),
    listarContasBancarias(sessao.filialId),
    listarCategoriasFinanceiras(sessao.filialId),
    listarCentrosCusto(sessao.filialId),
    listarCentrosLucro(sessao.filialId),
    listarSafras(sessao.filialId),
    listarProjetos(sessao.filialId),
  ]);
```

Localize onde `<LinhaExtratoActions ... categorias={categorias} />` é
renderizado (dentro do `.map` que monta as linhas da tabela):

```tsx
                <LinhaExtratoActions
                  linhaExtratoId={linha.id}
                  status={linha.status}
                  lancamentoVinculadoDescricao={linha.lancamentoBancario?.descricao ?? null}
                  podeEscrever={podeEscrever}
                  categorias={categorias}
                />
```

Troque por:

```tsx
                <LinhaExtratoActions
                  linhaExtratoId={linha.id}
                  status={linha.status}
                  lancamentoVinculadoDescricao={linha.lancamentoBancario?.descricao ?? null}
                  podeEscrever={podeEscrever}
                  categorias={categorias}
                  centrosCusto={centrosCusto}
                  centrosLucro={centrosLucro}
                  safras={safras}
                  projetos={projetos}
                />
```

- [ ] **Step 2: Repassar as 4 dimensões em `linha-extrato-actions.tsx`**

Em `src/app/(dashboard)/financeiro/conciliacao/linha-extrato-actions.tsx`,
troque a assinatura de:

```tsx
export function LinhaExtratoActions({
  linhaExtratoId,
  status,
  lancamentoVinculadoDescricao,
  podeEscrever,
  categorias,
}: {
  linhaExtratoId: string;
  status: string;
  lancamentoVinculadoDescricao: string | null;
  podeEscrever: boolean;
  categorias: { id: string; nome: string }[];
}) {
```

para:

```tsx
export function LinhaExtratoActions({
  linhaExtratoId,
  status,
  lancamentoVinculadoDescricao,
  podeEscrever,
  categorias,
  centrosCusto,
  centrosLucro,
  safras,
  projetos,
}: {
  linhaExtratoId: string;
  status: string;
  lancamentoVinculadoDescricao: string | null;
  podeEscrever: boolean;
  categorias: { id: string; nome: string }[];
  centrosCusto: { id: string; nome: string }[];
  centrosLucro: { id: string; nome: string }[];
  safras: { id: string; nome: string }[];
  projetos: { id: string; nome: string }[];
}) {
```

Troque a linha (perto do final do componente):

```tsx
      <CriarLancamentoDialogForm linhaExtratoId={linhaExtratoId} categorias={categorias} />
```

por:

```tsx
      <CriarLancamentoDialogForm
        linhaExtratoId={linhaExtratoId}
        categorias={categorias}
        centrosCusto={centrosCusto}
        centrosLucro={centrosLucro}
        safras={safras}
        projetos={projetos}
      />
```

- [ ] **Step 3: Adicionar os 4 seletores no diálogo**

Em `src/app/(dashboard)/financeiro/conciliacao/criar-lancamento-dialog-form.tsx`,
troque a assinatura de:

```tsx
export function CriarLancamentoDialogForm({
  linhaExtratoId,
  categorias,
}: {
  linhaExtratoId: string;
  categorias: { id: string; nome: string }[];
}) {
```

para:

```tsx
export function CriarLancamentoDialogForm({
  linhaExtratoId,
  categorias,
  centrosCusto,
  centrosLucro,
  safras,
  projetos,
}: {
  linhaExtratoId: string;
  categorias: { id: string; nome: string }[];
  centrosCusto: { id: string; nome: string }[];
  centrosLucro: { id: string; nome: string }[];
  safras: { id: string; nome: string }[];
  projetos: { id: string; nome: string }[];
}) {
```

Logo após o bloco do seletor de categoria financeira, adicione 4 blocos
(mesma estrutura da Task 4, Step 2, mas com `id`/`htmlFor` incluindo
`${linhaExtratoId}` pra manter ids únicos por linha, seguindo o padrão já
usado no campo `descricao` deste mesmo arquivo):

```tsx
          <div className="space-y-2">
            <Label htmlFor={`centroCustoId-${linhaExtratoId}`}>Centro de custo</Label>
            <Select name="centroCustoId" defaultValue={SEM_VALOR}>
              <SelectTrigger id={`centroCustoId-${linhaExtratoId}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhum</SelectItem>
                {centrosCusto.map((centro) => (
                  <SelectItem key={centro.id} value={centro.id}>
                    {centro.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`centroLucroId-${linhaExtratoId}`}>Centro de lucro</Label>
            <Select name="centroLucroId" defaultValue={SEM_VALOR}>
              <SelectTrigger id={`centroLucroId-${linhaExtratoId}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhum</SelectItem>
                {centrosLucro.map((centro) => (
                  <SelectItem key={centro.id} value={centro.id}>
                    {centro.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`safraId-${linhaExtratoId}`}>Safra</Label>
            <Select name="safraId" defaultValue={SEM_VALOR}>
              <SelectTrigger id={`safraId-${linhaExtratoId}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhuma</SelectItem>
                {safras.map((safra) => (
                  <SelectItem key={safra.id} value={safra.id}>
                    {safra.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`projetoId-${linhaExtratoId}`}>Projeto</Label>
            <Select name="projetoId" defaultValue={SEM_VALOR}>
              <SelectTrigger id={`projetoId-${linhaExtratoId}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhum</SelectItem>
                {projetos.map((projeto) => (
                  <SelectItem key={projeto.id} value={projeto.id}>
                    {projeto.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
```

- [ ] **Step 4: Repassar os 4 campos na action**

Em `src/app/(dashboard)/financeiro/conciliacao/actions.ts`, a função
`criarLancamentoDaLinhaAction` atual passa:

```ts
    await conciliacaoService.criarLancamentoDaLinha(sessao, parsed.data.linhaExtratoId, {
      descricao: parsed.data.descricao,
      categoriaFinanceiraId:
        parsed.data.categoriaFinanceiraId && parsed.data.categoriaFinanceiraId !== SEM_VALOR
          ? parsed.data.categoriaFinanceiraId
          : null,
    });
```

Troque por (mesmo padrão de normalização, repetido pros 4 campos novos):

```ts
    await conciliacaoService.criarLancamentoDaLinha(sessao, parsed.data.linhaExtratoId, {
      descricao: parsed.data.descricao,
      categoriaFinanceiraId:
        parsed.data.categoriaFinanceiraId && parsed.data.categoriaFinanceiraId !== SEM_VALOR
          ? parsed.data.categoriaFinanceiraId
          : null,
      centroCustoId:
        parsed.data.centroCustoId && parsed.data.centroCustoId !== SEM_VALOR
          ? parsed.data.centroCustoId
          : null,
      centroLucroId:
        parsed.data.centroLucroId && parsed.data.centroLucroId !== SEM_VALOR
          ? parsed.data.centroLucroId
          : null,
      safraId:
        parsed.data.safraId && parsed.data.safraId !== SEM_VALOR
          ? parsed.data.safraId
          : null,
      projetoId:
        parsed.data.projetoId && parsed.data.projetoId !== SEM_VALOR
          ? parsed.data.projetoId
          : null,
    });
```

- [ ] **Step 5: `tsc` e suíte completa**

Run: `npx tsc --noEmit && npm run test`
Expected: ambos limpos — este é o ponto em que qualquer erro de tipo
pendente das Tasks 2/3 sobre `conciliacao/actions.ts` deve desaparecer.

- [ ] **Step 6: Checagem manual**

Rode `npm run dev`, abra `/financeiro/conciliacao`, encontre uma linha
sem título correspondente, clique "Criar lançamento". Confirme os 4
seletores novos aparecem junto ao de categoria, e que salvar com valores
escolhidos não dá erro.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/financeiro/conciliacao/page.tsx" "src/app/(dashboard)/financeiro/conciliacao/linha-extrato-actions.tsx" "src/app/(dashboard)/financeiro/conciliacao/criar-lancamento-dialog-form.tsx" "src/app/(dashboard)/financeiro/conciliacao/actions.ts"
git commit -m "feat: seletores de dimensao analitica no lancamento criado via conciliacao"
```

---

### Task 6: Extrair `SeletorAnoMes` para pasta compartilhada da Controladoria

**Files:**
- Create: `src/app/(dashboard)/controladoria/_shared/seletor-ano-mes.tsx`
- Create: `src/app/(dashboard)/controladoria/_shared/seletor-ano-mes.test.ts`
- Delete: `src/app/(dashboard)/controladoria/orcamento/seletor-ano-mes.tsx`
- Delete: `src/app/(dashboard)/controladoria/orcamento/seletor-ano-mes.test.ts`
- Modify: `src/app/(dashboard)/controladoria/orcamento/page.tsx`

**Interfaces:**
- Produces (consumed by Task 8): `SeletorAnoMes({ ano, mes }: { ano: number; mes: number })`, `deslocarAno(ano: number, direcao: 1 | -1): number`, ambos exportados de `../_shared/seletor-ano-mes`.

- [ ] **Step 1: Criar o arquivo compartilhado**

`SeletorAnoMes` hoje vive em `src/app/(dashboard)/controladoria/orcamento/seletor-ano-mes.tsx`
e vai ter um segundo consumidor (`fluxo-por-dimensao`, Task 8) — mesmo
motivo que levou `_fluxo-de-caixa/` a existir em `financeiro/` na Fase 4b.
Crie `src/app/(dashboard)/controladoria/_shared/seletor-ano-mes.tsx` com
exatamente o conteúdo atual do arquivo em `orcamento/`:

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function deslocarAno(ano: number, direcao: 1 | -1): number {
  return ano + direcao;
}

export function SeletorAnoMes({ ano, mes }: { ano: number; mes: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function atualizar(novoAno: number, novoMes: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("ano", String(novoAno));
    params.set("mes", String(novoMes));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => atualizar(deslocarAno(ano, -1), mes)}>
        Ano anterior
      </Button>
      <span className="text-sm font-medium">{ano}</span>
      <Button type="button" variant="outline" size="sm" onClick={() => atualizar(deslocarAno(ano, 1), mes)}>
        Próximo ano
      </Button>
      <Select value={String(mes)} onValueChange={(valor) => valor && atualizar(ano, Number(valor))}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MESES.map((nome, indice) => (
            <SelectItem key={nome} value={String(indice + 1)}>
              {nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 2: Criar o teste no novo local**

Crie `src/app/(dashboard)/controladoria/_shared/seletor-ano-mes.test.ts`
com exatamente o conteúdo atual do teste:

```ts
import { describe, expect, test } from "vitest";
import { deslocarAno } from "./seletor-ano-mes";

describe("deslocarAno", () => {
  test("avança um ano", () => {
    expect(deslocarAno(2026, 1)).toBe(2027);
  });

  test("volta um ano", () => {
    expect(deslocarAno(2026, -1)).toBe(2025);
  });
});
```

- [ ] **Step 3: Remover os arquivos antigos**

```bash
git rm "src/app/(dashboard)/controladoria/orcamento/seletor-ano-mes.tsx" "src/app/(dashboard)/controladoria/orcamento/seletor-ano-mes.test.ts"
```

- [ ] **Step 4: Atualizar o import em `orcamento/page.tsx`**

Em `src/app/(dashboard)/controladoria/orcamento/page.tsx`, troque:

```ts
import { SeletorAnoMes } from "./seletor-ano-mes";
```

por:

```ts
import { SeletorAnoMes } from "../_shared/seletor-ano-mes";
```

- [ ] **Step 5: Rodar pra confirmar que passa**

Run: `npx vitest run "src/app/(dashboard)/controladoria/_shared/seletor-ano-mes.test.ts" && npx tsc --noEmit && npm run test`
Expected: tudo limpo — os 2 testes de `deslocarAno` passam no novo
local, `tsc` não reclama de import quebrado, suíte completa passa.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/controladoria/_shared/seletor-ano-mes.tsx" "src/app/(dashboard)/controladoria/_shared/seletor-ano-mes.test.ts" "src/app/(dashboard)/controladoria/orcamento/page.tsx"
git commit -m "refactor: extrair SeletorAnoMes para pasta compartilhada da Controladoria"
```

---

### Task 7: Serviço `fluxoDeCaixaPorDimensao.ts`

**Files:**
- Create: `src/server/services/fluxoDeCaixaPorDimensao.ts`
- Create: `src/server/services/fluxoDeCaixaPorDimensao.test.ts`

**Interfaces:**
- Consumes: `saldoRemanescenteParcela` (de `./fluxoDeCaixaProjetado`); `requirePermission` (de `@/server/auth/permissions`); `SessaoAtiva` (de `@/server/auth/sessao`); `prisma` (de `@/server/db/client`).
- Produces (consumed by Task 8): `TipoDimensao`, `LinhaFluxoPorDimensao`, `listarFluxoDeCaixaPorDimensao(sessao, tipoDimensao, ano, mes): Promise<LinhaFluxoPorDimensao[]>`.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/server/services/fluxoDeCaixaPorDimensao.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import { registrarBaixa, aprovarBaixa } from "./baixa";
import {
  buscarRealizadoPorDimensao,
  buscarProjetadoPorDimensao,
  listarValoresDimensao,
  listarFluxoDeCaixaPorDimensao,
} from "./fluxoDeCaixaPorDimensao";

describe("fluxoDeCaixaPorDimensao", () => {
  let fixture: FixtureFinanceiro;
  let centroCustoAtivoId: string;
  let centroCustoInativoId: string;
  let centroCustoFilhoId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("FCD", "FINANCEIRO");

    const centroCustoAtivo = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Ativo", codigo: "ATV" },
    });
    centroCustoAtivoId = centroCustoAtivo.id;

    const centroCustoInativo = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Inativo", codigo: "INA", ativo: false },
    });
    centroCustoInativoId = centroCustoInativo.id;

    const centroCustoFilho = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Filho", codigo: "FLH", parentId: centroCustoAtivoId },
    });
    centroCustoFilhoId = centroCustoFilho.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { filialId: fixture.filialId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  describe("buscarRealizadoPorDimensao", () => {
    test("soma pelo campo direto quando presente", async () => {
      await prisma.lancamentoBancario.create({
        data: {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-04-10T00:00:00Z"),
          tipo: "SAIDA",
          valor: 200,
          descricao: "Direto",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: true,
          centroCustoId: centroCustoAtivoId,
        },
      });

      const totais = await buscarRealizadoPorDimensao(fixture.filialId, "CENTRO_CUSTO", 2026, 4);
      expect(totais.get(centroCustoAtivoId)?.saidas).toBe(200);
    });

    test("usa o fallback via baixa quando o campo direto está nulo (dado histórico)", async () => {
      const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
        contraparteId: fixture.fornecedorId,
        documento: `FCD-FALLBACK-${Date.now()}`,
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        centroCustoId: centroCustoAtivoId,
        centroLucroId: "",
        safraId: "",
        projetoId: "",
        contaBancariaId: fixture.contaBancariaId,
        formaPagamento: "",
        parcelas: [{ numero: 1, dataVencimento: new Date("2026-05-01T00:00:00Z"), valorOriginal: 400 }],
      });
      const parcela = titulo.parcelas[0];

      const baixa = await registrarBaixa(fixture.sessao, parcela.id, {
        data: new Date("2026-05-05T00:00:00Z"),
        valorPago: 400,
        valorJuros: 0,
        valorMulta: 0,
        valorDesconto: 0,
        contaBancariaId: fixture.contaBancariaId,
      });
      await aprovarBaixa(fixture.sessaoAdmin, baixa.id);

      // Simula dado histórico anterior a esta correção: apaga o campo direto
      // que aprovarBaixa já copiou (Task 3), deixando só o vínculo via baixaId.
      await prisma.lancamentoBancario.updateMany({
        where: { baixaId: baixa.id },
        data: { centroCustoId: null },
      });

      const totais = await buscarRealizadoPorDimensao(fixture.filialId, "CENTRO_CUSTO", 2026, 5);
      expect(totais.get(centroCustoAtivoId)?.saidas).toBe(400);
    });

    test("sem campo direto e sem baixa cai na chave null (Não classificado)", async () => {
      await prisma.lancamentoBancario.create({
        data: {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-06-10T00:00:00Z"),
          tipo: "ENTRADA",
          valor: 90,
          descricao: "Sem dimensão",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: true,
        },
      });

      const totais = await buscarRealizadoPorDimensao(fixture.filialId, "CENTRO_CUSTO", 2026, 6);
      expect(totais.get(null)?.entradas).toBe(90);
    });

    test("escopo de filial — lançamento de outra filial não vaza", async () => {
      const outraFixture = await criarFixtureFinanceiro("FCD2", "FINANCEIRO");
      try {
        const outroCentro = await prisma.centroCusto.create({
          data: { filialId: outraFixture.filialId, nome: "Outro", codigo: "OUT" },
        });
        await prisma.lancamentoBancario.create({
          data: {
            filialId: outraFixture.filialId,
            contaBancariaId: outraFixture.contaBancariaId,
            data: new Date("2026-04-10T00:00:00Z"),
            tipo: "SAIDA",
            valor: 999,
            descricao: "Outra filial",
            origem: "MANUAL",
            usuarioId: outraFixture.usuarioId,
            conciliado: true,
            centroCustoId: outroCentro.id,
          },
        });

        const totais = await buscarRealizadoPorDimensao(fixture.filialId, "CENTRO_CUSTO", 2026, 4);
        expect(totais.get(outroCentro.id)).toBeUndefined();
      } finally {
        await limparFixtureFinanceiro(outraFixture);
      }
    });
  });

  describe("buscarProjetadoPorDimensao", () => {
    test("só considera parcelas em aberto dentro do mês, separadas por tipo", async () => {
      await criarTitulo(fixture.sessao, "PAGAR", {
        contraparteId: fixture.fornecedorId,
        documento: `FCD-PROJ-PAG-${Date.now()}`,
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        centroCustoId: centroCustoAtivoId,
        centroLucroId: "",
        safraId: "",
        projetoId: "",
        contaBancariaId: fixture.contaBancariaId,
        formaPagamento: "",
        parcelas: [{ numero: 1, dataVencimento: new Date("2026-08-15T00:00:00Z"), valorOriginal: 500 }],
      });
      await criarTitulo(fixture.sessao, "RECEBER", {
        contraparteId: fixture.clienteId,
        documento: `FCD-PROJ-REC-${Date.now()}`,
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        centroCustoId: centroCustoAtivoId,
        centroLucroId: "",
        safraId: "",
        projetoId: "",
        contaBancariaId: fixture.contaBancariaId,
        formaPagamento: "",
        parcelas: [{ numero: 1, dataVencimento: new Date("2026-08-20T00:00:00Z"), valorOriginal: 700 }],
      });

      const totais = await buscarProjetadoPorDimensao(fixture.filialId, "CENTRO_CUSTO", 2026, 8);
      expect(totais.get(centroCustoAtivoId)?.saidas).toBeGreaterThanOrEqual(500);
      expect(totais.get(centroCustoAtivoId)?.entradas).toBeGreaterThanOrEqual(700);

      const totaisMesErrado = await buscarProjetadoPorDimensao(fixture.filialId, "CENTRO_CUSTO", 2026, 9);
      expect(totaisMesErrado.get(centroCustoAtivoId)).toBeUndefined();
    });
  });

  describe("listarValoresDimensao", () => {
    test("retorna só centros de custo ativos da filial", async () => {
      const valores = await listarValoresDimensao(fixture.filialId, "CENTRO_CUSTO");
      const ids = valores.map((v) => v.id);
      expect(ids).toContain(centroCustoAtivoId);
      expect(ids).toContain(centroCustoFilhoId);
      expect(ids).not.toContain(centroCustoInativoId);
    });
  });

  describe("listarFluxoDeCaixaPorDimensao", () => {
    test("inclui a linha Não classificado sempre, mesmo zerada", async () => {
      const linhas = await listarFluxoDeCaixaPorDimensao(fixture.sessao, "CENTRO_LUCRO", 2030, 1);
      const naoClassificado = linhas.find((l) => l.dimensaoId === null);
      expect(naoClassificado).toBeDefined();
      expect(naoClassificado?.dimensaoNome).toBe("Não classificado");
      expect(naoClassificado?.entradasRealizadas).toBe(0);
      expect(naoClassificado?.saidasRealizadas).toBe(0);
    });

    test("centro de custo filho não soma no total do pai (sem rollup)", async () => {
      await prisma.lancamentoBancario.create({
        data: {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-07-10T00:00:00Z"),
          tipo: "SAIDA",
          valor: 60,
          descricao: "Do filho",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: true,
          centroCustoId: centroCustoFilhoId,
        },
      });

      const linhas = await listarFluxoDeCaixaPorDimensao(fixture.sessao, "CENTRO_CUSTO", 2026, 7);
      const linhaPai = linhas.find((l) => l.dimensaoId === centroCustoAtivoId);
      const linhaFilho = linhas.find((l) => l.dimensaoId === centroCustoFilhoId);
      expect(linhaPai?.saidasRealizadas ?? 0).toBe(0);
      expect(linhaFilho?.saidasRealizadas).toBe(60);
    });
  });
});
```

- [ ] **Step 2: Rodar pra confirmar que falha**

Run: `npx vitest run src/server/services/fluxoDeCaixaPorDimensao.test.ts`
Expected: FALHA — `./fluxoDeCaixaPorDimensao` ainda não existe.

- [ ] **Step 3: Implementar o serviço**

Crie `src/server/services/fluxoDeCaixaPorDimensao.ts`:

```ts
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { saldoRemanescenteParcela } from "./fluxoDeCaixaProjetado";

export type TipoDimensao = "CENTRO_CUSTO" | "CENTRO_LUCRO" | "SAFRA";

export type LinhaFluxoPorDimensao = {
  dimensaoId: string | null;
  dimensaoNome: string;
  ano: number;
  mes: number;
  entradasRealizadas: number;
  saidasRealizadas: number;
  entradasProjetadas: number;
  saidasProjetadas: number;
};

type TotaisPorDimensao = { entradas: number; saidas: number };

const CAMPO_POR_DIMENSAO: Record<TipoDimensao, "centroCustoId" | "centroLucroId" | "safraId"> = {
  CENTRO_CUSTO: "centroCustoId",
  CENTRO_LUCRO: "centroLucroId",
  SAFRA: "safraId",
};

function inicioDoMes(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 1));
}

function fimDoMes(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999));
}

function somar(totais: Map<string | null, TotaisPorDimensao>, chave: string | null, campo: "entradas" | "saidas", valor: number) {
  const atual = totais.get(chave) ?? { entradas: 0, saidas: 0 };
  atual[campo] += valor;
  totais.set(chave, atual);
}

/**
 * Realizado por dimensão — campo direto primeiro (lançamentos criados após
 * a correção na origem), fallback via baixa->parcela->titulo pra dado
 * histórico. Sem os dois, cai em `null` ("Não classificado").
 */
export async function buscarRealizadoPorDimensao(
  filialId: string,
  tipoDimensao: TipoDimensao,
  ano: number,
  mes: number,
): Promise<Map<string | null, TotaisPorDimensao>> {
  const campo = CAMPO_POR_DIMENSAO[tipoDimensao];

  const lancamentos = await prisma.lancamentoBancario.findMany({
    where: {
      filialId,
      conciliado: true,
      contaBancaria: { ativo: true },
      data: { gte: inicioDoMes(ano, mes), lte: fimDoMes(ano, mes) },
    },
    include: {
      baixa: {
        include: {
          parcela: {
            include: { titulo: { select: { centroCustoId: true, centroLucroId: true, safraId: true } } },
          },
        },
      },
    },
  });

  const totais = new Map<string | null, TotaisPorDimensao>();
  for (const lancamento of lancamentos) {
    const direto = lancamento[campo];
    const viaBaixa = lancamento.baixa?.parcela.titulo[campo] ?? null;
    const dimensaoId = direto ?? viaBaixa;

    somar(totais, dimensaoId, lancamento.tipo === "ENTRADA" ? "entradas" : "saidas", Number(lancamento.valor));
  }
  return totais;
}

/**
 * Projetado por dimensão — sempre via `Titulo`, direto (não há fallback
 * necessário: a parcela projetada só existe através do título).
 */
export async function buscarProjetadoPorDimensao(
  filialId: string,
  tipoDimensao: TipoDimensao,
  ano: number,
  mes: number,
): Promise<Map<string | null, TotaisPorDimensao>> {
  const campo = CAMPO_POR_DIMENSAO[tipoDimensao];

  const parcelas = await prisma.parcela.findMany({
    where: {
      titulo: { filialId },
      status: { in: ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"] },
      dataVencimento: { gte: inicioDoMes(ano, mes), lte: fimDoMes(ano, mes) },
    },
    include: {
      titulo: { select: { tipo: true, centroCustoId: true, centroLucroId: true, safraId: true } },
      baixas: { where: { statusAprovacao: "APROVADO" } },
    },
  });

  const totais = new Map<string | null, TotaisPorDimensao>();
  for (const parcela of parcelas) {
    const saldo = saldoRemanescenteParcela(
      Number(parcela.valorAtualizado),
      parcela.baixas.map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
    );
    const dimensaoId = parcela.titulo[campo];
    somar(totais, dimensaoId, parcela.titulo.tipo === "RECEBER" ? "entradas" : "saidas", saldo);
  }
  return totais;
}

export async function listarValoresDimensao(
  filialId: string,
  tipoDimensao: TipoDimensao,
): Promise<{ id: string; nome: string }[]> {
  if (tipoDimensao === "CENTRO_CUSTO") {
    return prisma.centroCusto.findMany({
      where: { filialId, ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    });
  }
  if (tipoDimensao === "CENTRO_LUCRO") {
    return prisma.centroLucro.findMany({
      where: { filialId, ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    });
  }
  return prisma.safra.findMany({
    where: { filialId, ativo: true },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });
}

export async function listarFluxoDeCaixaPorDimensao(
  sessao: SessaoAtiva,
  tipoDimensao: TipoDimensao,
  ano: number,
  mes: number,
): Promise<LinhaFluxoPorDimensao[]> {
  requirePermission(sessao.perfil, "titulo:ler");

  const [valores, realizado, projetado] = await Promise.all([
    listarValoresDimensao(sessao.filialId, tipoDimensao),
    buscarRealizadoPorDimensao(sessao.filialId, tipoDimensao, ano, mes),
    buscarProjetadoPorDimensao(sessao.filialId, tipoDimensao, ano, mes),
  ]);

  const linhas: LinhaFluxoPorDimensao[] = valores.map((valor) => {
    const r = realizado.get(valor.id) ?? { entradas: 0, saidas: 0 };
    const p = projetado.get(valor.id) ?? { entradas: 0, saidas: 0 };
    return {
      dimensaoId: valor.id,
      dimensaoNome: valor.nome,
      ano,
      mes,
      entradasRealizadas: r.entradas,
      saidasRealizadas: r.saidas,
      entradasProjetadas: p.entradas,
      saidasProjetadas: p.saidas,
    };
  });

  const rNulo = realizado.get(null) ?? { entradas: 0, saidas: 0 };
  const pNulo = projetado.get(null) ?? { entradas: 0, saidas: 0 };
  linhas.push({
    dimensaoId: null,
    dimensaoNome: "Não classificado",
    ano,
    mes,
    entradasRealizadas: rNulo.entradas,
    saidasRealizadas: rNulo.saidas,
    entradasProjetadas: pNulo.entradas,
    saidasProjetadas: pNulo.saidas,
  });

  return linhas;
}
```

- [ ] **Step 4: Rodar pra confirmar que passa**

Run: `npx vitest run src/server/services/fluxoDeCaixaPorDimensao.test.ts`
Expected: PASSA (todos os testes).

- [ ] **Step 5: `tsc` e suíte completa**

Run: `npx tsc --noEmit && npm run test`
Expected: ambos limpos.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/fluxoDeCaixaPorDimensao.ts src/server/services/fluxoDeCaixaPorDimensao.test.ts
git commit -m "feat: servico de fluxo de caixa por dimensao (centro de custo, centro de lucro, safra)"
```

---

### Task 8: UI — `/controladoria/fluxo-por-dimensao`

**Files:**
- Create: `src/app/(dashboard)/controladoria/fluxo-por-dimensao/page.tsx`
- Create: `src/app/(dashboard)/controladoria/fluxo-por-dimensao/seletor-dimensao.tsx`
- Modify: `src/app/(dashboard)/nav-items.ts`

**Interfaces:**
- Consumes: `listarFluxoDeCaixaPorDimensao`, `TipoDimensao`, `LinhaFluxoPorDimensao` (Task 7, `@/server/services/fluxoDeCaixaPorDimensao`); `SeletorAnoMes` (Task 6, `../_shared/seletor-ano-mes`); `requireSessaoAtiva`, `requirePermission` (existentes).
- Produces: nada consumido por tarefa futura — última tarefa do plano.

- [ ] **Step 1: Criar o seletor de dimensão**

Crie `src/app/(dashboard)/controladoria/fluxo-por-dimensao/seletor-dimensao.tsx`:

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TipoDimensao } from "@/server/services/fluxoDeCaixaPorDimensao";

const OPCOES: { valor: TipoDimensao; rotulo: string }[] = [
  { valor: "CENTRO_CUSTO", rotulo: "Centro de custo" },
  { valor: "CENTRO_LUCRO", rotulo: "Centro de lucro" },
  { valor: "SAFRA", rotulo: "Safra" },
];

export function SeletorDimensao({ dimensao, ano, mes }: { dimensao: TipoDimensao; ano: number; mes: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function atualizar(novaDimensao: TipoDimensao) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("dimensao", novaDimensao);
    params.set("ano", String(ano));
    params.set("mes", String(mes));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={dimensao} onValueChange={(valor) => valor && atualizar(valor as TipoDimensao)}>
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPCOES.map((opcao) => (
          <SelectItem key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Criar `page.tsx`**

Crie `src/app/(dashboard)/controladoria/fluxo-por-dimensao/page.tsx`:

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarFluxoDeCaixaPorDimensao, type TipoDimensao } from "@/server/services/fluxoDeCaixaPorDimensao";
import { SeletorAnoMes } from "../_shared/seletor-ano-mes";
import { SeletorDimensao } from "./seletor-dimensao";

const DIMENSOES_VALIDAS: TipoDimensao[] = ["CENTRO_CUSTO", "CENTRO_LUCRO", "SAFRA"];

function dimensaoValida(valor: string | undefined): TipoDimensao {
  return DIMENSOES_VALIDAS.includes(valor as TipoDimensao) ? (valor as TipoDimensao) : "CENTRO_CUSTO";
}

function anoValido(valor: string | undefined): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : new Date().getUTCFullYear();
}

function mesValido(valor: string | undefined): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 1 && numero <= 12 ? numero : new Date().getUTCMonth() + 1;
}

export default async function FluxoPorDimensaoPage({
  searchParams,
}: {
  searchParams: Promise<{ dimensao?: string | string[]; ano?: string | string[]; mes?: string | string[] }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:ler");

  const params = await searchParams;
  const dimensaoParam = Array.isArray(params.dimensao) ? params.dimensao[0] : params.dimensao;
  const anoParam = Array.isArray(params.ano) ? params.ano[0] : params.ano;
  const mesParam = Array.isArray(params.mes) ? params.mes[0] : params.mes;

  const dimensao = dimensaoValida(dimensaoParam);
  const ano = anoValido(anoParam);
  const mes = mesValido(mesParam);

  const linhas = await listarFluxoDeCaixaPorDimensao(sessao, dimensao, ano, mes);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Fluxo de caixa por dimensão</h1>
        <p className="text-sm text-muted-foreground">
          Realizado (movimentações conciliadas) e projetado (títulos em
          aberto) do mês, agrupados por centro de custo, centro de lucro ou
          safra. "Não classificado" reúne o que não tem essa dimensão
          preenchida.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <SeletorDimensao dimensao={dimensao} ano={ano} mes={mes} />
        <SeletorAnoMes ano={ano} mes={mes} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dimensão</TableHead>
            <TableHead>Entradas realizadas</TableHead>
            <TableHead>Saídas realizadas</TableHead>
            <TableHead>Entradas projetadas</TableHead>
            <TableHead>Saídas projetadas</TableHead>
            <TableHead>Saldo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((linha) => {
            const saldo =
              linha.entradasRealizadas + linha.entradasProjetadas - (linha.saidasRealizadas + linha.saidasProjetadas);
            return (
              <TableRow key={linha.dimensaoId ?? "nao-classificado"}>
                <TableCell className="font-medium">{linha.dimensaoNome}</TableCell>
                <TableCell>{linha.entradasRealizadas.toFixed(2)}</TableCell>
                <TableCell>{linha.saidasRealizadas.toFixed(2)}</TableCell>
                <TableCell>{linha.entradasProjetadas.toFixed(2)}</TableCell>
                <TableCell>{linha.saidasProjetadas.toFixed(2)}</TableCell>
                <TableCell className={saldo < 0 ? "font-medium text-destructive" : undefined}>
                  {saldo.toFixed(2)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Adicionar a entrada de navegação**

Em `src/app/(dashboard)/nav-items.ts`, a seção "Controladoria" atual é:

```ts
  {
    titulo: "Controladoria",
    itens: [
      { href: "/controladoria/orcamento", label: "Orçamento" },
    ],
  },
```

Troque por:

```ts
  {
    titulo: "Controladoria",
    itens: [
      { href: "/controladoria/orcamento", label: "Orçamento" },
      { href: "/controladoria/fluxo-por-dimensao", label: "Fluxo de caixa por dimensão" },
    ],
  },
```

- [ ] **Step 4: Rodar a suíte completa, `tsc` e build**

Run: `npx tsc --noEmit && npm run test && npm run build`
Expected: tudo limpo.

- [ ] **Step 5: Checagem manual**

Rode `npm run dev`, logue, abra `/controladoria/fluxo-por-dimensao`.
Confirme: a entrada "Fluxo de caixa por dimensão" aparece em
"Controladoria"; o seletor de dimensão troca entre Centro de custo/Centro
de lucro/Safra e a tabela muda de conjunto de linhas; a linha "Não
classificado" aparece sempre, mesmo com tudo zerado; um lançamento
manual criado na Task 4 com uma dimensão escolhida aparece na linha
correta ao navegar até o mês certo.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/controladoria/fluxo-por-dimensao" "src/app/(dashboard)/nav-items.ts"
git commit -m "feat: tela de fluxo de caixa por dimensao"
```

---

## Self-Review Notes

- **Spec coverage**: correção na origem (migração + 3 caminhos de escrita) → Tasks 1-3; UI dos 2 formulários existentes → Tasks 4-5; extração do seletor compartilhado → Task 6; serviço de leitura (direto + fallback, "Não classificado" sempre presente, sem rollup) → Task 7; UI do relatório + nav → Task 8. Todos os itens de "Fora de escopo" da spec (orçamento por dimensão, comparação entre safras, relatório por Projeto, rollup hierárquico, dimensão obrigatória em Título, backfill, visão cruzando as 3 dimensões) estão deliberadamente ausentes de todas as tasks.
- **Consistência de tipos verificada**: `TipoDimensao` e `LinhaFluxoPorDimensao` definidos uma vez na Task 7, consumidos idênticos na Task 8. `listarFluxoDeCaixaPorDimensao(sessao, tipoDimensao, ano, mes)` é a única função de leitura que a UI chama (Task 8), igual ao padrão já estabelecido no Orçamento. As assinaturas de `criarLancamentoManual`/`criarLancamentoDaLinha`/`aprovarBaixa` alteradas nas Tasks 1-3 são exatamente as que as Tasks 4-5 (UI) e os testes da Task 7 (fallback via baixa) assumem.
- **Sem placeholders**: todo step tem código completo e literal.
- **Dependência entre tasks por ordem**: Tasks 2-3 dependem da migração da Task 1 já aplicada (colunas precisam existir antes de qualquer `data: { centroCustoId: ... }` compilar). Task 5 depende da Task 2 (assinatura de `criarLancamentoDaLinha`). Task 8 depende das Tasks 6 e 7. Quem despachar este plano deve executar as tasks em ordem numérica — não há tasks paralelizáveis aqui, diferente de planos anteriores desta sessão.
- **Achado de execução esperado**: a Task 2 deliberadamente deixa `tsc`/a suíte completa com um erro de tipo pendente em `conciliacao/actions.ts` (porque a action ainda não repassa os 4 campos novos) até a Task 5 rodar — isso é uma sequência de tasks interdependentes, não um bug do plano; o passo de verificação de cada task já avisa disso explicitamente.
