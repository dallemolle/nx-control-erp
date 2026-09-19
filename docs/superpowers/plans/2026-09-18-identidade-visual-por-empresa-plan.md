# Identidade Visual por Empresa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada Empresa ganha uma cor de fundo de sidebar e um logo pequeno, opcionais, configuráveis pelo Administrador — pra identificar visualmente qual empresa está sendo movimentada.

**Architecture:** Dois campos novos em `Empresa` (`corPrimaria`, `logoUrl`). Uma função pura calcula a cor de texto legível sobre a cor da empresa (fórmula YIQ). O logo sobe pro Vercel Blob como blob público (reaproveitando o SDK já usado por `anexo.ts`, mas sem a rota privada de proxy). O `layout.tsx` do dashboard (server component) calcula um `style` inline com as duas CSS custom properties (`--sidebar`, `--sidebar-foreground`) e repassa pra `Sidebar`, que aplica na `<nav>` raiz — sobrepõe só a cor de fundo, sem mexer na paleta pessoal (tema A/B/C + claro/escuro) que o usuário já escolhe via `ThemeToggle`.

**Tech Stack:** Next.js (App Router, server components), Prisma, Zod, `@vercel/blob`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-identidade-visual-por-empresa-design.md`

## Global Constraints

- Cor e logo são **opcionais** — nenhuma empresa existente muda de aparência até o Administrador configurar (`corPrimaria`/`logoUrl` começam `NULL` em toda empresa já cadastrada).
- Contraste do texto sobre a cor da empresa é **calculado automaticamente** (fórmula YIQ, limiar 128/255) — sem campo manual de "cor do texto".
- A cor da empresa sobrescreve **só** `--sidebar`/`--sidebar-foreground`. Tudo mais (bordas, `--sidebar-accent` do hover/item ativo, paleta A/B/C, claro/escuro) continua vindo da escolha pessoal do usuário via `next-themes`.
- Logo: blob **público** no Vercel Blob (`access: "public"`) — diferente dos anexos de título, que são privados. Limite de 1MB. Formatos aceitos: PNG, JPG, SVG, WebP.
- O checkbox "Usar cor personalizada" decide se `corPrimaria` é considerada — nunca o atributo `disabled` do `<input type="color">` (inputs desabilitados não são enviados no `FormData`).

---

### Task 1: Função pura de contraste de cor

**Files:**
- Create: `src/lib/corContraste.ts`
- Test: `src/lib/corContraste.test.ts`

**Interfaces:**
- Produces: `corDeTextoContrastante(corFundoHex: string): "#000000" | "#ffffff"`, `corHexValida(valor: string): boolean` — usadas pela Task 3 (schema Zod) e pela Task 7 (layout.tsx).

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/lib/corContraste.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { corDeTextoContrastante, corHexValida } from "./corContraste";

describe("corDeTextoContrastante", () => {
  test("preto de fundo -> texto branco", () => {
    expect(corDeTextoContrastante("#000000")).toBe("#ffffff");
  });

  test("branco de fundo -> texto preto", () => {
    expect(corDeTextoContrastante("#ffffff")).toBe("#000000");
  });

  test("navy escuro (cor padrão do sistema hoje) -> texto branco", () => {
    expect(corDeTextoContrastante("#0B2545")).toBe("#ffffff");
  });

  test("amarelo claro -> texto preto", () => {
    expect(corDeTextoContrastante("#F5D76E")).toBe("#000000");
  });
});

describe("corHexValida", () => {
  test("aceita hex de 6 dígitos com #", () => {
    expect(corHexValida("#0B2545")).toBe(true);
    expect(corHexValida("#abc123")).toBe(true);
  });

  test("rejeita sem #", () => {
    expect(corHexValida("0B2545")).toBe(false);
  });

  test("rejeita hex de 3 dígitos", () => {
    expect(corHexValida("#fff")).toBe(false);
  });

  test("rejeita caracteres não-hex", () => {
    expect(corHexValida("#GGGGGG")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/corContraste.test.ts`
Expected: FAIL com "Cannot find module './corContraste'"

- [ ] **Step 3: Implementar**

Criar `src/lib/corContraste.ts`:

```ts
/** Devolve preto ou branco — o que for mais legível sobre `corFundoHex`. Fórmula YIQ (percepção de brilho), limiar 128/255. */
export function corDeTextoContrastante(corFundoHex: string): "#000000" | "#ffffff" {
  const hex = corFundoHex.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000000" : "#ffffff";
}

/** Valida o formato #RRGGBB (hex de 6 dígitos, com #). */
export function corHexValida(valor: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(valor);
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/corContraste.test.ts`
Expected: PASS (8 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/corContraste.ts src/lib/corContraste.test.ts
git commit -m "feat: funcao pura de contraste de cor (corDeTextoContrastante)"
```

---

### Task 2: Campos de dados (Empresa.corPrimaria, Empresa.logoUrl)

**Files:**
- Modify: `prisma/schema.prisma` (model `Empresa`, linhas 59-77 hoje)
- Create: `prisma/migrations/<timestamp>_add_identidade_visual_empresa/migration.sql`

**Interfaces:**
- Produces: colunas `empresas.corPrimaria` (nullable text) e `empresas.logoUrl` (nullable text), refletidas no client Prisma gerado como `Empresa.corPrimaria: string | null` e `Empresa.logoUrl: string | null` — usadas pelas Tasks 4, 6 e 7.

- [ ] **Step 1: Editar o model no schema**

Em `prisma/schema.prisma`, dentro de `model Empresa`, adicionar as duas linhas logo depois de `moedaPadrao`:

```prisma
model Empresa {
  id           String   @id @default(uuid())
  razaoSocial  String
  nomeFantasia String
  cnpjCpf      String   @unique
  moedaPadrao  String   @default("BRL")
  corPrimaria  String?
  logoUrl      String?
  ativo        Boolean  @default(true)
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  usuarios     UsuarioEmpresa[]
  filiais      Filial[]
  clientes     Cliente[]
  fornecedores Fornecedor[]
  auditLogs    AuditLog[]
  cenariosEstrategicos CenarioEstrategico[]

  @@map("empresas")
}
```

- [ ] **Step 2: Criar a migration à mão**

Gerar um timestamp novo (formato `YYYYMMDDHHMMSS`, maior que o último existente em `prisma/migrations/`) e criar a pasta:

```bash
mkdir -p "prisma/migrations/<timestamp>_add_identidade_visual_empresa"
```

Criar `prisma/migrations/<timestamp>_add_identidade_visual_empresa/migration.sql`:

```sql
-- Adiciona cor de fundo da sidebar e logo, opcionais, configuraveis por
-- empresa. Sem NOT NULL, sem default: toda empresa ja cadastrada recebe
-- NULL nas duas colunas e continua com a aparencia atual ate o
-- Administrador configurar.

ALTER TABLE "empresas" ADD COLUMN "corPrimaria" TEXT;
ALTER TABLE "empresas" ADD COLUMN "logoUrl" TEXT;
```

- [ ] **Step 3: Aplicar a migration e regenerar o client**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: "1 migration found... Applied" e "Generated Prisma Client" sem erro.

- [ ] **Step 4: Confirmar que o tipo do client reflete os campos novos**

Run: `npx tsc --noEmit`
Expected: sem erros (o schema ainda não é usado em nenhum lugar do código, então isso só confirma que a geração do client não quebrou nada existente).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma "prisma/migrations/<timestamp>_add_identidade_visual_empresa"
git commit -m "feat: adiciona corPrimaria e logoUrl ao model Empresa"
```

---

### Task 3: Campo `corPrimaria` no schema Zod

**Files:**
- Modify: `src/lib/schemas/empresa.ts`

**Interfaces:**
- Consumes: `corHexValida` de `@/lib/corContraste` (Task 1).
- Produces: `empresaSchema` com campo `corPrimaria: string | null` no tipo inferido `EmpresaFormValues` — consumido pela Task 4 (service) e Task 5 (action).

- [ ] **Step 1: Editar o schema**

`src/lib/schemas/empresa.ts` fica assim (arquivo inteiro):

```ts
import { z } from "zod";
import { cnpjCpfSchema } from "@/lib/cnpjCpf";
import { corHexValida } from "@/lib/corContraste";

export const empresaSchema = z.object({
  razaoSocial: z.string().trim().min(3, "Informe a razão social"),
  nomeFantasia: z.string().trim().min(2, "Informe o nome fantasia"),
  cnpjCpf: cnpjCpfSchema,
  moedaPadrao: z
    .string()
    .trim()
    .length(3, "Use o código ISO da moeda, ex: BRL")
    .default("BRL"),
  corPrimaria: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || corHexValida(v), "Cor inválida"),
});

export type EmpresaFormValues = z.infer<typeof empresaSchema>;
```

- [ ] **Step 2: Verificar que o projeto continua tipando certo**

Run: `npx tsc --noEmit`
Expected: sem erros novos. (`empresaSchema.safeParse` em `actions.ts` ainda não passa `corPrimaria` nenhum — isso é esperado, `empresaSchema` exige o campo mas a Task 5 é quem ajusta a action pra sempre enviá-lo.)

- [ ] **Step 3: Escrever um teste rápido do schema isolado**

Criar `src/lib/schemas/empresa.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { empresaSchema } from "./empresa";

const BASE = {
  razaoSocial: "Empresa Teste Ltda",
  nomeFantasia: "Empresa Teste",
  cnpjCpf: "12345678000190",
  moedaPadrao: "BRL",
};

describe("empresaSchema — corPrimaria", () => {
  test("string vazia vira null", () => {
    const resultado = empresaSchema.parse({ ...BASE, corPrimaria: "" });
    expect(resultado.corPrimaria).toBeNull();
  });

  test("hex válido é aceito", () => {
    const resultado = empresaSchema.parse({ ...BASE, corPrimaria: "#0B2545" });
    expect(resultado.corPrimaria).toBe("#0B2545");
  });

  test("hex inválido é rejeitado", () => {
    const resultado = empresaSchema.safeParse({ ...BASE, corPrimaria: "azul" });
    expect(resultado.success).toBe(false);
  });
});
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/schemas/empresa.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/empresa.ts src/lib/schemas/empresa.test.ts
git commit -m "feat: campo corPrimaria no schema de Empresa"
```

---

### Task 4: Upload de logo e persistência no service

**Files:**
- Modify: `src/server/services/empresa.ts`
- Modify: `src/server/services/empresa.test.ts`

**Interfaces:**
- Consumes: `EmpresaFormValues` (Task 3, já com `corPrimaria`), `put`/`del` de `@vercel/blob`.
- Produces: `criarEmpresa(sessao, dados, logo?: File | null): Promise<Empresa>` e `atualizarEmpresa(sessao, id, dados, logo?: File | null, removerLogo?: boolean): Promise<Empresa>` (assinaturas estendidas, 3º/4º parâmetro opcionais — quem chama sem eles continua funcionando) — consumidas pela Task 5 (actions).

- [ ] **Step 1: Escrever os testes de integração (falhando)**

Adicionar ao topo de `src/server/services/empresa.test.ts` (antes do `describe("criarEmpresa"...)` existente) o mock do Blob, e um novo `describe` com os casos de logo/cor. Arquivo completo:

```ts
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string) => ({ url: `https://blob.test/${pathname}` })),
  del: vi.fn(async () => undefined),
}));

import { put, del } from "@vercel/blob";
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { criarEmpresa, atualizarEmpresa } from "./empresa";
import { listarFiliaisAcessiveis } from "./usuarioEmpresaFilial";

describe("criarEmpresa", () => {
  let usuarioId: string;
  let novaEmpresaId: string | undefined;
  let sessao: SessaoAtiva;

  beforeAll(async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);

    const usuario = await prisma.usuario.create({
      data: { nome: "Fundador", email: `fundador-${randomSuffix}@teste.local`, senhaHash: "x" },
    });
    usuarioId = usuario.id;

    sessao = {
      usuarioId,
      nome: "Fundador",
      empresaId: "n/a",
      perfil: "ADMINISTRADOR",
      filialId: "n/a",
      podeAlterarFilial: true,
    };
  });

  afterAll(async () => {
    if (novaEmpresaId) {
      await prisma.usuarioEmpresaFilial.deleteMany({
        where: { usuarioEmpresa: { empresaId: novaEmpresaId } },
      });
      await prisma.usuarioEmpresa.deleteMany({ where: { empresaId: novaEmpresaId } });
      await prisma.filial.deleteMany({ where: { empresaId: novaEmpresaId } });
      await prisma.auditLog.deleteMany({ where: { empresaId: novaEmpresaId } });
      await prisma.empresa.delete({ where: { id: novaEmpresaId } });
    }
    await prisma.usuario.delete({ where: { id: usuarioId } });
    await prisma.$disconnect();
  });

  test("cria a Filial Matriz e o vínculo do fundador com acesso de alteração", async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const empresa = await criarEmpresa(sessao, {
      razaoSocial: "Nova Empresa Ltda",
      nomeFantasia: "Nova Empresa",
      cnpjCpf: `${randomSuffix}/0001-01`,
      moedaPadrao: "BRL",
      corPrimaria: null,
    });
    novaEmpresaId = empresa.id;

    const filiais = await listarFiliaisAcessiveis(usuarioId, empresa.id);

    expect(filiais).toHaveLength(1);
    expect(filiais[0]?.filial.nome).toBe("Matriz");
    expect(filiais[0]?.podeAlterar).toBe(true);
  });

  test("sem corPrimaria/logo: os dois campos ficam null", async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const empresa = await criarEmpresa(sessao, {
      razaoSocial: "Empresa Sem Marca Ltda",
      nomeFantasia: "Empresa Sem Marca",
      cnpjCpf: `${randomSuffix}/0001-01`,
      moedaPadrao: "BRL",
      corPrimaria: null,
    });

    expect(empresa.corPrimaria).toBeNull();
    expect(empresa.logoUrl).toBeNull();

    await prisma.usuarioEmpresaFilial.deleteMany({ where: { usuarioEmpresa: { empresaId: empresa.id } } });
    await prisma.usuarioEmpresa.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.filial.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.auditLog.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.empresa.delete({ where: { id: empresa.id } });
  });

  test("com corPrimaria e logo: persiste os dois", async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const arquivo = new File([Buffer.from("fake-png")], "logo.png", { type: "image/png" });

    const empresa = await criarEmpresa(
      sessao,
      {
        razaoSocial: "Empresa Com Marca Ltda",
        nomeFantasia: "Empresa Com Marca",
        cnpjCpf: `${randomSuffix}/0001-01`,
        moedaPadrao: "BRL",
        corPrimaria: "#0B2545",
      },
      arquivo,
    );

    expect(empresa.corPrimaria).toBe("#0B2545");
    expect(empresa.logoUrl).toContain("blob.test");
    expect(put).toHaveBeenCalledWith(
      expect.stringContaining(`empresas/${empresa.id}/logo-`),
      arquivo,
      { access: "public" },
    );

    await prisma.usuarioEmpresaFilial.deleteMany({ where: { usuarioEmpresa: { empresaId: empresa.id } } });
    await prisma.usuarioEmpresa.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.filial.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.auditLog.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.empresa.delete({ where: { id: empresa.id } });
  });

  test("arquivo de logo maior que 1MB é rejeitado, empresa não é criada", async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const conteudoGrande = "A".repeat(1024 * 1024 + 1);
    const arquivo = new File([conteudoGrande], "logo-grande.png", { type: "image/png" });

    await expect(
      criarEmpresa(
        sessao,
        {
          razaoSocial: "Não Deve Existir Ltda",
          nomeFantasia: "Não Deve Existir",
          cnpjCpf: `${randomSuffix}/0001-01`,
          moedaPadrao: "BRL",
          corPrimaria: null,
        },
        arquivo,
      ),
    ).rejects.toThrow("limite");

    const encontrada = await prisma.empresa.findFirst({ where: { nomeFantasia: "Não Deve Existir" } });
    expect(encontrada).toBeNull();
  });
});

describe("atualizarEmpresa — cor e logo", () => {
  let usuarioId: string;
  let empresaId: string;
  let sessao: SessaoAtiva;

  beforeAll(async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const usuario = await prisma.usuario.create({
      data: { nome: "Admin Marca", email: `admin-marca-${randomSuffix}@teste.local`, senhaHash: "x" },
    });
    usuarioId = usuario.id;
    sessao = {
      usuarioId,
      nome: "Admin Marca",
      empresaId: "n/a",
      perfil: "ADMINISTRADOR",
      filialId: "n/a",
      podeAlterarFilial: true,
    };

    const empresa = await criarEmpresa(sessao, {
      razaoSocial: "Empresa Atualiza Ltda",
      nomeFantasia: "Empresa Atualiza",
      cnpjCpf: `${randomSuffix}/0001-02`,
      moedaPadrao: "BRL",
      corPrimaria: null,
    });
    empresaId = empresa.id;
  });

  afterAll(async () => {
    await prisma.usuarioEmpresaFilial.deleteMany({ where: { usuarioEmpresa: { empresaId } } });
    await prisma.usuarioEmpresa.deleteMany({ where: { empresaId } });
    await prisma.filial.deleteMany({ where: { empresaId } });
    await prisma.auditLog.deleteMany({ where: { empresaId } });
    await prisma.empresa.delete({ where: { id: empresaId } });
    await prisma.usuario.delete({ where: { id: usuarioId } });
    await prisma.$disconnect();
  });

  test("define corPrimaria", async () => {
    const empresa = await atualizarEmpresa(sessao, empresaId, {
      razaoSocial: "Empresa Atualiza Ltda",
      nomeFantasia: "Empresa Atualiza",
      cnpjCpf: (await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } })).cnpjCpf,
      moedaPadrao: "BRL",
      corPrimaria: "#F5D76E",
    });

    expect(empresa.corPrimaria).toBe("#F5D76E");
  });

  test("faz upload de um logo novo", async () => {
    const arquivo = new File([Buffer.from("fake-png-2")], "logo2.png", { type: "image/png" });
    const dadosAtuais = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });

    const empresa = await atualizarEmpresa(
      sessao,
      empresaId,
      {
        razaoSocial: dadosAtuais.razaoSocial,
        nomeFantasia: dadosAtuais.nomeFantasia,
        cnpjCpf: dadosAtuais.cnpjCpf,
        moedaPadrao: dadosAtuais.moedaPadrao,
        corPrimaria: dadosAtuais.corPrimaria,
      },
      arquivo,
    );

    expect(empresa.logoUrl).toContain("blob.test");
  });

  test("trocar o logo existente apaga o blob antigo antes de subir o novo", async () => {
    const arquivo = new File([Buffer.from("fake-png-3")], "logo3.png", { type: "image/png" });
    const antes = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(antes.logoUrl).not.toBeNull();

    await atualizarEmpresa(
      sessao,
      empresaId,
      {
        razaoSocial: antes.razaoSocial,
        nomeFantasia: antes.nomeFantasia,
        cnpjCpf: antes.cnpjCpf,
        moedaPadrao: antes.moedaPadrao,
        corPrimaria: antes.corPrimaria,
      },
      arquivo,
    );

    expect(del).toHaveBeenCalledWith(antes.logoUrl);
  });

  test("removerLogo:true sem novo arquivo limpa logoUrl e apaga o blob", async () => {
    const antes = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(antes.logoUrl).not.toBeNull();

    const empresa = await atualizarEmpresa(
      sessao,
      empresaId,
      {
        razaoSocial: antes.razaoSocial,
        nomeFantasia: antes.nomeFantasia,
        cnpjCpf: antes.cnpjCpf,
        moedaPadrao: antes.moedaPadrao,
        corPrimaria: antes.corPrimaria,
      },
      null,
      true,
    );

    expect(empresa.logoUrl).toBeNull();
    expect(del).toHaveBeenCalledWith(antes.logoUrl);
  });

  test("arquivo de tipo não aceito é rejeitado, logoUrl não muda", async () => {
    const antes = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    const arquivo = new File([Buffer.from("nao é imagem")], "arquivo.txt", { type: "text/plain" });

    await expect(
      atualizarEmpresa(
        sessao,
        empresaId,
        {
          razaoSocial: antes.razaoSocial,
          nomeFantasia: antes.nomeFantasia,
          cnpjCpf: antes.cnpjCpf,
          moedaPadrao: antes.moedaPadrao,
          corPrimaria: antes.corPrimaria,
        },
        arquivo,
      ),
    ).rejects.toThrow("Formato de logo não aceito");

    const depois = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(depois.logoUrl).toBe(antes.logoUrl);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run src/server/services/empresa.test.ts`
Expected: FAIL — `criarEmpresa`/`atualizarEmpresa` ainda não aceitam o parâmetro `logo`, e `corPrimaria`/`logoUrl` não existem no retorno.

- [ ] **Step 3: Implementar**

`src/server/services/empresa.ts` fica assim (arquivo inteiro):

```ts
import { put, del } from "@vercel/blob";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { EmpresaFormValues } from "@/lib/schemas/empresa";

export const TAMANHO_MAXIMO_LOGO_BYTES = 1 * 1024 * 1024;
const TIPOS_LOGO_ACEITOS = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

function validarArquivoLogo(arquivo: File): void {
  if (arquivo.size > TAMANHO_MAXIMO_LOGO_BYTES) {
    throw new Error(`Logo maior que o limite de ${TAMANHO_MAXIMO_LOGO_BYTES / (1024 * 1024)} MB`);
  }
  if (!TIPOS_LOGO_ACEITOS.includes(arquivo.type)) {
    throw new Error("Formato de logo não aceito — use PNG, JPG, SVG ou WebP");
  }
}

/** undefined = não mexe no campo; null = limpa; string = nova url. */
async function processarLogo(
  empresaId: string,
  logoUrlAtual: string | null,
  arquivo: File | null,
  removerLogo: boolean,
): Promise<string | null | undefined> {
  if (arquivo && arquivo.size > 0) {
    validarArquivoLogo(arquivo);
    if (logoUrlAtual) await del(logoUrlAtual).catch(() => {});
    const blob = await put(`empresas/${empresaId}/logo-${Date.now()}`, arquivo, {
      access: "public",
    });
    return blob.url;
  }
  if (removerLogo && logoUrlAtual) {
    await del(logoUrlAtual).catch(() => {});
    return null;
  }
  return undefined;
}

export async function listarEmpresas() {
  return prisma.empresa.findMany({ orderBy: { razaoSocial: "asc" } });
}

export async function criarEmpresa(sessao: SessaoAtiva, dados: EmpresaFormValues, logo: File | null = null) {
  requirePermission(sessao.perfil, "empresa:gerenciar");

  // Valida ANTES da transação — um arquivo inválido não deve deixar uma empresa órfã pra trás.
  if (logo && logo.size > 0) validarArquivoLogo(logo);

  let empresa = await prisma.$transaction(async (tx) => {
    const novaEmpresa = await tx.empresa.create({ data: dados });
    const vinculo = await tx.usuarioEmpresa.create({
      data: { usuarioId: sessao.usuarioId, empresaId: novaEmpresa.id, perfil: "ADMINISTRADOR" },
    });
    const matriz = await tx.filial.create({
      data: { empresaId: novaEmpresa.id, nome: "Matriz", cnpjCpf: dados.cnpjCpf },
    });
    await tx.usuarioEmpresaFilial.create({
      data: { usuarioEmpresaId: vinculo.id, filialId: matriz.id, podeAlterar: true, ativo: true },
    });
    return novaEmpresa;
  });

  if (logo && logo.size > 0) {
    const logoUrl = await processarLogo(empresa.id, null, logo, false);
    if (logoUrl) {
      empresa = await prisma.empresa.update({ where: { id: empresa.id }, data: { logoUrl } });
    }
  }

  await registrarAuditoria({
    empresaId: empresa.id,
    filialId: null,
    usuarioId: sessao.usuarioId,
    entidade: "Empresa",
    entidadeId: empresa.id,
    acao: "CRIAR",
    anterior: null,
    novo: dados,
  });

  return empresa;
}

export async function atualizarEmpresa(
  sessao: SessaoAtiva,
  id: string,
  dados: EmpresaFormValues,
  logo: File | null = null,
  removerLogo = false,
) {
  requirePermission(sessao.perfil, "empresa:gerenciar");

  const anterior = await prisma.empresa.findUniqueOrThrow({ where: { id } });
  const novoLogoUrl = await processarLogo(id, anterior.logoUrl, logo, removerLogo);

  const empresa = await prisma.empresa.update({
    where: { id },
    data: { ...dados, ...(novoLogoUrl !== undefined ? { logoUrl: novoLogoUrl } : {}) },
  });

  await registrarAuditoria({
    empresaId: id,
    filialId: null,
    usuarioId: sessao.usuarioId,
    entidade: "Empresa",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: {
      razaoSocial: anterior.razaoSocial,
      nomeFantasia: anterior.nomeFantasia,
      cnpjCpf: anterior.cnpjCpf,
      moedaPadrao: anterior.moedaPadrao,
      corPrimaria: anterior.corPrimaria,
      logoUrl: anterior.logoUrl,
    },
    novo: { ...dados, logoUrl: novoLogoUrl !== undefined ? novoLogoUrl : anterior.logoUrl },
  });

  return empresa;
}

export async function definirAtivoEmpresa(sessao: SessaoAtiva, id: string, ativo: boolean) {
  requirePermission(sessao.perfil, "empresa:gerenciar");

  const empresa = await prisma.empresa.update({ where: { id }, data: { ativo } });

  await registrarAuditoria({
    empresaId: id,
    filialId: null,
    usuarioId: sessao.usuarioId,
    entidade: "Empresa",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });

  return empresa;
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx vitest run src/server/services/empresa.test.ts`
Expected: PASS (11 testes: 4 de `criarEmpresa` + 7 de `atualizarEmpresa — cor e logo`)

- [ ] **Step 5: Rodar a suíte inteira pra confirmar que nada mais quebrou**

Run: `npm test`
Expected: PASS em todos os arquivos.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/empresa.ts src/server/services/empresa.test.ts
git commit -m "feat: upload de logo (Vercel Blob publico) e persistencia de corPrimaria/logoUrl"
```

---

### Task 5: Actions — extrair logo/removerLogo e normalizar corPrimaria

**Files:**
- Modify: `src/app/(dashboard)/empresas/actions.ts`

**Interfaces:**
- Consumes: `criarEmpresa(sessao, dados, logo?)`, `atualizarEmpresa(sessao, id, dados, logo?, removerLogo?)` (Task 4).
- Produces: `criarEmpresaAction`/`atualizarEmpresaAction` aceitando os campos `usarCorPersonalizada`, `corPrimaria`, `logo`, `removerLogo` do `FormData` — consumidos pela Task 6 (formulário).

- [ ] **Step 1: Editar o arquivo**

`src/app/(dashboard)/empresas/actions.ts` fica assim (arquivo inteiro):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { empresaSchema } from "@/lib/schemas/empresa";
import * as empresaService from "@/server/services/empresa";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

function extrairLogo(formData: FormData): File | null {
  const logo = formData.get("logo");
  return logo instanceof File && logo.size > 0 ? logo : null;
}

/** O checkbox "usarCorPersonalizada" decide se corPrimaria vale algo — nunca o
 * atributo disabled do input de cor (inputs desabilitados não são enviados no FormData). */
function normalizarDados(formData: FormData): Record<string, FormDataEntryValue> {
  const dadosBrutos = Object.fromEntries(formData);
  if (dadosBrutos.usarCorPersonalizada !== "true") {
    dadosBrutos.corPrimaria = "";
  }
  return dadosBrutos;
}

export async function criarEmpresaAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = empresaSchema.safeParse(normalizarDados(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await empresaService.criarEmpresa(sessao, parsed.data, extrairLogo(formData));
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/empresas");
  return { sucesso: true };
}

export async function atualizarEmpresaAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const parsed = empresaSchema.safeParse(normalizarDados(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const removerLogo = formData.get("removerLogo") === "true";

  try {
    await empresaService.atualizarEmpresa(sessao, id, parsed.data, extrairLogo(formData), removerLogo);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/empresas");
  return { sucesso: true };
}

export async function alternarAtivoEmpresaAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";

  await empresaService.definirAtivoEmpresa(sessao, id, ativo);
  revalidatePath("/empresas");
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS em todos os arquivos (nenhum teste existente cobre `actions.ts` diretamente — são Server Actions, testadas indiretamente via `empresa.ts`; a Task 7 faz a verificação visual ponta a ponta).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/empresas/actions.ts"
git commit -m "feat: actions de Empresa extraem logo/removerLogo e normalizam corPrimaria"
```

---

### Task 6: Formulário de cadastro — campos de cor e logo

**Files:**
- Modify: `src/app/(dashboard)/empresas/empresa-dialog-form.tsx`

**Interfaces:**
- Consumes: `criarEmpresaAction`/`atualizarEmpresaAction` (Task 5) — os `name` dos inputs precisam bater exatamente com o que a action lê (`usarCorPersonalizada`, `corPrimaria`, `logo`, `removerLogo`).

- [ ] **Step 1: Editar o componente**

`src/app/(dashboard)/empresas/empresa-dialog-form.tsx` fica assim (arquivo inteiro):

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
import { criarEmpresaAction, atualizarEmpresaAction, type FormState } from "./actions";

type Empresa = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpjCpf: string;
  moedaPadrao: string;
  corPrimaria: string | null;
  logoUrl: string | null;
};

const ESTADO_INICIAL: FormState = {};
const COR_PADRAO = "#0b2545";

export function EmpresaDialogForm({ empresa }: { empresa?: Empresa }) {
  const [aberto, setAberto] = useState(false);
  const [usarCor, setUsarCor] = useState(!!empresa?.corPrimaria);
  const action = empresa ? atualizarEmpresaAction : criarEmpresaAction;
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={empresa ? "outline" : "default"} size={empresa ? "sm" : "default"} />}
      >
        {empresa ? "Editar" : "Nova empresa"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{empresa ? "Editar empresa" : "Nova empresa"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {empresa ? <input type="hidden" name="id" value={empresa.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="razaoSocial">Razão social</Label>
            <Input
              id="razaoSocial"
              name="razaoSocial"
              defaultValue={empresa?.razaoSocial}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nomeFantasia">Nome fantasia</Label>
            <Input
              id="nomeFantasia"
              name="nomeFantasia"
              defaultValue={empresa?.nomeFantasia}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cnpjCpf">CNPJ/CPF</Label>
            <Input id="cnpjCpf" name="cnpjCpf" defaultValue={empresa?.cnpjCpf} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="moedaPadrao">Moeda padrão</Label>
            <Input
              id="moedaPadrao"
              name="moedaPadrao"
              defaultValue={empresa?.moedaPadrao ?? "BRL"}
              maxLength={3}
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="usarCorPersonalizada"
                name="usarCorPersonalizada"
                value="true"
                checked={usarCor}
                onChange={(e) => setUsarCor(e.target.checked)}
                className="size-4"
              />
              <Label htmlFor="usarCorPersonalizada">Usar cor personalizada nesta empresa</Label>
            </div>
            <input
              type="color"
              id="corPrimaria"
              name="corPrimaria"
              defaultValue={empresa?.corPrimaria ?? COR_PADRAO}
              className={usarCor ? "h-9 w-16" : "h-9 w-16 opacity-40"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logo">Logo</Label>
            {empresa?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={empresa.logoUrl} alt="Logo atual" className="h-10 w-10 rounded object-contain" />
            ) : null}
            <Input
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
            />
            {empresa?.logoUrl ? (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="removerLogo" name="removerLogo" value="true" className="size-4" />
                <Label htmlFor="removerLogo">Remover logo atual</Label>
              </div>
            ) : null}
          </div>
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

- [ ] **Step 2: Atualizar quem passa `empresa` pro componente**

Em `src/app/(dashboard)/empresas/page.tsx`, o objeto `empresa` já vem direto do Prisma (`listarEmpresas()`), então `corPrimaria`/`logoUrl` já estão presentes automaticamente — nenhuma mudança necessária ali além de conferir que o tipo bate (o `tsc` da Step 3 confirma isso).

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS em todos os arquivos.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/empresas/empresa-dialog-form.tsx"
git commit -m "feat: campos de cor personalizada e logo no formulario de Empresa"
```

---

### Task 7: Aplicação visual (layout + sidebar) e verificação ponta a ponta

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/app/(dashboard)/sidebar.tsx`

**Interfaces:**
- Consumes: `corDeTextoContrastante` (Task 1), `Empresa.corPrimaria`/`Empresa.logoUrl` (Task 2).

- [ ] **Step 1: Editar o layout**

`src/app/(dashboard)/layout.tsx` fica assim (arquivo inteiro):

```tsx
import type { ReactNode, CSSProperties } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { prisma } from "@/server/db/client";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { obterVersaoInfo } from "@/lib/versao";
import { corDeTextoContrastante } from "@/lib/corContraste";
import { Sidebar } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";
import { sair } from "./actions";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const sessao = await requireSessaoAtiva();
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: sessao.empresaId } });
  const filial = await prisma.filial.findUniqueOrThrow({ where: { id: sessao.filialId } });
  const versaoInfo = obterVersaoInfo();

  const estiloSidebar: CSSProperties | undefined = empresa.corPrimaria
    ? ({
        "--sidebar": empresa.corPrimaria,
        "--sidebar-foreground": corDeTextoContrastante(empresa.corPrimaria),
      } as CSSProperties)
    : undefined;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        perfil={sessao.perfil}
        versaoInfo={versaoInfo}
        estilo={estiloSidebar}
        logoUrl={empresa.logoUrl}
      />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-app-header-foreground/10 bg-app-header px-6 py-3 text-app-header-foreground">
          <div className="text-sm">
            <p className="font-medium">
              {empresa.nomeFantasia} · {filial.nome}
            </p>
            <p className="text-xs text-app-header-foreground/70">
              {sessao.nome} · {sessao.perfil}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              render={<Link href="/selecionar-empresa" />}
              nativeButton={false}
              variant="ghost"
              size="sm"
              className="text-app-header-foreground hover:bg-app-header-foreground/10 hover:text-app-header-foreground"
            >
              Trocar empresa
            </Button>
            <Button
              render={<Link href="/selecionar-filial" />}
              nativeButton={false}
              variant="ghost"
              size="sm"
              className="text-app-header-foreground hover:bg-app-header-foreground/10 hover:text-app-header-foreground"
            >
              Trocar filial
            </Button>
            <form action={sair}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="border-app-header-foreground/30 text-app-header-foreground hover:bg-app-header-foreground/10 hover:text-app-header-foreground"
              >
                Sair
              </Button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Editar a sidebar**

`src/app/(dashboard)/sidebar.tsx` fica assim (arquivo inteiro):

```tsx
"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Perfil } from "@prisma/client";
import { cn } from "@/lib/utils";
import type { VersaoInfo } from "@/lib/versao";
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion";
import { NAV_SECTIONS } from "./nav-items";
import { VersaoBadge } from "./versao-badge";

type SidebarProps = {
  perfil: Perfil;
  versaoInfo: VersaoInfo;
  estilo?: CSSProperties;
  logoUrl?: string | null;
};

export function Sidebar({ perfil, versaoInfo, estilo, logoUrl }: SidebarProps) {
  const pathname = usePathname();

  const secoesVisiveis = NAV_SECTIONS.map((secao) => ({
    ...secao,
    itens: secao.itens.filter((item) => !item.permitido || item.permitido.includes(perfil)),
  })).filter((secao) => secao.itens.length > 0);

  const secaoAtiva = secoesVisiveis.find((secao) =>
    secao.itens.some((item) => pathname.startsWith(item.href)),
  )?.titulo;

  const [abertas, setAbertas] = useState<string[]>(secaoAtiva ? [secaoAtiva] : []);

  useEffect(() => {
    if (secaoAtiva) {
      setAbertas((atual) => (atual.includes(secaoAtiva) ? atual : [...atual, secaoAtiva]));
    }
  }, [secaoAtiva]);

  return (
    <nav
      style={estilo}
      className="flex w-60 shrink-0 flex-col gap-4 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground"
    >
      <div className="flex items-center gap-2 px-2">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-6 rounded object-contain" />
        ) : null}
        <Link href="/" className="text-sm font-semibold">
          NX Control
        </Link>
      </div>
      <Accordion multiple value={abertas} onValueChange={(valor) => setAbertas(valor as string[])}>
        {secoesVisiveis.map((secao) => (
          <AccordionItem key={secao.titulo} value={secao.titulo}>
            <AccordionTrigger>{secao.titulo}</AccordionTrigger>
            <AccordionPanel>
              {secao.itens.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    pathname.startsWith(item.href) &&
                      "bg-sidebar-primary font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
      <div className="mt-auto">
        <VersaoBadge versaoInfo={versaoInfo} />
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Verificar tipos e suíte completa**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros, todos os testes passando.

- [ ] **Step 4: Build de produção**

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 5: Verificação visual (Playwright)**

Subir o servidor de dev (`npm run dev -- --port <porta livre>`), logar como `admin@nx-control-erp.local` / `TrocarSenha123!`, ir em **Empresas**, editar a empresa "Empresa Demonstração Ltda": marcar "Usar cor personalizada", escolher um tom escuro (ex. `#0B2545`) e salvar. Confirmar visualmente (screenshot) que a sidebar mudou de cor e o texto continua legível. Repetir com um tom claro (ex. `#F5D76E`) e confirmar que o texto vira preto automaticamente. Fazer upload de um logo pequeno (PNG) e confirmar que aparece ao lado de "NX Control" no topo da sidebar. Editar de novo e desmarcar "Usar cor personalizada": confirmar que a sidebar volta à cor da paleta pessoal (não fica presa na cor antiga).

Script de referência (mesmo padrão usado no resto desta sessão — ajustar a porta):

```ts
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto("http://localhost:3020/login");
  await page.fill('input[name="email"]', "admin@nx-control-erp.local");
  await page.fill('input[name="senha"]', "TrocarSenha123!");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");

  await page.goto("http://localhost:3020/empresas");
  await page.waitForLoadState("networkidle");
  await page.click('button:has-text("Editar")');
  await page.waitForTimeout(300);

  await page.check('#usarCorPersonalizada');
  await page.fill('#corPrimaria', "#0b2545");
  await page.setInputFiles('#logo', { name: "logo.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) });
  await page.click('button[type="submit"]:has-text("Salvar")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "_v1-empresa-cor-escura.png", fullPage: true });

  await browser.close();
}

main();
```

Expected: screenshot mostra a sidebar com o fundo `#0B2545`, texto branco legível, e um logo pequeno ao lado de "NX Control".

- [ ] **Step 6: Limpar arquivos temporários de verificação**

Run: `rm -f _v1-empresa-cor-escura.png` (e qualquer outro screenshot/script temporário criado na Step 5)

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/layout.tsx" "src/app/(dashboard)/sidebar.tsx"
git commit -m "feat: aplica cor e logo da empresa na sidebar"
```

---

## Verificação final

- `npm test` — todos os testes passando (novos + existentes).
- `npx tsc --noEmit` — sem erros.
- `npm run build` — build de produção conclui.
- Verificação visual da Task 7 confirmada (cor clara, cor escura, logo, e "voltar ao padrão" desmarcando o checkbox).
