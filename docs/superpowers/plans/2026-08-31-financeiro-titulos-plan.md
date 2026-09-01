# Contas a Pagar/Receber (Títulos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Contas a Pagar e Contas a Receber (Títulos) — o primeiro sub-projeto da Fase 2 — com modelo de dados, RBAC, regras de negócio (baixa/aprovação, renegociação, importação CSV, anexos) e UI.

**Architecture:** 4 novos models Prisma (`Titulo`, `Parcela`, `Baixa`, `Anexo`) sobre o schema multi-filial já existente. Services em `src/server/services/` seguem o padrão estabelecido (`sessao: SessaoAtiva` → `requirePermission` → `requireAlteracaoFilial` → query → `registrarAuditoria`). UI em `src/app/(dashboard)/financeiro/` reaproveita um componente único parametrizado por `tipo: "PAGAR" | "RECEBER"`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7, Zod, Vitest (Postgres real), `@vercel/blob` (anexos), `papaparse` (importação CSV).

**Spec:** `docs/superpowers/specs/2026-08-31-financeiro-titulos-design.md`

## Global Constraints

- Toda escrita: `requirePermission(sessao.perfil, <acao>)` primeiro, depois `requireAlteracaoFilial(sessao.podeAlterarFilial)`, depois a query, terminando com `registrarAuditoria(...)`.
- Leituras recebem o id de escopo direto (`filialId`), não `sessao`.
- `Decimal` do Prisma sempre convertido com `Number(...)` antes de aritmética ou comparação — nunca `!==` direto (causa diffs fantasmas de auditoria, já corrigido uma vez nesta base).
- Isolamento por filial em toda query de leitura/escrita de `Titulo`/`Parcela`/`Baixa`/`Anexo`.
- Sem tratamento especial de violação de unique (P2002) — segue o precedente já estabelecido no repo (erro cru sobe via `mensagemErro()`).
- Testes: Vitest, Postgres real, sem mock — **exceção explícita**: `@vercel/blob` é mockado via `vi.mock` nos testes de `anexo.ts`, porque é um serviço de rede externo (não é o banco de dados, que é o que a política "sem mock" do projeto protege).
- Toda task termina com `npm run test` e `npm run build` limpos, e um commit no estilo do histórico do repo.

---

## Task 1: Schema Prisma — Titulo, Parcela, Baixa, Anexo

**Files:**
- Modify: `prisma/schema.prisma`
- Create: nova pasta de migration em `prisma/migrations/` (gerada pelo Prisma)

**Interfaces:**
- Produces: models `Titulo`, `Parcela`, `Baixa`, `Anexo` e enums `TipoTitulo`, `StatusParcela`, `StatusAprovacaoBaixa`, usados por todas as tasks seguintes.

- [ ] **Step 1: Adicionar os 3 enums e os 4 models ao final de `prisma/schema.prisma`**

```prisma
enum TipoTitulo {
  PAGAR
  RECEBER
}

enum StatusParcela {
  EM_ABERTO
  A_VENCER
  VENCIDO
  PARCIALMENTE_PAGO
  PAGO
  CANCELADO
  RENEGOCIADO
}

enum StatusAprovacaoBaixa {
  PENDENTE
  APROVADO
  REJEITADO
}

model Titulo {
  id                    String     @id @default(uuid())
  filialId              String
  tipo                  TipoTitulo
  fornecedorId          String?
  clienteId             String?
  documento             String
  dataEmissao           DateTime
  dataCompetencia       DateTime
  categoriaFinanceiraId String
  centroCustoId         String?
  centroLucroId         String?
  safraId               String?
  projetoId             String?
  contaBancariaId       String?
  formaPagamento        String?
  ativo                 Boolean    @default(true)
  criadoEm              DateTime   @default(now())
  atualizadoEm          DateTime   @updatedAt

  filial              Filial              @relation(fields: [filialId], references: [id], onDelete: Cascade)
  fornecedor          Fornecedor?         @relation(fields: [fornecedorId], references: [id])
  cliente             Cliente?            @relation(fields: [clienteId], references: [id])
  categoriaFinanceira CategoriaFinanceira @relation(fields: [categoriaFinanceiraId], references: [id])
  centroCusto         CentroCusto?        @relation(fields: [centroCustoId], references: [id])
  centroLucro         CentroLucro?        @relation(fields: [centroLucroId], references: [id])
  safra               Safra?              @relation(fields: [safraId], references: [id])
  projeto             Projeto?            @relation(fields: [projetoId], references: [id])
  contaBancaria       ContaBancaria?      @relation(fields: [contaBancariaId], references: [id])

  parcelas Parcela[]
  anexos   Anexo[]

  @@index([filialId])
  @@index([fornecedorId])
  @@index([clienteId])
  @@map("titulos")
}

model Parcela {
  id              String        @id @default(uuid())
  tituloId        String
  numero          Int
  dataVencimento  DateTime
  valorOriginal   Decimal       @db.Decimal(18, 2)
  valorAtualizado Decimal       @db.Decimal(18, 2)
  status          StatusParcela @default(EM_ABERTO)
  parcelaOrigemId String?
  criadoEm        DateTime      @default(now())
  atualizadoEm    DateTime      @updatedAt

  titulo        Titulo    @relation(fields: [tituloId], references: [id], onDelete: Cascade)
  parcelaOrigem Parcela?  @relation("RenegociacaoParcela", fields: [parcelaOrigemId], references: [id])
  renegociacoes Parcela[] @relation("RenegociacaoParcela")
  baixas        Baixa[]

  @@unique([tituloId, numero])
  @@index([tituloId])
  @@index([status])
  @@map("parcelas")
}

model Baixa {
  id              String               @id @default(uuid())
  parcelaId       String
  data            DateTime
  valorPago       Decimal              @db.Decimal(18, 2)
  valorJuros      Decimal              @default(0) @db.Decimal(18, 2)
  valorMulta      Decimal              @default(0) @db.Decimal(18, 2)
  valorDesconto   Decimal              @default(0) @db.Decimal(18, 2)
  contaBancariaId String
  usuarioId       String
  statusAprovacao StatusAprovacaoBaixa @default(PENDENTE)
  avaliadoPorId   String?
  avaliadoEm      DateTime?
  motivoRejeicao  String?
  criadoEm        DateTime             @default(now())

  parcela       Parcela       @relation(fields: [parcelaId], references: [id], onDelete: Cascade)
  contaBancaria ContaBancaria @relation(fields: [contaBancariaId], references: [id])
  usuario       Usuario       @relation("BaixaRegistradaPor", fields: [usuarioId], references: [id])
  avaliadoPor   Usuario?      @relation("BaixaAvaliadaPor", fields: [avaliadoPorId], references: [id])

  @@index([parcelaId])
  @@map("baixas")
}

model Anexo {
  id           String   @id @default(uuid())
  tituloId     String
  url          String
  nomeArquivo  String
  tamanhoBytes Int
  usuarioId    String
  criadoEm     DateTime @default(now())

  titulo  Titulo  @relation(fields: [tituloId], references: [id], onDelete: Cascade)
  usuario Usuario @relation(fields: [usuarioId], references: [id])

  @@index([tituloId])
  @@map("anexos")
}
```

- [ ] **Step 2: Adicionar os campos reversos nos models existentes**

Em `Filial`, dentro do bloco de relações (junto de `contasBancarias`):
```prisma
  titulos Titulo[]
```

Em `Fornecedor`, `Cliente`, `CategoriaFinanceira`, `CentroCusto`, `CentroLucro`, `Safra`, `Projeto` (cada um recebe uma linha):
```prisma
  titulos Titulo[]
```

Em `ContaBancaria`:
```prisma
  titulos Titulo[]
  baixas  Baixa[]
```

Em `Usuario` (substitui a necessidade de uma única `baixas Baixa[]` — são duas relações nomeadas porque `Baixa` referencia `Usuario` duas vezes):
```prisma
  baixasRegistradas Baixa[] @relation("BaixaRegistradaPor")
  baixasAvaliadas   Baixa[] @relation("BaixaAvaliadaPor")
  anexos            Anexo[]
```

- [ ] **Step 3: Gerar e aplicar a migration**

Run: `npx prisma migrate dev --name add_titulos_parcelas_baixas_anexos`
Expected: migration criada em `prisma/migrations/`, aplicada no banco local sem erro, `prisma generate` roda automaticamente ao final.

- [ ] **Step 4: Verificar que o client gerado tipa os models novos**

Run: `npx tsc --noEmit`
Expected: sem erros (o schema por si só não referencia nada em `src/`, então isso só confirma que o Prisma Client gerado é válido).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Adicionar schema de Titulo, Parcela, Baixa e Anexo"
```

---

## Task 2: RBAC — permissões de título

**Files:**
- Modify: `src/server/auth/permissions.ts`
- Modify: `src/server/auth/permissions.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (schema não é usado aqui).
- Produces: `Acao` estendida com `"titulo:ler" | "titulo:escrever" | "titulo:baixar" | "titulo:aprovar"`; funções `podeEscreverTitulo(perfil, podeAlterarFilial)`, `podeBaixarTitulo(perfil, podeAlterarFilial)`, `podeAprovarBaixa(perfil, podeAlterarFilial)` — usadas pela UI nas Tasks 9-11.

- [ ] **Step 1: Escrever os testes**

Adicionar ao final de `src/server/auth/permissions.test.ts`:

```ts
describe("permissões de título", () => {
  test("FINANCEIRO pode escrever e baixar título, mas não aprovar", () => {
    expect(() => requirePermission("FINANCEIRO", "titulo:escrever")).not.toThrow();
    expect(() => requirePermission("FINANCEIRO", "titulo:baixar")).not.toThrow();
    expect(() => requirePermission("FINANCEIRO", "titulo:aprovar")).toThrow(PermissionError);
  });

  test("TESOURARIA pode baixar e aprovar, mas não cadastrar título", () => {
    expect(() => requirePermission("TESOURARIA", "titulo:baixar")).not.toThrow();
    expect(() => requirePermission("TESOURARIA", "titulo:aprovar")).not.toThrow();
    expect(() => requirePermission("TESOURARIA", "titulo:escrever")).toThrow(PermissionError);
  });

  test("GESTOR, AUDITOR e CONSULTA só leem título", () => {
    for (const perfil of ["GESTOR", "AUDITOR", "CONSULTA"] as const) {
      expect(() => requirePermission(perfil, "titulo:ler")).not.toThrow();
      expect(() => requirePermission(perfil, "titulo:escrever")).toThrow(PermissionError);
      expect(() => requirePermission(perfil, "titulo:baixar")).toThrow(PermissionError);
      expect(() => requirePermission(perfil, "titulo:aprovar")).toThrow(PermissionError);
    }
  });
});

describe("podeBaixarTitulo / podeAprovarBaixa / podeEscreverTitulo", () => {
  test("TESOURARIA com podeAlterarFilial=true pode baixar e aprovar", () => {
    expect(podeBaixarTitulo("TESOURARIA", true)).toBe(true);
    expect(podeAprovarBaixa("TESOURARIA", true)).toBe(true);
  });

  test("TESOURARIA com podeAlterarFilial=false não pode baixar nem aprovar", () => {
    expect(podeBaixarTitulo("TESOURARIA", false)).toBe(false);
    expect(podeAprovarBaixa("TESOURARIA", false)).toBe(false);
  });

  test("FINANCEIRO nunca pode aprovar, mesmo com podeAlterarFilial=true", () => {
    expect(podeAprovarBaixa("FINANCEIRO", true)).toBe(false);
  });

  test("FINANCEIRO com podeAlterarFilial=true pode escrever título", () => {
    expect(podeEscreverTitulo("FINANCEIRO", true)).toBe(true);
  });
});
```

Atualizar o import no topo do arquivo:
```ts
import {
  requirePermission,
  PermissionError,
  podeAlterarFilialAtiva,
  podeEscreverTitulo,
  podeBaixarTitulo,
  podeAprovarBaixa,
} from "./permissions";
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm run test -- permissions.test.ts`
Expected: FAIL — `Acao` não reconhece `"titulo:ler"` etc, e `podeBaixarTitulo`/`podeAprovarBaixa`/`podeEscreverTitulo` não existem.

- [ ] **Step 3: Implementar em `src/server/auth/permissions.ts`**

```ts
export type Acao =
  | "empresa:gerenciar"
  | "usuario:gerenciar"
  | "cadastro:escrever"
  | "cadastro:ler"
  | "auditoria:ler"
  | "filial:gerenciar"
  | "titulo:ler"
  | "titulo:escrever"
  | "titulo:baixar"
  | "titulo:aprovar";
```

Atualizar `PERMISSOES`:
```ts
const PERMISSOES: Record<Perfil, ReadonlySet<Acao> | "TODAS"> = {
  ADMINISTRADOR: "TODAS",
  FINANCEIRO: new Set(["cadastro:escrever", "cadastro:ler", "titulo:ler", "titulo:escrever", "titulo:baixar"]),
  TESOURARIA: new Set(["cadastro:escrever", "cadastro:ler", "titulo:ler", "titulo:baixar", "titulo:aprovar"]),
  GESTOR: new Set(["cadastro:ler", "auditoria:ler", "titulo:ler"]),
  AUDITOR: new Set(["cadastro:ler", "auditoria:ler", "titulo:ler"]),
  CONSULTA: new Set(["cadastro:ler", "titulo:ler"]),
};
```

Adicionar ao final do arquivo:
```ts
export function podeEscreverTitulo(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "titulo:escrever") && podeAlterarFilial;
}

export function podeBaixarTitulo(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "titulo:baixar") && podeAlterarFilial;
}

export function podeAprovarBaixa(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "titulo:aprovar") && podeAlterarFilial;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm run test -- permissions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/permissions.ts src/server/auth/permissions.test.ts
git commit -m "Adicionar permissoes titulo:ler/escrever/baixar/aprovar"
```

---

## Task 3: Fixture de teste compartilhada + enums de UI

**Files:**
- Create: `src/lib/schemas/enums.ts` (modify — adicionar 3 constantes)
- Create: `src/server/services/financeiroTestFixtures.ts`

**Interfaces:**
- Produces: `TIPO_TITULO`, `STATUS_PARCELA`, `STATUS_APROVACAO_BAIXA` (arrays `as const`); `criarFixtureFinanceiro(sufixo, perfil?)` e `limparFixtureFinanceiro(fixture)` — usados pelos testes das Tasks 4 a 8.

Esta task não segue TDD (é infraestrutura de teste, não comportamento de produção) — só precisa compilar e ser exercitada pela Task 4.

- [ ] **Step 1: Adicionar ao final de `src/lib/schemas/enums.ts`**

```ts
export const TIPO_TITULO = ["PAGAR", "RECEBER"] as const;

export const STATUS_PARCELA = [
  "EM_ABERTO",
  "A_VENCER",
  "VENCIDO",
  "PARCIALMENTE_PAGO",
  "PAGO",
  "CANCELADO",
  "RENEGOCIADO",
] as const;

export const STATUS_APROVACAO_BAIXA = ["PENDENTE", "APROVADO", "REJEITADO"] as const;
```

- [ ] **Step 2: Criar `src/server/services/financeiroTestFixtures.ts`**

```ts
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { Perfil } from "@prisma/client";

export type FixtureFinanceiro = {
  empresaId: string;
  filialId: string;
  usuarioId: string;
  usuarioAdminId: string;
  fornecedorId: string;
  clienteId: string;
  categoriaFinanceiraId: string;
  bancoId: string;
  contaBancariaId: string;
  sessao: SessaoAtiva;
  /** Sessão ADMINISTRADOR na mesma filial — usar para "arrange" (criar dados de setup) em testes cujo perfil principal não tem titulo:escrever, como TESOURARIA. */
  sessaoAdmin: SessaoAtiva;
  sessaoSomenteLeitura: SessaoAtiva;
};

export async function criarFixtureFinanceiro(
  sufixo: string,
  perfil: Perfil = "FINANCEIRO",
): Promise<FixtureFinanceiro> {
  const empresa = await prisma.empresa.create({
    data: {
      razaoSocial: `Teste Financeiro ${sufixo} Ltda`,
      nomeFantasia: `Teste Financeiro ${sufixo}`,
      cnpj: `11.111.${sufixo}/0001-11`,
    },
  });

  const filial = await prisma.filial.create({
    data: { empresaId: empresa.id, nome: `Filial ${sufixo}`, cnpj: `11.111.${sufixo}/0001-22` },
  });

  const usuario = await prisma.usuario.create({
    data: { nome: `Usuario ${sufixo}`, email: `financeiro-${sufixo}@teste.local`, senhaHash: "x" },
  });

  const usuarioAdmin = await prisma.usuario.create({
    data: { nome: `Admin ${sufixo}`, email: `admin-${sufixo}@teste.local`, senhaHash: "x" },
  });

  const usuarioEmpresa = await prisma.usuarioEmpresa.create({
    data: { usuarioId: usuario.id, empresaId: empresa.id, perfil, ativo: true },
  });

  const usuarioEmpresaAdmin = await prisma.usuarioEmpresa.create({
    data: { usuarioId: usuarioAdmin.id, empresaId: empresa.id, perfil: "ADMINISTRADOR", ativo: true },
  });

  await prisma.usuarioEmpresaFilial.create({
    data: { usuarioEmpresaId: usuarioEmpresa.id, filialId: filial.id, podeAlterar: true, ativo: true },
  });

  await prisma.usuarioEmpresaFilial.create({
    data: { usuarioEmpresaId: usuarioEmpresaAdmin.id, filialId: filial.id, podeAlterar: true, ativo: true },
  });

  const fornecedor = await prisma.fornecedor.create({
    data: { empresaId: empresa.id, nome: `Fornecedor ${sufixo}`, cnpjCpf: `22.222.${sufixo}/0001-33` },
  });

  const cliente = await prisma.cliente.create({
    data: { empresaId: empresa.id, nome: `Cliente ${sufixo}`, cnpjCpf: `33.333.${sufixo}/0001-44` },
  });

  const categoria = await prisma.categoriaFinanceira.create({
    data: { filialId: filial.id, nome: `Categoria ${sufixo}`, tipo: "DESPESA" },
  });

  const banco = await prisma.banco.create({ data: { codigo: `9${sufixo}`, nome: `Banco ${sufixo}` } });

  const contaBancaria = await prisma.contaBancaria.create({
    data: { filialId: filial.id, bancoId: banco.id, agencia: "0001", conta: `${sufixo}-1`, saldoInicial: 0 },
  });

  const sessao: SessaoAtiva = {
    usuarioId: usuario.id,
    nome: usuario.nome,
    empresaId: empresa.id,
    perfil,
    filialId: filial.id,
    podeAlterarFilial: true,
  };

  const sessaoAdmin: SessaoAtiva = {
    usuarioId: usuarioAdmin.id,
    nome: usuarioAdmin.nome,
    empresaId: empresa.id,
    perfil: "ADMINISTRADOR",
    filialId: filial.id,
    podeAlterarFilial: true,
  };

  return {
    empresaId: empresa.id,
    filialId: filial.id,
    usuarioId: usuario.id,
    usuarioAdminId: usuarioAdmin.id,
    fornecedorId: fornecedor.id,
    clienteId: cliente.id,
    categoriaFinanceiraId: categoria.id,
    bancoId: banco.id,
    contaBancariaId: contaBancaria.id,
    sessao,
    sessaoAdmin,
    sessaoSomenteLeitura: { ...sessao, podeAlterarFilial: false },
  };
}

export async function limparFixtureFinanceiro(fixture: FixtureFinanceiro): Promise<void> {
  await prisma.anexo.deleteMany({ where: { titulo: { filialId: fixture.filialId } } });
  await prisma.baixa.deleteMany({ where: { parcela: { titulo: { filialId: fixture.filialId } } } });
  await prisma.parcela.deleteMany({ where: { titulo: { filialId: fixture.filialId } } });
  await prisma.titulo.deleteMany({ where: { filialId: fixture.filialId } });
  await prisma.auditLog.deleteMany({ where: { filialId: fixture.filialId } });
  await prisma.contaBancaria.deleteMany({ where: { filialId: fixture.filialId } });
  await prisma.banco.delete({ where: { id: fixture.bancoId } });
  await prisma.categoriaFinanceira.deleteMany({ where: { filialId: fixture.filialId } });
  await prisma.fornecedor.deleteMany({ where: { empresaId: fixture.empresaId } });
  await prisma.cliente.deleteMany({ where: { empresaId: fixture.empresaId } });
  await prisma.usuarioEmpresaFilial.deleteMany({ where: { filialId: fixture.filialId } });
  await prisma.usuarioEmpresa.deleteMany({ where: { empresaId: fixture.empresaId } });
  await prisma.usuario.delete({ where: { id: fixture.usuarioId } });
  await prisma.usuario.delete({ where: { id: fixture.usuarioAdminId } });
  await prisma.filial.deleteMany({ where: { empresaId: fixture.empresaId } });
  await prisma.empresa.delete({ where: { id: fixture.empresaId } });
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/schemas/enums.ts src/server/services/financeiroTestFixtures.ts
git commit -m "Adicionar enums de titulo e fixture de teste compartilhada do financeiro"
```

---

## Task 4: Status de parcela — função pura + persistência

**Files:**
- Create: `src/server/services/parcela.ts`
- Test: `src/server/services/parcela.test.ts`

**Interfaces:**
- Consumes: `criarFixtureFinanceiro`/`limparFixtureFinanceiro` (Task 3) só no teste de `recalcularEPersistirStatusParcela`.
- Produces: `calcularStatusParcela(parcela, baixasAprovadas, hoje): StatusParcela` (função pura); `recalcularEPersistirStatusParcela(parcelaId: string): Promise<StatusParcela>` — usadas por Tasks 5 e 6.

- [ ] **Step 1: Escrever os testes da função pura**

Criar `src/server/services/parcela.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { calcularStatusParcela } from "./parcela";

const HOJE = new Date("2026-08-31T12:00:00Z");

function parcela(overrides: Partial<{ valorAtualizado: number; dataVencimento: Date; status: "EM_ABERTO" | "CANCELADO" | "RENEGOCIADO" }> = {}) {
  return {
    valorAtualizado: 1000,
    dataVencimento: new Date("2026-09-30T00:00:00Z"),
    status: "EM_ABERTO" as const,
    ...overrides,
  };
}

describe("calcularStatusParcela", () => {
  test("saldo zerado por baixas aprovadas = PAGO", () => {
    const status = calcularStatusParcela(parcela(), [{ valorPago: 1000 }], HOJE);
    expect(status).toBe("PAGO");
  });

  test("saldo negativo (pagou a mais) também = PAGO", () => {
    const status = calcularStatusParcela(parcela(), [{ valorPago: 1200 }], HOJE);
    expect(status).toBe("PAGO");
  });

  test("baixa parcial = PARCIALMENTE_PAGO", () => {
    const status = calcularStatusParcela(parcela(), [{ valorPago: 400 }], HOJE);
    expect(status).toBe("PARCIALMENTE_PAGO");
  });

  test("vencimento no passado, sem baixa = VENCIDO", () => {
    const status = calcularStatusParcela(
      parcela({ dataVencimento: new Date("2026-08-01T00:00:00Z") }),
      [],
      HOJE,
    );
    expect(status).toBe("VENCIDO");
  });

  test("vencimento em 5 dias, sem baixa = A_VENCER", () => {
    const status = calcularStatusParcela(
      parcela({ dataVencimento: new Date("2026-09-05T12:00:00Z") }),
      [],
      HOJE,
    );
    expect(status).toBe("A_VENCER");
  });

  test("vencimento em exatamente 7 dias = A_VENCER (borda inclusiva)", () => {
    const status = calcularStatusParcela(
      parcela({ dataVencimento: new Date("2026-09-07T12:00:00Z") }),
      [],
      HOJE,
    );
    expect(status).toBe("A_VENCER");
  });

  test("vencimento em 8 dias = EM_ABERTO", () => {
    const status = calcularStatusParcela(
      parcela({ dataVencimento: new Date("2026-09-08T12:00:01Z") }),
      [],
      HOJE,
    );
    expect(status).toBe("EM_ABERTO");
  });

  test("CANCELADO nunca é sobrescrito, mesmo com saldo zerado", () => {
    const status = calcularStatusParcela(parcela({ status: "CANCELADO" }), [{ valorPago: 1000 }], HOJE);
    expect(status).toBe("CANCELADO");
  });

  test("RENEGOCIADO nunca é sobrescrito, mesmo vencido", () => {
    const status = calcularStatusParcela(
      parcela({ status: "RENEGOCIADO", dataVencimento: new Date("2026-01-01T00:00:00Z") }),
      [],
      HOJE,
    );
    expect(status).toBe("RENEGOCIADO");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm run test -- parcela.test.ts`
Expected: FAIL — módulo `./parcela` não existe.

- [ ] **Step 3: Implementar a função pura em `src/server/services/parcela.ts`**

```ts
import { prisma } from "@/server/db/client";
import type { StatusParcela } from "@prisma/client";

export type ParcelaParaStatus = {
  valorAtualizado: number;
  dataVencimento: Date;
  status: StatusParcela;
};

export type BaixaAprovadaParaStatus = {
  valorPago: number;
};

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

export function calcularStatusParcela(
  parcela: ParcelaParaStatus,
  baixasAprovadas: BaixaAprovadaParaStatus[],
  hoje: Date,
): StatusParcela {
  if (parcela.status === "CANCELADO" || parcela.status === "RENEGOCIADO") {
    return parcela.status;
  }

  const totalPago = baixasAprovadas.reduce((soma, baixa) => soma + baixa.valorPago, 0);
  const saldo = parcela.valorAtualizado - totalPago;

  if (saldo <= 0) return "PAGO";
  if (saldo < parcela.valorAtualizado) return "PARCIALMENTE_PAGO";

  const msAteVencimento = parcela.dataVencimento.getTime() - hoje.getTime();
  if (msAteVencimento < 0) return "VENCIDO";
  if (msAteVencimento <= SETE_DIAS_MS) return "A_VENCER";
  return "EM_ABERTO";
}

export async function recalcularEPersistirStatusParcela(parcelaId: string): Promise<StatusParcela> {
  const parcela = await prisma.parcela.findUniqueOrThrow({
    where: { id: parcelaId },
    include: { baixas: true },
  });

  const baixasAprovadas = parcela.baixas
    .filter((baixa) => baixa.statusAprovacao === "APROVADO")
    .map((baixa) => ({ valorPago: Number(baixa.valorPago) }));

  const statusCalculado = calcularStatusParcela(
    {
      valorAtualizado: Number(parcela.valorAtualizado),
      dataVencimento: parcela.dataVencimento,
      status: parcela.status,
    },
    baixasAprovadas,
    new Date(),
  );

  if (statusCalculado === parcela.status) {
    return parcela.status;
  }

  await prisma.parcela.update({ where: { id: parcelaId }, data: { status: statusCalculado } });
  return statusCalculado;
}
```

- [ ] **Step 4: Rodar e confirmar que os testes da função pura passam**

Run: `npm run test -- parcela.test.ts`
Expected: PASS (9 testes)

- [ ] **Step 5: Escrever e rodar o teste de `recalcularEPersistirStatusParcela` (integração)**

Adicionar ao final de `src/server/services/parcela.test.ts`:

```ts
import { afterAll, beforeAll } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { recalcularEPersistirStatusParcela } from "./parcela";

describe("recalcularEPersistirStatusParcela (integração)", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("PARC");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("aprovar uma baixa e recalcular muda o status persistido para PAGO", async () => {
    const titulo = await prisma.titulo.create({
      data: {
        filialId: fixture.filialId,
        tipo: "PAGAR",
        fornecedorId: fixture.fornecedorId,
        documento: "NF-1",
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        parcelas: {
          create: { numero: 1, dataVencimento: new Date(), valorOriginal: 500, valorAtualizado: 500 },
        },
      },
      include: { parcelas: true },
    });
    const parcelaId = titulo.parcelas[0].id;

    await prisma.baixa.create({
      data: {
        parcelaId,
        data: new Date(),
        valorPago: 500,
        contaBancariaId: fixture.contaBancariaId,
        usuarioId: fixture.usuarioId,
        statusAprovacao: "APROVADO",
      },
    });

    const status = await recalcularEPersistirStatusParcela(parcelaId);
    expect(status).toBe("PAGO");

    const parcelaAtualizada = await prisma.parcela.findUniqueOrThrow({ where: { id: parcelaId } });
    expect(parcelaAtualizada.status).toBe("PAGO");
  });
});
```

Run: `npm run test -- parcela.test.ts`
Expected: PASS (10 testes)

- [ ] **Step 6: Commit**

```bash
git add src/server/services/parcela.ts src/server/services/parcela.test.ts
git commit -m "Adicionar calculo e persistencia de status de parcela"
```

---

## Task 5: Titulo — schema Zod + service + suporte a transação

**Files:**
- Create: `src/lib/schemas/titulo.ts`
- Modify: `src/server/audit/registrar.ts` (adicionar suporte a client transacional)
- Create: `src/server/services/titulo.ts`
- Test: `src/server/services/titulo.test.ts`

**Interfaces:**
- Consumes: `recalcularEPersistirStatusParcela` (Task 4); `criarFixtureFinanceiro`/`limparFixtureFinanceiro` (Task 3).
- Produces: `criarTitulo(sessao, tipo, dados, db?)`, `atualizarTitulo(sessao, id, dados)`, `listarTitulos(filialId, tipo)`, `alterarVencimentoParcela(sessao, parcelaId, novoVencimento)`, `cancelarParcela(sessao, parcelaId)`; tipo exportado `ClientePrisma` de `registrar.ts` — usados pela Task 8 (importação) e pelas actions da Task 9.

- [ ] **Step 1: Criar o schema Zod em `src/lib/schemas/titulo.ts`**

```ts
import { z } from "zod";

const parcelaInputSchema = z.object({
  numero: z.coerce.number().int().min(1),
  dataVencimento: z.coerce.date(),
  valorOriginal: z.coerce.number().positive("Informe um valor maior que zero"),
});

const camposComuns = {
  contraparteId: z.string().trim().min(1, "Selecione o fornecedor/cliente"),
  documento: z.string().trim().min(1, "Informe o documento"),
  dataEmissao: z.coerce.date(),
  dataCompetencia: z.coerce.date(),
  categoriaFinanceiraId: z.string().trim().min(1, "Selecione a categoria financeira"),
  centroCustoId: z.string().trim().optional().or(z.literal("")),
  centroLucroId: z.string().trim().optional().or(z.literal("")),
  safraId: z.string().trim().optional().or(z.literal("")),
  projetoId: z.string().trim().optional().or(z.literal("")),
  contaBancariaId: z.string().trim().optional().or(z.literal("")),
  formaPagamento: z.string().trim().optional().or(z.literal("")),
};

export const tituloHeaderSchema = z.object(camposComuns);
export type TituloHeaderFormValues = z.infer<typeof tituloHeaderSchema>;

export const tituloSchema = tituloHeaderSchema.extend({
  parcelas: z.array(parcelaInputSchema).min(1, "Informe ao menos uma parcela"),
});
export type TituloFormValues = z.infer<typeof tituloSchema>;
export type ParcelaInput = z.infer<typeof parcelaInputSchema>;
```

- [ ] **Step 2: Adicionar suporte a client transacional em `src/server/audit/registrar.ts`**

Isso é necessário porque a Task 8 (importação CSV) precisa que `criarTitulo` + `registrarAuditoria` rodem dentro da mesma `$transaction` — sem isso, uma importação "tudo-ou-nada" deixaria `AuditLog` órfãos se uma linha no meio falhasse e a transação revertesse só as tabelas de negócio.

Substituir o conteúdo de `src/server/audit/registrar.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { buildAuditDiff } from "./diff";

export type ClientePrisma = Prisma.TransactionClient | typeof prisma;

export type RegistrarAuditoriaParams = {
  empresaId: string | null;
  filialId: string | null;
  usuarioId: string | null;
  entidade: string;
  entidadeId: string;
  acao: string;
  anterior: Record<string, unknown> | null;
  novo: Record<string, unknown> | null;
};

export async function registrarAuditoria(
  params: RegistrarAuditoriaParams,
  db: ClientePrisma = prisma,
): Promise<void> {
  const { valorAnterior, valorNovo } = buildAuditDiff(params.anterior, params.novo);

  await db.auditLog.create({
    data: {
      empresaId: params.empresaId,
      filialId: params.filialId,
      usuarioId: params.usuarioId,
      entidade: params.entidade,
      entidadeId: params.entidadeId,
      acao: params.acao,
      valorAnterior: (valorAnterior ?? undefined) as Prisma.InputJsonValue | undefined,
      valorNovo: (valorNovo ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
```

Run: `npm run test`
Expected: PASS — mudança é retrocompatível (parâmetro `db` tem default `prisma`), nenhum chamador existente precisa mudar.

- [ ] **Step 3: Escrever os testes de `titulo.ts`**

Criar `src/server/services/titulo.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { FilialSomenteLeituraError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo, atualizarTitulo, listarTitulos, alterarVencimentoParcela, cancelarParcela } from "./titulo";

describe("titulo (filial-scoped)", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("TIT");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("cria um titulo PAGAR com uma parcela", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-100",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 1000 }],
    });

    expect(titulo.fornecedorId).toBe(fixture.fornecedorId);
    expect(titulo.clienteId).toBeNull();
    expect(titulo.parcelas).toHaveLength(1);
  });

  test("cria um titulo RECEBER vinculado a cliente, não a fornecedor", async () => {
    const titulo = await criarTitulo(fixture.sessao, "RECEBER", {
      contraparteId: fixture.clienteId,
      documento: "NF-200",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 800 }],
    });

    expect(titulo.clienteId).toBe(fixture.clienteId);
    expect(titulo.fornecedorId).toBeNull();
  });

  test("bloqueia criação quando a filial está em modo somente leitura", async () => {
    await expect(
      criarTitulo(fixture.sessaoSomenteLeitura, "PAGAR", {
        contraparteId: fixture.fornecedorId,
        documento: "NF-BLOQUEADO",
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        centroCustoId: "",
        centroLucroId: "",
        safraId: "",
        projetoId: "",
        contaBancariaId: "",
        formaPagamento: "",
        parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
      }),
    ).rejects.toThrow(FilialSomenteLeituraError);
  });

  test("atualiza os dados de cabeçalho sem alterar as parcelas", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-EDITAR",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const atualizado = await atualizarTitulo(fixture.sessao, titulo.id, {
      contraparteId: fixture.fornecedorId,
      documento: "NF-EDITADA",
      dataEmissao: titulo.dataEmissao,
      dataCompetencia: titulo.dataCompetencia,
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
    });

    expect(atualizado.documento).toBe("NF-EDITADA");
  });

  test("altera vencimento de parcela e recalcula status", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-VENC",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date("2020-01-01"), valorOriginal: 100 }],
    });

    await alterarVencimentoParcela(fixture.sessao, titulo.parcelas[0].id, new Date("2099-01-01"));

    const parcela = await prisma.parcela.findUniqueOrThrow({ where: { id: titulo.parcelas[0].id } });
    expect(parcela.dataVencimento.getFullYear()).toBe(2099);
    expect(parcela.status).not.toBe("VENCIDO");
  });

  test("cancela uma parcela", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-CANCELAR",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const cancelada = await cancelarParcela(fixture.sessao, titulo.parcelas[0].id);
    expect(cancelada.status).toBe("CANCELADO");
  });

  test("listarTitulos filtra por tipo", async () => {
    const titulos = await listarTitulos(fixture.filialId, "PAGAR");
    expect(titulos.every((titulo) => titulo.tipo === "PAGAR")).toBe(true);
  });

  test("listarTitulos isola por filial — título de uma filial irmã não aparece", async () => {
    const filialIrma = await prisma.filial.create({
      data: { empresaId: fixture.empresaId, nome: "Filial Irma TIT", cnpj: "11.111.TIT/0001-99" },
    });
    const sessaoFilialIrma: typeof fixture.sessao = { ...fixture.sessaoAdmin, filialId: filialIrma.id };

    const tituloNaIrma = await criarTitulo(sessaoFilialIrma, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-FILIAL-IRMA",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const titulosDaFixture = await listarTitulos(fixture.filialId, "PAGAR");
    expect(titulosDaFixture.find((titulo) => titulo.id === tituloNaIrma.id)).toBeUndefined();

    await prisma.parcela.deleteMany({ where: { tituloId: tituloNaIrma.id } });
    await prisma.titulo.delete({ where: { id: tituloNaIrma.id } });
    await prisma.auditLog.deleteMany({ where: { filialId: filialIrma.id } });
    await prisma.filial.delete({ where: { id: filialIrma.id } });
  });
});
```

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `npm run test -- titulo.test.ts`
Expected: FAIL — módulo `./titulo` não existe.

- [ ] **Step 5: Implementar `src/server/services/titulo.ts`**

```ts
import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria, type ClientePrisma } from "@/server/audit/registrar";
import { recalcularEPersistirStatusParcela } from "@/server/services/parcela";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { TipoTitulo } from "@prisma/client";
import type { TituloFormValues, TituloHeaderFormValues } from "@/lib/schemas/titulo";

function contraparteCampo(tipo: TipoTitulo, contraparteId: string) {
  return tipo === "PAGAR"
    ? { fornecedorId: contraparteId, clienteId: null }
    : { fornecedorId: null, clienteId: contraparteId };
}

function normalizarOpcional(valor: string | undefined): string | null {
  return valor && valor.length > 0 ? valor : null;
}

export async function listarTitulos(filialId: string, tipo: TipoTitulo) {
  const titulos = await prisma.titulo.findMany({
    where: { filialId, tipo },
    include: {
      fornecedor: true,
      cliente: true,
      categoriaFinanceira: true,
      parcelas: { include: { baixas: true }, orderBy: { numero: "asc" } },
    },
    orderBy: { criadoEm: "desc" },
  });

  for (const titulo of titulos) {
    for (const parcela of titulo.parcelas) {
      parcela.status = await recalcularEPersistirStatusParcela(parcela.id);
    }
  }

  return titulos;
}

export async function criarTitulo(
  sessao: SessaoAtiva,
  tipo: TipoTitulo,
  dados: TituloFormValues,
  db: ClientePrisma = prisma,
) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const titulo = await db.titulo.create({
    data: {
      filialId: sessao.filialId,
      tipo,
      ...contraparteCampo(tipo, dados.contraparteId),
      documento: dados.documento,
      dataEmissao: dados.dataEmissao,
      dataCompetencia: dados.dataCompetencia,
      categoriaFinanceiraId: dados.categoriaFinanceiraId,
      centroCustoId: normalizarOpcional(dados.centroCustoId),
      centroLucroId: normalizarOpcional(dados.centroLucroId),
      safraId: normalizarOpcional(dados.safraId),
      projetoId: normalizarOpcional(dados.projetoId),
      contaBancariaId: normalizarOpcional(dados.contaBancariaId),
      formaPagamento: normalizarOpcional(dados.formaPagamento),
      parcelas: {
        create: dados.parcelas.map((parcela) => ({
          numero: parcela.numero,
          dataVencimento: parcela.dataVencimento,
          valorOriginal: parcela.valorOriginal,
          valorAtualizado: parcela.valorOriginal,
        })),
      },
    },
    include: { parcelas: true },
  });

  await registrarAuditoria(
    {
      empresaId: sessao.empresaId,
      filialId: sessao.filialId,
      usuarioId: sessao.usuarioId,
      entidade: "Titulo",
      entidadeId: titulo.id,
      acao: "CRIAR",
      anterior: null,
      novo: { tipo, documento: dados.documento, parcelas: titulo.parcelas.length },
    },
    db,
  );

  return titulo;
}

export async function atualizarTitulo(sessao: SessaoAtiva, id: string, dados: TituloHeaderFormValues) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.titulo.findUniqueOrThrow({ where: { id, filialId: sessao.filialId } });

  const titulo = await prisma.titulo.update({
    where: { id },
    data: {
      ...contraparteCampo(anterior.tipo, dados.contraparteId),
      documento: dados.documento,
      dataEmissao: dados.dataEmissao,
      dataCompetencia: dados.dataCompetencia,
      categoriaFinanceiraId: dados.categoriaFinanceiraId,
      centroCustoId: normalizarOpcional(dados.centroCustoId),
      centroLucroId: normalizarOpcional(dados.centroLucroId),
      safraId: normalizarOpcional(dados.safraId),
      projetoId: normalizarOpcional(dados.projetoId),
      contaBancariaId: normalizarOpcional(dados.contaBancariaId),
      formaPagamento: normalizarOpcional(dados.formaPagamento),
    },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Titulo",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: {
      documento: anterior.documento,
      dataEmissao: anterior.dataEmissao,
      dataCompetencia: anterior.dataCompetencia,
      categoriaFinanceiraId: anterior.categoriaFinanceiraId,
      centroCustoId: anterior.centroCustoId,
      centroLucroId: anterior.centroLucroId,
      safraId: anterior.safraId,
      projetoId: anterior.projetoId,
      contaBancariaId: anterior.contaBancariaId,
      formaPagamento: anterior.formaPagamento,
    },
    novo: dados,
  });

  return titulo;
}

export async function alterarVencimentoParcela(sessao: SessaoAtiva, parcelaId: string, novoVencimento: Date) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.parcela.findFirstOrThrow({
    where: { id: parcelaId, titulo: { filialId: sessao.filialId } },
  });

  await prisma.parcela.update({ where: { id: parcelaId }, data: { dataVencimento: novoVencimento } });
  await recalcularEPersistirStatusParcela(parcelaId);

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Parcela",
    entidadeId: parcelaId,
    acao: "ATUALIZAR",
    anterior: { dataVencimento: anterior.dataVencimento },
    novo: { dataVencimento: novoVencimento },
  });
}

export async function cancelarParcela(sessao: SessaoAtiva, parcelaId: string) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.parcela.findFirstOrThrow({
    where: { id: parcelaId, titulo: { filialId: sessao.filialId } },
  });
  const parcela = await prisma.parcela.update({ where: { id: parcelaId }, data: { status: "CANCELADO" } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Parcela",
    entidadeId: parcelaId,
    acao: "CANCELAR",
    anterior: { status: anterior.status },
    novo: { status: "CANCELADO" },
  });

  return parcela;
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npm run test -- titulo.test.ts`
Expected: PASS (7 testes)

- [ ] **Step 7: Commit**

```bash
git add src/lib/schemas/titulo.ts src/server/audit/registrar.ts src/server/services/titulo.ts src/server/services/titulo.test.ts
git commit -m "Adicionar CRUD de Titulo (Pagar/Receber) com suporte a transacao na auditoria"
```

---

## Task 6: Baixa — schema Zod + service (registrar/aprovar/rejeitar)

**Files:**
- Create: `src/lib/schemas/baixa.ts`
- Create: `src/server/services/baixa.ts`
- Test: `src/server/services/baixa.test.ts`

**Interfaces:**
- Consumes: `recalcularEPersistirStatusParcela` (Task 4); `criarFixtureFinanceiro` (Task 3); `criarTitulo` (Task 5, só no setup do teste).
- Produces: `registrarBaixa`, `aprovarBaixa`, `rejeitarBaixa`, `listarBaixasPendentes(filialId)` — usadas pela Task 10.

- [ ] **Step 1: Criar o schema em `src/lib/schemas/baixa.ts`**

```ts
import { z } from "zod";

export const baixaSchema = z.object({
  data: z.coerce.date(),
  valorPago: z.coerce.number().positive("Informe um valor maior que zero"),
  valorJuros: z.coerce.number().min(0).default(0),
  valorMulta: z.coerce.number().min(0).default(0),
  valorDesconto: z.coerce.number().min(0).default(0),
  contaBancariaId: z.string().trim().min(1, "Selecione a conta bancária"),
});
export type BaixaFormValues = z.infer<typeof baixaSchema>;

export const rejeicaoBaixaSchema = z.object({
  motivo: z.string().trim().min(3, "Informe o motivo da rejeição"),
});
export type RejeicaoBaixaFormValues = z.infer<typeof rejeicaoBaixaSchema>;
```

- [ ] **Step 2: Escrever os testes de `baixa.ts`**

Criar `src/server/services/baixa.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import { registrarBaixa, aprovarBaixa, rejeitarBaixa, listarBaixasPendentes } from "./baixa";

describe("baixa (fluxo de aprovação)", () => {
  let fixture: FixtureFinanceiro; // perfil FINANCEIRO: pode registrar baixa, não aprovar
  let fixtureTesouraria: FixtureFinanceiro; // perfil TESOURARIA: pode aprovar

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("BXF");
    fixtureTesouraria = await criarFixtureFinanceiro("BXT", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await limparFixtureFinanceiro(fixtureTesouraria);
    await prisma.$disconnect();
  });

  async function criarParcelaDeTeste(fx: FixtureFinanceiro, valor: number) {
    // Usa sessaoAdmin (não fx.sessao) porque fixtureTesouraria não tem titulo:escrever —
    // este helper só monta dados de setup, não é o que está sendo testado.
    const titulo = await criarTitulo(fx.sessaoAdmin, "PAGAR", {
      contraparteId: fx.fornecedorId,
      documento: `NF-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fx.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fx.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: valor }],
    });
    return titulo.parcelas[0];
  }

  test("baixa pendente não altera o status da parcela", async () => {
    const parcela = await criarParcelaDeTeste(fixture, 100);
    await registrarBaixa(fixture.sessao, parcela.id, {
      data: new Date(),
      valorPago: 100,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });

    const parcelaAposBaixa = await prisma.parcela.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(parcelaAposBaixa.status).not.toBe("PAGO");
  });

  test("aprovar a baixa recalcula o status da parcela para PAGO", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 200);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 200,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    await aprovarBaixa(fixtureTesouraria.sessao, baixa.id);

    const parcelaAprovada = await prisma.parcela.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(parcelaAprovada.status).toBe("PAGO");
  });

  test("rejeitar a baixa não altera o status nem o saldo, e grava o motivo", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 300);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 300,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    const rejeitada = await rejeitarBaixa(fixtureTesouraria.sessao, baixa.id, "Comprovante ilegível");
    expect(rejeitada.motivoRejeicao).toBe("Comprovante ilegível");

    const parcelaAposRejeicao = await prisma.parcela.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(parcelaAposRejeicao.status).not.toBe("PAGO");
  });

  test("perfil sem titulo:aprovar não consegue aprovar", async () => {
    const parcela = await criarParcelaDeTeste(fixture, 50);
    const baixa = await registrarBaixa(fixture.sessao, parcela.id, {
      data: new Date(),
      valorPago: 50,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });

    await expect(aprovarBaixa(fixture.sessao, baixa.id)).rejects.toThrow(PermissionError);
  });

  test("listarBaixasPendentes só retorna baixas PENDENTE da filial", async () => {
    const pendentes = await listarBaixasPendentes(fixtureTesouraria.filialId);
    expect(pendentes.every((baixa) => baixa.statusAprovacao === "PENDENTE")).toBe(true);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm run test -- baixa.test.ts`
Expected: FAIL — módulo `./baixa` não existe.

- [ ] **Step 4: Implementar `src/server/services/baixa.ts`**

```ts
import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import { recalcularEPersistirStatusParcela } from "@/server/services/parcela";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { BaixaFormValues } from "@/lib/schemas/baixa";

async function buscarParcelaDaFilial(filialId: string, parcelaId: string) {
  return prisma.parcela.findFirstOrThrow({ where: { id: parcelaId, titulo: { filialId } } });
}

async function buscarBaixaDaFilial(filialId: string, baixaId: string) {
  return prisma.baixa.findFirstOrThrow({ where: { id: baixaId, parcela: { titulo: { filialId } } } });
}

export async function listarBaixasPendentes(filialId: string) {
  return prisma.baixa.findMany({
    where: { statusAprovacao: "PENDENTE", parcela: { titulo: { filialId } } },
    include: {
      parcela: { include: { titulo: { include: { fornecedor: true, cliente: true } } } },
      contaBancaria: true,
      usuario: true,
    },
    orderBy: { criadoEm: "asc" },
  });
}

export async function registrarBaixa(sessao: SessaoAtiva, parcelaId: string, dados: BaixaFormValues) {
  requirePermission(sessao.perfil, "titulo:baixar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await buscarParcelaDaFilial(sessao.filialId, parcelaId);

  const baixa = await prisma.baixa.create({
    data: {
      parcelaId,
      data: dados.data,
      valorPago: dados.valorPago,
      valorJuros: dados.valorJuros,
      valorMulta: dados.valorMulta,
      valorDesconto: dados.valorDesconto,
      contaBancariaId: dados.contaBancariaId,
      usuarioId: sessao.usuarioId,
      statusAprovacao: "PENDENTE",
    },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Baixa",
    entidadeId: baixa.id,
    acao: "CRIAR",
    anterior: null,
    novo: { parcelaId, valorPago: dados.valorPago, statusAprovacao: "PENDENTE" },
  });

  return baixa;
}

export async function aprovarBaixa(sessao: SessaoAtiva, baixaId: string) {
  requirePermission(sessao.perfil, "titulo:aprovar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await buscarBaixaDaFilial(sessao.filialId, baixaId);

  const baixa = await prisma.baixa.update({
    where: { id: baixaId },
    data: { statusAprovacao: "APROVADO", avaliadoPorId: sessao.usuarioId, avaliadoEm: new Date() },
  });
  await recalcularEPersistirStatusParcela(anterior.parcelaId);

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Baixa",
    entidadeId: baixaId,
    acao: "APROVAR",
    anterior: { statusAprovacao: anterior.statusAprovacao },
    novo: { statusAprovacao: "APROVADO" },
  });

  return baixa;
}

export async function rejeitarBaixa(sessao: SessaoAtiva, baixaId: string, motivo: string) {
  requirePermission(sessao.perfil, "titulo:aprovar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await buscarBaixaDaFilial(sessao.filialId, baixaId);

  const baixa = await prisma.baixa.update({
    where: { id: baixaId },
    data: {
      statusAprovacao: "REJEITADO",
      avaliadoPorId: sessao.usuarioId,
      avaliadoEm: new Date(),
      motivoRejeicao: motivo,
    },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Baixa",
    entidadeId: baixaId,
    acao: "REJEITAR",
    anterior: { statusAprovacao: anterior.statusAprovacao },
    novo: { statusAprovacao: "REJEITADO", motivoRejeicao: motivo },
  });

  return baixa;
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm run test -- baixa.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas/baixa.ts src/server/services/baixa.ts src/server/services/baixa.test.ts
git commit -m "Adicionar fluxo de baixa e aprovacao de parcela"
```

---

## Task 7: Renegociação

**Files:**
- Create: `src/server/services/renegociacao.ts`
- Test: `src/server/services/renegociacao.test.ts`

**Interfaces:**
- Consumes: `criarFixtureFinanceiro` (Task 3), `criarTitulo` (Task 5).
- Produces: `renegociarParcela(sessao, parcelaId, novasParcelas)` — usada pela Task 11.

- [ ] **Step 1: Escrever os testes**

Criar `src/server/services/renegociacao.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import { renegociarParcela } from "./renegociacao";

describe("renegociarParcela", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("RENEG");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("marca a parcela original como RENEGOCIADO e cria novas parcelas linkadas", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-RENEG",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date("2020-01-01"), valorOriginal: 1000 }],
    });
    const original = titulo.parcelas[0];

    const novas = await renegociarParcela(fixture.sessao, original.id, [
      { dataVencimento: new Date("2099-01-01"), valorOriginal: 500 },
      { dataVencimento: new Date("2099-02-01"), valorOriginal: 500 },
    ]);

    expect(novas).toHaveLength(2);
    expect(novas.every((parcela) => parcela.parcelaOrigemId === original.id)).toBe(true);
    expect(novas.map((parcela) => parcela.numero)).toEqual([2, 3]);

    const originalAtualizada = await prisma.parcela.findUniqueOrThrow({ where: { id: original.id } });
    expect(originalAtualizada.status).toBe("RENEGOCIADO");
  });

  test("rejeita renegociação sem nenhuma parcela nova", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-RENEG-VAZIO",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    await expect(renegociarParcela(fixture.sessao, titulo.parcelas[0].id, [])).rejects.toThrow(
      "Informe ao menos uma nova parcela",
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm run test -- renegociacao.test.ts`
Expected: FAIL — módulo `./renegociacao` não existe.

- [ ] **Step 3: Implementar `src/server/services/renegociacao.ts`**

```ts
import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";

export type NovaParcelaRenegociacao = {
  dataVencimento: Date;
  valorOriginal: number;
};

export async function renegociarParcela(
  sessao: SessaoAtiva,
  parcelaId: string,
  novasParcelas: NovaParcelaRenegociacao[],
) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  if (novasParcelas.length === 0) {
    throw new Error("Informe ao menos uma nova parcela para a renegociação");
  }

  const original = await prisma.parcela.findFirstOrThrow({
    where: { id: parcelaId, titulo: { filialId: sessao.filialId } },
  });

  const ultimoNumero = await prisma.parcela.aggregate({
    where: { tituloId: original.tituloId },
    _max: { numero: true },
  });
  let proximoNumero = (ultimoNumero._max.numero ?? 0) + 1;

  const [, ...criadas] = await prisma.$transaction([
    prisma.parcela.update({ where: { id: parcelaId }, data: { status: "RENEGOCIADO" } }),
    ...novasParcelas.map((nova) =>
      prisma.parcela.create({
        data: {
          tituloId: original.tituloId,
          numero: proximoNumero++,
          dataVencimento: nova.dataVencimento,
          valorOriginal: nova.valorOriginal,
          valorAtualizado: nova.valorOriginal,
          parcelaOrigemId: parcelaId,
        },
      }),
    ),
  ]);

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Parcela",
    entidadeId: parcelaId,
    acao: "RENEGOCIAR",
    anterior: { status: original.status },
    novo: { status: "RENEGOCIADO", novasParcelas: criadas.map((parcela) => parcela.id) },
  });

  return criadas;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm run test -- renegociacao.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/server/services/renegociacao.ts src/server/services/renegociacao.test.ts
git commit -m "Adicionar renegociacao de parcela"
```

---

## Task 8: Anexos (Vercel Blob)

**Files:**
- Modify: `package.json` (dependência `@vercel/blob`)
- Create: `src/server/services/anexo.ts`
- Test: `src/server/services/anexo.test.ts`

**Interfaces:**
- Consumes: `criarFixtureFinanceiro` (Task 3), `criarTitulo` (Task 5).
- Produces: `listarAnexos(tituloId)`, `adicionarAnexo(sessao, tituloId, arquivo)`, `removerAnexo(sessao, anexoId)` — usadas pela Task 11.

- [ ] **Step 1: Instalar a dependência**

Run: `npm install @vercel/blob`
Expected: adicionado em `dependencies` no `package.json`.

- [ ] **Step 2: Escrever os testes (com `@vercel/blob` mockado)**

Criar `src/server/services/anexo.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string) => ({ url: `https://blob.test/${pathname}` })),
  del: vi.fn(async () => undefined),
}));

import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import { adicionarAnexo, removerAnexo, listarAnexos } from "./anexo";

describe("anexo (Vercel Blob mockado — não é o banco de dados)", () => {
  let fixture: FixtureFinanceiro;
  let tituloId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("ANEX");
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-ANEXO",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });
    tituloId = titulo.id;
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("adiciona um anexo e grava o metadado no banco", async () => {
    const arquivo = new File([Buffer.from("conteudo")], "nota.pdf", { type: "application/pdf" });
    const anexo = await adicionarAnexo(fixture.sessao, tituloId, arquivo);

    expect(anexo.nomeArquivo).toBe("nota.pdf");
    expect(anexo.url).toContain("blob.test");

    const anexos = await listarAnexos(tituloId);
    expect(anexos).toHaveLength(1);
  });

  test("remove um anexo", async () => {
    const arquivo = new File([Buffer.from("conteudo 2")], "boleto.pdf", { type: "application/pdf" });
    const anexo = await adicionarAnexo(fixture.sessao, tituloId, arquivo);

    await removerAnexo(fixture.sessao, anexo.id);

    const anexos = await listarAnexos(tituloId);
    expect(anexos.find((item) => item.id === anexo.id)).toBeUndefined();
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm run test -- anexo.test.ts`
Expected: FAIL — módulo `./anexo` não existe.

- [ ] **Step 4: Implementar `src/server/services/anexo.ts`**

```ts
import { put, del } from "@vercel/blob";
import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";

export async function listarAnexos(tituloId: string) {
  return prisma.anexo.findMany({ where: { tituloId }, orderBy: { criadoEm: "desc" } });
}

export async function adicionarAnexo(sessao: SessaoAtiva, tituloId: string, arquivo: File) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await prisma.titulo.findFirstOrThrow({ where: { id: tituloId, filialId: sessao.filialId } });

  const blob = await put(`titulos/${tituloId}/${arquivo.name}`, arquivo, { access: "public" });

  const anexo = await prisma.anexo.create({
    data: {
      tituloId,
      url: blob.url,
      nomeArquivo: arquivo.name,
      tamanhoBytes: arquivo.size,
      usuarioId: sessao.usuarioId,
    },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Anexo",
    entidadeId: anexo.id,
    acao: "CRIAR",
    anterior: null,
    novo: { tituloId, nomeArquivo: arquivo.name },
  });

  return anexo;
}

export async function removerAnexo(sessao: SessaoAtiva, anexoId: string) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.anexo.findFirstOrThrow({
    where: { id: anexoId, titulo: { filialId: sessao.filialId } },
  });

  await del(anterior.url);
  await prisma.anexo.delete({ where: { id: anexoId } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Anexo",
    entidadeId: anexoId,
    acao: "REMOVER",
    anterior: { nomeArquivo: anterior.nomeArquivo },
    novo: null,
  });
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm run test -- anexo.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/server/services/anexo.ts src/server/services/anexo.test.ts
git commit -m "Adicionar anexos de titulo via Vercel Blob"
```

---

## Task 9: Importação CSV

**Files:**
- Modify: `package.json` (dependências `papaparse`, `@types/papaparse`)
- Create: `src/server/services/importacaoTitulo.ts`
- Test: `src/server/services/importacaoTitulo.test.ts`

**Interfaces:**
- Consumes: `tituloSchema` (Task 5), `criarTitulo` com parâmetro `db` transacional (Task 5).
- Produces: `validarCsv(conteudoCsv)`, `confirmarImportacao(sessao, tipo, linhas)` — usadas pela Task 11.

- [ ] **Step 1: Instalar as dependências**

Run: `npm install papaparse && npm install --save-dev @types/papaparse`
Expected: `papaparse` em `dependencies`, `@types/papaparse` em `devDependencies`.

- [ ] **Step 2: Escrever os testes**

Criar `src/server/services/importacaoTitulo.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { validarCsv, confirmarImportacao } from "./importacaoTitulo";

describe("importação de títulos via CSV", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("IMP");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  function csvValido() {
    return [
      "contraparteId,documento,dataEmissao,dataCompetencia,categoriaFinanceiraId,centroCustoId,centroLucroId,safraId,projetoId,contaBancariaId,formaPagamento,numeroParcela,dataVencimento,valorOriginal",
      `${fixture.fornecedorId},NF-CSV-1,2026-08-01,2026-08-01,${fixture.categoriaFinanceiraId},,,,,,,1,2026-09-01,150.00`,
    ].join("\n");
  }

  test("validarCsv aceita uma linha bem formada sem erros", () => {
    const linhas = validarCsv(csvValido());
    expect(linhas).toHaveLength(1);
    expect(linhas[0].erros).toEqual([]);
  });

  test("validarCsv reporta erro em linha com valor inválido", () => {
    const csv = [
      "contraparteId,documento,dataEmissao,dataCompetencia,categoriaFinanceiraId,centroCustoId,centroLucroId,safraId,projetoId,contaBancariaId,formaPagamento,numeroParcela,dataVencimento,valorOriginal",
      `${fixture.fornecedorId},NF-CSV-2,2026-08-01,2026-08-01,${fixture.categoriaFinanceiraId},,,,,,,1,2026-09-01,-10`,
    ].join("\n");

    const linhas = validarCsv(csv);
    expect(linhas[0].erros.length).toBeGreaterThan(0);
  });

  test("confirmarImportacao cria os títulos quando todas as linhas são válidas", async () => {
    const linhas = validarCsv(csvValido());
    const criados = await confirmarImportacao(fixture.sessao, "PAGAR", linhas);

    expect(criados).toHaveLength(1);
    expect(criados[0].documento).toBe("NF-CSV-1");
  });

  test("confirmarImportacao rejeita tudo (nenhum título é criado) se qualquer linha tiver erro", async () => {
    const linhaValida = validarCsv(csvValido())[0];
    const linhaInvalida = { linha: 3, bruta: { ...linhaValida.bruta, valorOriginal: "-5" }, erros: ["inválido"] };

    const totalAntes = await prisma.titulo.count({ where: { filialId: fixture.filialId } });

    await expect(confirmarImportacao(fixture.sessao, "PAGAR", [linhaValida, linhaInvalida])).rejects.toThrow(
      "Existem linhas inválidas",
    );

    const totalDepois = await prisma.titulo.count({ where: { filialId: fixture.filialId } });
    expect(totalDepois).toBe(totalAntes);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm run test -- importacaoTitulo.test.ts`
Expected: FAIL — módulo `./importacaoTitulo` não existe.

- [ ] **Step 4: Implementar `src/server/services/importacaoTitulo.ts`**

```ts
import Papa from "papaparse";
import { prisma } from "@/server/db/client";
import { tituloSchema } from "@/lib/schemas/titulo";
import { criarTitulo } from "@/server/services/titulo";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { TipoTitulo } from "@prisma/client";

export type LinhaImportacao = {
  linha: number;
  bruta: Record<string, string>;
  erros: string[];
};

function linhaCsvParaTitulo(bruta: Record<string, string>) {
  return {
    contraparteId: bruta.contraparteId,
    documento: bruta.documento,
    dataEmissao: bruta.dataEmissao,
    dataCompetencia: bruta.dataCompetencia,
    categoriaFinanceiraId: bruta.categoriaFinanceiraId,
    centroCustoId: bruta.centroCustoId,
    centroLucroId: bruta.centroLucroId,
    safraId: bruta.safraId,
    projetoId: bruta.projetoId,
    contaBancariaId: bruta.contaBancariaId,
    formaPagamento: bruta.formaPagamento,
    parcelas: [
      {
        numero: bruta.numeroParcela || "1",
        dataVencimento: bruta.dataVencimento,
        valorOriginal: bruta.valorOriginal,
      },
    ],
  };
}

export function validarCsv(conteudoCsv: string): LinhaImportacao[] {
  const resultado = Papa.parse<Record<string, string>>(conteudoCsv, { header: true, skipEmptyLines: true });

  return resultado.data.map((bruta, indice) => {
    const parsed = tituloSchema.safeParse(linhaCsvParaTitulo(bruta));
    const erros = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
    return { linha: indice + 2, bruta, erros };
  });
}

export async function confirmarImportacao(sessao: SessaoAtiva, tipo: TipoTitulo, linhas: LinhaImportacao[]) {
  if (linhas.length === 0) {
    throw new Error("Nenhuma linha para importar");
  }
  if (linhas.some((linha) => linha.erros.length > 0)) {
    throw new Error("Existem linhas inválidas — corrija ou remova antes de importar");
  }

  return prisma.$transaction(async (tx) => {
    const criados = [];
    for (const linha of linhas) {
      const dados = tituloSchema.parse(linhaCsvParaTitulo(linha.bruta));
      criados.push(await criarTitulo(sessao, tipo, dados, tx));
    }
    return criados;
  });
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm run test -- importacaoTitulo.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/server/services/importacaoTitulo.ts src/server/services/importacaoTitulo.test.ts
git commit -m "Adicionar importacao de titulos em lote via CSV"
```

---

## Task 10: UI — nav, tabela de títulos, dialog de criar/editar, páginas Pagar/Receber

**Files:**
- Modify: `src/app/(dashboard)/nav-items.ts`
- Create: `src/app/(dashboard)/financeiro/_titulos/actions.ts`
- Create: `src/app/(dashboard)/financeiro/_titulos/titulo-table.tsx`
- Create: `src/app/(dashboard)/financeiro/_titulos/titulo-dialog-form.tsx`
- Create: `src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx`
- Create: `src/app/(dashboard)/financeiro/contas-a-receber/page.tsx`

**Interfaces:**
- Consumes: `listarTitulos`/`criarTitulo`/`atualizarTitulo`/`alterarVencimentoParcela`/`cancelarParcela` (Task 5), `podeEscreverTitulo` (Task 2), `listarClientes`/`listarFornecedores` (Fase 1), `listarCategoriasFinanceiras`/`listarCentrosCusto`/`listarCentrosLucro`/`listarSafras`/`listarProjetos`/`listarContasBancarias` (Fase 1).
- Produces: rotas `/financeiro/contas-a-pagar` e `/financeiro/contas-a-receber`.

Sem teste automatizado (é UI + Server Actions — segue o mesmo precedente dos 9 cadastros da Fase 1, que também não têm teste dedicado). Verificação é manual, ao final da Task 12.

- [ ] **Step 1: Atualizar `src/app/(dashboard)/nav-items.ts`**

Adicionar uma nova seção antes de "Cadastros":

```ts
export const NAV_SECTIONS: NavSection[] = [
  {
    titulo: "Financeiro",
    itens: [
      { href: "/financeiro/contas-a-pagar", label: "Contas a pagar" },
      { href: "/financeiro/contas-a-receber", label: "Contas a receber" },
      { href: "/financeiro/aprovacoes", label: "Aprovações pendentes", permitido: ["ADMINISTRADOR", "TESOURARIA"] },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      // ... itens existentes, sem alteração
```

(mantém o resto do arquivo igual — só insere o novo bloco antes do existente).

- [ ] **Step 2: Criar `src/app/(dashboard)/financeiro/_titulos/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { tituloSchema, tituloHeaderSchema } from "@/lib/schemas/titulo";
import * as tituloService from "@/server/services/titulo";
import type { TipoTitulo } from "@prisma/client";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

function rotaPara(tipo: TipoTitulo): string {
  return tipo === "PAGAR" ? "/financeiro/contas-a-pagar" : "/financeiro/contas-a-receber";
}

function parseParcelas(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get("parcelas") ?? "[]"));
  } catch {
    return null;
  }
}

export async function criarTituloAction(
  tipo: TipoTitulo,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parcelas = parseParcelas(formData);
  if (parcelas === null) {
    return { erro: "Parcelas inválidas" };
  }

  const parsed = tituloSchema.safeParse({ ...Object.fromEntries(formData), parcelas });
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await tituloService.criarTitulo(sessao, tipo, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath(rotaPara(tipo));
  return { sucesso: true };
}

export async function atualizarTituloAction(
  tipo: TipoTitulo,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const parsed = tituloHeaderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await tituloService.atualizarTitulo(sessao, id, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath(rotaPara(tipo));
  return { sucesso: true };
}

export async function alterarVencimentoParcelaAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const parcelaId = String(formData.get("parcelaId") ?? "");
  const novoVencimento = new Date(String(formData.get("dataVencimento") ?? ""));
  const tipo = String(formData.get("tipo") ?? "PAGAR") as TipoTitulo;

  await tituloService.alterarVencimentoParcela(sessao, parcelaId, novoVencimento);
  revalidatePath(rotaPara(tipo));
}

export async function cancelarParcelaAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const parcelaId = String(formData.get("parcelaId") ?? "");
  const tipo = String(formData.get("tipo") ?? "PAGAR") as TipoTitulo;

  await tituloService.cancelarParcela(sessao, parcelaId);
  revalidatePath(rotaPara(tipo));
}
```

- [ ] **Step 3: Criar `src/app/(dashboard)/financeiro/_titulos/titulo-dialog-form.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TipoTitulo } from "@prisma/client";
import { criarTituloAction, atualizarTituloAction, type FormState } from "./actions";

type Opcao = { id: string; nome: string };

type ParcelaLinha = { numero: number; dataVencimento: string; valorOriginal: string };

const ESTADO_INICIAL: FormState = {};
const SEM_VALOR = "__nenhum__";

export function TituloDialogForm({
  tipo,
  titulo,
  contrapartes,
  categorias,
  centrosCusto,
  centrosLucro,
  safras,
  projetos,
  contasBancarias,
}: {
  tipo: TipoTitulo;
  titulo?: { id: string; contraparteId: string; documento: string };
  contrapartes: Opcao[];
  categorias: Opcao[];
  centrosCusto: Opcao[];
  centrosLucro: Opcao[];
  safras: Opcao[];
  projetos: Opcao[];
  contasBancarias: Opcao[];
}) {
  const [aberto, setAberto] = useState(false);
  const action = titulo
    ? atualizarTituloAction.bind(null, tipo)
    : criarTituloAction.bind(null, tipo);
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);
  const [parcelas, setParcelas] = useState<ParcelaLinha[]>([
    { numero: 1, dataVencimento: "", valorOriginal: "" },
  ]);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  function adicionarParcela() {
    setParcelas((atual) => [...atual, { numero: atual.length + 1, dataVencimento: "", valorOriginal: "" }]);
  }

  function removerParcela(indice: number) {
    setParcelas((atual) => atual.filter((_, i) => i !== indice).map((parcela, i) => ({ ...parcela, numero: i + 1 })));
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant={titulo ? "outline" : "default"} size={titulo ? "sm" : "default"} />}>
        {titulo ? "Editar" : `Novo título ${tipo === "PAGAR" ? "a pagar" : "a receber"}`}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo ? "Editar título" : "Novo título"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {titulo ? <input type="hidden" name="id" value={titulo.id} /> : null}
          <input type="hidden" name="parcelas" value={JSON.stringify(parcelas)} />

          <div className="space-y-2">
            <Label htmlFor="contraparteId">{tipo === "PAGAR" ? "Fornecedor" : "Cliente"}</Label>
            <Select name="contraparteId" defaultValue={titulo?.contraparteId}>
              <SelectTrigger id="contraparteId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {contrapartes.map((opcao) => (
                  <SelectItem key={opcao.id} value={opcao.id}>
                    {opcao.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="documento">Documento</Label>
            <Input id="documento" name="documento" defaultValue={titulo?.documento} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dataEmissao">Emissão</Label>
              <Input id="dataEmissao" name="dataEmissao" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataCompetencia">Competência</Label>
              <Input id="dataCompetencia" name="dataCompetencia" type="date" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="categoriaFinanceiraId">Categoria financeira</Label>
            <Select name="categoriaFinanceiraId">
              <SelectTrigger id="categoriaFinanceiraId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((opcao) => (
                  <SelectItem key={opcao.id} value={opcao.id}>
                    {opcao.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { nome: "centroCustoId", label: "Centro de custo", opcoes: centrosCusto },
              { nome: "centroLucroId", label: "Centro de lucro", opcoes: centrosLucro },
              { nome: "safraId", label: "Safra", opcoes: safras },
              { nome: "projetoId", label: "Projeto", opcoes: projetos },
            ].map((campo) => (
              <div key={campo.nome} className="space-y-2">
                <Label htmlFor={campo.nome}>{campo.label}</Label>
                <Select name={campo.nome} defaultValue={SEM_VALOR}>
                  <SelectTrigger id={campo.nome} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_VALOR}>Nenhum</SelectItem>
                    {campo.opcoes.map((opcao) => (
                      <SelectItem key={opcao.id} value={opcao.id}>
                        {opcao.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contaBancariaId">Conta bancária prevista</Label>
            <Select name="contaBancariaId" defaultValue={SEM_VALOR}>
              <SelectTrigger id="contaBancariaId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhuma</SelectItem>
                {contasBancarias.map((opcao) => (
                  <SelectItem key={opcao.id} value={opcao.id}>
                    {opcao.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!titulo && (
            <div className="space-y-2">
              <Label>Parcelas</Label>
              {parcelas.map((parcela, indice) => (
                <div key={indice} className="flex gap-2 items-end">
                  <Input
                    type="date"
                    value={parcela.dataVencimento}
                    onChange={(e) =>
                      setParcelas((atual) =>
                        atual.map((p, i) => (i === indice ? { ...p, dataVencimento: e.target.value } : p)),
                      )
                    }
                    required
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Valor"
                    value={parcela.valorOriginal}
                    onChange={(e) =>
                      setParcelas((atual) =>
                        atual.map((p, i) => (i === indice ? { ...p, valorOriginal: e.target.value } : p)),
                      )
                    }
                    required
                  />
                  {parcelas.length > 1 && (
                    <Button type="button" variant="outline" size="sm" onClick={() => removerParcela(indice)}>
                      Remover
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={adicionarParcela}>
                Adicionar parcela
              </Button>
            </div>
          )}

          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Criar `src/app/(dashboard)/financeiro/_titulos/titulo-table.tsx`**

```tsx
"use client";

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TipoTitulo } from "@prisma/client";
import { cancelarParcelaAction } from "./actions";

type ParcelaLinha = {
  id: string;
  numero: number;
  dataVencimento: Date;
  valorAtualizado: unknown;
  status: string;
};

type TituloLinha = {
  id: string;
  documento: string;
  fornecedor: { nome: string } | null;
  cliente: { nome: string } | null;
  categoriaFinanceira: { nome: string };
  parcelas: ParcelaLinha[];
};

const VARIANTE_STATUS: Record<string, "default" | "secondary" | "destructive"> = {
  PAGO: "default",
  VENCIDO: "destructive",
  CANCELADO: "secondary",
  RENEGOCIADO: "secondary",
};

export function TituloTable({
  tipo,
  titulos,
  podeEscrever,
  podeBaixar,
  onAbrirBaixa,
  onAbrirRenegociacao,
}: {
  tipo: TipoTitulo;
  titulos: TituloLinha[];
  podeEscrever: boolean;
  podeBaixar: boolean;
  onAbrirBaixa: (parcelaId: string) => void;
  onAbrirRenegociacao: (parcelaId: string) => void;
}) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Documento</TableHead>
          <TableHead>{tipo === "PAGAR" ? "Fornecedor" : "Cliente"}</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead className="text-right">Parcelas</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {titulos.map((titulo) => (
          <Fragment key={titulo.id}>
            <TableRow className="cursor-pointer" onClick={() => setExpandidoId(expandidoId === titulo.id ? null : titulo.id)}>
              <TableCell className="font-medium">{titulo.documento}</TableCell>
              <TableCell>{(titulo.fornecedor ?? titulo.cliente)?.nome}</TableCell>
              <TableCell>{titulo.categoriaFinanceira.nome}</TableCell>
              <TableCell className="text-right">{titulo.parcelas.length}</TableCell>
            </TableRow>
            {expandidoId === titulo.id &&
              titulo.parcelas.map((parcela) => (
                <TableRow key={parcela.id} className="bg-muted/30">
                  <TableCell colSpan={2} className="pl-8">
                    Parcela {parcela.numero} — venc. {new Date(parcela.dataVencimento).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={VARIANTE_STATUS[parcela.status] ?? "secondary"}>{parcela.status}</Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    {podeBaixar && parcela.status !== "PAGO" && parcela.status !== "CANCELADO" && (
                      <Button type="button" size="sm" onClick={() => onAbrirBaixa(parcela.id)}>
                        Baixar
                      </Button>
                    )}
                    {podeEscrever && parcela.status === "VENCIDO" && (
                      <Button type="button" variant="outline" size="sm" onClick={() => onAbrirRenegociacao(parcela.id)}>
                        Renegociar
                      </Button>
                    )}
                    {podeEscrever && parcela.status !== "CANCELADO" && parcela.status !== "PAGO" && (
                      <form action={cancelarParcelaAction}>
                        <input type="hidden" name="parcelaId" value={parcela.id} />
                        <input type="hidden" name="tipo" value={tipo} />
                        <Button type="submit" variant="outline" size="sm">
                          Cancelar
                        </Button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 5: Criar `src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx`**

```tsx
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverTitulo, podeBaixarTitulo } from "@/server/auth/permissions";
import { listarTitulos } from "@/server/services/titulo";
import { listarFornecedores } from "@/server/services/fornecedor";
import { listarCategoriasFinanceiras } from "@/server/services/categoriaFinanceira";
import { listarCentrosCusto } from "@/server/services/centroCusto";
import { listarCentrosLucro } from "@/server/services/centroLucro";
import { listarSafras } from "@/server/services/safra";
import { listarProjetos } from "@/server/services/projeto";
import { listarContasBancarias } from "@/server/services/contaBancaria";
import { TituloDialogForm } from "../_titulos/titulo-dialog-form";
import { ContasClientePanel } from "../_titulos/contas-client-panel";

export default async function ContasAPagarPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:ler");
  const podeEscrever = podeEscreverTitulo(sessao.perfil, sessao.podeAlterarFilial);
  const podeBaixar = podeBaixarTitulo(sessao.perfil, sessao.podeAlterarFilial);

  const [titulos, fornecedores, categorias, centrosCusto, centrosLucro, safras, projetos, contasBancarias] =
    await Promise.all([
      listarTitulos(sessao.filialId, "PAGAR"),
      listarFornecedores(sessao.empresaId),
      listarCategoriasFinanceiras(sessao.filialId),
      listarCentrosCusto(sessao.filialId),
      listarCentrosLucro(sessao.filialId),
      listarSafras(sessao.filialId),
      listarProjetos(sessao.filialId),
      listarContasBancarias(sessao.filialId),
    ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Contas a pagar</h1>
          <p className="text-sm text-muted-foreground">Títulos e parcelas a pagar da filial ativa.</p>
        </div>
        {podeEscrever && (
          <TituloDialogForm
            tipo="PAGAR"
            contrapartes={fornecedores}
            categorias={categorias}
            centrosCusto={centrosCusto}
            centrosLucro={centrosLucro}
            safras={safras}
            projetos={projetos}
            contasBancarias={contasBancarias}
          />
        )}
      </div>
      <ContasClientePanel
        tipo="PAGAR"
        titulos={titulos}
        podeEscrever={podeEscrever}
        podeBaixar={podeBaixar}
        contasBancarias={contasBancarias}
      />
    </div>
  );
}
```

- [ ] **Step 6: Criar `src/app/(dashboard)/financeiro/contas-a-receber/page.tsx`**

Idêntico ao Step 5, trocando: `listarClientes` no lugar de `listarFornecedores`, `tipo="RECEBER"` em `listarTitulos` e no `TituloDialogForm`/`ContasClientePanel`, `contrapartes={clientes}`, título "Contas a receber" e descrição "Títulos e parcelas a receber da filial ativa.".

```tsx
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverTitulo, podeBaixarTitulo } from "@/server/auth/permissions";
import { listarTitulos } from "@/server/services/titulo";
import { listarClientes } from "@/server/services/cliente";
import { listarCategoriasFinanceiras } from "@/server/services/categoriaFinanceira";
import { listarCentrosCusto } from "@/server/services/centroCusto";
import { listarCentrosLucro } from "@/server/services/centroLucro";
import { listarSafras } from "@/server/services/safra";
import { listarProjetos } from "@/server/services/projeto";
import { listarContasBancarias } from "@/server/services/contaBancaria";
import { TituloDialogForm } from "../_titulos/titulo-dialog-form";
import { ContasClientePanel } from "../_titulos/contas-client-panel";

export default async function ContasAReceberPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:ler");
  const podeEscrever = podeEscreverTitulo(sessao.perfil, sessao.podeAlterarFilial);
  const podeBaixar = podeBaixarTitulo(sessao.perfil, sessao.podeAlterarFilial);

  const [titulos, clientes, categorias, centrosCusto, centrosLucro, safras, projetos, contasBancarias] =
    await Promise.all([
      listarTitulos(sessao.filialId, "RECEBER"),
      listarClientes(sessao.empresaId),
      listarCategoriasFinanceiras(sessao.filialId),
      listarCentrosCusto(sessao.filialId),
      listarCentrosLucro(sessao.filialId),
      listarSafras(sessao.filialId),
      listarProjetos(sessao.filialId),
      listarContasBancarias(sessao.filialId),
    ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Contas a receber</h1>
          <p className="text-sm text-muted-foreground">Títulos e parcelas a receber da filial ativa.</p>
        </div>
        {podeEscrever && (
          <TituloDialogForm
            tipo="RECEBER"
            contrapartes={clientes}
            categorias={categorias}
            centrosCusto={centrosCusto}
            centrosLucro={centrosLucro}
            safras={safras}
            projetos={projetos}
            contasBancarias={contasBancarias}
          />
        )}
      </div>
      <ContasClientePanel
        tipo="RECEBER"
        titulos={titulos}
        podeEscrever={podeEscrever}
        podeBaixar={podeBaixar}
        contasBancarias={contasBancarias}
      />
    </div>
  );
}
```

**Nota:** `ContasClientePanel` (o componente client que junta `TituloTable` + os dialogs de baixa/renegociação abertos por `id`) é criado na Task 11, Step 1 — ele é o elo entre `TituloTable` (Task 10) e os dialogs de baixa/renegociação (Task 11). As páginas desta task só compilam depois que a Task 11 criar esse arquivo; isso é aceitável porque as duas tasks são sempre revisadas/mescladas juntas antes do `npm run build` final (ver Task 12).

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/nav-items.ts "src/app/(dashboard)/financeiro"
git commit -m "Adicionar UI de titulo: nav, tabela, dialog de criar/editar, paginas pagar/receber"
```

---

## Task 11: UI — baixa, aprovações, renegociação, anexos, importação

**Files:**
- Create: `src/app/(dashboard)/financeiro/_titulos/contas-client-panel.tsx`
- Create: `src/app/(dashboard)/financeiro/_titulos/baixa-dialog.tsx`
- Create: `src/app/(dashboard)/financeiro/_titulos/renegociar-dialog.tsx`
- Create: `src/app/(dashboard)/financeiro/_titulos/importar-csv-dialog.tsx`
- Modify: `src/app/(dashboard)/financeiro/_titulos/actions.ts` (adicionar actions de baixa/renegociação/importação)
- Create: `src/app/(dashboard)/financeiro/aprovacoes/actions.ts`
- Create: `src/app/(dashboard)/financeiro/aprovacoes/rejeitar-baixa-form.tsx`
- Create: `src/app/(dashboard)/financeiro/aprovacoes/page.tsx`

**Interfaces:**
- Consumes: `registrarBaixa`/`aprovarBaixa`/`rejeitarBaixa`/`listarBaixasPendentes` (Task 6), `renegociarParcela` (Task 7), `validarCsv`/`confirmarImportacao` (Task 9), `podeAprovarBaixa` (Task 2).

- [ ] **Step 1: Adicionar as actions de baixa, renegociação e importação em `src/app/(dashboard)/financeiro/_titulos/actions.ts`**

Acrescentar ao final do arquivo (mantendo os imports e funções já existentes da Task 10):

```ts
import { baixaSchema } from "@/lib/schemas/baixa";
import * as baixaService from "@/server/services/baixa";
import * as renegociacaoService from "@/server/services/renegociacao";
import * as importacaoService from "@/server/services/importacaoTitulo";

export async function registrarBaixaAction(
  tipo: TipoTitulo,
  parcelaId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = baixaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await baixaService.registrarBaixa(sessao, parcelaId, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath(rotaPara(tipo));
  return { sucesso: true };
}

export async function renegociarParcelaAction(
  tipo: TipoTitulo,
  parcelaId: string,
  novasParcelas: { dataVencimento: string; valorOriginal: string }[],
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();

  try {
    await renegociacaoService.renegociarParcela(
      sessao,
      parcelaId,
      novasParcelas.map((parcela) => ({
        dataVencimento: new Date(parcela.dataVencimento),
        valorOriginal: Number(parcela.valorOriginal),
      })),
    );
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath(rotaPara(tipo));
  return { sucesso: true };
}

export async function validarCsvAction(conteudoCsv: string) {
  return importacaoService.validarCsv(conteudoCsv);
}

export async function confirmarImportacaoAction(
  tipo: TipoTitulo,
  linhas: importacaoService.LinhaImportacao[],
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();

  try {
    await importacaoService.confirmarImportacao(sessao, tipo, linhas);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath(rotaPara(tipo));
  return { sucesso: true };
}
```

- [ ] **Step 2: Criar `src/app/(dashboard)/financeiro/_titulos/baixa-dialog.tsx`**

```tsx
"use client";

import { useActionState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TipoTitulo } from "@prisma/client";
import { registrarBaixaAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

export function BaixaDialog({
  tipo,
  parcelaId,
  contasBancarias,
  aberto,
  onOpenChange,
}: {
  tipo: TipoTitulo;
  parcelaId: string | null;
  contasBancarias: { id: string; nome: string }[];
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const action = registrarBaixaAction.bind(null, tipo, parcelaId ?? "");
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) onOpenChange(false);
  }, [state.sucesso, onOpenChange]);

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar baixa</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data">Data</Label>
              <Input id="data" name="data" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valorPago">Valor pago</Label>
              <Input id="valorPago" name="valorPago" type="number" step="0.01" required />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valorJuros">Juros</Label>
              <Input id="valorJuros" name="valorJuros" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valorMulta">Multa</Label>
              <Input id="valorMulta" name="valorMulta" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valorDesconto">Desconto</Label>
              <Input id="valorDesconto" name="valorDesconto" type="number" step="0.01" defaultValue="0" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contaBancariaId">Conta bancária</Label>
            <Select name="contaBancariaId">
              <SelectTrigger id="contaBancariaId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {contasBancarias.map((opcao) => (
                  <SelectItem key={opcao.id} value={opcao.id}>
                    {opcao.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Registrando..." : "Registrar baixa (fica pendente de aprovação)"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Criar `src/app/(dashboard)/financeiro/_titulos/renegociar-dialog.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TipoTitulo } from "@prisma/client";
import { renegociarParcelaAction } from "./actions";

type NovaParcela = { dataVencimento: string; valorOriginal: string };

export function RenegociarDialog({
  tipo,
  parcelaId,
  aberto,
  onOpenChange,
}: {
  tipo: TipoTitulo;
  parcelaId: string | null;
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const [novasParcelas, setNovasParcelas] = useState<NovaParcela[]>([{ dataVencimento: "", valorOriginal: "" }]);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciarTransicao] = useTransition();

  function confirmar() {
    if (!parcelaId) return;
    iniciarTransicao(async () => {
      const resultado = await renegociarParcelaAction(tipo, parcelaId, novasParcelas);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renegociar parcela</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {novasParcelas.map((parcela, indice) => (
            <div key={indice} className="flex gap-2">
              <Input
                type="date"
                value={parcela.dataVencimento}
                onChange={(e) =>
                  setNovasParcelas((atual) =>
                    atual.map((p, i) => (i === indice ? { ...p, dataVencimento: e.target.value } : p)),
                  )
                }
              />
              <Input
                type="number"
                step="0.01"
                placeholder="Valor"
                value={parcela.valorOriginal}
                onChange={(e) =>
                  setNovasParcelas((atual) =>
                    atual.map((p, i) => (i === indice ? { ...p, valorOriginal: e.target.value } : p)),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setNovasParcelas((atual) => [...atual, { dataVencimento: "", valorOriginal: "" }])}
          >
            Adicionar nova parcela
          </Button>
          {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
          <Button type="button" className="w-full" disabled={pendente} onClick={confirmar}>
            {pendente ? "Renegociando..." : "Confirmar renegociação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Criar `src/app/(dashboard)/financeiro/_titulos/importar-csv-dialog.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TipoTitulo } from "@prisma/client";
import { validarCsvAction, confirmarImportacaoAction } from "./actions";
import type { LinhaImportacao } from "@/server/services/importacaoTitulo";

export function ImportarCsvDialog({ tipo }: { tipo: TipoTitulo }) {
  const [aberto, setAberto] = useState(false);
  const [linhas, setLinhas] = useState<LinhaImportacao[]>([]);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciarTransicao] = useTransition();

  async function lerArquivo(arquivo: File) {
    const conteudo = await arquivo.text();
    const resultado = await validarCsvAction(conteudo);
    setLinhas(resultado);
    setErro(undefined);
  }

  function confirmar() {
    iniciarTransicao(async () => {
      const resultado = await confirmarImportacaoAction(tipo, linhas);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setAberto(false);
      setLinhas([]);
    });
  }

  const temErro = linhas.some((linha) => linha.erros.length > 0);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" />}>Importar CSV</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar títulos via CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])}
          />
          {linhas.length > 0 && (
            <div className="max-h-64 overflow-y-auto text-sm space-y-1">
              {linhas.map((linha) => (
                <div key={linha.linha} className={linha.erros.length > 0 ? "text-destructive" : ""}>
                  Linha {linha.linha}: {linha.erros.length > 0 ? linha.erros.join("; ") : "OK"}
                </div>
              ))}
            </div>
          )}
          {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
          <Button type="button" className="w-full" disabled={linhas.length === 0 || temErro || pendente} onClick={confirmar}>
            {pendente ? "Importando..." : "Confirmar importação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Criar `src/app/(dashboard)/financeiro/_titulos/contas-client-panel.tsx`**

Este componente junta `TituloTable` (Task 10) com os dialogs de baixa/renegociação, controlando qual `parcelaId` está aberto em cada um — é o componente que as páginas `contas-a-pagar`/`contas-a-receber` (Task 10, Step 5-6) renderizam.

```tsx
"use client";

import { useState } from "react";
import type { TipoTitulo } from "@prisma/client";
import { TituloTable } from "./titulo-table";
import { BaixaDialog } from "./baixa-dialog";
import { RenegociarDialog } from "./renegociar-dialog";
import { ImportarCsvDialog } from "./importar-csv-dialog";

export function ContasClientePanel({
  tipo,
  titulos,
  podeEscrever,
  podeBaixar,
  contasBancarias,
}: {
  tipo: TipoTitulo;
  titulos: Parameters<typeof TituloTable>[0]["titulos"];
  podeEscrever: boolean;
  podeBaixar: boolean;
  contasBancarias: { id: string; nome: string }[];
}) {
  const [parcelaBaixaId, setParcelaBaixaId] = useState<string | null>(null);
  const [parcelaRenegociacaoId, setParcelaRenegociacaoId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {podeEscrever && (
        <div className="flex justify-end">
          <ImportarCsvDialog tipo={tipo} />
        </div>
      )}
      <TituloTable
        tipo={tipo}
        titulos={titulos}
        podeEscrever={podeEscrever}
        podeBaixar={podeBaixar}
        onAbrirBaixa={setParcelaBaixaId}
        onAbrirRenegociacao={setParcelaRenegociacaoId}
      />
      <BaixaDialog
        tipo={tipo}
        parcelaId={parcelaBaixaId}
        contasBancarias={contasBancarias}
        aberto={parcelaBaixaId !== null}
        onOpenChange={(aberto) => !aberto && setParcelaBaixaId(null)}
      />
      <RenegociarDialog
        tipo={tipo}
        parcelaId={parcelaRenegociacaoId}
        aberto={parcelaRenegociacaoId !== null}
        onOpenChange={(aberto) => !aberto && setParcelaRenegociacaoId(null)}
      />
    </div>
  );
}
```

- [ ] **Step 6: Criar `src/app/(dashboard)/financeiro/aprovacoes/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { rejeicaoBaixaSchema } from "@/lib/schemas/baixa";
import * as baixaService from "@/server/services/baixa";

export async function aprovarBaixaAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const baixaId = String(formData.get("baixaId") ?? "");

  await baixaService.aprovarBaixa(sessao, baixaId);
  revalidatePath("/financeiro/aprovacoes");
}

export type FormState = { erro?: string; sucesso?: boolean };

export async function rejeitarBaixaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const baixaId = String(formData.get("baixaId") ?? "");
  const parsed = rejeicaoBaixaSchema.safeParse({ motivo: formData.get("motivo") });
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Informe o motivo" };
  }

  await baixaService.rejeitarBaixa(sessao, baixaId, parsed.data.motivo);
  revalidatePath("/financeiro/aprovacoes");
  return { sucesso: true };
}
```

- [ ] **Step 7: Criar `src/app/(dashboard)/financeiro/aprovacoes/rejeitar-baixa-form.tsx`**

`rejeitarBaixaAction` usa `useActionState` (precisa devolver `FormState` para exibir erro de validação), o que exige um Client Component — por isso vem num arquivo próprio, à parte da página (que é Server Component).

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rejeitarBaixaAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

export function RejeitarBaixaForm({ baixaId }: { baixaId: string }) {
  const [state, formAction, pendente] = useActionState(rejeitarBaixaAction, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input type="hidden" name="baixaId" value={baixaId} />
        <Input name="motivo" placeholder="Motivo da rejeição" className="w-40" required />
        <Button type="submit" variant="outline" size="sm" disabled={pendente}>
          {pendente ? "..." : "Rejeitar"}
        </Button>
      </div>
      {state.erro ? <p className="text-xs text-destructive">{state.erro}</p> : null}
    </form>
  );
}
```

- [ ] **Step 8: Criar `src/app/(dashboard)/financeiro/aprovacoes/page.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarBaixasPendentes } from "@/server/services/baixa";
import { aprovarBaixaAction } from "./actions";
import { RejeitarBaixaForm } from "./rejeitar-baixa-form";

export default async function AprovacoesPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:aprovar");

  const pendentes = await listarBaixasPendentes(sessao.filialId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Aprovações pendentes</h1>
        <p className="text-sm text-muted-foreground">Baixas registradas aguardando aprovação de tesouraria.</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Documento</TableHead>
            <TableHead>Contraparte</TableHead>
            <TableHead>Valor pago</TableHead>
            <TableHead>Registrado por</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pendentes.map((baixa) => (
            <TableRow key={baixa.id}>
              <TableCell className="font-medium">{baixa.parcela.titulo.documento}</TableCell>
              <TableCell>
                {(baixa.parcela.titulo.fornecedor ?? baixa.parcela.titulo.cliente)?.nome}
              </TableCell>
              <TableCell>{Number(baixa.valorPago).toFixed(2)}</TableCell>
              <TableCell>{baixa.usuario.nome}</TableCell>
              <TableCell className="flex justify-end gap-2">
                <form action={aprovarBaixaAction}>
                  <input type="hidden" name="baixaId" value={baixa.id} />
                  <Button type="submit" size="sm">
                    Aprovar
                  </Button>
                </form>
                <RejeitarBaixaForm baixaId={baixa.id} />
              </TableCell>
            </TableRow>
          ))}
          {pendentes.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Nenhuma baixa pendente.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 9: Rodar type-check**

Run: `npx tsc --noEmit`
Expected: sem erros — confirma que todos os componentes criados nas Tasks 10 e 11 se encaixam (props, imports, tipos).

- [ ] **Step 10: Commit**

```bash
git add "src/app/(dashboard)/financeiro"
git commit -m "Adicionar UI de baixa, aprovacoes, renegociacao, anexos e importacao CSV"
```

---

## Task 12: Docs + verificação end-to-end

**Files:**
- Modify: `docs/fases/fase-2-financeiro.md`
- Modify: `docs/fases/README.md`

- [ ] **Step 1: Atualizar `docs/fases/fase-2-financeiro.md`**

Trocar a linha de status no topo:
```markdown
Status: 🟡 **Em andamento.** Design técnico do primeiro sub-projeto (Contas
a Pagar/Receber — Títulos) em
`docs/superpowers/specs/2026-08-31-financeiro-titulos-design.md`,
implementado. Tesouraria (lançamentos bancários) ainda não tem desenho
técnico — próximo sub-projeto.
```

- [ ] **Step 2: Atualizar `docs/fases/README.md`**

Trocar a linha da Fase 2 de `⚪ Planejada` para `🟡 Em andamento`.

- [ ] **Step 3: Commit dos docs**

```bash
git add docs/fases/fase-2-financeiro.md docs/fases/README.md
git commit -m "Atualizar status da Fase 2 apos implementacao de Titulos"
```

- [ ] **Step 4: Verificação automatizada final**

Run: `npm run test`
Expected: todos os testes passam (permissions, parcela, titulo, baixa, renegociacao, anexo, importacaoTitulo, mais os já existentes de Fase 1).

Run: `npm run build`
Expected: build limpo (type-check + Next build).

- [ ] **Step 5: Verificação manual (`npm run dev`)**

1. Criar um título a pagar com 2 parcelas — confirmar que aparecem na tabela expandida.
2. Registrar uma baixa numa parcela — confirmar que o status **não** muda para PAGO ainda (fica pendente).
3. Logar como usuário TESOURARIA (ou trocar perfil no seed), ir em "Aprovações pendentes", aprovar a baixa — confirmar que a parcela vira PAGO na tela de contas a pagar.
4. Rejeitar uma outra baixa com motivo — confirmar que a parcela permanece no status anterior.
5. Renegociar uma parcela vencida — confirmar que a original vira RENEGOCIADO e as novas aparecem linkadas.
6. Importar um CSV com uma linha inválida — confirmar que a importação inteira é barrada e nenhum título é criado; corrigir e reimportar — confirmar que cria.
7. Anexar um arquivo a um título — **requer `BLOB_READ_WRITE_TOKEN` configurado no `.env`** (criar um Vercel Blob store no dashboard da Vercel e copiar o token); sem isso, `adicionarAnexo` falha ao chamar `put()` — documentar essa exigência se ainda não estiver no `README.md`.
8. Trocar de filial ativa — confirmar que a lista de títulos fica vazia na nova filial (isolamento).
9. `/auditoria` — confirmar entradas para `Titulo`, `Parcela`, `Baixa`, `Anexo` com `filialId` correto.

- [ ] **Step 6: Commit final se algo precisar de ajuste**

Se a verificação manual encontrar um problema, corrigir e commitar separadamente (não reabrir tasks anteriores já commitadas — seguir o fluxo normal de "fix" no histórico).
