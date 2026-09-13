# Auditoria — Filtros e Paginação (Fase 6, sub-projeto 6d) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à tela `/auditoria` filtros combináveis (entidade, ação,
usuário, filial, período) e paginação real, substituindo a busca fixa
dos 200 registros mais recentes por uma consulta com `where` dinâmico e
`skip`/`take`.

**Architecture:** Query string com um param por dimensão, mesmo padrão
já estabelecido no sub-projeto anterior (6c — Filtros globais): Server
Component lê e valida, um componente client reescreve a URL. Novo
`src/server/services/auditoria.ts` substitui o acesso direto ao
`prisma` que a página faz hoje. `entidade`/`ação` (strings livres, sem
enum) e `usuário` têm suas opções de filtro construídas a partir dos
valores já gravados (`distinct`); `filial` vem do cadastro completo
(`Filial.findMany`), não de valores já logados.

**Tech Stack:** Next.js App Router (Server Components), Prisma,
TypeScript, Vitest (Postgres real, sem mocks).

**Spec:** `docs/superpowers/specs/2026-09-13-auditoria-filtros-design.md`

## Global Constraints

- 5 dimensões de filtro: entidade, ação, usuário, filial, período
  (`dataDe`/`dataAte`, inclusivos, início-do-dia/fim-do-dia, mesma lição
  do sub-projeto 6c — nunca lançam erro em valor malformado).
- `entidade`/`acao`: opções vêm de `DISTINCT` nos próprios logs da
  empresa ativa. `usuarioId`: opções vêm de `DISTINCT usuarioId` nos
  logs + `Usuario.findMany` pelos ids coletados. `filialId`: opções vêm
  do cadastro completo `Filial.findMany({ empresaId })` — **não** de
  valores distintos já logados (é diferente dos outros 3 porque é FK de
  cadastro real, não campo livre).
- `where` sempre fixa `empresaId: sessao.empresaId` — nunca filtra a
  sessão por filial (a tela já mostra todas as filiais da empresa por
  padrão; `filialId` é um filtro opcional, não uma troca de escopo).
- Paginação: `TAMANHO_PAGINA = 50`, offset (`skip`/`take`), nunca cursor.
  Mudar qualquer filtro reseta a página para 1 (remove o param `pagina`
  da URL).
- `requirePermission(sessao.perfil, "auditoria:ler")` chamado tanto na
  página quanto dentro de cada função do serviço (checagem redundante,
  mesmo padrão já usado em `listarFluxoDeCaixaRealizado`).
- Sem `queryStringDoFiltro` — esta tela não tem export, esse helper não
  teria consumidor (diferente do sub-projeto 6c).
- Workflow de aprovação de pagamentos (cadastro→aprovação→programação→
  pagamento→conciliação) **fora de escopo** — não tocar em
  `baixa.ts`/`aprovarBaixa`. Registrar no backlog.

---

### Task 1: Serviço `auditoria.ts`

**Files:**
- Create: `src/server/services/auditoria.ts`
- Test: `src/server/services/auditoria.test.ts`

**Interfaces:**
- Produces: `export type FiltroAuditoria = { entidade?: string; acao?: string; usuarioId?: string; filialId?: string; dataDe?: Date; dataAte?: Date }`; `export type OpcoesFiltroAuditoria = { entidades: string[]; acoes: string[]; usuarios: { id: string; nome: string }[]; filiais: { id: string; nome: string }[] }`; `export async function listarAuditoria(sessao: SessaoAtiva, filtro: FiltroAuditoria, pagina: number): Promise<{ logs: LogAuditoria[]; totalPaginas: number }>` (onde `LogAuditoria` inclui as relações `usuario`/`filial`); `export async function buscarOpcoesFiltroAuditoria(sessao: SessaoAtiva): Promise<OpcoesFiltroAuditoria>`.

**Nota importante para os testes:** a fixture `criarFixtureFinanceiro`
cria `fixture.sessao` com perfil `FINANCEIRO`, que **não tem**
`auditoria:ler` (só `GESTOR`, `AUDITOR` e `ADMINISTRADOR` têm). Todo
teste que chama `listarAuditoria`/`buscarOpcoesFiltroAuditoria` para
LER dados deve usar `fixture.sessaoAdmin` (perfil `ADMINISTRADOR`), não
`fixture.sessao` — exceto o teste que verifica o bloqueio de permissão,
que usa `fixture.sessao` de propósito.

- [ ] **Step 1: Escrever os testes de integração (arquivo/funções ainda não existem)**

Criar `src/server/services/auditoria.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { listarAuditoria, buscarOpcoesFiltroAuditoria } from "./auditoria";

describe("auditoria (empresa-scoped)", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("AUD");
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { empresaId: fixture.empresaId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("listarAuditoria bloqueia perfil sem auditoria:ler", async () => {
    await expect(listarAuditoria(fixture.sessao, {}, 1)).rejects.toThrow(PermissionError);
  });

  test("buscarOpcoesFiltroAuditoria bloqueia perfil sem auditoria:ler", async () => {
    await expect(buscarOpcoesFiltroAuditoria(fixture.sessao)).rejects.toThrow(PermissionError);
  });

  test("listarAuditoria filtra por entidade", async () => {
    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: fixture.filialId,
        usuarioId: fixture.usuarioId,
        entidade: "TituloTesteAUD",
        acao: "CRIAR",
        entidadeId: "id-1",
      },
    });
    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: fixture.filialId,
        usuarioId: fixture.usuarioId,
        entidade: "BaixaTesteAUD",
        acao: "CRIAR",
        entidadeId: "id-2",
      },
    });

    const { logs } = await listarAuditoria(fixture.sessaoAdmin, { entidade: "TituloTesteAUD" }, 1);
    expect(logs.every((log) => log.entidade === "TituloTesteAUD")).toBe(true);
    expect(logs.some((log) => log.entidade === "BaixaTesteAUD")).toBe(false);
  });

  test("listarAuditoria filtra por acao", async () => {
    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: fixture.filialId,
        usuarioId: fixture.usuarioId,
        entidade: "AcaoTesteAUD",
        acao: "APROVAR_TESTE_AUD",
        entidadeId: "id-3",
      },
    });

    const { logs } = await listarAuditoria(fixture.sessaoAdmin, { acao: "APROVAR_TESTE_AUD" }, 1);
    expect(logs.every((log) => log.acao === "APROVAR_TESTE_AUD")).toBe(true);
  });

  test("listarAuditoria filtra por usuarioId", async () => {
    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: fixture.filialId,
        usuarioId: fixture.usuarioAdminId,
        entidade: "UsuarioTesteAUD",
        acao: "CRIAR",
        entidadeId: "id-4",
      },
    });
    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: fixture.filialId,
        usuarioId: fixture.usuarioId,
        entidade: "UsuarioTesteAUD",
        acao: "CRIAR",
        entidadeId: "id-5",
      },
    });

    const { logs } = await listarAuditoria(
      fixture.sessaoAdmin,
      { entidade: "UsuarioTesteAUD", usuarioId: fixture.usuarioAdminId },
      1,
    );
    expect(logs.every((log) => log.usuarioId === fixture.usuarioAdminId)).toBe(true);
    expect(logs.some((log) => log.usuarioId === fixture.usuarioId)).toBe(false);
  });

  test("listarAuditoria filtra por filialId — e as opções de filial vêm do cadastro completo, não só de quem já tem log", async () => {
    const filialIrma = await prisma.filial.create({
      data: { empresaId: fixture.empresaId, nome: "Filial Irma AUD", cnpj: "11.111.AUD/0001-99" },
    });

    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: filialIrma.id,
        usuarioId: fixture.usuarioId,
        entidade: "FilialTesteAUD",
        acao: "CRIAR",
        entidadeId: "id-6",
      },
    });

    const { logs } = await listarAuditoria(fixture.sessaoAdmin, { filialId: filialIrma.id }, 1);
    expect(logs.every((log) => log.filialId === filialIrma.id)).toBe(true);

    // Cadastro completo: uma filial SEM nenhum log ainda aparece nas opções.
    const outraFilialSemLog = await prisma.filial.create({
      data: { empresaId: fixture.empresaId, nome: "Filial Sem Log AUD", cnpj: "11.111.AUD/0001-88" },
    });
    const opcoes = await buscarOpcoesFiltroAuditoria(fixture.sessaoAdmin);
    expect(opcoes.filiais.some((f) => f.id === outraFilialSemLog.id)).toBe(true);

    await prisma.auditLog.deleteMany({ where: { filialId: filialIrma.id } });
    await prisma.filial.delete({ where: { id: filialIrma.id } });
    await prisma.filial.delete({ where: { id: outraFilialSemLog.id } });
  });

  test("listarAuditoria filtra por período (dataDe/dataAte, inclusivo)", async () => {
    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: fixture.filialId,
        usuarioId: fixture.usuarioId,
        entidade: "PeriodoTesteAUD",
        acao: "CRIAR",
        entidadeId: "id-7",
        criadoEm: new Date("2027-03-15T12:00:00.000Z"),
      },
    });

    const dentro = await listarAuditoria(
      fixture.sessaoAdmin,
      { entidade: "PeriodoTesteAUD", dataDe: new Date("2027-03-01T00:00:00.000Z"), dataAte: new Date("2027-03-31T23:59:59.999Z") },
      1,
    );
    expect(dentro.logs.length).toBeGreaterThan(0);

    const fora = await listarAuditoria(
      fixture.sessaoAdmin,
      { entidade: "PeriodoTesteAUD", dataDe: new Date("2027-04-01T00:00:00.000Z") },
      1,
    );
    expect(fora.logs).toEqual([]);
  });

  test("listarAuditoria combina dois filtros: interseção, não união", async () => {
    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: fixture.filialId,
        usuarioId: fixture.usuarioId,
        entidade: "ComboTesteAUD",
        acao: "ACAO_A_AUD",
        entidadeId: "id-8",
      },
    });
    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: fixture.filialId,
        usuarioId: fixture.usuarioId,
        entidade: "ComboTesteAUD",
        acao: "ACAO_B_AUD",
        entidadeId: "id-9",
      },
    });

    const { logs } = await listarAuditoria(
      fixture.sessaoAdmin,
      { entidade: "ComboTesteAUD", acao: "ACAO_A_AUD" },
      1,
    );
    expect(logs.some((log) => log.entidadeId === "id-8")).toBe(true);
    expect(logs.some((log) => log.entidadeId === "id-9")).toBe(false);
  });

  test("listarAuditoria pagina corretamente", async () => {
    const criacoes = Array.from({ length: 55 }, (_, i) =>
      prisma.auditLog.create({
        data: {
          empresaId: fixture.empresaId,
          filialId: fixture.filialId,
          usuarioId: fixture.usuarioId,
          entidade: "PaginaTesteAUD",
          acao: "CRIAR",
          entidadeId: `pagina-${i}`,
        },
      }),
    );
    await Promise.all(criacoes);

    const pagina1 = await listarAuditoria(fixture.sessaoAdmin, { entidade: "PaginaTesteAUD" }, 1);
    const pagina2 = await listarAuditoria(fixture.sessaoAdmin, { entidade: "PaginaTesteAUD" }, 2);

    expect(pagina1.logs).toHaveLength(50);
    expect(pagina2.logs).toHaveLength(5);
    expect(pagina1.totalPaginas).toBe(2);

    const idsPagina1 = new Set(pagina1.logs.map((log) => log.id));
    const idsPagina2 = new Set(pagina2.logs.map((log) => log.id));
    const intersecao = [...idsPagina1].filter((id) => idsPagina2.has(id));
    expect(intersecao).toHaveLength(0);
  });

  test("listarAuditoria não vaza entre empresas, mesmo com filtro que combinaria", async () => {
    const outraEmpresa = await prisma.empresa.create({
      data: { razaoSocial: "Outra Empresa AUD Ltda", nomeFantasia: "Outra AUD", cnpj: "44.444.AUD/0001-11" },
    });

    await prisma.auditLog.create({
      data: {
        empresaId: outraEmpresa.id,
        entidade: "IsolamentoTesteAUD",
        acao: "CRIAR",
        entidadeId: "id-alheio",
      },
    });

    const { logs } = await listarAuditoria(fixture.sessaoAdmin, { entidade: "IsolamentoTesteAUD" }, 1);
    expect(logs).toEqual([]);

    await prisma.auditLog.deleteMany({ where: { empresaId: outraEmpresa.id } });
    await prisma.empresa.delete({ where: { id: outraEmpresa.id } });
  });

  test("buscarOpcoesFiltroAuditoria devolve entidades/ações/usuários distintos", async () => {
    const opcoes = await buscarOpcoesFiltroAuditoria(fixture.sessaoAdmin);
    expect(opcoes.entidades).toContain("ComboTesteAUD");
    // Sem duplicatas: cada entidade aparece só uma vez mesmo com múltiplos logs dela.
    const contagem = opcoes.entidades.filter((e) => e === "ComboTesteAUD").length;
    expect(contagem).toBe(1);
    expect(opcoes.usuarios.some((u) => u.id === fixture.usuarioId)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- auditoria.test.ts`
Expected: FAIL — o módulo `./auditoria` não existe.

- [ ] **Step 3: Implementar o serviço**

Criar `src/server/services/auditoria.ts`:

```ts
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";

const TAMANHO_PAGINA = 50;

export type FiltroAuditoria = {
  entidade?: string;
  acao?: string;
  usuarioId?: string;
  filialId?: string;
  dataDe?: Date;
  dataAte?: Date;
};

export type OpcoesFiltroAuditoria = {
  entidades: string[];
  acoes: string[];
  usuarios: { id: string; nome: string }[];
  filiais: { id: string; nome: string }[];
};

export async function listarAuditoria(sessao: SessaoAtiva, filtro: FiltroAuditoria, pagina: number) {
  requirePermission(sessao.perfil, "auditoria:ler");

  const where = {
    empresaId: sessao.empresaId,
    ...(filtro.entidade && { entidade: filtro.entidade }),
    ...(filtro.acao && { acao: filtro.acao }),
    ...(filtro.usuarioId && { usuarioId: filtro.usuarioId }),
    ...(filtro.filialId && { filialId: filtro.filialId }),
    ...((filtro.dataDe || filtro.dataAte) && {
      criadoEm: {
        ...(filtro.dataDe && { gte: filtro.dataDe }),
        ...(filtro.dataAte && { lte: filtro.dataAte }),
      },
    }),
  };

  const paginaSegura = Math.max(pagina, 1);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { usuario: true, filial: true },
      orderBy: { criadoEm: "desc" },
      skip: (paginaSegura - 1) * TAMANHO_PAGINA,
      take: TAMANHO_PAGINA,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, totalPaginas: Math.max(Math.ceil(total / TAMANHO_PAGINA), 1) };
}

export async function buscarOpcoesFiltroAuditoria(sessao: SessaoAtiva): Promise<OpcoesFiltroAuditoria> {
  requirePermission(sessao.perfil, "auditoria:ler");

  const [entidadesRows, acoesRows, usuarioIdsRows, filiais] = await Promise.all([
    prisma.auditLog.findMany({
      where: { empresaId: sessao.empresaId },
      distinct: ["entidade"],
      select: { entidade: true },
      orderBy: { entidade: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { empresaId: sessao.empresaId },
      distinct: ["acao"],
      select: { acao: true },
      orderBy: { acao: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { empresaId: sessao.empresaId, usuarioId: { not: null } },
      distinct: ["usuarioId"],
      select: { usuarioId: true },
    }),
    prisma.filial.findMany({
      where: { empresaId: sessao.empresaId },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
  ]);

  const usuarioIds = usuarioIdsRows.map((linha) => linha.usuarioId).filter((id): id is string => id !== null);

  const usuarios =
    usuarioIds.length > 0
      ? await prisma.usuario.findMany({
          where: { id: { in: usuarioIds } },
          orderBy: { nome: "asc" },
          select: { id: true, nome: true },
        })
      : [];

  return {
    entidades: entidadesRows.map((linha) => linha.entidade),
    acoes: acoesRows.map((linha) => linha.acao),
    usuarios,
    filiais,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- auditoria.test.ts`
Expected: PASS — todos os testes.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/auditoria.ts src/server/services/auditoria.test.ts
git commit -m "feat: servico de auditoria com filtro combinavel e paginacao"
```

---

### Task 2: Módulo de URL — parsing do filtro e da página

**Files:**
- Create: `src/app/(dashboard)/auditoria/filtro-auditoria-url.ts`
- Test: `src/app/(dashboard)/auditoria/filtro-auditoria-url.test.ts`

**Interfaces:**
- Consumes: `FiltroAuditoria` de `@/server/services/auditoria` (Task 1).
- Produces: `export function filtroAuditoriaDaUrl(get: (campo: string) => string | undefined): FiltroAuditoria`; `export function paginaDaUrl(get: (campo: string) => string | undefined): number` (sempre `>= 1`).

- [ ] **Step 1: Escrever os testes (arquivo/funções ainda não existem)**

Criar `src/app/(dashboard)/auditoria/filtro-auditoria-url.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { filtroAuditoriaDaUrl, paginaDaUrl } from "./filtro-auditoria-url";

describe("filtroAuditoriaDaUrl", () => {
  test("nenhum param presente devolve filtro totalmente vazio", () => {
    const filtro = filtroAuditoriaDaUrl(() => undefined);
    expect(filtro).toEqual({
      entidade: undefined,
      acao: undefined,
      usuarioId: undefined,
      filialId: undefined,
      dataDe: undefined,
      dataAte: undefined,
    });
  });

  test("parseia valores válidos de cada dimensão", () => {
    const valores: Record<string, string> = {
      entidade: "Titulo",
      acao: "CRIAR",
      usuarioId: "usr-1",
      filialId: "fil-1",
      dataDe: "2026-01-01",
      dataAte: "2026-01-31",
    };
    const filtro = filtroAuditoriaDaUrl((campo) => valores[campo]);
    expect(filtro.entidade).toBe("Titulo");
    expect(filtro.acao).toBe("CRIAR");
    expect(filtro.usuarioId).toBe("usr-1");
    expect(filtro.filialId).toBe("fil-1");
    expect(filtro.dataDe?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(filtro.dataAte?.toISOString()).toBe("2026-01-31T23:59:59.999Z");
  });

  test('sentinela "__nenhum__" vira undefined', () => {
    const filtro = filtroAuditoriaDaUrl((campo) => (campo === "entidade" ? "__nenhum__" : undefined));
    expect(filtro.entidade).toBeUndefined();
  });

  test("data malformada ou com roll-over de calendário vira undefined (nunca lança erro)", () => {
    const malformada = filtroAuditoriaDaUrl((campo) => (campo === "dataDe" ? "31/01/2026" : undefined));
    expect(malformada.dataDe).toBeUndefined();

    const rollover = filtroAuditoriaDaUrl((campo) => (campo === "dataAte" ? "2026-02-30" : undefined));
    expect(rollover.dataAte).toBeUndefined();
  });
});

describe("paginaDaUrl", () => {
  test("ausente devolve 1", () => {
    expect(paginaDaUrl(() => undefined)).toBe(1);
  });

  test('"0", negativo ou não-numérico devolvem 1', () => {
    expect(paginaDaUrl((campo) => (campo === "pagina" ? "0" : undefined))).toBe(1);
    expect(paginaDaUrl((campo) => (campo === "pagina" ? "-3" : undefined))).toBe(1);
    expect(paginaDaUrl((campo) => (campo === "pagina" ? "abc" : undefined))).toBe(1);
  });

  test("valor válido devolve o número", () => {
    expect(paginaDaUrl((campo) => (campo === "pagina" ? "5" : undefined))).toBe(5);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- filtro-auditoria-url.test.ts`
Expected: FAIL — o módulo `./filtro-auditoria-url` não existe.

- [ ] **Step 3: Implementar o módulo**

Criar `src/app/(dashboard)/auditoria/filtro-auditoria-url.ts`:

```ts
import { SEM_VALOR } from "@/lib/schemas/enums";
import type { FiltroAuditoria } from "@/server/services/auditoria";

function valorOuUndefined(valor: string | undefined): string | undefined {
  return valor && valor.length > 0 && valor !== SEM_VALOR ? valor : undefined;
}

function dataInicioDoDiaOuUndefined(valor: string | undefined): Date | undefined {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return undefined;
  const data = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) return undefined;
  return data;
}

function dataFimDoDiaOuUndefined(valor: string | undefined): Date | undefined {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return undefined;
  const data = new Date(`${valor}T23:59:59.999Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) return undefined;
  return data;
}

export function filtroAuditoriaDaUrl(get: (campo: string) => string | undefined): FiltroAuditoria {
  return {
    entidade: valorOuUndefined(get("entidade")),
    acao: valorOuUndefined(get("acao")),
    usuarioId: valorOuUndefined(get("usuarioId")),
    filialId: valorOuUndefined(get("filialId")),
    dataDe: dataInicioDoDiaOuUndefined(get("dataDe")),
    dataAte: dataFimDoDiaOuUndefined(get("dataAte")),
  };
}

export function paginaDaUrl(get: (campo: string) => string | undefined): number {
  const valor = get("pagina");
  if (!valor) return 1;
  const numero = Number.parseInt(valor, 10);
  return Number.isInteger(numero) && numero >= 1 ? numero : 1;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- filtro-auditoria-url.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/auditoria/filtro-auditoria-url.ts src/app/\(dashboard\)/auditoria/filtro-auditoria-url.test.ts
git commit -m "feat: modulo de parsing de filtro/pagina de auditoria na URL"
```

---

### Task 3: Componentes `BarraDeFiltrosAuditoria` e `Paginacao`

**Files:**
- Create: `src/app/(dashboard)/auditoria/barra-de-filtros.tsx`
- Test: `src/app/(dashboard)/auditoria/barra-de-filtros.test.ts`
- Create: `src/app/(dashboard)/auditoria/paginacao.tsx`
- Test: `src/app/(dashboard)/auditoria/paginacao.test.ts`

**Interfaces:**
- Consumes: nada de Task 1/2 diretamente (os nomes de param que estes
  componentes escrevem na URL — `entidade`, `acao`, `usuarioId`,
  `filialId`, `dataDe`, `dataAte`, `pagina` — precisam ser exatamente os
  mesmos que `filtro-auditoria-url.ts` (Task 2) lê; sem import cruzado,
  mesma decisão de design do sub-projeto 6c).
- Produces: `export type OpcoesFiltroAuditoria` (reexportado/idêntico ao
  de `@/server/services/auditoria`); `export function construirUrlComFiltro(searchParamsAtual: URLSearchParams, pathname: string, campo: string, valor: string): string`; `export function BarraDeFiltrosAuditoria({ opcoes }: { opcoes: OpcoesFiltroAuditoria }): JSX.Element`; `export function construirUrlComPagina(searchParamsAtual: URLSearchParams, pathname: string, pagina: number): string`; `export function Paginacao({ pagina, totalPaginas }: { pagina: number; totalPaginas: number }): JSX.Element`.

- [ ] **Step 1: Escrever os testes de `construirUrlComFiltro` e `construirUrlComPagina` (arquivos ainda não existem)**

Criar `src/app/(dashboard)/auditoria/barra-de-filtros.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { construirUrlComFiltro } from "./barra-de-filtros";

describe("construirUrlComFiltro", () => {
  test("adiciona um novo filtro preservando os demais params da URL", () => {
    const atual = new URLSearchParams("acao=CRIAR");
    const resultado = construirUrlComFiltro(atual, "/auditoria", "entidade", "Titulo");
    expect(resultado).toBe("/auditoria?acao=CRIAR&entidade=Titulo");
  });

  test('sentinela "__nenhum__" remove o param', () => {
    const atual = new URLSearchParams("acao=CRIAR&entidade=Titulo");
    const resultado = construirUrlComFiltro(atual, "/auditoria", "entidade", "__nenhum__");
    expect(resultado).toBe("/auditoria?acao=CRIAR");
  });

  test("string vazia remove o param (usado pelos campos de data)", () => {
    const atual = new URLSearchParams("dataDe=2026-01-01");
    const resultado = construirUrlComFiltro(atual, "/auditoria", "dataDe", "");
    expect(resultado).toBe("/auditoria");
  });

  test("sem nenhum param restante devolve só o pathname", () => {
    const atual = new URLSearchParams("entidade=Titulo");
    const resultado = construirUrlComFiltro(atual, "/auditoria", "entidade", "__nenhum__");
    expect(resultado).toBe("/auditoria");
  });

  test("mudar um filtro sempre remove o param pagina da URL", () => {
    const atual = new URLSearchParams("pagina=3&acao=CRIAR");
    const resultado = construirUrlComFiltro(atual, "/auditoria", "entidade", "Titulo");
    expect(resultado).toBe("/auditoria?acao=CRIAR&entidade=Titulo");
  });
});
```

Criar `src/app/(dashboard)/auditoria/paginacao.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { construirUrlComPagina } from "./paginacao";

describe("construirUrlComPagina", () => {
  test("página 1 remove o param (é o default)", () => {
    const atual = new URLSearchParams("pagina=3&entidade=Titulo");
    const resultado = construirUrlComPagina(atual, "/auditoria", 1);
    expect(resultado).toBe("/auditoria?entidade=Titulo");
  });

  test("página > 1 seta o param", () => {
    const atual = new URLSearchParams("entidade=Titulo");
    const resultado = construirUrlComPagina(atual, "/auditoria", 2);
    expect(resultado).toBe("/auditoria?entidade=Titulo&pagina=2");
  });

  test("preserva os demais params da URL", () => {
    const atual = new URLSearchParams("entidade=Titulo&acao=CRIAR&pagina=1");
    const resultado = construirUrlComPagina(atual, "/auditoria", 3);
    expect(resultado).toBe("/auditoria?entidade=Titulo&acao=CRIAR&pagina=3");
  });

  test("sem nenhum param restante e página 1 devolve só o pathname", () => {
    const atual = new URLSearchParams("pagina=2");
    const resultado = construirUrlComPagina(atual, "/auditoria", 1);
    expect(resultado).toBe("/auditoria");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- barra-de-filtros.test.ts paginacao.test.ts`
Expected: FAIL — os módulos `./barra-de-filtros` e `./paginacao` não existem.

- [ ] **Step 3: Implementar `barra-de-filtros.tsx`**

Criar `src/app/(dashboard)/auditoria/barra-de-filtros.tsx`:

```tsx
"use client";

import type { ChangeEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SEM_VALOR } from "@/lib/schemas/enums";

export type OpcoesFiltroAuditoria = {
  entidades: string[];
  acoes: string[];
  usuarios: { id: string; nome: string }[];
  filiais: { id: string; nome: string }[];
};

export function construirUrlComFiltro(
  searchParamsAtual: URLSearchParams,
  pathname: string,
  campo: string,
  valor: string,
): string {
  const params = new URLSearchParams(searchParamsAtual.toString());
  if (!valor || valor === SEM_VALOR) {
    params.delete(campo);
  } else {
    params.set(campo, valor);
  }
  params.delete("pagina");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function BarraDeFiltrosAuditoria({ opcoes }: { opcoes: OpcoesFiltroAuditoria }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function valorSelect(campo: string): string {
    return searchParams.get(campo) ?? SEM_VALOR;
  }

  function valorData(campo: string): string {
    return searchParams.get(campo) ?? "";
  }

  function aoMudarSelect(campo: string) {
    return (valor: string | null) => {
      if (valor !== null) {
        router.push(construirUrlComFiltro(searchParams, pathname, campo, valor));
      }
    };
  }

  function aoMudarData(campo: string) {
    return (evento: ChangeEvent<HTMLInputElement>) =>
      router.push(construirUrlComFiltro(searchParams, pathname, campo, evento.target.value));
  }

  function limparFiltros() {
    router.push(pathname);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Entidade</span>
        <Select value={valorSelect("entidade")} onValueChange={aoMudarSelect("entidade")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todas</SelectItem>
            {opcoes.entidades.map((entidade) => (
              <SelectItem key={entidade} value={entidade}>
                {entidade}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Ação</span>
        <Select value={valorSelect("acao")} onValueChange={aoMudarSelect("acao")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todas</SelectItem>
            {opcoes.acoes.map((acao) => (
              <SelectItem key={acao} value={acao}>
                {acao}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Usuário</span>
        <Select value={valorSelect("usuarioId")} onValueChange={aoMudarSelect("usuarioId")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todos</SelectItem>
            {opcoes.usuarios.map((usuario) => (
              <SelectItem key={usuario.id} value={usuario.id}>
                {usuario.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Filial</span>
        <Select value={valorSelect("filialId")} onValueChange={aoMudarSelect("filialId")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todas</SelectItem>
            {opcoes.filiais.map((filial) => (
              <SelectItem key={filial.id} value={filial.id}>
                {filial.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Data de</span>
        <Input type="date" className="w-40" value={valorData("dataDe")} onChange={aoMudarData("dataDe")} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Data até</span>
        <Input type="date" className="w-40" value={valorData("dataAte")} onChange={aoMudarData("dataAte")} />
      </div>

      <Button type="button" variant="outline" size="sm" onClick={limparFiltros}>
        Limpar filtros
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Implementar `paginacao.tsx`**

Criar `src/app/(dashboard)/auditoria/paginacao.tsx`:

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function construirUrlComPagina(searchParamsAtual: URLSearchParams, pathname: string, pagina: number): string {
  const params = new URLSearchParams(searchParamsAtual.toString());
  if (pagina <= 1) {
    params.delete("pagina");
  } else {
    params.set("pagina", String(pagina));
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function Paginacao({ pagina, totalPaginas }: { pagina: number; totalPaginas: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navegar(novaPagina: number) {
    router.push(construirUrlComPagina(searchParams, pathname, novaPagina));
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-xs text-muted-foreground">
        Página {pagina} de {totalPaginas}
      </span>
      <Button type="button" variant="outline" size="sm" disabled={pagina <= 1} onClick={() => navegar(pagina - 1)}>
        Anterior
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pagina >= totalPaginas}
        onClick={() => navegar(pagina + 1)}
      >
        Próximo
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test -- barra-de-filtros.test.ts paginacao.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/auditoria/barra-de-filtros.tsx src/app/\(dashboard\)/auditoria/barra-de-filtros.test.ts src/app/\(dashboard\)/auditoria/paginacao.tsx src/app/\(dashboard\)/auditoria/paginacao.test.ts
git commit -m "feat: componentes de filtro e paginacao da tela de auditoria"
```

---

### Task 4: Wiring em `page.tsx` e backlog

**Files:**
- Modify: `src/app/(dashboard)/auditoria/page.tsx`
- Modify: `docs/backlog.md`

**Interfaces:**
- Consumes: `listarAuditoria`, `buscarOpcoesFiltroAuditoria` (Task 1);
  `filtroAuditoriaDaUrl`, `paginaDaUrl` (Task 2); `BarraDeFiltrosAuditoria`,
  `Paginacao` (Task 3).

Sem testes automatizados neste task (Server Component — convenção já
estabelecida no projeto de não testar `page.tsx`). Verificação é
`npx tsc --noEmit && npm run build && npm test`.

- [ ] **Step 1: Reescrever `page.tsx`**

Substituir o conteúdo inteiro de
`src/app/(dashboard)/auditoria/page.tsx` por:

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarAuditoria, buscarOpcoesFiltroAuditoria } from "@/server/services/auditoria";
import { filtroAuditoriaDaUrl, paginaDaUrl } from "./filtro-auditoria-url";
import { BarraDeFiltrosAuditoria } from "./barra-de-filtros";
import { Paginacao } from "./paginacao";

function formatarData(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(data);
}

function paramCru(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

type SearchParams = {
  entidade?: string | string[];
  acao?: string | string[];
  usuarioId?: string | string[];
  filialId?: string | string[];
  dataDe?: string | string[];
  dataAte?: string | string[];
  pagina?: string | string[];
};

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "auditoria:ler");

  const sp = await searchParams;
  const get = (campo: string) => paramCru((sp as Record<string, string | string[] | undefined>)[campo]);
  const filtro = filtroAuditoriaDaUrl(get);
  const pagina = paginaDaUrl(get);

  const [{ logs, totalPaginas }, opcoes] = await Promise.all([
    listarAuditoria(sessao, filtro, pagina),
    buscarOpcoesFiltroAuditoria(sessao),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Auditoria</h1>
        <p className="text-sm text-muted-foreground">Alterações registradas nesta empresa.</p>
      </div>

      <BarraDeFiltrosAuditoria opcoes={opcoes} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data/hora</TableHead>
            <TableHead>Usuário</TableHead>
            <TableHead>Filial</TableHead>
            <TableHead>Entidade</TableHead>
            <TableHead>Ação</TableHead>
            <TableHead>Valor anterior</TableHead>
            <TableHead>Valor novo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="whitespace-nowrap text-xs">{formatarData(log.criadoEm)}</TableCell>
              <TableCell className="text-xs">{log.usuario?.nome ?? "—"}</TableCell>
              <TableCell className="text-xs">{log.filial?.nome ?? "—"}</TableCell>
              <TableCell className="text-xs">{log.entidade}</TableCell>
              <TableCell className="text-xs">{log.acao}</TableCell>
              <TableCell className="max-w-56 truncate text-xs text-muted-foreground">
                {log.valorAnterior ? JSON.stringify(log.valorAnterior) : "—"}
              </TableCell>
              <TableCell className="max-w-56 truncate text-xs text-muted-foreground">
                {log.valorNovo ? JSON.stringify(log.valorNovo) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Paginacao pagina={pagina} totalPaginas={totalPaginas} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck, build e suíte completa**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: todos limpos/verdes. Se aparecer erro `LayoutProps` em
`src/app/layout.tsx`, é artefato conhecido de worktree novo — resolver
com `npx next typegen`, nunca editando `layout.tsx`.

- [ ] **Step 3: Registrar no backlog o que ficou fora do escopo**

Adicionar ao final de `docs/backlog.md` (depois da última seção
existente, `## Filtros globais (Fase 6, sub-projeto 6c)`):

```markdown
## Auditoria — workflow de aprovação de pagamentos (Fase 6, sub-projeto 6d)

- **Workflow de aprovação de pagamentos de 5 passos** (cadastro →
  aprovação → programação → pagamento → conciliação), citado na prosa
  original da Fase 6, ficou fora do escopo. Hoje o fluxo real é de 3
  passos: cadastro → aprovação-que-já-é-pagamento (`aprovarBaixa` cria o
  `LancamentoBancario` na própria transação de aprovação) → conciliação.
  Não existe "programação" em nenhum lugar do schema. Desacoplar
  aprovação de pagamento é uma mudança de comportamento real (não uma
  extensão pequena) e não deve ser feita sem um pedido de negócio
  explícito — retomar só se/quando isso for pedido.
- **Ramo de classificação automática sem match** (dentro de
  `processarLinhasPendentes`, em `conciliacao.ts`) não gera `AuditLog` —
  decisão consciente, não um gap: é uma classificação derivada
  (`SUGESTAO`/`DIVERGENCIA_VALOR`/`DIVERGENCIA_DATA`/`DUPLICADO`, sem
  vincular nenhum `LancamentoBancario`), o mesmo princípio já aplicado a
  `recalcularEPersistirStatusParcela`, que também não audita por ser
  derivado, não uma ação de usuário.
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/auditoria/page.tsx docs/backlog.md
git commit -m "feat: wiring de filtros e paginacao na tela de auditoria"
```
