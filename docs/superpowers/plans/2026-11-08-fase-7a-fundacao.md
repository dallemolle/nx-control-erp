# Fase 7a — Fundação: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar perfis PRODUCAO/VENDAS, permissões novas, menu filtrado por permissão, cadastros de fruta/produto/insumo/talhão/local, configuração de produção por filial e os ajustes em Cliente/Fornecedor.

**Architecture:** Segue os cadastros existentes (`safra.ts` + `/cadastros/safras`): serviço por entidade com `requirePermission` + `requireAlteracaoFilial` + `registrarAuditoria`, schema Zod em `src/lib/schemas/`, página server component com tabela e diálogo client. Uma migration Prisma. O menu passa a declarar a ação exigida por item.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 7 + Postgres, Zod 4, Vitest, base-ui.

**Spec:** [`docs/superpowers/specs/2026-11-08-fase-7a-fundacao-design.md`](../specs/2026-11-08-fase-7a-fundacao-design.md)

## Global Constraints

- Kg em `Decimal(18,3)`; R$/kg e custo unitário em `Decimal(18,4)`; área em `Decimal(10,2)`.
- Tabelas em snake_case no plural (`@@map`); uuid; `criadoEm`/`atualizadoEm`.
- Toda escrita: `requirePermission` → `requireAlteracaoFilial` → operação → `registrarAuditoria`.
- Escopo: fruta, produto, insumo, cliente por `empresaId`; talhão, local, configuração por `filialId` — também no `where` de update/ativação.
- Duplicidade (P2002) vira mensagem de campo, nunca erro genérico do banco.
- Sem dados reais da Hortitex no seed, nos testes ou nos docs.
- Decimal do Prisma não atravessa para client component: converter com `Number(...)` antes.
- Testes de integração rodam contra o Postgres local (`npm test`; `.env` com `DATABASE_URL`).
- Commits com mensagem convencional e a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/<ts>_fase_7a_fundacao/` | Enums, 6 models, Perfil, Cliente/Fornecedor |
| `src/server/auth/permissions.ts` (+ test) | Ações novas, matriz, helpers `pode…` |
| `src/app/(dashboard)/nav-items.ts` (+ `nav-items.test.ts`), `sidebar.tsx` | Menu por ação |
| `src/lib/schemas/campos.ts` (+ test) | `checkboxSchema`, `numeroOpcional` |
| `src/server/services/duplicidade.ts` (+ test) | `comMensagemDeDuplicidade`, `DuplicidadeError` |
| `src/server/services/producaoTestFixtures.ts` | Fixture de empresa/filiais/sessões para os testes |
| `src/lib/schemas/enums.ts` | Enums e rótulos novos |
| `src/lib/cnpjCpf.ts` (+ test) | `cnpjCpfOpcionalSchema` |
| `src/lib/schemas/cliente.ts`, `src/server/services/cliente.ts` (+ test), `src/server/services/resolucaoCadastros.ts` (+ test), `/cadastros/clientes/*` | Cliente sem documento, campos de venda, `cliente:escrever` |
| `src/lib/schemas/fornecedor.ts`, `src/server/services/fornecedor.ts`, `/cadastros/fornecedores/fornecedor-dialog-form.tsx` | Município |
| `src/lib/schemas/{fruta,produto,insumo,talhao,localArmazenamento,configuracaoProducao}.ts` (+ tests) | Validação |
| `src/server/services/{fruta,produto,insumo,talhao,localArmazenamento,configuracaoProducao}.ts` (+ tests) | Regras e persistência |
| `src/app/(dashboard)/cadastros/{frutas,produtos,insumos,talhoes,locais-armazenamento}/` | Telas |
| `src/app/(dashboard)/configuracao-producao/` | Tela de configuração |
| `src/lib/schemas/usuario.ts`, `/usuarios/*` | Perfis novos e rótulos |
| `prisma/seed.ts`, `content/ajuda/passo-a-passo.md` | Catálogo de exemplo e ajuda |

---

### Task 1: Schema Prisma e migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_fase_7a_fundacao/migration.sql` (gerada)
- Modify: `src/server/services/resolucaoCadastros.ts:56`
- Modify: `src/app/(dashboard)/cadastros/clientes/page.tsx:45`

**Interfaces:**
- Produces: tipos Prisma `Fruta`, `Produto`, `Insumo`, `Talhao`, `LocalArmazenamento`, `ConfiguracaoProducao`; enums `CategoriaProduto`, `Conservacao`, `TipoLocalArmazenamento`, `CanalVenda`; `Perfil` com `PRODUCAO` e `VENDAS`; `Cliente.cnpjCpf: string | null`.

- [ ] **Step 1: Editar o schema**

(`Perfil` muda na Task 2, com migration própria: o tipo `Record<Perfil, …>` da matriz só compila junto com as permissões novas.)

Acrescentar os enums:

```prisma
enum CategoriaProduto {
  FRUTO
  POLPA
}

enum Conservacao {
  IN_NATURA
  RESFRIADO
  CONGELADO
}

enum TipoLocalArmazenamento {
  CAMARA_FRIA
  FREEZER
  REFRIGERADOR
  RECEPCAO
  OUTRO
}

enum CanalVenda {
  BATEDOR
  ATACADO
  VAREJO
  RESTAURANTE
  INDUSTRIA
  CONSUMIDOR_FINAL
  OUTRO
}
```

Em `model Cliente`: `cnpjCpf String?` e, depois de `classificacaoFiscalPadrao`:

```prisma
  canalVenda          CanalVenda?
  municipio           String?
  enderecoEntrega     String?
  retiraNaPropriedade Boolean     @default(false)
```

Em `model Fornecedor`, depois de `classificacaoFiscalPadrao`: `municipio String?`.

Models novos:

```prisma
model Fruta {
  id                 String   @id @default(uuid())
  empresaId          String
  nome               String
  custoPadraoKg      Decimal  @default(0) @db.Decimal(18, 4)
  exigeBranqueamento Boolean  @default(false)
  ativo              Boolean  @default(true)
  criadoEm           DateTime @default(now())
  atualizadoEm       DateTime @updatedAt

  empresa  Empresa   @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  produtos Produto[]
  talhoes  Talhao[]

  @@unique([empresaId, nome])
  @@index([empresaId])
  @@map("frutas")
}

model Produto {
  id                String           @id @default(uuid())
  empresaId         String
  codigo            String
  descricao         String
  categoria         CategoriaProduto
  frutaId           String
  conservacao       Conservacao
  validadeDias      Int
  precoReferenciaKg Decimal?         @db.Decimal(18, 4)
  armazenamento     String?
  unidadeComercial  String?
  fatorUnidadeKg    Decimal?         @db.Decimal(18, 3)
  ativo             Boolean          @default(true)
  criadoEm          DateTime         @default(now())
  atualizadoEm      DateTime         @updatedAt

  empresa Empresa @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  fruta   Fruta   @relation(fields: [frutaId], references: [id], onDelete: Restrict)

  @@unique([empresaId, codigo])
  @@index([empresaId])
  @@map("produtos")
}

model Insumo {
  id            String   @id @default(uuid())
  empresaId     String
  nome          String
  unidade       String
  custoUnitario Decimal  @db.Decimal(18, 4)
  ativo         Boolean  @default(true)
  criadoEm      DateTime @default(now())
  atualizadoEm  DateTime @updatedAt

  empresa Empresa @relation(fields: [empresaId], references: [id], onDelete: Cascade)

  @@unique([empresaId, nome])
  @@index([empresaId])
  @@map("insumos")
}

model Talhao {
  id           String   @id @default(uuid())
  filialId     String
  nome         String
  frutaId      String
  areaHa       Decimal  @db.Decimal(10, 2)
  anoPlantio   Int?
  espacamento  String?
  observacao   String?
  ativo        Boolean  @default(true)
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  filial Filial @relation(fields: [filialId], references: [id], onDelete: Cascade)
  fruta  Fruta  @relation(fields: [frutaId], references: [id], onDelete: Restrict)

  @@unique([filialId, nome])
  @@index([filialId])
  @@map("talhoes")
}

model LocalArmazenamento {
  id           String                 @id @default(uuid())
  filialId     String
  nome         String
  tipo         TipoLocalArmazenamento
  temperatura  String?
  capacidadeKg Decimal?               @db.Decimal(18, 3)
  ativo        Boolean                @default(true)
  criadoEm     DateTime               @default(now())
  atualizadoEm DateTime               @updatedAt

  filial Filial @relation(fields: [filialId], references: [id], onDelete: Cascade)

  @@unique([filialId, nome])
  @@index([filialId])
  @@map("locais_armazenamento")
}

model ConfiguracaoProducao {
  filialId                      String   @id
  registroAdepara               String?
  alertaVencimentoCongeladoDias Int      @default(30)
  alertaVencimentoResfriadoDias Int      @default(1)
  branqueamentoTemperaturaMinC  Decimal  @default(80) @db.Decimal(5, 1)
  branqueamentoTempoMinS        Int      @default(10)
  toleranciaBalancoMassa        Decimal  @default(0.03) @db.Decimal(5, 4)
  criadoEm                      DateTime @default(now())
  atualizadoEm                  DateTime @updatedAt

  filial Filial @relation(fields: [filialId], references: [id], onDelete: Cascade)

  @@map("configuracoes_producao")
}
```

Back-relations: em `Empresa` acrescentar `frutas Fruta[]`, `produtos Produto[]`, `insumos Insumo[]`; em `Filial`, `talhoes Talhao[]`, `locaisArmazenamento LocalArmazenamento[]`, `configuracaoProducao ConfiguracaoProducao?`.

- [ ] **Step 2: Gerar a migration**

Run: `npx prisma migrate dev --name fase_7a_fundacao`
Expected: migration criada e aplicada; `Generated Prisma Client`. Conferir no SQL gerado: `ALTER COLUMN "cnpjCpf" DROP NOT NULL` em `clientes`, 6 `CREATE TABLE`, nenhum `DROP` de dado.

- [ ] **Step 3: Corrigir os usos que quebram com `cnpjCpf` opcional**

`src/app/(dashboard)/cadastros/clientes/cliente-dialog-form.tsx`: no tipo `Cliente`, `cnpjCpf: string | null`; no input, `defaultValue={cliente?.cnpjCpf ?? ""}`.

`src/server/services/resolucaoCadastros.ts`, na montagem do mapa:

```ts
    mapaContraparte: new Map(
      contrapartes
        .filter((c): c is typeof c & { cnpjCpf: string } => c.cnpjCpf !== null)
        .map((c) => [normalizarDocumento(c.cnpjCpf), c.id]),
    ),
```

`src/app/(dashboard)/cadastros/clientes/page.tsx`: `<TableCell>{cliente.cnpjCpf ?? "—"}</TableCell>`.

- [ ] **Step 4: Teste da resolução com cliente sem documento**

Em `src/server/services/resolucaoCadastros.test.ts`, acrescentar (usando a fixture que o arquivo já usa — ler o topo do arquivo; se usar `criarFixtureFinanceiro`, `fixture.sessao` e `fixture.empresaId`):

```ts
test("cliente sem CPF/CNPJ não quebra o mapa e o cliente com documento continua resolvido", async () => {
  await prisma.cliente.create({
    data: { empresaId: fixture.empresaId, nome: "Consumidor final", cnpjCpf: null },
  });
  const cadastros = await carregarCadastrosParaResolucao(fixture.sessao, "RECEBER");
  const clienteComDoc = await prisma.cliente.findFirstOrThrow({
    where: { empresaId: fixture.empresaId, cnpjCpf: { not: null } },
  });
  const erros: string[] = [];
  expect(resolverContraparte(cadastros, clienteComDoc.cnpjCpf!, erros, new Set())).toBe(clienteComDoc.id);
  expect(erros).toEqual([]);
});
```

- [ ] **Step 5: Rodar e verificar**

Run: `npx vitest run src/server/services/resolucaoCadastros.test.ts` → PASS.
Run: `npx tsc --noEmit` → sem erros.

- [ ] **Step 6: Commit**

```bash
git add prisma src/server/services/resolucaoCadastros.ts src/server/services/resolucaoCadastros.test.ts "src/app/(dashboard)/cadastros/clientes"
git commit -m "feat(producao): schema da Fase 7a (cadastros de produção e cliente sem documento)"
```

---

### Task 2: Permissões e perfis

**Files:**
- Modify: `prisma/schema.prisma` (`enum Perfil`)
- Create: `prisma/migrations/<timestamp>_perfis_producao_vendas/migration.sql` (gerada)
- Modify: `src/server/auth/permissions.ts`
- Modify: `src/server/auth/permissions.test.ts`
- Modify: `src/lib/schemas/usuario.ts`
- Modify: `src/app/(dashboard)/usuarios/perfil-form.tsx`, `src/app/(dashboard)/usuarios/novo-usuario-dialog.tsx`

**Interfaces:**
- Produces: `Acao` com as 10 ações novas; `podeEscreverCadastroProducao(perfil, podeAlterarFilial): boolean`, `podeEscreverCliente(perfil, podeAlterarFilial): boolean`, `podeConfigurarProducao(perfil, podeAlterarFilial): boolean`; `ROTULOS_PERFIL: Record<Perfil, string>` em `src/lib/schemas/usuario.ts`.

- [ ] **Step 1: Testes que falham**

Acrescentar a `permissions.test.ts`:

```ts
import type { Perfil } from "@prisma/client";
import { podeExecutar, podeEscreverCadastroProducao, podeEscreverCliente, podeConfigurarProducao } from "./permissions";
import type { Acao } from "./permissions";

const ACOES_FASE_7: Acao[] = [
  "cadastroProducao:escrever",
  "cliente:escrever",
  "producao:configurar",
  "producao:ler",
  "producao:escrever",
  "estoque:ajustar",
  "venda:ler",
  "venda:escrever",
  "venda:cancelar",
  "venda:liberarVencido",
];

const ESPERADO: Record<Exclude<Perfil, "ADMINISTRADOR">, Acao[]> = {
  FINANCEIRO: ["cliente:escrever", "producao:ler", "venda:ler", "venda:escrever", "venda:cancelar"],
  TESOURARIA: ["cliente:escrever", "producao:ler", "venda:ler"],
  GESTOR: ["producao:ler", "venda:ler", "venda:liberarVencido"],
  AUDITOR: ["producao:ler", "venda:ler"],
  CONSULTA: ["producao:ler", "venda:ler"],
  PRODUCAO: ["cadastroProducao:escrever", "producao:ler", "producao:escrever", "estoque:ajustar", "venda:ler"],
  VENDAS: ["cliente:escrever", "producao:ler", "venda:ler", "venda:escrever"],
};

describe("matriz da Fase 7", () => {
  for (const [perfil, permitidas] of Object.entries(ESPERADO) as [Perfil, Acao[]][]) {
    test(`${perfil} tem exatamente as ações esperadas da Fase 7`, () => {
      const obtidas = ACOES_FASE_7.filter((acao) => podeExecutar(perfil, acao));
      expect(obtidas.sort()).toEqual([...permitidas].sort());
    });
  }

  test("ADMINISTRADOR tem todas", () => {
    expect(ACOES_FASE_7.every((acao) => podeExecutar("ADMINISTRADOR", acao))).toBe(true);
  });

  test("PRODUCAO e VENDAS leem cadastros e não tocam no financeiro", () => {
    for (const perfil of ["PRODUCAO", "VENDAS"] as const) {
      expect(podeExecutar(perfil, "cadastro:ler")).toBe(true);
      expect(podeExecutar(perfil, "cadastro:escrever")).toBe(false);
      for (const acao of ["titulo:ler", "lancamento:ler", "conciliacao:ler", "orcamento:ler"] as const) {
        expect(podeExecutar(perfil, acao)).toBe(false);
      }
    }
  });

  test("helpers respeitam filial somente leitura", () => {
    expect(podeEscreverCadastroProducao("PRODUCAO", true)).toBe(true);
    expect(podeEscreverCadastroProducao("PRODUCAO", false)).toBe(false);
    expect(podeEscreverCadastroProducao("FINANCEIRO", true)).toBe(false);
    expect(podeEscreverCliente("VENDAS", true)).toBe(true);
    expect(podeEscreverCliente("CONSULTA", true)).toBe(false);
    expect(podeConfigurarProducao("ADMINISTRADOR", true)).toBe(true);
    expect(podeConfigurarProducao("PRODUCAO", true)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar** — `npx vitest run src/server/auth/permissions.test.ts` → FAIL (ações/helpers inexistentes).

- [ ] **Step 3: Implementar**

Em `prisma/schema.prisma`, `enum Perfil` ganha `PRODUCAO` e `VENDAS` depois de `CONSULTA`. Run: `npx prisma migrate dev --name perfis_producao_vendas` → SQL com dois `ALTER TYPE "Perfil" ADD VALUE`.

Em `Acao`, acrescentar:

```ts
  | "cadastroProducao:escrever"
  | "cliente:escrever"
  | "producao:configurar"
  | "producao:ler"
  | "producao:escrever"
  | "estoque:ajustar"
  | "venda:ler"
  | "venda:escrever"
  | "venda:cancelar"
  | "venda:liberarVencido";
```

Em `PERMISSOES`, acrescentar a cada `Set` as ações da tabela `ESPERADO` acima e criar:

```ts
  PRODUCAO: new Set([
    "cadastro:ler",
    "cadastroProducao:escrever",
    "producao:ler",
    "producao:escrever",
    "estoque:ajustar",
    "venda:ler",
  ]),
  VENDAS: new Set(["cadastro:ler", "cliente:escrever", "producao:ler", "venda:ler", "venda:escrever"]),
```

Helpers, no fim do arquivo:

```ts
export function podeEscreverCadastroProducao(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "cadastroProducao:escrever") && podeAlterarFilial;
}

export function podeEscreverCliente(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "cliente:escrever") && podeAlterarFilial;
}

export function podeConfigurarProducao(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "producao:configurar") && podeAlterarFilial;
}
```

Em `src/lib/schemas/usuario.ts`: `PERFIS` ganha `"PRODUCAO", "VENDAS"` e:

```ts
export const ROTULOS_PERFIL: Record<(typeof PERFIS)[number], string> = {
  ADMINISTRADOR: "Administrador",
  FINANCEIRO: "Financeiro",
  TESOURARIA: "Tesouraria",
  GESTOR: "Gestor",
  AUDITOR: "Auditor",
  CONSULTA: "Consulta",
  PRODUCAO: "Produção",
  VENDAS: "Vendas",
};
```

Em `perfil-form.tsx` e `novo-usuario-dialog.tsx`, o texto do `SelectItem` passa de `{opcao}` para `{ROTULOS_PERFIL[opcao]}`. Na lista de `/usuarios/page.tsx`, se o perfil aparecer como texto, usar o rótulo também.

- [ ] **Step 4: Rodar** — `npx vitest run src/server/auth` → PASS; `npx tsc --noEmit` → limpo.

- [ ] **Step 5: Commit** — `git commit -m "feat(producao): perfis Produção e Vendas e permissões da Fase 7"`

---

### Task 3: Menu filtrado por permissão

**Files:**
- Modify: `src/app/(dashboard)/nav-items.ts`
- Create: `src/app/(dashboard)/nav-items.test.ts`
- Modify: `src/app/(dashboard)/sidebar.tsx:99-102`

**Interfaces:**
- Consumes: `podeExecutar`, `Acao` (Task 2).
- Produces: `NavItem = { href; label; acao?: Acao }`; `secoesVisiveis(perfil: Perfil): NavSection[]`.

- [ ] **Step 1: Teste que falha** (`nav-items.test.ts`)

```ts
import { describe, expect, test } from "vitest";
import type { Perfil } from "@prisma/client";
import { secoesVisiveis } from "./nav-items";

function hrefs(perfil: Perfil): string[] {
  return secoesVisiveis(perfil).flatMap((s) => s.itens.map((i) => i.href));
}

describe("secoesVisiveis", () => {
  test("ADMINISTRADOR vê tudo, inclusive Configuração de produção e os cadastros novos", () => {
    const h = hrefs("ADMINISTRADOR");
    expect(h).toContain("/configuracao-producao");
    expect(h).toContain("/cadastros/produtos");
    expect(h).toContain("/financeiro/aprovacoes");
  });

  test("Aprovações só para quem aprova (ADMINISTRADOR e TESOURARIA)", () => {
    expect(hrefs("TESOURARIA")).toContain("/financeiro/aprovacoes");
    expect(hrefs("FINANCEIRO")).not.toContain("/financeiro/aprovacoes");
  });

  test("Fluxo de caixa estratégico some para quem não pode abrir a página", () => {
    for (const perfil of ["FINANCEIRO", "TESOURARIA", "CONSULTA"] as const) {
      expect(hrefs(perfil)).not.toContain("/financeiro/fluxo-de-caixa-estrategico");
    }
    expect(hrefs("GESTOR")).toContain("/financeiro/fluxo-de-caixa-estrategico");
  });

  test("PRODUCAO e VENDAS não veem Financeiro, Controladoria nem Administração", () => {
    for (const perfil of ["PRODUCAO", "VENDAS"] as const) {
      const titulos = secoesVisiveis(perfil).map((s) => s.titulo);
      expect(titulos).not.toContain("Financeiro");
      expect(titulos).not.toContain("Controladoria");
      expect(titulos).not.toContain("Administração");
      expect(titulos).toContain("Cadastros");
      expect(titulos).toContain("Ajuda");
    }
  });

  test("seção sem itens visíveis é omitida", () => {
    expect(secoesVisiveis("CONSULTA").every((s) => s.itens.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar** — FAIL (`secoesVisiveis` não existe).

- [ ] **Step 3: Implementar**

`nav-items.ts`:

```ts
import type { Perfil } from "@prisma/client";
import { podeExecutar, type Acao } from "@/server/auth/permissions";

export type NavItem = { href: string; label: string; acao?: Acao };
export type NavSection = { titulo: string; itens: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    titulo: "Financeiro",
    itens: [
      { href: "/financeiro/contas-a-pagar", label: "Contas a pagar", acao: "titulo:ler" },
      { href: "/financeiro/contas-a-receber", label: "Contas a receber", acao: "titulo:ler" },
      { href: "/financeiro/aprovacoes", label: "Aprovações pendentes", acao: "titulo:aprovar" },
      { href: "/financeiro/tesouraria", label: "Tesouraria", acao: "lancamento:ler" },
      { href: "/financeiro/conciliacao", label: "Conciliação", acao: "conciliacao:ler" },
      { href: "/financeiro/fluxo-de-caixa", label: "Fluxo de caixa", acao: "lancamento:ler" },
      { href: "/financeiro/fluxo-de-caixa-projetado", label: "Fluxo de caixa projetado", acao: "titulo:ler" },
      {
        href: "/financeiro/fluxo-de-caixa-estrategico",
        label: "Fluxo de caixa estratégico",
        acao: "planejamentoEstrategico:ler",
      },
    ],
  },
  {
    titulo: "Controladoria",
    itens: [
      { href: "/controladoria/orcamento", label: "Orçamento", acao: "orcamento:ler" },
      { href: "/controladoria/fluxo-por-dimensao", label: "Fluxo de caixa por dimensão", acao: "titulo:ler" },
      { href: "/controladoria/comparacao-safras", label: "Comparação entre safras", acao: "orcamento:ler" },
      { href: "/controladoria/fiscal-gerencial", label: "Fiscal × gerencial", acao: "titulo:ler" },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { href: "/cadastros/clientes", label: "Clientes", acao: "cadastro:ler" },
      { href: "/cadastros/fornecedores", label: "Fornecedores", acao: "cadastro:ler" },
      { href: "/cadastros/categorias", label: "Categorias financeiras", acao: "cadastro:ler" },
      { href: "/cadastros/centros-de-custo", label: "Centros de custo", acao: "cadastro:ler" },
      { href: "/cadastros/centros-de-lucro", label: "Centros de lucro", acao: "cadastro:ler" },
      { href: "/cadastros/safras", label: "Safras", acao: "cadastro:ler" },
      { href: "/cadastros/projetos", label: "Projetos", acao: "cadastro:ler" },
      { href: "/cadastros/frutas", label: "Frutas", acao: "cadastro:ler" },
      { href: "/cadastros/produtos", label: "Produtos", acao: "cadastro:ler" },
      { href: "/cadastros/insumos", label: "Insumos", acao: "cadastro:ler" },
      { href: "/cadastros/talhoes", label: "Talhões", acao: "cadastro:ler" },
      { href: "/cadastros/locais-armazenamento", label: "Locais de armazenamento", acao: "cadastro:ler" },
      { href: "/cadastros/bancos", label: "Bancos", acao: "cadastro:ler" },
      { href: "/cadastros/contas-bancarias", label: "Contas bancárias", acao: "cadastro:ler" },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { href: "/empresas", label: "Empresas", acao: "empresa:gerenciar" },
      { href: "/filiais", label: "Filiais", acao: "filial:gerenciar" },
      { href: "/usuarios", label: "Usuários", acao: "usuario:gerenciar" },
      { href: "/configuracao-producao", label: "Configuração de produção", acao: "producao:configurar" },
      { href: "/auditoria", label: "Auditoria", acao: "auditoria:ler" },
    ],
  },
  {
    titulo: "Gestão",
    itens: [{ href: "/dashboard-executivo", label: "Dashboard executivo", acao: "dashboardExecutivo:ler" }],
  },
  {
    titulo: "Ajuda",
    itens: [
      { href: "/ajuda/passo-a-passo", label: "Passo a passo" },
      { href: "/ajuda/novidades", label: "Novidades" },
    ],
  },
];

/** Seções e itens que o perfil pode abrir; item sem `acao` aparece para todos. */
export function secoesVisiveis(perfil: Perfil): NavSection[] {
  return NAV_SECTIONS.map((secao) => ({
    ...secao,
    itens: secao.itens.filter((item) => !item.acao || podeExecutar(perfil, item.acao)),
  })).filter((secao) => secao.itens.length > 0);
}
```

Os itens novos apontam para páginas criadas nas Tasks 6–11; até lá dão 404, o que não quebra teste nem build.

`sidebar.tsx`: trocar o bloco das linhas 99-102 por `const secoesVisiveis = secoesVisiveisDoPerfil(perfil);` com `import { secoesVisiveis as secoesVisiveisDoPerfil } from "./nav-items";` (o nome local `secoesVisiveis` continua sendo usado no resto do componente).

- [ ] **Step 4: Rodar** — `npx vitest run "src/app/(dashboard)/nav-items.test.ts"` → PASS; `npx tsc --noEmit` → limpo (nenhum uso restante de `permitido`: `grep -rn "permitido" src` vazio).

- [ ] **Step 5: Commit** — `git commit -m "feat(menu): itens do menu filtrados pela permissão que a página exige"`

---

### Task 4: Utilitários compartilhados (campos, duplicidade, enums, fixture)

**Files:**
- Create: `src/lib/schemas/campos.ts`, `src/lib/schemas/campos.test.ts`
- Create: `src/server/services/duplicidade.ts`, `src/server/services/duplicidade.test.ts`
- Create: `src/server/services/producaoTestFixtures.ts`
- Modify: `src/lib/schemas/enums.ts`

**Interfaces:**
- Produces:
  - `checkboxSchema: z.ZodType<boolean>` — `"on"`/`"true"`/`true` → `true`; ausente → `false`.
  - `numeroOpcional(schema: z.ZodNumber)` — `""`/ausente → `undefined`; senão `Number(v)` validado por `schema`.
  - `textoOpcional` — trim; `""` → `null`.
  - `DuplicidadeError`; `comMensagemDeDuplicidade<T>(op: () => Promise<T>, mensagem: string): Promise<T>`.
  - `CATEGORIA_PRODUTO`, `CONSERVACAO`, `TIPO_LOCAL_ARMAZENAMENTO`, `CANAL_VENDA` (tuplas `as const`) e `ROTULOS_CATEGORIA_PRODUTO`, `ROTULOS_CONSERVACAO`, `ROTULOS_TIPO_LOCAL`, `ROTULOS_CANAL_VENDA`.
  - `criarFixtureProducao(sufixo: string): Promise<FixtureProducao>` com `{ empresaId, outraEmpresaId, filialAId, filialBId, usuarioId, sessao(perfil, opcoes?), limpar() }`.

- [ ] **Step 1: Testes que falham**

`campos.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { checkboxSchema, numeroOpcional, textoOpcional } from "./campos";

describe("checkboxSchema", () => {
  test("on/true viram true; ausente vira false", () => {
    expect(checkboxSchema.parse("on")).toBe(true);
    expect(checkboxSchema.parse("true")).toBe(true);
    expect(checkboxSchema.parse(undefined)).toBe(false);
    expect(checkboxSchema.parse("false")).toBe(false);
  });
});

describe("numeroOpcional", () => {
  const schema = numeroOpcional(z.number().positive("Deve ser maior que zero"));
  test("vazio vira undefined", () => {
    expect(schema.parse("")).toBeUndefined();
    expect(schema.parse(undefined)).toBeUndefined();
  });
  test("texto numérico vira número validado", () => {
    expect(schema.parse("14.5")).toBe(14.5);
    expect(schema.safeParse("0").success).toBe(false);
    expect(schema.safeParse("abc").success).toBe(false);
  });
});

describe("textoOpcional", () => {
  test("vazio vira null; texto é aparado", () => {
    expect(textoOpcional.parse("")).toBeNull();
    expect(textoOpcional.parse("  -18 °C ")).toBe("-18 °C");
    expect(textoOpcional.parse(undefined)).toBeNull();
  });
});
```

`duplicidade.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { Prisma } from "@prisma/client";
import { comMensagemDeDuplicidade, DuplicidadeError } from "./duplicidade";

describe("comMensagemDeDuplicidade", () => {
  test("P2002 vira DuplicidadeError com a mensagem", async () => {
    const erroP2002 = new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "x" });
    await expect(
      comMensagemDeDuplicidade(() => Promise.reject(erroP2002), "Já existe uma fruta com este nome"),
    ).rejects.toThrow(new DuplicidadeError("Já existe uma fruta com este nome"));
  });

  test("outros erros passam sem mudança", async () => {
    const outro = new Error("falhou");
    await expect(comMensagemDeDuplicidade(() => Promise.reject(outro), "x")).rejects.toBe(outro);
  });

  test("sucesso devolve o resultado", async () => {
    await expect(comMensagemDeDuplicidade(() => Promise.resolve(42), "x")).resolves.toBe(42);
  });
});
```

- [ ] **Step 2: Rodar** — FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

`src/lib/schemas/campos.ts`:

```ts
import { z } from "zod";

/** Checkbox de formulário HTML: posta "on" quando marcado e nada quando desmarcado. */
export const checkboxSchema = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Número opcional vindo de `<input type="number">`: vazio vira `undefined`. */
export function numeroOpcional(schema: z.ZodNumber) {
  return z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    schema.optional(),
  );
}

/** Texto opcional: aparado; vazio vira `null` (gravado como nulo). */
export const textoOpcional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
  z.string().nullable(),
);
```

`src/server/services/duplicidade.ts`:

```ts
import { Prisma } from "@prisma/client";

export class DuplicidadeError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "DuplicidadeError";
  }
}

/** Troca a violação de unicidade do banco (P2002) por uma mensagem para o usuário. */
export async function comMensagemDeDuplicidade<T>(operacao: () => Promise<T>, mensagem: string): Promise<T> {
  try {
    return await operacao();
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      throw new DuplicidadeError(mensagem);
    }
    throw erro;
  }
}
```

`src/lib/schemas/enums.ts`, no fim:

```ts
export const CATEGORIA_PRODUTO = ["FRUTO", "POLPA"] as const;
export const CONSERVACAO = ["IN_NATURA", "RESFRIADO", "CONGELADO"] as const;
export const TIPO_LOCAL_ARMAZENAMENTO = ["CAMARA_FRIA", "FREEZER", "REFRIGERADOR", "RECEPCAO", "OUTRO"] as const;
export const CANAL_VENDA = [
  "BATEDOR",
  "ATACADO",
  "VAREJO",
  "RESTAURANTE",
  "INDUSTRIA",
  "CONSUMIDOR_FINAL",
  "OUTRO",
] as const;

export const ROTULOS_CATEGORIA_PRODUTO = { FRUTO: "Fruto", POLPA: "Polpa" } as const;
export const ROTULOS_CONSERVACAO = { IN_NATURA: "In natura", RESFRIADO: "Resfriado", CONGELADO: "Congelado" } as const;
export const ROTULOS_TIPO_LOCAL = {
  CAMARA_FRIA: "Câmara fria",
  FREEZER: "Freezer",
  REFRIGERADOR: "Refrigerador",
  RECEPCAO: "Recepção",
  OUTRO: "Outro",
} as const;
export const ROTULOS_CANAL_VENDA = {
  BATEDOR: "Batedor / ponto de açaí",
  ATACADO: "Atacado / distribuidor",
  VAREJO: "Varejo / mercado",
  RESTAURANTE: "Restaurante / lanchonete",
  INDUSTRIA: "Indústria",
  CONSUMIDOR_FINAL: "Consumidor final",
  OUTRO: "Outro",
} as const;
```

`src/server/services/producaoTestFixtures.ts`:

```ts
import type { Perfil } from "@prisma/client";
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";

export type FixtureProducao = {
  empresaId: string;
  outraEmpresaId: string;
  filialAId: string;
  filialBId: string;
  usuarioId: string;
  /** Sessão na filial A (ou B) com o perfil pedido; as permissões vêm só do perfil. */
  sessao: (perfil: Perfil, opcoes?: { filial?: "A" | "B"; somenteLeitura?: boolean }) => SessaoAtiva;
  limpar: () => Promise<void>;
};

export async function criarFixtureProducao(sufixo: string): Promise<FixtureProducao> {
  const d = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
  const empresa = await prisma.empresa.create({
    data: { razaoSocial: `Prod ${sufixo} Ltda`, nomeFantasia: `Prod ${sufixo}`, cnpjCpf: `44.${d}/0001-01` },
  });
  const outra = await prisma.empresa.create({
    data: { razaoSocial: `Outra ${sufixo} Ltda`, nomeFantasia: `Outra ${sufixo}`, cnpjCpf: `44.${d}/0001-02` },
  });
  const filialA = await prisma.filial.create({
    data: { empresaId: empresa.id, nome: "Filial A", cnpjCpf: `44.${d}/0001-03` },
  });
  const filialB = await prisma.filial.create({
    data: { empresaId: empresa.id, nome: "Filial B", cnpjCpf: `44.${d}/0001-04` },
  });
  const usuario = await prisma.usuario.create({
    data: { nome: `Usuario ${sufixo}`, email: `producao-${sufixo}-${d}@teste.local`, senhaHash: "x" },
  });

  return {
    empresaId: empresa.id,
    outraEmpresaId: outra.id,
    filialAId: filialA.id,
    filialBId: filialB.id,
    usuarioId: usuario.id,
    sessao: (perfil, opcoes = {}) => ({
      usuarioId: usuario.id,
      nome: usuario.nome,
      empresaId: empresa.id,
      perfil,
      filialId: opcoes.filial === "B" ? filialB.id : filialA.id,
      podeAlterarFilial: !opcoes.somenteLeitura,
    }),
    limpar: async () => {
      await prisma.auditLog.deleteMany({ where: { empresaId: { in: [empresa.id, outra.id] } } });
      await prisma.produto.deleteMany({ where: { empresaId: { in: [empresa.id, outra.id] } } });
      await prisma.talhao.deleteMany({ where: { filial: { empresaId: { in: [empresa.id, outra.id] } } } });
      await prisma.empresa.deleteMany({ where: { id: { in: [empresa.id, outra.id] } } });
      await prisma.usuario.delete({ where: { id: usuario.id } });
    },
  };
}
```

(Produto e talhão são apagados antes da empresa porque `Fruta` tem `onDelete: Restrict` para eles.)

- [ ] **Step 4: Rodar** — `npx vitest run src/lib/schemas/campos.test.ts src/server/services/duplicidade.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(producao): utilitários de formulário, duplicidade e fixture de testes"`

---

### Task 5: Cliente sem documento, campos de venda e `cliente:escrever`

**Files:**
- Modify: `src/lib/cnpjCpf.ts` (+ `src/lib/cnpjCpf.test.ts` se existir; senão criar)
- Modify: `src/lib/schemas/cliente.ts`, `src/server/services/cliente.ts`, `src/server/services/cliente.test.ts`
- Modify: `src/app/(dashboard)/cadastros/clientes/page.tsx`, `cliente-dialog-form.tsx`
- Modify: `src/lib/schemas/fornecedor.ts`, `src/server/services/fornecedor.ts`, `src/app/(dashboard)/cadastros/fornecedores/fornecedor-dialog-form.tsx`

**Interfaces:**
- Consumes: `checkboxSchema`, `textoOpcional`, `comMensagemDeDuplicidade`, `CANAL_VENDA`, `ROTULOS_CANAL_VENDA`, `criarFixtureProducao` (Task 4); `podeEscreverCliente` (Task 2).
- Produces: `cnpjCpfOpcionalSchema` (string vazia → `null`; preenchida → mesma regra 11/14 dígitos, formatada).

- [ ] **Step 1: Testes que falham**

`src/lib/cnpjCpf.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { cnpjCpfOpcionalSchema } from "./cnpjCpf";

describe("cnpjCpfOpcionalSchema", () => {
  test("vazio ou só espaços vira null", () => {
    expect(cnpjCpfOpcionalSchema.parse("")).toBeNull();
    expect(cnpjCpfOpcionalSchema.parse("  ")).toBeNull();
    expect(cnpjCpfOpcionalSchema.parse(undefined)).toBeNull();
  });
  test("preenchido é validado e formatado", () => {
    expect(cnpjCpfOpcionalSchema.parse("12345678901")).toBe("123.456.789-01");
    expect(cnpjCpfOpcionalSchema.safeParse("123").success).toBe(false);
  });
});
```

Em `cliente.test.ts`, novo `describe`:

```ts
describe("cliente - Fase 7 (documento opcional e permissão própria)", () => {
  let fx: FixtureProducao;
  beforeAll(async () => {
    fx = await criarFixtureProducao("cliente7");
  });
  afterAll(async () => {
    await fx.limpar();
  });

  const base = {
    nome: "Consumidor final",
    cnpjCpf: null,
    retiraNaPropriedade: false,
    canalVenda: "CONSUMIDOR_FINAL" as const,
  };

  test("dois clientes sem documento coexistem", async () => {
    await criarCliente(fx.sessao("VENDAS"), { ...base, nome: "Clientes diversos" });
    await criarCliente(fx.sessao("VENDAS"), base);
    const semDoc = await prisma.cliente.count({ where: { empresaId: fx.empresaId, cnpjCpf: null } });
    expect(semDoc).toBe(2);
  });

  test("documento repetido é recusado com mensagem", async () => {
    await criarCliente(fx.sessao("FINANCEIRO"), { ...base, nome: "A", cnpjCpf: "123.456.789-01" });
    await expect(
      criarCliente(fx.sessao("FINANCEIRO"), { ...base, nome: "B", cnpjCpf: "123.456.789-01" }),
    ).rejects.toThrow("Já existe um cliente com este CPF/CNPJ");
  });

  test("VENDAS cria cliente; CONSULTA e PRODUCAO não", async () => {
    await expect(criarCliente(fx.sessao("VENDAS"), { ...base, nome: "Batedor X" })).resolves.toBeDefined();
    await expect(criarCliente(fx.sessao("CONSULTA"), { ...base, nome: "Y" })).rejects.toThrow(PermissionError);
    await expect(criarCliente(fx.sessao("PRODUCAO"), { ...base, nome: "Z" })).rejects.toThrow(PermissionError);
  });

  test("grava os campos de venda", async () => {
    const c = await criarCliente(fx.sessao("VENDAS"), {
      ...base,
      nome: "Restaurante W",
      canalVenda: "RESTAURANTE",
      municipio: "Município Exemplo",
      enderecoEntrega: "Rua Exemplo, 1",
      retiraNaPropriedade: true,
    });
    expect(c).toMatchObject({ canalVenda: "RESTAURANTE", municipio: "Município Exemplo", retiraNaPropriedade: true });
  });
});
```

(Importar `criarFixtureProducao`, `FixtureProducao`, `PermissionError` e `beforeAll/afterAll`. `ClienteFormValues` é o tipo de saída do schema: o literal acima deve satisfazê-lo; campos opcionais omitidos.)

- [ ] **Step 2: Rodar** — `npx vitest run src/lib/cnpjCpf.test.ts src/server/services/cliente.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`src/lib/cnpjCpf.ts`, no fim:

```ts
/** CNPJ/CPF opcional: vazio vira `null`; preenchido segue `cnpjCpfSchema`. */
export const cnpjCpfOpcionalSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v : null),
  cnpjCpfSchema.nullable(),
);
```

`src/lib/schemas/cliente.ts`: `cnpjCpf: cnpjCpfOpcionalSchema,` e, no objeto:

```ts
    canalVenda: z.enum(CANAL_VENDA).optional().or(z.literal(SEM_VALOR)),
    municipio: textoOpcional.optional(),
    enderecoEntrega: textoOpcional.optional(),
    retiraNaPropriedade: checkboxSchema,
```

`src/server/services/cliente.ts`:
- `criarCliente`, `atualizarCliente`, `definirAtivoCliente`: `requirePermission(sessao.perfil, "cliente:escrever")`.
- `dadosNormalizados` ganha `canalVenda: normalizarOpcional(dados.canalVenda)`.
- `prisma.cliente.create(...)` e `prisma.cliente.update(...)` envolvidos em `comMensagemDeDuplicidade(() => …, "Já existe um cliente com este CPF/CNPJ")`.
- O `anterior` da auditoria de atualização ganha `canalVenda`, `municipio`, `enderecoEntrega`, `retiraNaPropriedade`.

`clientes/page.tsx`: `podeEscrever = podeEscreverCliente(sessao.perfil, sessao.podeAlterarFilial)`; coluna nova "Canal" com `cliente.canalVenda ? ROTULOS_CANAL_VENDA[cliente.canalVenda] : "—"`.

`cliente-dialog-form.tsx`:
- tipo `Cliente` com `cnpjCpf: string | null`, `canalVenda`, `municipio`, `enderecoEntrega`, `retiraNaPropriedade`;
- input de CNPJ/CPF sem `required`, label "CNPJ/CPF (opcional)" e ajuda "Deixe em branco para consumidor final ou clientes diversos.";
- depois da classificação fiscal, `<Separator />`, título "Vendas" e:

```tsx
<div className="space-y-2">
  <Label htmlFor="canalVenda">Canal de venda</Label>
  <Select name="canalVenda" defaultValue={cliente?.canalVenda ?? SEM_VALOR}>
    <SelectTrigger id="canalVenda" className="w-full">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={SEM_VALOR}>Nenhum</SelectItem>
      {CANAL_VENDA.map((canal) => (
        <SelectItem key={canal} value={canal}>
          {ROTULOS_CANAL_VENDA[canal]}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
<div className="space-y-2">
  <Label htmlFor="municipio">Município</Label>
  <Input id="municipio" name="municipio" defaultValue={cliente?.municipio ?? ""} />
</div>
<div className="space-y-2">
  <Label htmlFor="enderecoEntrega">Endereço de entrega</Label>
  <Input id="enderecoEntrega" name="enderecoEntrega" defaultValue={cliente?.enderecoEntrega ?? ""} />
</div>
<label className="flex items-center gap-2 text-sm">
  <input type="checkbox" name="retiraNaPropriedade" defaultChecked={cliente?.retiraNaPropriedade ?? false} />
  Retira na propriedade (pedido não gera entrega)
</label>
```

Fornecedor: `municipio: textoOpcional.optional()` no schema; campo "Município" no formulário (depois de telefone); no `anterior` da auditoria de atualização; tipo do formulário com `municipio: string | null`.

- [ ] **Step 4: Rodar** — `npx vitest run src/lib/cnpjCpf.test.ts src/server/services/cliente.test.ts src/server/services/fornecedor.test.ts` → PASS; `npx tsc --noEmit` → limpo.

- [ ] **Step 5: Commit** — `git commit -m "feat(cadastros): cliente sem CPF/CNPJ, dados de venda e permissão própria"`

---

### Task 6: Fruta

**Files:**
- Create: `src/lib/schemas/fruta.ts`, `src/server/services/fruta.ts`, `src/server/services/fruta.test.ts`
- Create: `src/app/(dashboard)/cadastros/frutas/{actions.ts,page.tsx,fruta-dialog-form.tsx}`

**Interfaces:**
- Consumes: Tasks 2 e 4.
- Produces: `frutaSchema`, `FrutaFormValues = { nome: string; custoPadraoKg: number; exigeBranqueamento: boolean }`; `listarFrutas(empresaId, opcoes?: { somenteAtivas?: boolean })`, `criarFruta(sessao, dados)`, `atualizarFruta(sessao, id, dados)`, `definirAtivoFruta(sessao, id, ativo)`, `requireFrutaAtiva(empresaId: string, frutaId: string): Promise<void>` (lança `Error("Fruta não encontrada ou inativa")`).

- [ ] **Step 1: Teste que falha** (`fruta.test.ts`)

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { FilialSomenteLeituraError, PermissionError } from "@/server/auth/permissions";
import { criarFixtureProducao, type FixtureProducao } from "./producaoTestFixtures";
import { atualizarFruta, criarFruta, definirAtivoFruta, listarFrutas, requireFrutaAtiva } from "./fruta";

describe("fruta (por empresa)", () => {
  let fx: FixtureProducao;
  beforeAll(async () => {
    fx = await criarFixtureProducao("fruta");
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("PRODUCAO cria, atualiza e inativa, com auditoria", async () => {
    const sessao = fx.sessao("PRODUCAO");
    const fruta = await criarFruta(sessao, { nome: "Açaí", custoPadraoKg: 1.5, exigeBranqueamento: true });
    expect(fruta.empresaId).toBe(fx.empresaId);
    await atualizarFruta(sessao, fruta.id, { nome: "Açaí", custoPadraoKg: 2, exigeBranqueamento: true });
    await definirAtivoFruta(sessao, fruta.id, false);
    const gravada = await prisma.fruta.findUniqueOrThrow({ where: { id: fruta.id } });
    expect(Number(gravada.custoPadraoKg)).toBe(2);
    expect(gravada.ativo).toBe(false);
    const acoes = await prisma.auditLog.findMany({ where: { entidadeId: fruta.id }, select: { acao: true } });
    expect(acoes.map((a) => a.acao).sort()).toEqual(["ATUALIZAR", "CRIAR", "INATIVAR"]);
  });

  test("é visível em qualquer filial da empresa", async () => {
    await criarFruta(fx.sessao("PRODUCAO"), { nome: "Acerola", custoPadraoKg: 0, exigeBranqueamento: false });
    const nomes = (await listarFrutas(fx.empresaId)).map((f) => f.nome);
    expect(nomes).toContain("Acerola");
  });

  test("nome repetido é recusado com mensagem", async () => {
    await criarFruta(fx.sessao("PRODUCAO"), { nome: "Cupuaçu", custoPadraoKg: 0, exigeBranqueamento: false });
    await expect(
      criarFruta(fx.sessao("PRODUCAO"), { nome: "Cupuaçu", custoPadraoKg: 0, exigeBranqueamento: false }),
    ).rejects.toThrow("Já existe uma fruta com este nome");
  });

  test("FINANCEIRO não escreve; filial somente leitura é recusada", async () => {
    const dados = { nome: "Bacaba", custoPadraoKg: 0, exigeBranqueamento: false };
    await expect(criarFruta(fx.sessao("FINANCEIRO"), dados)).rejects.toThrow(PermissionError);
    await expect(criarFruta(fx.sessao("PRODUCAO", { somenteLeitura: true }), dados)).rejects.toThrow(
      FilialSomenteLeituraError,
    );
  });

  test("não altera fruta de outra empresa", async () => {
    const alheia = await prisma.fruta.create({ data: { empresaId: fx.outraEmpresaId, nome: "Alheia" } });
    await expect(
      atualizarFruta(fx.sessao("PRODUCAO"), alheia.id, { nome: "X", custoPadraoKg: 0, exigeBranqueamento: false }),
    ).rejects.toThrow();
  });

  test("requireFrutaAtiva recusa inativa e de outra empresa", async () => {
    const inativa = await criarFruta(fx.sessao("PRODUCAO"), { nome: "Inativa", custoPadraoKg: 0, exigeBranqueamento: false });
    await definirAtivoFruta(fx.sessao("PRODUCAO"), inativa.id, false);
    await expect(requireFrutaAtiva(fx.empresaId, inativa.id)).rejects.toThrow("Fruta não encontrada ou inativa");
    const alheia = await prisma.fruta.create({ data: { empresaId: fx.outraEmpresaId, nome: "Alheia 2" } });
    await expect(requireFrutaAtiva(fx.empresaId, alheia.id)).rejects.toThrow("Fruta não encontrada ou inativa");
  });
});
```

- [ ] **Step 2: Rodar** — FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

`src/lib/schemas/fruta.ts`:

```ts
import { z } from "zod";
import { checkboxSchema } from "./campos";

export const frutaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  custoPadraoKg: z.coerce.number().min(0, "O custo não pode ser negativo").default(0),
  exigeBranqueamento: checkboxSchema,
});

export type FrutaFormValues = z.infer<typeof frutaSchema>;
```

`src/server/services/fruta.ts`:

```ts
import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { FrutaFormValues } from "@/lib/schemas/fruta";
import { comMensagemDeDuplicidade } from "./duplicidade";

const MSG_DUPLICADA = "Já existe uma fruta com este nome";

export async function listarFrutas(empresaId: string, opcoes: { somenteAtivas?: boolean } = {}) {
  return prisma.fruta.findMany({
    where: { empresaId, ...(opcoes.somenteAtivas ? { ativo: true } : {}) },
    orderBy: { nome: "asc" },
  });
}

/** Garante que a fruta é da empresa e está ativa — usado por produto e talhão. */
export async function requireFrutaAtiva(empresaId: string, frutaId: string): Promise<void> {
  const fruta = await prisma.fruta.findFirst({ where: { id: frutaId, empresaId, ativo: true }, select: { id: true } });
  if (!fruta) throw new Error("Fruta não encontrada ou inativa");
}

function autorizar(sessao: SessaoAtiva) {
  requirePermission(sessao.perfil, "cadastroProducao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
}

export async function criarFruta(sessao: SessaoAtiva, dados: FrutaFormValues) {
  autorizar(sessao);
  const fruta = await comMensagemDeDuplicidade(
    () => prisma.fruta.create({ data: { ...dados, empresaId: sessao.empresaId } }),
    MSG_DUPLICADA,
  );
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Fruta",
    entidadeId: fruta.id,
    acao: "CRIAR",
    anterior: null,
    novo: dados,
  });
  return fruta;
}

export async function atualizarFruta(sessao: SessaoAtiva, id: string, dados: FrutaFormValues) {
  autorizar(sessao);
  const anterior = await prisma.fruta.findUniqueOrThrow({ where: { id, empresaId: sessao.empresaId } });
  const fruta = await comMensagemDeDuplicidade(
    () => prisma.fruta.update({ where: { id }, data: dados }),
    MSG_DUPLICADA,
  );
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Fruta",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: {
      nome: anterior.nome,
      custoPadraoKg: Number(anterior.custoPadraoKg),
      exigeBranqueamento: anterior.exigeBranqueamento,
    },
    novo: dados,
  });
  return fruta;
}

export async function definirAtivoFruta(sessao: SessaoAtiva, id: string, ativo: boolean) {
  autorizar(sessao);
  await prisma.fruta.findUniqueOrThrow({ where: { id, empresaId: sessao.empresaId } });
  const fruta = await prisma.fruta.update({ where: { id }, data: { ativo } });
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Fruta",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });
  return fruta;
}
```

`frutas/actions.ts`: cópia de `cadastros/safras/actions.ts` trocando `safraSchema`→`frutaSchema`, `safraService.criarSafra/atualizarSafra/definirAtivoSafra`→`frutaService.criarFruta/atualizarFruta/definirAtivoFruta`, nomes `criarFrutaAction`, `atualizarFrutaAction`, `alternarAtivoFrutaAction` e `revalidatePath("/cadastros/frutas")`.

`frutas/page.tsx`: estrutura de `safras/page.tsx` com:
- título "Frutas", descrição "Frutas trabalhadas pela empresa. O custo-padrão é usado no fruto colhido nos talhões próprios.";
- `podeEscrever = podeEscreverCadastroProducao(sessao.perfil, sessao.podeAlterarFilial)`;
- dados: `listarFrutas(sessao.empresaId)`;
- colunas: Nome · Custo-padrão (R$/kg, `formatarMoeda(fruta.custoPadraoKg)`, alinhado à direita) · Branqueamento ("Exige" / "—") · Ativo (Badge) · Ações;
- o diálogo recebe `fruta={{ ...fruta, custoPadraoKg: Number(fruta.custoPadraoKg) }}`.

`fruta-dialog-form.tsx`: estrutura de `safra-dialog-form.tsx` com campos:
- `nome` (Input, required);
- `custoPadraoKg` (Input `type="number" step="0.0001" min="0"`, label "Custo-padrão do fruto próprio (R$/kg)", ajuda "Usado no custo e na margem do fruto colhido nos talhões. Deixe 0 se ainda não souber.");
- `exigeBranqueamento` (`<input type="checkbox">` com label "Exige branqueamento no processamento").

- [ ] **Step 4: Rodar** — `npx vitest run src/server/services/fruta.test.ts` → PASS; `npx tsc --noEmit` → limpo.

- [ ] **Step 5: Commit** — `git commit -m "feat(producao): cadastro de frutas"`

---

### Task 7: Produto

**Files:**
- Create: `src/lib/schemas/produto.ts`, `src/lib/schemas/produto.test.ts`, `src/server/services/produto.ts`, `src/server/services/produto.test.ts`
- Create: `src/app/(dashboard)/cadastros/produtos/{actions.ts,page.tsx,produto-dialog-form.tsx}`

**Interfaces:**
- Consumes: `requireFrutaAtiva`, `listarFrutas` (Task 6); Task 4.
- Produces: `produtoSchema`, `ProdutoFormValues`; `listarProdutos(empresaId)` (inclui `fruta: { nome }`), `criarProduto`, `atualizarProduto`, `definirAtivoProduto`.

- [ ] **Step 1: Testes que falham**

`produto.test.ts` (schema):

```ts
import { describe, expect, test } from "vitest";
import { produtoSchema } from "./produto";

const base = {
  codigo: "agc",
  descricao: "Polpa de açaí grosso – congelada",
  categoria: "POLPA",
  frutaId: "f1",
  conservacao: "CONGELADO",
  validadeDias: "365",
};

describe("produtoSchema", () => {
  test("código vira maiúsculo e aceita até 6 letras/dígitos", () => {
    expect(produtoSchema.parse(base).codigo).toBe("AGC");
    expect(produtoSchema.safeParse({ ...base, codigo: "AG-C" }).success).toBe(false);
    expect(produtoSchema.safeParse({ ...base, codigo: "ABCDEFG" }).success).toBe(false);
  });

  test("validade mínima de 1 dia", () => {
    expect(produtoSchema.safeParse({ ...base, validadeDias: "0" }).success).toBe(false);
  });

  test("unidade comercial e fator vão juntos", () => {
    expect(produtoSchema.safeParse({ ...base, unidadeComercial: "rasa", fatorUnidadeKg: "" }).success).toBe(false);
    expect(produtoSchema.safeParse({ ...base, unidadeComercial: "", fatorUnidadeKg: "14" }).success).toBe(false);
    const ok = produtoSchema.parse({ ...base, unidadeComercial: "rasa", fatorUnidadeKg: "14" });
    expect(ok).toMatchObject({ unidadeComercial: "rasa", fatorUnidadeKg: 14 });
    const sem = produtoSchema.parse({ ...base, unidadeComercial: "", fatorUnidadeKg: "" });
    expect(sem).toMatchObject({ unidadeComercial: null, fatorUnidadeKg: undefined });
  });

  test("preço de referência opcional e não negativo", () => {
    expect(produtoSchema.parse({ ...base, precoReferenciaKg: "" }).precoReferenciaKg).toBeUndefined();
    expect(produtoSchema.safeParse({ ...base, precoReferenciaKg: "-1" }).success).toBe(false);
  });
});
```

`src/server/services/produto.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureProducao, type FixtureProducao } from "./producaoTestFixtures";
import { criarProduto, atualizarProduto, listarProdutos } from "./produto";
import type { ProdutoFormValues } from "@/lib/schemas/produto";

describe("produto (por empresa)", () => {
  let fx: FixtureProducao;
  let frutaId: string;
  const dados = (sobrescrever: Partial<ProdutoFormValues> = {}): ProdutoFormValues => ({
    codigo: "FA",
    descricao: "Fruto de açaí",
    categoria: "FRUTO",
    frutaId,
    conservacao: "IN_NATURA",
    validadeDias: 1,
    precoReferenciaKg: undefined,
    armazenamento: null,
    unidadeComercial: "rasa",
    fatorUnidadeKg: 14,
    ...sobrescrever,
  });

  beforeAll(async () => {
    fx = await criarFixtureProducao("produto");
    frutaId = (await prisma.fruta.create({ data: { empresaId: fx.empresaId, nome: "Açaí" } })).id;
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("cria com rasa e lista com o nome da fruta", async () => {
    const p = await criarProduto(fx.sessao("PRODUCAO"), dados());
    expect(Number(p.fatorUnidadeKg)).toBe(14);
    const lista = await listarProdutos(fx.empresaId);
    expect(lista.find((x) => x.id === p.id)?.fruta.nome).toBe("Açaí");
  });

  test("código repetido na empresa é recusado com mensagem", async () => {
    await expect(criarProduto(fx.sessao("PRODUCAO"), dados())).rejects.toThrow(
      "Já existe um produto com este código",
    );
  });

  test("recusa fruta inativa ou de outra empresa", async () => {
    const alheia = await prisma.fruta.create({ data: { empresaId: fx.outraEmpresaId, nome: "Açaí" } });
    await expect(
      criarProduto(fx.sessao("PRODUCAO"), dados({ codigo: "X1", frutaId: alheia.id })),
    ).rejects.toThrow("Fruta não encontrada ou inativa");
  });

  test("VENDAS não escreve produto", async () => {
    await expect(criarProduto(fx.sessao("VENDAS"), dados({ codigo: "X2" }))).rejects.toThrow(PermissionError);
  });

  test("atualiza e audita", async () => {
    const p = await criarProduto(fx.sessao("ADMINISTRADOR"), dados({ codigo: "AGC", categoria: "POLPA" }));
    await atualizarProduto(fx.sessao("PRODUCAO"), p.id, dados({ codigo: "AGC", categoria: "POLPA", validadeDias: 300 }));
    expect((await prisma.produto.findUniqueOrThrow({ where: { id: p.id } })).validadeDias).toBe(300);
    expect(await prisma.auditLog.count({ where: { entidadeId: p.id } })).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar** — FAIL.

- [ ] **Step 3: Implementar**

`src/lib/schemas/produto.ts`:

```ts
import { z } from "zod";
import { CATEGORIA_PRODUTO, CONSERVACAO } from "./enums";
import { numeroOpcional, textoOpcional } from "./campos";

export const produtoSchema = z
  .object({
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{1,6}$/, "Código com 1 a 6 letras ou números, sem espaços nem traços"),
    descricao: z.string().trim().min(2, "Informe a descrição"),
    categoria: z.enum(CATEGORIA_PRODUTO),
    frutaId: z.string().min(1, "Selecione a fruta"),
    conservacao: z.enum(CONSERVACAO),
    validadeDias: z.coerce.number().int("Use dias inteiros").min(1, "Validade mínima de 1 dia"),
    precoReferenciaKg: numeroOpcional(z.number().min(0, "O preço não pode ser negativo")),
    armazenamento: textoOpcional,
    unidadeComercial: textoOpcional,
    fatorUnidadeKg: numeroOpcional(z.number().positive("O fator deve ser maior que zero")),
  })
  .superRefine((dados, ctx) => {
    const temUnidade = dados.unidadeComercial !== null;
    const temFator = dados.fatorUnidadeKg !== undefined;
    if (temUnidade !== temFator) {
      ctx.addIssue({
        code: "custom",
        path: [temUnidade ? "fatorUnidadeKg" : "unidadeComercial"],
        message: "Informe a unidade comercial e quantos kg ela tem, ou deixe os dois em branco",
      });
    }
  });

export type ProdutoFormValues = z.infer<typeof produtoSchema>;
```

`src/server/services/produto.ts`: mesmo formato de `fruta.ts` (Task 6), com:
- `MSG_DUPLICADA = "Já existe um produto com este código"`;
- entidade de auditoria `"Produto"`;
- `listarProdutos(empresaId)` = `prisma.produto.findMany({ where: { empresaId }, include: { fruta: { select: { nome: true } } }, orderBy: { codigo: "asc" } })`;
- em `criarProduto` e `atualizarProduto`, depois de `autorizar(sessao)`: `await requireFrutaAtiva(sessao.empresaId, dados.frutaId);`
- `data` do Prisma: `{ ...dados, precoReferenciaKg: dados.precoReferenciaKg ?? null, fatorUnidadeKg: dados.fatorUnidadeKg ?? null }` (em `create`, mais `empresaId: sessao.empresaId`);
- `anterior` da atualização: todos os campos do formulário, Decimals com `Number(...)` (ou `null`).

`produtos/actions.ts`: padrão de `safras/actions.ts` (nomes `criarProdutoAction`, `atualizarProdutoAction`, `alternarAtivoProdutoAction`; `revalidatePath("/cadastros/produtos")`).

`produtos/page.tsx`:
- título "Produtos", descrição "Frutos e polpas vendidos ou estocados. O código vira o prefixo do número de lote.";
- `podeEscreverCadastroProducao`; dados `listarProdutos(sessao.empresaId)` e `listarFrutas(sessao.empresaId, { somenteAtivas: true })` (passadas ao diálogo como `frutas: { id, nome }[]`);
- colunas: Código · Descrição · Fruta · Categoria (`ROTULOS_CATEGORIA_PRODUTO`) · Conservação (`ROTULOS_CONSERVACAO`) · Validade (`N dias`) · Preço ref. (R$/kg, `formatarMoeda` ou "—") · Unidade (`rasa = 14 kg` ou "—") · Ativo · Ações;
- tabela dentro de `<div className="overflow-x-auto">` (muitas colunas no celular);
- diálogo recebe o produto com Decimals convertidos por `Number` (ou `null`).

`produto-dialog-form.tsx` (`"use client"`, padrão de `safra-dialog-form.tsx`), campos na ordem:
- `codigo` (Input, `maxLength={6}`, `className="uppercase"`, required, ajuda "Ex.: FA, AGC. Vira o início do nº de lote.");
- `descricao` (Input, required);
- `categoria` (Select com `CATEGORIA_PRODUTO` e `ROTULOS_CATEGORIA_PRODUTO`, padrão `FRUTO`);
- `frutaId` (Select das `frutas`, placeholder "Selecione a fruta");
- `conservacao` (Select com `CONSERVACAO`/`ROTULOS_CONSERVACAO`, padrão `IN_NATURA`);
- `validadeDias` (`type="number" min="1" step="1"`, required);
- `precoReferenciaKg` (`type="number" min="0" step="0.0001"`, label "Preço de referência (R$/kg)", opcional);
- `armazenamento` (Input, label "Armazenamento (etiqueta)", placeholder "-18 °C");
- `<Separator />` + "Unidade comercial (opcional)": `unidadeComercial` (Input, placeholder "rasa") e `fatorUnidadeKg` (`type="number" min="0" step="0.001"`, label "kg por unidade", placeholder "14"), com ajuda "Ex.: rasa = 14 kg. Permite lançar quantidade e preço por rasa."
- `DialogContent` com `className="max-h-[90vh] overflow-y-auto"` (formulário longo no celular).

- [ ] **Step 4: Rodar** — `npx vitest run src/lib/schemas/produto.test.ts src/server/services/produto.test.ts` → PASS; `npx tsc --noEmit` → limpo.

- [ ] **Step 5: Commit** — `git commit -m "feat(producao): cadastro de produtos com unidade comercial (rasa)"`

---

### Task 8: Insumo

**Files:**
- Create: `src/lib/schemas/insumo.ts`, `src/server/services/insumo.ts`, `src/server/services/insumo.test.ts`
- Create: `src/app/(dashboard)/cadastros/insumos/{actions.ts,page.tsx,insumo-dialog-form.tsx}`

**Interfaces:**
- Produces: `insumoSchema`, `InsumoFormValues = { nome: string; unidade: string; custoUnitario: number }`; `listarInsumos(empresaId)`, `criarInsumo`, `atualizarInsumo`, `definirAtivoInsumo`.

- [ ] **Step 1: Teste que falha** (`insumo.test.ts`)

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureProducao, type FixtureProducao } from "./producaoTestFixtures";
import { criarInsumo, definirAtivoInsumo, listarInsumos } from "./insumo";

describe("insumo (por empresa)", () => {
  let fx: FixtureProducao;
  beforeAll(async () => {
    fx = await criarFixtureProducao("insumo");
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("cria com custo de 4 casas e inativa", async () => {
    const i = await criarInsumo(fx.sessao("PRODUCAO"), { nome: "Embalagem 1 kg", unidade: "un", custoUnitario: 0.1234 });
    expect(Number(i.custoUnitario)).toBe(0.1234);
    await definirAtivoInsumo(fx.sessao("PRODUCAO"), i.id, false);
    expect((await listarInsumos(fx.empresaId)).find((x) => x.id === i.id)?.ativo).toBe(false);
  });

  test("nome repetido recusado; VENDAS não escreve", async () => {
    await criarInsumo(fx.sessao("PRODUCAO"), { nome: "Energia", unidade: "kWh", custoUnitario: 1 });
    await expect(
      criarInsumo(fx.sessao("PRODUCAO"), { nome: "Energia", unidade: "kWh", custoUnitario: 1 }),
    ).rejects.toThrow("Já existe um insumo com este nome");
    await expect(
      criarInsumo(fx.sessao("VENDAS"), { nome: "Outro", unidade: "un", custoUnitario: 1 }),
    ).rejects.toThrow(PermissionError);
  });

  test("audita a criação", async () => {
    const i = await criarInsumo(fx.sessao("PRODUCAO"), { nome: "Caixa", unidade: "un", custoUnitario: 2 });
    expect(await prisma.auditLog.count({ where: { entidadeId: i.id, acao: "CRIAR" } })).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar** — FAIL.

- [ ] **Step 3: Implementar**

`src/lib/schemas/insumo.ts`:

```ts
import { z } from "zod";

export const insumoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  unidade: z.string().trim().min(1, "Informe a unidade (un, kWh, h…)"),
  custoUnitario: z.coerce.number().min(0, "O custo não pode ser negativo"),
});

export type InsumoFormValues = z.infer<typeof insumoSchema>;
```

`src/server/services/insumo.ts`: formato de `fruta.ts` com entidade `"Insumo"`, `MSG_DUPLICADA = "Já existe um insumo com este nome"`, `listarInsumos(empresaId)` ordenado por nome, `anterior` `{ nome, unidade, custoUnitario: Number(...) }`.

Telas (padrão de `frutas/`): título "Insumos", descrição "Embalagens, energia e mão de obra usadas no processamento. O custo aqui é a referência; cada OP grava o custo do dia."; colunas Nome · Unidade · Custo unitário (`formatarMoeda`) · Ativo · Ações; campos `nome`, `unidade` (placeholder "un"), `custoUnitario` (`type="number" min="0" step="0.0001"`).

- [ ] **Step 4: Rodar** — PASS; `npx tsc --noEmit` limpo.

- [ ] **Step 5: Commit** — `git commit -m "feat(producao): cadastro de insumos"`

---

### Task 9: Talhão

**Files:**
- Create: `src/lib/schemas/talhao.ts`, `src/server/services/talhao.ts`, `src/server/services/talhao.test.ts`
- Create: `src/app/(dashboard)/cadastros/talhoes/{actions.ts,page.tsx,talhao-dialog-form.tsx}`

**Interfaces:**
- Consumes: `requireFrutaAtiva`, `listarFrutas`.
- Produces: `talhaoSchema`, `TalhaoFormValues = { nome; frutaId; areaHa: number; anoPlantio?: number; espacamento: string|null; observacao: string|null }`; `listarTalhoes(filialId)` (inclui `fruta: { nome }`), `criarTalhao`, `atualizarTalhao`, `definirAtivoTalhao`.

- [ ] **Step 1: Teste que falha** (`talhao.test.ts`)

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureProducao, type FixtureProducao } from "./producaoTestFixtures";
import { atualizarTalhao, criarTalhao, listarTalhoes } from "./talhao";
import { talhaoSchema } from "@/lib/schemas/talhao";

describe("talhão (por filial)", () => {
  let fx: FixtureProducao;
  let frutaId: string;
  const dados = (nome: string, extra = {}) => ({
    nome,
    frutaId,
    areaHa: 2.5,
    anoPlantio: 2015,
    espacamento: null,
    observacao: null,
    ...extra,
  });

  beforeAll(async () => {
    fx = await criarFixtureProducao("talhao");
    frutaId = (await prisma.fruta.create({ data: { empresaId: fx.empresaId, nome: "Açaí" } })).id;
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("fica na filial da sessão e não aparece na outra", async () => {
    await criarTalhao(fx.sessao("PRODUCAO"), dados("Talhão 1"));
    expect((await listarTalhoes(fx.filialAId)).map((t) => t.nome)).toContain("Talhão 1");
    expect((await listarTalhoes(fx.filialBId)).map((t) => t.nome)).not.toContain("Talhão 1");
  });

  test("mesmo nome em outra filial é permitido; na mesma, recusado", async () => {
    await expect(criarTalhao(fx.sessao("PRODUCAO", { filial: "B" }), dados("Talhão 1"))).resolves.toBeDefined();
    await expect(criarTalhao(fx.sessao("PRODUCAO"), dados("Talhão 1"))).rejects.toThrow(
      "Já existe um talhão com este nome nesta filial",
    );
  });

  test("não altera talhão de outra filial", async () => {
    const t = await criarTalhao(fx.sessao("PRODUCAO"), dados("Talhão 2"));
    await expect(atualizarTalhao(fx.sessao("PRODUCAO", { filial: "B" }), t.id, dados("X"))).rejects.toThrow();
  });

  test("recusa fruta de outra empresa", async () => {
    const alheia = await prisma.fruta.create({ data: { empresaId: fx.outraEmpresaId, nome: "Açaí" } });
    await expect(
      criarTalhao(fx.sessao("PRODUCAO"), dados("Talhão 3", { frutaId: alheia.id })),
    ).rejects.toThrow("Fruta não encontrada ou inativa");
  });

  test("schema: área > 0 e ano entre 1950 e o ano atual", () => {
    const base = { nome: "T", frutaId: "f", areaHa: "1", anoPlantio: "" };
    expect(talhaoSchema.safeParse({ ...base, nome: "Tt", areaHa: "0" }).success).toBe(false);
    expect(talhaoSchema.safeParse({ ...base, nome: "Tt", anoPlantio: "1900" }).success).toBe(false);
    expect(talhaoSchema.safeParse({ ...base, nome: "Tt", anoPlantio: String(new Date().getFullYear() + 1) }).success).toBe(false);
    expect(talhaoSchema.parse({ ...base, nome: "Tt" }).anoPlantio).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar** — FAIL.

- [ ] **Step 3: Implementar**

`src/lib/schemas/talhao.ts`:

```ts
import { z } from "zod";
import { numeroOpcional, textoOpcional } from "./campos";

export const talhaoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  frutaId: z.string().min(1, "Selecione a cultura"),
  areaHa: z.coerce.number().positive("A área deve ser maior que zero"),
  anoPlantio: numeroOpcional(
    z
      .number()
      .int("Ano inválido")
      .min(1950, "Ano de plantio a partir de 1950")
      .max(new Date().getFullYear(), "Ano de plantio não pode ser futuro"),
  ),
  espacamento: textoOpcional,
  observacao: textoOpcional,
});

export type TalhaoFormValues = z.infer<typeof talhaoSchema>;
```

`src/server/services/talhao.ts`: formato de `fruta.ts`, mas por **filial**:
- `listarTalhoes(filialId)` com `include: { fruta: { select: { nome: true } } }`, ordem por nome;
- `create` com `{ ...dados, anoPlantio: dados.anoPlantio ?? null, filialId: sessao.filialId }`;
- `findUniqueOrThrow({ where: { id, filialId: sessao.filialId } })` antes de atualizar/ativar;
- `requireFrutaAtiva(sessao.empresaId, dados.frutaId)` ao criar e atualizar;
- `MSG_DUPLICADA = "Já existe um talhão com este nome nesta filial"`; entidade `"Talhao"`.

Telas: título "Talhões", descrição "Áreas de cultivo próprias da filial. Origem do fruto colhido."; colunas Nome · Cultura · Área (ha, 2 casas) · Plantio (ano ou "—") · Ativo · Ações; campos `nome`, `frutaId` (Select "Cultura"), `areaHa` (`step="0.01" min="0"`), `anoPlantio` (`type="number" step="1"`), `espacamento` (placeholder "5 x 5 m"), `observacao`.

- [ ] **Step 4: Rodar** — PASS; tsc limpo.

- [ ] **Step 5: Commit** — `git commit -m "feat(producao): cadastro de talhões"`

---

### Task 10: Local de armazenamento

**Files:**
- Create: `src/lib/schemas/localArmazenamento.ts`, `src/server/services/localArmazenamento.ts`, `src/server/services/localArmazenamento.test.ts`
- Create: `src/app/(dashboard)/cadastros/locais-armazenamento/{actions.ts,page.tsx,local-dialog-form.tsx}`

**Interfaces:**
- Produces: `localArmazenamentoSchema`, `LocalArmazenamentoFormValues = { nome; tipo; temperatura: string|null; capacidadeKg?: number }`; `listarLocaisArmazenamento(filialId)`, `criarLocalArmazenamento`, `atualizarLocalArmazenamento`, `definirAtivoLocalArmazenamento`.

- [ ] **Step 1: Teste que falha** (`localArmazenamento.test.ts`)

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { criarFixtureProducao, type FixtureProducao } from "./producaoTestFixtures";
import { criarLocalArmazenamento, definirAtivoLocalArmazenamento, listarLocaisArmazenamento } from "./localArmazenamento";
import { localArmazenamentoSchema } from "@/lib/schemas/localArmazenamento";

describe("local de armazenamento (por filial)", () => {
  let fx: FixtureProducao;
  beforeAll(async () => {
    fx = await criarFixtureProducao("local");
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("cria na filial, com capacidade opcional", async () => {
    const l = await criarLocalArmazenamento(fx.sessao("PRODUCAO"), {
      nome: "Câmara fria 01",
      tipo: "CAMARA_FRIA",
      temperatura: "-18 °C",
      capacidadeKg: 5000,
    });
    expect(l.filialId).toBe(fx.filialAId);
    const semCapacidade = await criarLocalArmazenamento(fx.sessao("PRODUCAO"), {
      nome: "Recepção",
      tipo: "RECEPCAO",
      temperatura: null,
      capacidadeKg: undefined,
    });
    expect(semCapacidade.capacidadeKg).toBeNull();
    expect((await listarLocaisArmazenamento(fx.filialBId)).length).toBe(0);
  });

  test("nome repetido na filial recusado; inativar não alcança outra filial", async () => {
    await expect(
      criarLocalArmazenamento(fx.sessao("PRODUCAO"), {
        nome: "Recepção",
        tipo: "OUTRO",
        temperatura: null,
        capacidadeKg: undefined,
      }),
    ).rejects.toThrow("Já existe um local com este nome nesta filial");
    const [local] = await listarLocaisArmazenamento(fx.filialAId);
    await expect(
      definirAtivoLocalArmazenamento(fx.sessao("PRODUCAO", { filial: "B" }), local.id, false),
    ).rejects.toThrow();
  });

  test("schema: capacidade > 0 quando informada", () => {
    expect(localArmazenamentoSchema.safeParse({ nome: "Ab", tipo: "FREEZER", capacidadeKg: "0" }).success).toBe(false);
    expect(localArmazenamentoSchema.parse({ nome: "Ab", tipo: "FREEZER", capacidadeKg: "" }).capacidadeKg).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar** — FAIL.

- [ ] **Step 3: Implementar**

`src/lib/schemas/localArmazenamento.ts`:

```ts
import { z } from "zod";
import { TIPO_LOCAL_ARMAZENAMENTO } from "./enums";
import { numeroOpcional, textoOpcional } from "./campos";

export const localArmazenamentoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  tipo: z.enum(TIPO_LOCAL_ARMAZENAMENTO),
  temperatura: textoOpcional,
  capacidadeKg: numeroOpcional(z.number().positive("A capacidade deve ser maior que zero")),
});

export type LocalArmazenamentoFormValues = z.infer<typeof localArmazenamentoSchema>;
```

Serviço por filial como `talhao.ts` (sem fruta): `data` com `capacidadeKg: dados.capacidadeKg ?? null`; entidade `"LocalArmazenamento"`; `MSG_DUPLICADA = "Já existe um local com este nome nesta filial"`.

Telas: título "Locais de armazenamento", descrição "Câmaras, freezers e áreas onde os lotes ficam guardados."; colunas Nome · Tipo (`ROTULOS_TIPO_LOCAL`) · Temperatura · Capacidade (kg, `toLocaleString("pt-BR")` ou "—") · Ativo · Ações; campos `nome`, `tipo` (Select, padrão `CAMARA_FRIA`), `temperatura` (placeholder "-18 °C"), `capacidadeKg` (`step="0.001" min="0"`, opcional).

- [ ] **Step 4: Rodar** — PASS; tsc limpo.

- [ ] **Step 5: Commit** — `git commit -m "feat(producao): cadastro de locais de armazenamento"`

---

### Task 11: Configuração de produção

**Files:**
- Create: `src/lib/schemas/configuracaoProducao.ts`, `src/server/services/configuracaoProducao.ts`, `src/server/services/configuracaoProducao.test.ts`
- Create: `src/app/(dashboard)/configuracao-producao/{actions.ts,page.tsx,configuracao-form.tsx}`

**Interfaces:**
- Produces:
  - `CONFIGURACAO_PRODUCAO_PADRAO` e `type ConfiguracaoProducaoValores = { registroAdepara: string|null; alertaVencimentoCongeladoDias: number; alertaVencimentoResfriadoDias: number; branqueamentoTemperaturaMinC: number; branqueamentoTempoMinS: number; toleranciaBalancoMassa: number }` (tolerância como fração).
  - `obterConfiguracaoProducao(filialId): Promise<ConfiguracaoProducaoValores>` — usado por 7b/7e.
  - `salvarConfiguracaoProducao(sessao, dados: ConfiguracaoProducaoValores)`.
  - `configuracaoProducaoSchema` — recebe `toleranciaBalancoMassaPercentual` (0–100) e devolve `ConfiguracaoProducaoValores`.

- [ ] **Step 1: Teste que falha** (`configuracaoProducao.test.ts`)

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureProducao, type FixtureProducao } from "./producaoTestFixtures";
import {
  CONFIGURACAO_PRODUCAO_PADRAO,
  obterConfiguracaoProducao,
  salvarConfiguracaoProducao,
} from "./configuracaoProducao";
import { configuracaoProducaoSchema } from "@/lib/schemas/configuracaoProducao";

describe("configuração de produção", () => {
  let fx: FixtureProducao;
  beforeAll(async () => {
    fx = await criarFixtureProducao("config");
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("sem registro devolve os padrões e não grava", async () => {
    expect(await obterConfiguracaoProducao(fx.filialAId)).toEqual(CONFIGURACAO_PRODUCAO_PADRAO);
    expect(await prisma.configuracaoProducao.count({ where: { filialId: fx.filialAId } })).toBe(0);
  });

  test("salvar cria e depois atualiza (upsert), só na filial da sessão", async () => {
    const valores = { ...CONFIGURACAO_PRODUCAO_PADRAO, registroAdepara: "REG-1", toleranciaBalancoMassa: 0.05 };
    await salvarConfiguracaoProducao(fx.sessao("ADMINISTRADOR"), valores);
    await salvarConfiguracaoProducao(fx.sessao("ADMINISTRADOR"), { ...valores, branqueamentoTempoMinS: 15 });
    const lida = await obterConfiguracaoProducao(fx.filialAId);
    expect(lida).toMatchObject({ registroAdepara: "REG-1", toleranciaBalancoMassa: 0.05, branqueamentoTempoMinS: 15 });
    expect(await obterConfiguracaoProducao(fx.filialBId)).toEqual(CONFIGURACAO_PRODUCAO_PADRAO);
    expect(await prisma.auditLog.count({ where: { entidade: "ConfiguracaoProducao", filialId: fx.filialAId } })).toBe(2);
  });

  test("só producao:configurar salva", async () => {
    await expect(
      salvarConfiguracaoProducao(fx.sessao("PRODUCAO"), CONFIGURACAO_PRODUCAO_PADRAO),
    ).rejects.toThrow(PermissionError);
  });

  test("schema converte a tolerância de % para fração e valida limites", () => {
    const base = {
      registroAdepara: "",
      alertaVencimentoCongeladoDias: "30",
      alertaVencimentoResfriadoDias: "1",
      branqueamentoTemperaturaMinC: "80",
      branqueamentoTempoMinS: "10",
      toleranciaBalancoMassaPercentual: "3",
    };
    expect(configuracaoProducaoSchema.parse(base)).toMatchObject({ toleranciaBalancoMassa: 0.03, registroAdepara: null });
    expect(configuracaoProducaoSchema.safeParse({ ...base, toleranciaBalancoMassaPercentual: "101" }).success).toBe(false);
    expect(configuracaoProducaoSchema.safeParse({ ...base, branqueamentoTemperaturaMinC: "151" }).success).toBe(false);
    expect(configuracaoProducaoSchema.safeParse({ ...base, alertaVencimentoResfriadoDias: "-1" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar** — FAIL.

- [ ] **Step 3: Implementar**

`src/lib/schemas/configuracaoProducao.ts`:

```ts
import { z } from "zod";
import { textoOpcional } from "./campos";

const dias = z.coerce.number().int("Use dias inteiros").min(0, "Não pode ser negativo");

export const configuracaoProducaoSchema = z
  .object({
    registroAdepara: textoOpcional,
    alertaVencimentoCongeladoDias: dias,
    alertaVencimentoResfriadoDias: dias,
    branqueamentoTemperaturaMinC: z.coerce.number().min(0, "Mínimo 0 °C").max(150, "Máximo 150 °C"),
    branqueamentoTempoMinS: z.coerce.number().int("Use segundos inteiros").min(0, "Não pode ser negativo"),
    toleranciaBalancoMassaPercentual: z.coerce.number().min(0, "Mínimo 0%").max(100, "Máximo 100%"),
  })
  .transform(({ toleranciaBalancoMassaPercentual, ...resto }) => ({
    ...resto,
    toleranciaBalancoMassa: toleranciaBalancoMassaPercentual / 100,
  }));
```

`src/server/services/configuracaoProducao.ts`:

```ts
import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";

export type ConfiguracaoProducaoValores = {
  registroAdepara: string | null;
  alertaVencimentoCongeladoDias: number;
  alertaVencimentoResfriadoDias: number;
  branqueamentoTemperaturaMinC: number;
  branqueamentoTempoMinS: number;
  /** Fração: 0,03 = 3%. */
  toleranciaBalancoMassa: number;
};

export const CONFIGURACAO_PRODUCAO_PADRAO: ConfiguracaoProducaoValores = {
  registroAdepara: null,
  alertaVencimentoCongeladoDias: 30,
  alertaVencimentoResfriadoDias: 1,
  branqueamentoTemperaturaMinC: 80,
  branqueamentoTempoMinS: 10,
  toleranciaBalancoMassa: 0.03,
};

export async function obterConfiguracaoProducao(filialId: string): Promise<ConfiguracaoProducaoValores> {
  const c = await prisma.configuracaoProducao.findUnique({ where: { filialId } });
  if (!c) return { ...CONFIGURACAO_PRODUCAO_PADRAO };
  return {
    registroAdepara: c.registroAdepara,
    alertaVencimentoCongeladoDias: c.alertaVencimentoCongeladoDias,
    alertaVencimentoResfriadoDias: c.alertaVencimentoResfriadoDias,
    branqueamentoTemperaturaMinC: Number(c.branqueamentoTemperaturaMinC),
    branqueamentoTempoMinS: c.branqueamentoTempoMinS,
    toleranciaBalancoMassa: Number(c.toleranciaBalancoMassa),
  };
}

export async function salvarConfiguracaoProducao(sessao: SessaoAtiva, dados: ConfiguracaoProducaoValores) {
  requirePermission(sessao.perfil, "producao:configurar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await obterConfiguracaoProducao(sessao.filialId);
  await prisma.configuracaoProducao.upsert({
    where: { filialId: sessao.filialId },
    create: { ...dados, filialId: sessao.filialId },
    update: dados,
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "ConfiguracaoProducao",
    entidadeId: sessao.filialId,
    acao: "ATUALIZAR",
    anterior,
    novo: dados,
  });
}
```

(Se `registrarAuditoria` não aceitar `"ATUALIZAR"` sem registro prévio, conferir a união de ações em `src/server/audit/registrar.ts` e usar a que existir.)

`configuracao-producao/actions.ts`: `"use server"`; `salvarConfiguracaoProducaoAction(_prev, formData)` com `configuracaoProducaoSchema.safeParse`, chama o serviço, `revalidatePath("/configuracao-producao")`, devolve `{ sucesso: true }` ou `{ erro }`.

`page.tsx`: `requirePermission(sessao.perfil, "producao:configurar")`; título "Configuração de produção", descrição "Parâmetros da filial ativa usados na recepção, no processamento e nos alertas de estoque."; carrega `obterConfiguracaoProducao(sessao.filialId)` e passa ao formulário com `somenteLeitura={!podeConfigurarProducao(sessao.perfil, sessao.podeAlterarFilial)}`.

`configuracao-form.tsx` (`"use client"`, `useActionState`): um `Card` com grupos:
- **Registro**: `registroAdepara` (label "Registro na ADEPARA", opcional).
- **Alertas de vencimento**: `alertaVencimentoCongeladoDias` ("Congelado: avisar com quantos dias de antecedência"), `alertaVencimentoResfriadoDias` ("In natura e resfriado").
- **Branqueamento (frutas que exigem)**: `branqueamentoTemperaturaMinC` ("Temperatura mínima (°C)", `step="0.1"`), `branqueamentoTempoMinS` ("Tempo mínimo (s)").
- **Balanço de massa**: `toleranciaBalancoMassaPercentual` ("Tolerância (%)", `step="0.01"`, valor inicial `toleranciaBalancoMassa * 100`).
- Botão "Salvar" (oculto em somente leitura; inputs `disabled`); mensagem "Configuração salva." em sucesso e `state.erro` em erro.
- Grade `grid gap-4 sm:grid-cols-2` para funcionar a 390px.

- [ ] **Step 4: Rodar** — PASS; tsc limpo.

- [ ] **Step 5: Commit** — `git commit -m "feat(producao): configuração de produção por filial"`

---

### Task 12: Seed e ajuda

**Files:**
- Modify: `prisma/seed.ts`
- Modify: `content/ajuda/passo-a-passo.md`

- [ ] **Step 1: Seed**

Em `prisma/seed.ts`, depois do vínculo do admin com a filial:

```ts
  const frutas = [
    { nome: "Açaí", exigeBranqueamento: true },
    { nome: "Acerola", exigeBranqueamento: false },
  ];
  const frutaId: Record<string, string> = {};
  for (const f of frutas) {
    const fruta = await prisma.fruta.upsert({
      where: { empresaId_nome: { empresaId: empresa.id, nome: f.nome } },
      update: {},
      create: { empresaId: empresa.id, ...f },
    });
    frutaId[f.nome] = fruta.id;
  }

  // Catálogo de exemplo (doc 1 da Fase 7), sem preços reais.
  const produtos = [
    { codigo: "FA", descricao: "Fruto de açaí", categoria: "FRUTO", fruta: "Açaí", conservacao: "IN_NATURA", validadeDias: 1, armazenamento: "Sombra / ventilado", unidadeComercial: "rasa", fatorUnidadeKg: 14 },
    { codigo: "FC", descricao: "Fruto de acerola", categoria: "FRUTO", fruta: "Acerola", conservacao: "IN_NATURA", validadeDias: 2, armazenamento: "Sombra / refrigerado" },
    { codigo: "AGC", descricao: "Polpa de açaí grosso/especial – congelada", categoria: "POLPA", fruta: "Açaí", conservacao: "CONGELADO", validadeDias: 365, armazenamento: "-18 °C" },
    { codigo: "AMC", descricao: "Polpa de açaí médio/regular – congelada", categoria: "POLPA", fruta: "Açaí", conservacao: "CONGELADO", validadeDias: 365, armazenamento: "-18 °C" },
    { codigo: "APC", descricao: "Polpa de açaí fino/popular – congelada", categoria: "POLPA", fruta: "Açaí", conservacao: "CONGELADO", validadeDias: 365, armazenamento: "-18 °C" },
    { codigo: "AGR", descricao: "Açaí grosso/especial – resfriado", categoria: "POLPA", fruta: "Açaí", conservacao: "RESFRIADO", validadeDias: 2, armazenamento: "0 a 5 °C" },
    { codigo: "AMR", descricao: "Açaí médio/regular – resfriado", categoria: "POLPA", fruta: "Açaí", conservacao: "RESFRIADO", validadeDias: 2, armazenamento: "0 a 5 °C" },
    { codigo: "APR", descricao: "Açaí fino/popular – resfriado", categoria: "POLPA", fruta: "Açaí", conservacao: "RESFRIADO", validadeDias: 2, armazenamento: "0 a 5 °C" },
    { codigo: "ACC", descricao: "Polpa de acerola – congelada", categoria: "POLPA", fruta: "Acerola", conservacao: "CONGELADO", validadeDias: 365, armazenamento: "-18 °C" },
  ] as const;
  for (const { fruta, ...p } of produtos) {
    await prisma.produto.upsert({
      where: { empresaId_codigo: { empresaId: empresa.id, codigo: p.codigo } },
      update: {},
      create: { empresaId: empresa.id, frutaId: frutaId[fruta], ...p },
    });
  }

  for (const t of [
    { nome: "Talhão Açaí 01", fruta: "Açaí", areaHa: 2 },
    { nome: "Talhão Acerola 01", fruta: "Acerola", areaHa: 1 },
  ]) {
    await prisma.talhao.upsert({
      where: { filialId_nome: { filialId: filial.id, nome: t.nome } },
      update: {},
      create: { filialId: filial.id, nome: t.nome, frutaId: frutaId[t.fruta], areaHa: t.areaHa },
    });
  }

  for (const l of [
    { nome: "Recepção", tipo: "RECEPCAO" },
    { nome: "Câmara fria 01", tipo: "CAMARA_FRIA", temperatura: "-18 °C" },
  ] as const) {
    await prisma.localArmazenamento.upsert({
      where: { filialId_nome: { filialId: filial.id, nome: l.nome } },
      update: {},
      create: { filialId: filial.id, ...l },
    });
  }
```

Run: `npm run db:seed` duas vezes → as duas sem erro (idempotente).
Conferir: `npx dotenv -e .env -- npx tsx -e "import {PrismaClient} from '@prisma/client'"` não é necessário; basta abrir `/cadastros/produtos` na Task 13 e ver os 9.

- [ ] **Step 2: Ajuda**

Em `content/ajuda/passo-a-passo.md`, nova seção "Produção — cadastros iniciais":
1. Administração → Configuração de produção: registro ADEPARA, alertas, branqueamento, tolerância.
2. Cadastros → Frutas (custo-padrão do fruto próprio; "exige branqueamento" para o açaí).
3. Cadastros → Produtos (código = início do nº de lote; rasa = 14 kg).
4. Talhões e Locais de armazenamento (por filial).
5. Insumos.
6. Perfis novos: Produção (galpão: cadastros de produção, e nas próximas versões recepção, processamento e ajustes) e Vendas (clientes, e nas próximas versões pedidos e entregas). Cliente pode ficar sem CPF/CNPJ (consumidor final).

Seguir o estilo das seções existentes do arquivo (ler antes de escrever).

- [ ] **Step 3: Commit** — `git commit -m "feat(producao): catálogo de exemplo no seed e ajuda dos cadastros"`

---

### Task 13: Verificação final

- [ ] **Step 1:** `npm test` → tudo verde (anotar o total).
- [ ] **Step 2:** `npm run lint` → limpo.
- [ ] **Step 3:** `npm run build` → limpo.
- [ ] **Step 4: Navegador** (dev em `npm run dev`; login admin@nx-control-erp.local / TrocarSenha123! → Empresa Demonstração → Matriz):
  - Cada tela nova: criar, editar, inativar; duplicado mostra a mensagem; desktop e 390px sem rolagem horizontal da página.
  - Cliente sem CPF/CNPJ salvo e exibido com "—".
  - Criar usuários temporários com perfil Produção e Vendas (`/usuarios`), entrar com cada um: menu sem Financeiro/Controladoria/Administração; Produção edita produto e não vê botão em Clientes; Vendas cria cliente e não vê botão em Produtos; abrir `/financeiro/contas-a-pagar` por URL é recusado.
  - Remover os usuários temporários e apagar `.playwright-mcp` ao final.
- [ ] **Step 5:** Atualizar `docs/fases/fase-7-producao-estoque-vendas.md` (7a concluída) e marcar a spec como implementada. Commit `docs(producao): Fase 7a concluída`.
