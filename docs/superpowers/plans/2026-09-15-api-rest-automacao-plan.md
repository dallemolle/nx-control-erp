# API REST de Automação de Lançamentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a primeira API REST programática do `nx-control-erp`, autenticada por chave (bearer token) vinculada a um usuário existente, permitindo que um agente externo crie contas a pagar/receber, lançamentos bancários manuais, baixas de parcela e importe extratos bancários, além de consultar os cadastros de apoio — tudo usando identificador natural (CNPJ/CPF, código, nome) em vez de UUID interno.

**Architecture:** Cada rota vive em `src/app/api/v1/**/route.ts` e delega para os `services` existentes em `src/server/services/`, que já fazem toda a validação de negócio, checagem de permissão (nas rotas de escrita) e auditoria — nenhum desses services muda de comportamento. Duas peças novas fazem a ponte entre uma requisição HTTP crua e o `SessaoAtiva` que esses services esperam: `requireSessaoApi` (autentica a chave, resolve empresa/filial dos headers) e `executarRotaApi` (wrapper que centraliza o mapeamento de erro → status HTTP). A resolução de identificador natural (CNPJ→fornecedor, código→centro de custo, etc.) hoje vive duplicada dentro da importação de CSV; é extraída para um módulo compartilhado, `resolucaoCadastros.ts`, usado tanto pelo CSV quanto pela API nova.

**Tech Stack:** Next.js 16 App Router (Route Handlers), Prisma 7, Zod, Vitest, `crypto` nativo do Node (SHA-256 para hash da chave).

**Spec:** `docs/superpowers/specs/2026-09-15-api-rest-automacao-design.md`

## Global Constraints

- Toda chamada exige os headers `Authorization: Bearer <chave>`, `X-Empresa-Id`, `X-Filial-Id`.
- Identificador natural que não resolve para um cadastro existente → erro `422`, nunca cria o cadastro automaticamente.
- Nenhuma rota reimplementa checagem de permissão que o service já faz internamente (`criarTitulo`, `criarLancamentoManual`, `registrarBaixa`, `importarExtratoOfx` já chamam `requirePermission` sozinhos). Rotas de **leitura** (`listarTitulos`, `listarLancamentos`, `listarFornecedores`, etc.) recebem `filialId`/`empresaId` crus e **não** checam permissão internamente — a rota precisa chamar `requirePermission(sessao.perfil, "...")` ela mesma antes de chamar o service.
- Formato de erro padrão: `{ "erro": "mensagem" }` (mais `"campos": [...]` quando aplicável). Sem idempotência, sem paginação nesta v1 (ver `docs/backlog.md`).
- Toda rota nova fica em `src/app/api/v1/`, fora do grupo `(dashboard)`.

---

## Task 1: Modelo de dados `ApiKey`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev` (nome sugerido: `add_api_key`)

**Interfaces:**
- Produces: model Prisma `ApiKey` com campos `id, usuarioId, nome, prefixo, chaveHash (@unique), ultimoUsoEm, revogadaEm, criadoEm`; relação inversa `Usuario.apiKeys`.

- [ ] **Step 1: Adicionar o model `ApiKey` ao schema**

Em `prisma/schema.prisma`, logo após o model `Usuario` (linha 146, depois do `@@map("usuarios")` que fecha o model `Usuario`), adicionar:

```prisma
model ApiKey {
  id          String    @id @default(uuid())
  usuarioId   String
  nome        String
  prefixo     String
  chaveHash   String    @unique
  ultimoUsoEm DateTime?
  revogadaEm  DateTime?
  criadoEm    DateTime  @default(now())

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@index([usuarioId])
  @@map("api_keys")
}
```

- [ ] **Step 2: Adicionar a relação inversa no model `Usuario`**

Em `prisma/schema.prisma`, dentro do model `Usuario` (por volta da linha 143, junto das outras relações `1:N`), adicionar a linha:

```prisma
  apiKeys                   ApiKey[]
```

- [ ] **Step 3: Gerar e aplicar a migration**

Run: `npx prisma migrate dev --name add_api_key`
Expected: cria uma nova pasta em `prisma/migrations/<timestamp>_add_api_key/migration.sql` e aplica no banco de dev sem erro. Prisma regenera o client automaticamente.

- [ ] **Step 4: Confirmar que o client gerado expõe `prisma.apiKey`**

Run: `npx tsc --noEmit`
Expected: sem erros (o types do Prisma Client já reconhece `ApiKey`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: adicionar modelo ApiKey para autenticacao da API REST"
```

---

## Task 2: Serviço de gestão de chaves (`apiKey.ts`)

**Files:**
- Create: `src/server/services/apiKey.ts`
- Test: `src/server/services/apiKey.test.ts`

**Interfaces:**
- Consumes: `prisma` (`@/server/db/client`), `requirePermission` (`@/server/auth/permissions`), `SessaoAtiva` (`@/server/auth/sessao`), fixture `criarFixtureFinanceiro`/`limparFixtureFinanceiro` (`./financeiroTestFixtures`).
- Produces:
  - `hashChaveApi(chave: string): string`
  - `gerarChave(sessao: SessaoAtiva, usuarioId: string, nome: string): Promise<{ id: string; chaveCompleta: string; prefixo: string }>`
  - `revogarChave(sessao: SessaoAtiva, chaveId: string): Promise<void>`
  - `listarChaves(sessao: SessaoAtiva, usuarioId: string): Promise<{ id: string; nome: string; prefixo: string; ultimoUsoEm: Date | null; revogadaEm: Date | null; criadoEm: Date }[]>`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/server/services/apiKey.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { gerarChave, revogarChave, listarChaves, hashChaveApi } from "./apiKey";

describe("gestão de chaves de API", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APIKEY");
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: { in: [fixture.usuarioId, fixture.usuarioAdminId] } } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("gerarChave cria a chave e devolve o valor completo só na criação", async () => {
    const resultado = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Agente IA - teste");

    expect(resultado.chaveCompleta).toMatch(/^sk_/);
    expect(resultado.prefixo).toBe(resultado.chaveCompleta.slice(0, 11));

    const persistida = await prisma.apiKey.findUniqueOrThrow({ where: { id: resultado.id } });
    expect(persistida.chaveHash).toBe(hashChaveApi(resultado.chaveCompleta));
    expect(persistida.chaveHash).not.toBe(resultado.chaveCompleta);
    expect(persistida.nome).toBe("Agente IA - teste");
    expect(persistida.revogadaEm).toBeNull();
  });

  test("listarChaves não expõe chaveHash nem a chave completa", async () => {
    await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave para listagem");

    const chaves = await listarChaves(fixture.sessaoAdmin, fixture.usuarioId);

    expect(chaves.length).toBeGreaterThan(0);
    for (const chave of chaves) {
      expect(chave).not.toHaveProperty("chaveHash");
      expect(Object.keys(chave).sort()).toEqual(
        ["criadoEm", "id", "nome", "prefixo", "revogadaEm", "ultimoUsoEm"].sort(),
      );
    }
  });

  test("revogarChave marca revogadaEm", async () => {
    const criada = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave para revogar");

    await revogarChave(fixture.sessaoAdmin, criada.id);

    const persistida = await prisma.apiKey.findUniqueOrThrow({ where: { id: criada.id } });
    expect(persistida.revogadaEm).not.toBeNull();
  });

  test("perfil sem usuario:gerenciar não consegue gerar, listar ou revogar", async () => {
    await expect(gerarChave(fixture.sessao, fixture.usuarioId, "Não permitido")).rejects.toThrow(PermissionError);
    await expect(listarChaves(fixture.sessao, fixture.usuarioId)).rejects.toThrow(PermissionError);

    const criadaComoAdmin = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Para testar revogação negada");
    await expect(revogarChave(fixture.sessao, criadaComoAdmin.id)).rejects.toThrow(PermissionError);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/server/services/apiKey.test.ts`
Expected: FAIL — `Cannot find module './apiKey'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar `apiKey.ts`**

Criar `src/server/services/apiKey.ts`:

```ts
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";

export function hashChaveApi(chave: string): string {
  return createHash("sha256").update(chave).digest("hex");
}

export async function gerarChave(
  sessao: SessaoAtiva,
  usuarioId: string,
  nome: string,
): Promise<{ id: string; chaveCompleta: string; prefixo: string }> {
  requirePermission(sessao.perfil, "usuario:gerenciar");

  const chaveCompleta = `sk_${randomBytes(32).toString("base64url")}`;
  const prefixo = chaveCompleta.slice(0, 11);
  const chaveHash = hashChaveApi(chaveCompleta);

  const apiKey = await prisma.apiKey.create({
    data: { usuarioId, nome, prefixo, chaveHash },
  });

  return { id: apiKey.id, chaveCompleta, prefixo };
}

export async function revogarChave(sessao: SessaoAtiva, chaveId: string): Promise<void> {
  requirePermission(sessao.perfil, "usuario:gerenciar");
  await prisma.apiKey.update({ where: { id: chaveId }, data: { revogadaEm: new Date() } });
}

export async function listarChaves(sessao: SessaoAtiva, usuarioId: string) {
  requirePermission(sessao.perfil, "usuario:gerenciar");
  return prisma.apiKey.findMany({
    where: { usuarioId },
    select: { id: true, nome: true, prefixo: true, ultimoUsoEm: true, revogadaEm: true, criadoEm: true },
    orderBy: { criadoEm: "desc" },
  });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/server/services/apiKey.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/apiKey.ts src/server/services/apiKey.test.ts
git commit -m "feat: servico de geracao/revogacao/listagem de chaves de API"
```

---

## Task 3: Extrair `resolucaoCadastros.ts` (refatoração pura, sem mudança de comportamento)

**Files:**
- Create: `src/server/services/resolucaoCadastros.ts`
- Modify: `src/server/services/importacaoTitulo.ts`
- Test: `src/server/services/resolucaoCadastros.test.ts`
- Verify unchanged: `src/server/services/importacaoTitulo.test.ts` (já existe, deve continuar passando sem edição)

**Interfaces:**
- Consumes: `prisma` (`@/server/db/client`), `SessaoAtiva`, `TipoTitulo` (`@prisma/client`).
- Produces:
  - `normalizarDocumento(valor: string): string`
  - `normalizarChave(valor: string): string`
  - `type CadastrosParaResolucao = { rotuloContraparte: string; mapaContraparte: Map<string,string>; mapaCategoria: Map<string,string>; mapaCentroCusto: Map<string,string>; mapaCentroLucro: Map<string,string>; mapaSafra: Map<string,string>; mapaProjeto: Map<string,string> ; mapaContaBancaria: Map<string,string> }`
  - `carregarCadastrosParaResolucao(sessao: SessaoAtiva, tipo: TipoTitulo): Promise<CadastrosParaResolucao>`
  - `resolverContraparte(cadastros: CadastrosParaResolucao, cnpjCpfBruto: string, erros: string[], camposComErroResolucao: Set<string>): string` — devolve `""` se `cnpjCpfBruto` vazio; devolve o id se resolver; empurra erro em `erros` (e `"contraparteId"` em `camposComErroResolucao`) e devolve `""` se não resolver.
  - `resolverCategoriaFinanceira(cadastros: CadastrosParaResolucao, nomeBruto: string, erros: string[], camposComErroResolucao: Set<string>): string` — mesma regra, campo `"categoriaFinanceiraId"`.
  - `resolverCodigoOpcional(mapa: Map<string,string>, valorBruto: string | undefined, rotulo: string, erros: string[]): string` — campo opcional: `""` se vazio; empurra erro (sem marcar `camposComErroResolucao`, pois estes campos são opcionais no schema e não geram erro duplicado de "obrigatório") e devolve `""` se não resolver; devolve o id se resolver.
  - `resolverContaBancariaOpcional(cadastros: CadastrosParaResolucao, agenciaBruta: string | undefined, contaBruta: string | undefined, erros: string[]): string`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/server/services/resolucaoCadastros.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import {
  carregarCadastrosParaResolucao,
  resolverContraparte,
  resolverCategoriaFinanceira,
  resolverCodigoOpcional,
  resolverContaBancariaOpcional,
  normalizarDocumento,
  normalizarChave,
} from "./resolucaoCadastros";

describe("resolução de cadastros por identificador natural", () => {
  let fixture: FixtureFinanceiro;
  let centroCustoId: string;
  const CENTRO_CUSTO_CODIGO = "CC-RES";

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("RES");
    const centro = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Centro Resolução", codigo: CENTRO_CUSTO_CODIGO },
    });
    centroCustoId = centro.id;
  });

  afterAll(async () => {
    await prisma.centroCusto.delete({ where: { id: centroCustoId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("normalizarDocumento remove pontuação", () => {
    expect(normalizarDocumento("11.222.333/0001-44")).toBe("11222333000144");
  });

  test("normalizarChave ignora maiúsculas/minúsculas e espaços nas pontas", () => {
    expect(normalizarChave("  Insumos Agrícolas  ")).toBe("insumos agrícolas");
  });

  test("resolverContraparte resolve por CNPJ ignorando pontuação", async () => {
    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: fixture.fornecedorId } });
    const cadastros = await carregarCadastrosParaResolucao(fixture.sessao, "PAGAR");

    const erros: string[] = [];
    const campos = new Set<string>();
    const id = resolverContraparte(cadastros, fornecedor.cnpjCpf.replace(/\D/g, ""), erros, campos);

    expect(id).toBe(fixture.fornecedorId);
    expect(erros).toEqual([]);
  });

  test("resolverContraparte não encontrado gera erro e marca o campo", async () => {
    const cadastros = await carregarCadastrosParaResolucao(fixture.sessao, "PAGAR");
    const erros: string[] = [];
    const campos = new Set<string>();

    const id = resolverContraparte(cadastros, "00000000000000", erros, campos);

    expect(id).toBe("");
    expect(erros).toEqual([expect.stringContaining("não encontrado")]);
    expect(campos.has("contraparteId")).toBe(true);
  });

  test("resolverContraparte com entrada vazia não gera erro", async () => {
    const cadastros = await carregarCadastrosParaResolucao(fixture.sessao, "PAGAR");
    const erros: string[] = [];
    const campos = new Set<string>();

    const id = resolverContraparte(cadastros, "", erros, campos);

    expect(id).toBe("");
    expect(erros).toEqual([]);
    expect(campos.size).toBe(0);
  });

  test("resolverCategoriaFinanceira resolve por nome", async () => {
    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });
    const cadastros = await carregarCadastrosParaResolucao(fixture.sessao, "PAGAR");
    const erros: string[] = [];
    const campos = new Set<string>();

    const id = resolverCategoriaFinanceira(cadastros, categoria.nome.toUpperCase(), erros, campos);

    expect(id).toBe(fixture.categoriaFinanceiraId);
    expect(erros).toEqual([]);
  });

  test("resolverCodigoOpcional resolve centro de custo por código, e vazio não gera erro", async () => {
    const cadastros = await carregarCadastrosParaResolucao(fixture.sessao, "PAGAR");
    const erros: string[] = [];

    const id = resolverCodigoOpcional(cadastros.mapaCentroCusto, CENTRO_CUSTO_CODIGO, "Centro de custo", erros);
    expect(id).toBe(centroCustoId);
    expect(erros).toEqual([]);

    const vazio = resolverCodigoOpcional(cadastros.mapaCentroCusto, undefined, "Centro de custo", erros);
    expect(vazio).toBe("");
    expect(erros).toEqual([]);
  });

  test("resolverContaBancariaOpcional exige agência e conta juntas", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });
    const cadastros = await carregarCadastrosParaResolucao(fixture.sessao, "PAGAR");

    const erros1: string[] = [];
    const id = resolverContaBancariaOpcional(cadastros, conta.agencia, conta.conta, erros1);
    expect(id).toBe(fixture.contaBancariaId);
    expect(erros1).toEqual([]);

    const erros2: string[] = [];
    resolverContaBancariaOpcional(cadastros, conta.agencia, undefined, erros2);
    expect(erros2).toEqual([expect.stringContaining("Informe agência e conta bancária juntas")]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/server/services/resolucaoCadastros.test.ts`
Expected: FAIL — `Cannot find module './resolucaoCadastros'`.

- [ ] **Step 3: Criar `resolucaoCadastros.ts` com a lógica extraída de `importacaoTitulo.ts`**

Criar `src/server/services/resolucaoCadastros.ts`:

```ts
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { TipoTitulo } from "@prisma/client";

/** Compara CNPJ/CPF ignorando pontuação — o cadastro não normaliza o valor digitado. */
export function normalizarDocumento(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Compara nome/código ignorando maiúsculas/minúsculas e espaços nas pontas. */
export function normalizarChave(valor: string): string {
  return valor.trim().toLowerCase();
}

export type CadastrosParaResolucao = {
  rotuloContraparte: string;
  mapaContraparte: Map<string, string>;
  mapaCategoria: Map<string, string>;
  mapaCentroCusto: Map<string, string>;
  mapaCentroLucro: Map<string, string>;
  mapaSafra: Map<string, string>;
  mapaProjeto: Map<string, string>;
  mapaContaBancaria: Map<string, string>;
};

export async function carregarCadastrosParaResolucao(
  sessao: SessaoAtiva,
  tipo: TipoTitulo,
): Promise<CadastrosParaResolucao> {
  const [contrapartes, categorias, centrosCusto, centrosLucro, safras, projetos, contasBancarias] =
    await Promise.all([
      tipo === "PAGAR"
        ? prisma.fornecedor.findMany({ where: { empresaId: sessao.empresaId }, select: { id: true, cnpjCpf: true } })
        : prisma.cliente.findMany({ where: { empresaId: sessao.empresaId }, select: { id: true, cnpjCpf: true } }),
      prisma.categoriaFinanceira.findMany({ where: { filialId: sessao.filialId }, select: { id: true, nome: true } }),
      prisma.centroCusto.findMany({ where: { filialId: sessao.filialId }, select: { id: true, codigo: true } }),
      prisma.centroLucro.findMany({ where: { filialId: sessao.filialId }, select: { id: true, codigo: true } }),
      prisma.safra.findMany({ where: { filialId: sessao.filialId }, select: { id: true, nome: true } }),
      prisma.projeto.findMany({ where: { filialId: sessao.filialId }, select: { id: true, codigo: true } }),
      prisma.contaBancaria.findMany({
        where: { filialId: sessao.filialId },
        select: { id: true, agencia: true, conta: true },
      }),
    ]);

  return {
    rotuloContraparte: tipo === "PAGAR" ? "Fornecedor" : "Cliente",
    mapaContraparte: new Map(contrapartes.map((c) => [normalizarDocumento(c.cnpjCpf), c.id])),
    mapaCategoria: new Map(categorias.map((c) => [normalizarChave(c.nome), c.id])),
    mapaCentroCusto: new Map(centrosCusto.map((c) => [normalizarChave(c.codigo), c.id])),
    mapaCentroLucro: new Map(centrosLucro.map((c) => [normalizarChave(c.codigo), c.id])),
    mapaSafra: new Map(safras.map((s) => [normalizarChave(s.nome), s.id])),
    mapaProjeto: new Map(projetos.map((p) => [normalizarChave(p.codigo), p.id])),
    mapaContaBancaria: new Map(
      contasBancarias.map((c) => [`${normalizarChave(c.agencia)}|${normalizarChave(c.conta)}`, c.id]),
    ),
  };
}

export function resolverContraparte(
  cadastros: CadastrosParaResolucao,
  cnpjCpfBruto: string,
  erros: string[],
  camposComErroResolucao: Set<string>,
): string {
  const valor = cnpjCpfBruto.trim();
  if (!valor) return "";
  const encontrado = cadastros.mapaContraparte.get(normalizarDocumento(valor));
  if (!encontrado) {
    erros.push(`${cadastros.rotuloContraparte} com CNPJ/CPF "${valor}" não encontrado`);
    camposComErroResolucao.add("contraparteId");
    return "";
  }
  return encontrado;
}

export function resolverCategoriaFinanceira(
  cadastros: CadastrosParaResolucao,
  nomeBruto: string,
  erros: string[],
  camposComErroResolucao: Set<string>,
): string {
  const valor = nomeBruto.trim();
  if (!valor) return "";
  const encontrado = cadastros.mapaCategoria.get(normalizarChave(valor));
  if (!encontrado) {
    erros.push(`Categoria financeira "${valor}" não encontrada`);
    camposComErroResolucao.add("categoriaFinanceiraId");
    return "";
  }
  return encontrado;
}

export function resolverCodigoOpcional(
  mapa: Map<string, string>,
  valorBruto: string | undefined,
  rotulo: string,
  erros: string[],
): string {
  const valor = (valorBruto ?? "").trim();
  if (!valor) return "";
  const encontrado = mapa.get(normalizarChave(valor));
  if (!encontrado) {
    erros.push(`${rotulo} "${valor}" não encontrado`);
    return "";
  }
  return encontrado;
}

export function resolverContaBancariaOpcional(
  cadastros: CadastrosParaResolucao,
  agenciaBruta: string | undefined,
  contaBruta: string | undefined,
  erros: string[],
): string {
  const agencia = (agenciaBruta ?? "").trim();
  const conta = (contaBruta ?? "").trim();
  if (!agencia && !conta) return "";
  if (!agencia || !conta) {
    erros.push("Informe agência e conta bancária juntas, ou deixe as duas em branco");
    return "";
  }
  const encontrado = cadastros.mapaContaBancaria.get(`${normalizarChave(agencia)}|${normalizarChave(conta)}`);
  if (!encontrado) {
    erros.push(`Conta bancária agência "${agencia}" / conta "${conta}" não encontrada`);
    return "";
  }
  return encontrado;
}
```

- [ ] **Step 4: Rodar o teste novo e confirmar que passa**

Run: `npx vitest run src/server/services/resolucaoCadastros.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Reescrever `importacaoTitulo.ts` para usar o módulo extraído, sem mudar comportamento**

Substituir o conteúdo de `src/server/services/importacaoTitulo.ts` por:

```ts
import Papa from "papaparse";
import { prisma } from "@/server/db/client";
import { tituloSchema } from "@/lib/schemas/titulo";
import { criarTitulo } from "@/server/services/titulo";
import {
  carregarCadastrosParaResolucao,
  resolverContraparte,
  resolverCategoriaFinanceira,
  resolverCodigoOpcional,
  resolverContaBancariaOpcional,
} from "@/server/services/resolucaoCadastros";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { TipoTitulo } from "@prisma/client";

export type LinhaImportacao = {
  linha: number;
  bruta: Record<string, string>;
  erros: string[];
};

async function construirResolvedor(sessao: SessaoAtiva, tipo: TipoTitulo) {
  const cadastros = await carregarCadastrosParaResolucao(sessao, tipo);

  function resolverLinha(bruta: Record<string, string>): {
    dados: Record<string, unknown>;
    erros: string[];
    camposComErroResolucao: Set<string>;
  } {
    const erros: string[] = [];
    const camposComErroResolucao = new Set<string>();

    const contraparteId = resolverContraparte(cadastros, bruta.cnpjCpf ?? "", erros, camposComErroResolucao);
    const categoriaFinanceiraId = resolverCategoriaFinanceira(
      cadastros,
      bruta.categoriaFinanceira ?? "",
      erros,
      camposComErroResolucao,
    );
    const centroCustoId = resolverCodigoOpcional(cadastros.mapaCentroCusto, bruta.centroCusto, "Centro de custo", erros);
    const centroLucroId = resolverCodigoOpcional(cadastros.mapaCentroLucro, bruta.centroLucro, "Centro de lucro", erros);
    const safraId = resolverCodigoOpcional(cadastros.mapaSafra, bruta.safra, "Safra", erros);
    const projetoId = resolverCodigoOpcional(cadastros.mapaProjeto, bruta.projeto, "Projeto", erros);
    const contaBancariaId = resolverContaBancariaOpcional(
      cadastros,
      bruta.contaBancariaAgencia,
      bruta.contaBancariaConta,
      erros,
    );

    const dados = {
      contraparteId,
      documento: bruta.documento,
      dataEmissao: bruta.dataEmissao,
      dataCompetencia: bruta.dataCompetencia,
      categoriaFinanceiraId,
      centroCustoId,
      centroLucroId,
      safraId,
      projetoId,
      contaBancariaId,
      formaPagamento: bruta.formaPagamento,
      parcelas: [
        {
          numero: bruta.numeroParcela || "1",
          dataVencimento: bruta.dataVencimento,
          valorOriginal: bruta.valorOriginal,
        },
      ],
    };

    return { dados, erros, camposComErroResolucao };
  }

  return { resolverLinha };
}

export async function validarCsv(
  sessao: SessaoAtiva,
  tipo: TipoTitulo,
  conteudoCsv: string,
): Promise<LinhaImportacao[]> {
  const resultado = Papa.parse<Record<string, string>>(conteudoCsv, { header: true, skipEmptyLines: true });
  const { resolverLinha } = await construirResolvedor(sessao, tipo);

  return resultado.data.map((bruta, indice) => {
    const { dados, erros: errosResolucao, camposComErroResolucao } = resolverLinha(bruta);
    const parsed = tituloSchema.safeParse(dados);
    const errosSchema = parsed.success
      ? []
      : parsed.error.issues
          .filter((issue) => !camposComErroResolucao.has(String(issue.path[0])))
          .map((issue) => issue.message);
    return { linha: indice + 2, bruta, erros: [...errosResolucao, ...errosSchema] };
  });
}

export async function confirmarImportacao(sessao: SessaoAtiva, tipo: TipoTitulo, linhas: LinhaImportacao[]) {
  if (linhas.length === 0) {
    throw new Error("Nenhuma linha para importar");
  }
  if (linhas.some((linha) => linha.erros.length > 0)) {
    throw new Error("Existem linhas inválidas — corrija ou remova antes de importar");
  }

  const { resolverLinha } = await construirResolvedor(sessao, tipo);

  return prisma.$transaction(async (tx) => {
    const criados = [];
    for (const linha of linhas) {
      const { dados, erros } = resolverLinha(linha.bruta);
      if (erros.length > 0) {
        throw new Error("Existem linhas inválidas — corrija ou remova antes de importar");
      }
      const dadosValidados = tituloSchema.parse(dados);
      criados.push(await criarTitulo(sessao, tipo, dadosValidados, tx));
    }
    return criados;
  });
}
```

- [ ] **Step 6: Rodar TODOS os testes de importação de título e confirmar que nada quebrou**

Run: `npx vitest run src/server/services/importacaoTitulo.test.ts src/server/services/resolucaoCadastros.test.ts`
Expected: PASS (7 + 9 testes) — o comportamento da importação de CSV é idêntico ao de antes da extração.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/resolucaoCadastros.ts src/server/services/resolucaoCadastros.test.ts src/server/services/importacaoTitulo.ts
git commit -m "refactor: extrair resolucao de cadastros por identificador natural para modulo compartilhado"
```

---

## Task 4: Autenticação por requisição (`sessaoApi.ts`)

**Files:**
- Create: `src/server/api/sessaoApi.ts`
- Test: `src/server/api/sessaoApi.test.ts`

**Interfaces:**
- Consumes: `hashChaveApi`/`gerarChave`/`revogarChave` (`@/server/services/apiKey`), `requireVinculoAtivo`/`AcessoNegadoError` (`@/server/services/usuarioEmpresa`), `requireVinculoFilialAtivo`/`AcessoFilialNegadoError` (`@/server/services/usuarioEmpresaFilial`), `SessaoAtiva` (`@/server/auth/sessao`).
- Produces:
  - `class ApiAuthError extends Error { status: number }`
  - `requireSessaoApi(request: Request): Promise<SessaoAtiva>`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/server/api/sessaoApi.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave, revogarChave } from "@/server/services/apiKey";
import { requireSessaoApi, ApiAuthError } from "./sessaoApi";

function requisicao(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/v1/teste", { headers });
}

describe("requireSessaoApi", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("SESAPI");
    const gerada = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave de teste");
    chaveCompleta = gerada.chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("chave válida resolve a sessão do usuário dono da chave", async () => {
    const sessao = await requireSessaoApi(
      requisicao({
        authorization: `Bearer ${chaveCompleta}`,
        "x-empresa-id": fixture.empresaId,
        "x-filial-id": fixture.filialId,
      }),
    );

    expect(sessao.usuarioId).toBe(fixture.usuarioId);
    expect(sessao.empresaId).toBe(fixture.empresaId);
    expect(sessao.filialId).toBe(fixture.filialId);
    expect(sessao.perfil).toBe("FINANCEIRO");
    expect(sessao.podeAlterarFilial).toBe(true);
  });

  test("atualiza ultimoUsoEm a cada chamada bem-sucedida", async () => {
    const antes = await prisma.apiKey.findFirstOrThrow({ where: { usuarioId: fixture.usuarioId } });
    expect(antes.ultimoUsoEm).not.toBeNull();
    const primeiroUso = antes.ultimoUsoEm!.getTime();

    await new Promise((resolve) => setTimeout(resolve, 10));
    await requireSessaoApi(
      requisicao({
        authorization: `Bearer ${chaveCompleta}`,
        "x-empresa-id": fixture.empresaId,
        "x-filial-id": fixture.filialId,
      }),
    );

    const depois = await prisma.apiKey.findFirstOrThrow({ where: { usuarioId: fixture.usuarioId } });
    expect(depois.ultimoUsoEm!.getTime()).toBeGreaterThan(primeiroUso);
  });

  test("sem header Authorization -> 401", async () => {
    await expect(
      requireSessaoApi(requisicao({ "x-empresa-id": fixture.empresaId, "x-filial-id": fixture.filialId })),
    ).rejects.toMatchObject({ status: 401 });
  });

  test("chave inválida -> 401", async () => {
    await expect(
      requireSessaoApi(
        requisicao({
          authorization: "Bearer sk_chave_que_nao_existe",
          "x-empresa-id": fixture.empresaId,
          "x-filial-id": fixture.filialId,
        }),
      ),
    ).rejects.toBeInstanceOf(ApiAuthError);
  });

  test("chave revogada -> 401", async () => {
    const gerada = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave a revogar");
    await revogarChave(fixture.sessaoAdmin, gerada.id);

    await expect(
      requireSessaoApi(
        requisicao({
          authorization: `Bearer ${gerada.chaveCompleta}`,
          "x-empresa-id": fixture.empresaId,
          "x-filial-id": fixture.filialId,
        }),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  test("sem X-Empresa-Id ou X-Filial-Id -> 400", async () => {
    await expect(
      requireSessaoApi(requisicao({ authorization: `Bearer ${chaveCompleta}` })),
    ).rejects.toMatchObject({ status: 400 });
  });

  test("empresa sem vínculo -> 403", async () => {
    await expect(
      requireSessaoApi(
        requisicao({
          authorization: `Bearer ${chaveCompleta}`,
          "x-empresa-id": "00000000-0000-0000-0000-000000000000",
          "x-filial-id": fixture.filialId,
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  test("filial sem vínculo -> 403", async () => {
    await expect(
      requireSessaoApi(
        requisicao({
          authorization: `Bearer ${chaveCompleta}`,
          "x-empresa-id": fixture.empresaId,
          "x-filial-id": "00000000-0000-0000-0000-000000000000",
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/server/api/sessaoApi.test.ts`
Expected: FAIL — `Cannot find module './sessaoApi'`.

- [ ] **Step 3: Implementar `sessaoApi.ts`**

Criar `src/server/api/sessaoApi.ts`:

```ts
import { prisma } from "@/server/db/client";
import { hashChaveApi } from "@/server/services/apiKey";
import { requireVinculoAtivo, AcessoNegadoError } from "@/server/services/usuarioEmpresa";
import { requireVinculoFilialAtivo, AcessoFilialNegadoError } from "@/server/services/usuarioEmpresaFilial";
import type { SessaoAtiva } from "@/server/auth/sessao";

export class ApiAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiAuthError";
    this.status = status;
  }
}

export async function requireSessaoApi(request: Request): Promise<SessaoAtiva> {
  const cabecalhoAuth = request.headers.get("authorization") ?? "";
  const [esquema, chave] = cabecalhoAuth.split(" ");
  if (esquema !== "Bearer" || !chave) {
    throw new ApiAuthError(401, "Chave de API ausente ou mal formada");
  }

  const apiKey = await prisma.apiKey.findUnique({
    where: { chaveHash: hashChaveApi(chave) },
    include: { usuario: true },
  });
  if (!apiKey) {
    throw new ApiAuthError(401, "Chave de API inválida");
  }
  if (apiKey.revogadaEm) {
    throw new ApiAuthError(401, "Chave de API revogada");
  }

  await prisma.apiKey.update({ where: { id: apiKey.id }, data: { ultimoUsoEm: new Date() } });

  const empresaId = request.headers.get("x-empresa-id");
  const filialId = request.headers.get("x-filial-id");
  if (!empresaId || !filialId) {
    throw new ApiAuthError(400, "Informe os headers X-Empresa-Id e X-Filial-Id");
  }

  let perfil;
  try {
    perfil = await requireVinculoAtivo(apiKey.usuarioId, empresaId);
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      throw new ApiAuthError(403, "Usuário sem vínculo com a empresa informada");
    }
    throw erro;
  }

  try {
    const { podeAlterar } = await requireVinculoFilialAtivo(apiKey.usuarioId, empresaId, filialId);
    return {
      usuarioId: apiKey.usuarioId,
      nome: apiKey.usuario.nome,
      empresaId,
      perfil,
      filialId,
      podeAlterarFilial: podeAlterar,
    };
  } catch (erro) {
    if (erro instanceof AcessoFilialNegadoError) {
      throw new ApiAuthError(403, "Usuário sem vínculo com a filial informada");
    }
    throw erro;
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/server/api/sessaoApi.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add src/server/api/sessaoApi.ts src/server/api/sessaoApi.test.ts
git commit -m "feat: autenticacao da API por chave (requireSessaoApi)"
```

---

## Task 5: Wrapper de erro central (`executarRotaApi.ts`)

**Files:**
- Create: `src/server/api/executarRotaApi.ts`
- Test: `src/server/api/executarRotaApi.test.ts`

**Interfaces:**
- Consumes: `ApiAuthError`/`requireSessaoApi` (`./sessaoApi`), `PermissionError`/`FilialSomenteLeituraError` (`@/server/auth/permissions`), `SessaoAtiva`.
- Produces:
  - `class ErroValidacaoApi extends Error { campos: string[] }`
  - `executarRotaApi(request: Request, handler: (sessao: SessaoAtiva) => Promise<Response>): Promise<Response>`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/server/api/executarRotaApi.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { PermissionError, FilialSomenteLeituraError } from "@/server/auth/permissions";
import { executarRotaApi, ErroValidacaoApi } from "./executarRotaApi";

function requisicaoAutenticada(fixture: FixtureFinanceiro, chaveCompleta: string): Request {
  return new Request("http://localhost/api/v1/teste", {
    headers: {
      authorization: `Bearer ${chaveCompleta}`,
      "x-empresa-id": fixture.empresaId,
      "x-filial-id": fixture.filialId,
    },
  });
}

describe("executarRotaApi", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("EXECROTA");
    const gerada = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave de teste");
    chaveCompleta = gerada.chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("chave válida chama o handler e devolve a resposta dele", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async (sessao) => {
      expect(sessao.usuarioId).toBe(fixture.usuarioId);
      return Response.json({ ok: true }, { status: 201 });
    });

    expect(resposta.status).toBe(201);
    expect(await resposta.json()).toEqual({ ok: true });
  });

  test("chave inválida devolve 401 antes de chamar o handler", async () => {
    const request = new Request("http://localhost/api/v1/teste", {
      headers: { authorization: "Bearer sk_invalida", "x-empresa-id": fixture.empresaId, "x-filial-id": fixture.filialId },
    });
    let handlerChamado = false;

    const resposta = await executarRotaApi(request, async () => {
      handlerChamado = true;
      return Response.json({});
    });

    expect(resposta.status).toBe(401);
    expect(handlerChamado).toBe(false);
  });

  test("PermissionError lançado pelo handler vira 403", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async () => {
      throw new PermissionError("FINANCEIRO", "titulo:aprovar");
    });

    expect(resposta.status).toBe(403);
    expect((await resposta.json()).erro).toContain("titulo:aprovar");
  });

  test("FilialSomenteLeituraError lançado pelo handler vira 403", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async () => {
      throw new FilialSomenteLeituraError();
    });

    expect(resposta.status).toBe(403);
  });

  test("ErroValidacaoApi vira 422 com os campos", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async () => {
      throw new ErroValidacaoApi('Categoria financeira "Insumos" não encontrada', ["categoriaFinanceira"]);
    });

    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.erro).toBe('Categoria financeira "Insumos" não encontrada');
    expect(corpo.campos).toEqual(["categoriaFinanceira"]);
  });

  test("recurso não encontrado via Prisma (findFirstOrThrow) vira 404", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async () => {
      await prisma.parcela.findFirstOrThrow({ where: { id: "00000000-0000-0000-0000-000000000000" } });
      return Response.json({});
    });

    expect(resposta.status).toBe(404);
  });

  test("erro inesperado vira 500 sem vazar detalhes internos", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async () => {
      throw new Error("detalhe interno sensível");
    });

    expect(resposta.status).toBe(500);
    const corpo = await resposta.json();
    expect(corpo.erro).toBe("Erro interno");
    expect(corpo.erro).not.toContain("sensível");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/server/api/executarRotaApi.test.ts`
Expected: FAIL — `Cannot find module './executarRotaApi'`.

- [ ] **Step 3: Implementar `executarRotaApi.ts`**

Criar `src/server/api/executarRotaApi.ts`:

```ts
import { Prisma } from "@prisma/client";
import { PermissionError, FilialSomenteLeituraError } from "@/server/auth/permissions";
import { ApiAuthError, requireSessaoApi } from "./sessaoApi";
import type { SessaoAtiva } from "@/server/auth/sessao";

export class ErroValidacaoApi extends Error {
  campos: string[];

  constructor(message: string, campos: string[] = []) {
    super(message);
    this.name = "ErroValidacaoApi";
    this.campos = campos;
  }
}

export async function executarRotaApi(
  request: Request,
  handler: (sessao: SessaoAtiva) => Promise<Response>,
): Promise<Response> {
  try {
    const sessao = await requireSessaoApi(request);
    return await handler(sessao);
  } catch (erro) {
    if (erro instanceof ApiAuthError) {
      return Response.json({ erro: erro.message }, { status: erro.status });
    }
    if (erro instanceof PermissionError || erro instanceof FilialSomenteLeituraError) {
      return Response.json({ erro: erro.message }, { status: 403 });
    }
    if (erro instanceof ErroValidacaoApi) {
      return Response.json({ erro: erro.message, campos: erro.campos }, { status: 422 });
    }
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2025") {
      return Response.json({ erro: "Recurso não encontrado" }, { status: 404 });
    }
    console.error(erro);
    return Response.json({ erro: "Erro interno" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/server/api/executarRotaApi.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/server/api/executarRotaApi.ts src/server/api/executarRotaApi.test.ts
git commit -m "feat: wrapper central de tratamento de erro para rotas da API"
```

---

## Task 6: `POST` e `GET /api/v1/titulos`

**Files:**
- Create: `src/app/api/v1/titulos/route.ts`
- Test: `src/app/api/v1/titulos/route.test.ts`

**Interfaces:**
- Consumes: `executarRotaApi`/`ErroValidacaoApi` (`@/server/api/executarRotaApi`), `carregarCadastrosParaResolucao`/`resolverContraparte`/`resolverCategoriaFinanceira`/`resolverCodigoOpcional`/`resolverContaBancariaOpcional` (`@/server/services/resolucaoCadastros`), `tituloSchema` (`@/lib/schemas/titulo`), `criarTitulo`/`listarTitulos` (`@/server/services/titulo`), `requirePermission` (`@/server/auth/permissions`).
- Produces: `POST(request: Request): Promise<Response>`, `GET(request: Request): Promise<Response>` exportados de `route.ts`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/api/v1/titulos/route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { POST, GET } from "./route";

describe("POST/GET /api/v1/titulos", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;
  let chaveConsulta: string;
  let usuarioConsultaId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APITIT", "FINANCEIRO");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave financeiro")).chaveCompleta;

    const usuarioConsulta = await prisma.usuario.create({
      data: { nome: "Consulta APITIT", email: "consulta-apitit@teste.local", senhaHash: "x" },
    });
    usuarioConsultaId = usuarioConsulta.id;
    const vinculoConsulta = await prisma.usuarioEmpresa.create({
      data: { usuarioId: usuarioConsulta.id, empresaId: fixture.empresaId, perfil: "CONSULTA", ativo: true },
    });
    await prisma.usuarioEmpresaFilial.create({
      data: { usuarioEmpresaId: vinculoConsulta.id, filialId: fixture.filialId, podeAlterar: false, ativo: true },
    });
    chaveConsulta = (await gerarChave(fixture.sessaoAdmin, usuarioConsulta.id, "Chave consulta")).chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: { in: [fixture.usuarioId, usuarioConsultaId] } } });
    await prisma.usuarioEmpresaFilial.deleteMany({ where: { usuarioEmpresa: { usuarioId: usuarioConsultaId } } });
    await prisma.usuarioEmpresa.deleteMany({ where: { usuarioId: usuarioConsultaId } });
    await prisma.usuario.delete({ where: { id: usuarioConsultaId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  function headers(chave: string) {
    return {
      authorization: `Bearer ${chave}`,
      "x-empresa-id": fixture.empresaId,
      "x-filial-id": fixture.filialId,
      "content-type": "application/json",
    };
  }

  test("cria um título a pagar resolvendo CNPJ e categoria por nome", async () => {
    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: fixture.fornecedorId } });
    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });

    const request = new Request("http://localhost/api/v1/titulos", {
      method: "POST",
      headers: headers(chaveCompleta),
      body: JSON.stringify({
        tipo: "PAGAR",
        cnpjCpf: fornecedor.cnpjCpf,
        documento: "NF-API-1",
        dataEmissao: "2026-09-01",
        dataCompetencia: "2026-09-01",
        categoriaFinanceira: categoria.nome,
        parcelas: [{ dataVencimento: "2026-10-01", valorOriginal: 500 }],
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(201);
    const corpo = await resposta.json();
    expect(corpo.documento).toBe("NF-API-1");
    expect(corpo.parcelas).toHaveLength(1);
    expect(corpo.parcelas[0].id).toBeTruthy();
  });

  test("cria título com múltiplas parcelas numeradas sequencialmente", async () => {
    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: fixture.fornecedorId } });
    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });

    const request = new Request("http://localhost/api/v1/titulos", {
      method: "POST",
      headers: headers(chaveCompleta),
      body: JSON.stringify({
        tipo: "PAGAR",
        cnpjCpf: fornecedor.cnpjCpf,
        documento: "NF-API-2",
        dataEmissao: "2026-09-01",
        dataCompetencia: "2026-09-01",
        categoriaFinanceira: categoria.nome,
        parcelas: [
          { dataVencimento: "2026-10-01", valorOriginal: 100 },
          { dataVencimento: "2026-11-01", valorOriginal: 100 },
        ],
      }),
    });

    const corpo = await (await POST(request)).json();
    expect(corpo.parcelas.map((p: { numero: number }) => p.numero)).toEqual([1, 2]);
  });

  test("CNPJ não encontrado -> 422 com o campo indicado", async () => {
    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });

    const request = new Request("http://localhost/api/v1/titulos", {
      method: "POST",
      headers: headers(chaveCompleta),
      body: JSON.stringify({
        tipo: "PAGAR",
        cnpjCpf: "00.000.000/0000-00",
        documento: "NF-API-3",
        dataEmissao: "2026-09-01",
        dataCompetencia: "2026-09-01",
        categoriaFinanceira: categoria.nome,
        parcelas: [{ dataVencimento: "2026-10-01", valorOriginal: 100 }],
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.erro).toContain("não encontrado");
    expect(corpo.campos).toContain("contraparteId");
  });

  test("perfil CONSULTA não consegue criar título -> 403", async () => {
    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: fixture.fornecedorId } });
    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });

    const request = new Request("http://localhost/api/v1/titulos", {
      method: "POST",
      headers: headers(chaveConsulta),
      body: JSON.stringify({
        tipo: "PAGAR",
        cnpjCpf: fornecedor.cnpjCpf,
        documento: "NF-API-4",
        dataEmissao: "2026-09-01",
        dataCompetencia: "2026-09-01",
        categoriaFinanceira: categoria.nome,
        parcelas: [{ dataVencimento: "2026-10-01", valorOriginal: 100 }],
      }),
    });

    expect((await POST(request)).status).toBe(403);
  });

  test("GET lista os títulos PAGAR da filial, incluindo id da parcela", async () => {
    const request = new Request("http://localhost/api/v1/titulos?tipo=PAGAR", { headers: headers(chaveCompleta) });

    const resposta = await GET(request);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(Array.isArray(corpo)).toBe(true);
    expect(corpo.some((t: { documento: string }) => t.documento === "NF-API-1")).toBe(true);
  });

  test("GET sem ?tipo= -> 422", async () => {
    const request = new Request("http://localhost/api/v1/titulos", { headers: headers(chaveCompleta) });
    expect((await GET(request)).status).toBe(422);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/app/api/v1/titulos/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implementar `route.ts`**

Criar `src/app/api/v1/titulos/route.ts`:

```ts
import { executarRotaApi, ErroValidacaoApi } from "@/server/api/executarRotaApi";
import {
  carregarCadastrosParaResolucao,
  resolverContraparte,
  resolverCategoriaFinanceira,
  resolverCodigoOpcional,
  resolverContaBancariaOpcional,
} from "@/server/services/resolucaoCadastros";
import { tituloSchema } from "@/lib/schemas/titulo";
import { criarTitulo, listarTitulos } from "@/server/services/titulo";
import { requirePermission } from "@/server/auth/permissions";
import type { TipoTitulo } from "@prisma/client";

type CorpoTitulo = {
  tipo: TipoTitulo;
  cnpjCpf: string;
  documento: string;
  dataEmissao: string;
  dataCompetencia: string;
  categoriaFinanceira: string;
  centroCusto?: string;
  centroLucro?: string;
  safra?: string;
  projeto?: string;
  contaBancariaAgencia?: string;
  contaBancariaConta?: string;
  formaPagamento?: string;
  parcelas: { dataVencimento: string; valorOriginal: number }[];
};

export async function POST(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    const corpo = (await request.json()) as CorpoTitulo;

    const cadastros = await carregarCadastrosParaResolucao(sessao, corpo.tipo);
    const erros: string[] = [];
    const camposComErroResolucao = new Set<string>();

    const contraparteId = resolverContraparte(cadastros, corpo.cnpjCpf ?? "", erros, camposComErroResolucao);
    const categoriaFinanceiraId = resolverCategoriaFinanceira(
      cadastros,
      corpo.categoriaFinanceira ?? "",
      erros,
      camposComErroResolucao,
    );
    const centroCustoId = resolverCodigoOpcional(cadastros.mapaCentroCusto, corpo.centroCusto, "Centro de custo", erros);
    const centroLucroId = resolverCodigoOpcional(cadastros.mapaCentroLucro, corpo.centroLucro, "Centro de lucro", erros);
    const safraId = resolverCodigoOpcional(cadastros.mapaSafra, corpo.safra, "Safra", erros);
    const projetoId = resolverCodigoOpcional(cadastros.mapaProjeto, corpo.projeto, "Projeto", erros);
    const contaBancariaId = resolverContaBancariaOpcional(
      cadastros,
      corpo.contaBancariaAgencia,
      corpo.contaBancariaConta,
      erros,
    );

    if (erros.length > 0) {
      throw new ErroValidacaoApi(erros.join("; "), Array.from(camposComErroResolucao));
    }

    const dados = tituloSchema.parse({
      contraparteId,
      documento: corpo.documento,
      dataEmissao: corpo.dataEmissao,
      dataCompetencia: corpo.dataCompetencia,
      categoriaFinanceiraId,
      centroCustoId,
      centroLucroId,
      safraId,
      projetoId,
      contaBancariaId,
      formaPagamento: corpo.formaPagamento,
      parcelas: (corpo.parcelas ?? []).map((parcela, indice) => ({
        numero: indice + 1,
        dataVencimento: parcela.dataVencimento,
        valorOriginal: parcela.valorOriginal,
      })),
    });

    const titulo = await criarTitulo(sessao, corpo.tipo, dados);
    return Response.json(titulo, { status: 201 });
  });
}

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "titulo:ler");

    const url = new URL(request.url);
    const tipo = url.searchParams.get("tipo");
    if (tipo !== "PAGAR" && tipo !== "RECEBER") {
      throw new ErroValidacaoApi('Informe ?tipo=PAGAR ou ?tipo=RECEBER', ["tipo"]);
    }

    const titulos = await listarTitulos(sessao.filialId, tipo);
    return Response.json(titulos, { status: 200 });
  });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/app/api/v1/titulos/route.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Rodar `npx tsc --noEmit` (o corpo do título vira JSON com `Decimal` — confirmar que `Response.json` serializa sem erro)**

Run: `npx tsc --noEmit`
Expected: sem erros. (`Response.json` aceita qualquer valor serializável; `Decimal` do Prisma tem `toJSON()` retornando string, então serializa sem lançar — mesmo comportamento já observado ao passar esses objetos para componentes client em `titulo-table.tsx`.)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v1/titulos
git commit -m "feat: rotas POST/GET /api/v1/titulos"
```

---

## Task 7: `POST` e `GET /api/v1/lancamentos-bancarios`

**Files:**
- Create: `src/app/api/v1/lancamentos-bancarios/route.ts`
- Test: `src/app/api/v1/lancamentos-bancarios/route.test.ts`

**Interfaces:**
- Consumes: `executarRotaApi`/`ErroValidacaoApi`, `carregarCadastrosParaResolucao`/`resolverCodigoOpcional`/`resolverContaBancariaOpcional` (`@/server/services/resolucaoCadastros` — chamado com `tipo: "PAGAR"` fixo só para reaproveitar `carregarCadastrosParaResolucao`, já que lançamento não tem contraparte; o campo `mapaContraparte`/`rotuloContraparte` resultante simplesmente não é usado aqui), `lancamentoManualSchema` (`@/lib/schemas/lancamentoBancario`), `criarLancamentoManual`/`listarLancamentos` (`@/server/services/lancamentoBancario`), `requirePermission`.
- Produces: `POST`, `GET` de `route.ts`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/api/v1/lancamentos-bancarios/route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { POST, GET } from "./route";

describe("POST/GET /api/v1/lancamentos-bancarios", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APILAN", "TESOURARIA");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave tesouraria")).chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  function headers() {
    return {
      authorization: `Bearer ${chaveCompleta}`,
      "x-empresa-id": fixture.empresaId,
      "x-filial-id": fixture.filialId,
      "content-type": "application/json",
    };
  }

  test("cria lançamento manual resolvendo conta bancária por agência+conta", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });

    const request = new Request("http://localhost/api/v1/lancamentos-bancarios", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        contaBancariaAgencia: conta.agencia,
        contaBancariaConta: conta.conta,
        data: "2026-09-10",
        tipo: "ENTRADA",
        valor: 1000,
        descricao: "Lançamento via API",
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(201);
    const corpo = await resposta.json();
    expect(corpo.descricao).toBe("Lançamento via API");
    expect(corpo.contaBancariaId).toBe(fixture.contaBancariaId);
  });

  test("conta bancária não encontrada -> 422", async () => {
    const request = new Request("http://localhost/api/v1/lancamentos-bancarios", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        contaBancariaAgencia: "9999",
        contaBancariaConta: "9999-9",
        data: "2026-09-10",
        tipo: "ENTRADA",
        valor: 1000,
        descricao: "Não deve criar",
      }),
    });

    expect((await POST(request)).status).toBe(422);
  });

  test("GET lista os lançamentos da filial", async () => {
    const request = new Request("http://localhost/api/v1/lancamentos-bancarios", { headers: headers() });
    const resposta = await GET(request);

    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.some((l: { descricao: string }) => l.descricao === "Lançamento via API")).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/app/api/v1/lancamentos-bancarios/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implementar `route.ts`**

Criar `src/app/api/v1/lancamentos-bancarios/route.ts`:

```ts
import { executarRotaApi, ErroValidacaoApi } from "@/server/api/executarRotaApi";
import {
  carregarCadastrosParaResolucao,
  resolverCodigoOpcional,
  resolverContaBancariaOpcional,
} from "@/server/services/resolucaoCadastros";
import { lancamentoManualSchema } from "@/lib/schemas/lancamentoBancario";
import { criarLancamentoManual, listarLancamentos } from "@/server/services/lancamentoBancario";
import { requirePermission } from "@/server/auth/permissions";

type CorpoLancamento = {
  contaBancariaAgencia: string;
  contaBancariaConta: string;
  data: string;
  tipo: "ENTRADA" | "SAIDA";
  valor: number;
  descricao: string;
  categoriaFinanceira?: string;
  centroCusto?: string;
  centroLucro?: string;
  safra?: string;
  projeto?: string;
};

export async function POST(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    const corpo = (await request.json()) as CorpoLancamento;

    // "PAGAR" é arbitrário aqui — lançamento não tem contraparte, então mapaContraparte/rotuloContraparte
    // resultantes não são usados; só as demais dimensões (categoria, centros, safra, projeto, conta) importam.
    const cadastros = await carregarCadastrosParaResolucao(sessao, "PAGAR");
    const erros: string[] = [];

    const contaBancariaId = resolverContaBancariaOpcional(
      cadastros,
      corpo.contaBancariaAgencia,
      corpo.contaBancariaConta,
      erros,
    );
    if (!contaBancariaId) {
      erros.push("Informe a conta bancária (agência e conta)");
    }
    const categoriaFinanceiraId = resolverCodigoOpcional(
      cadastros.mapaCategoria,
      corpo.categoriaFinanceira,
      "Categoria financeira",
      erros,
    );
    const centroCustoId = resolverCodigoOpcional(cadastros.mapaCentroCusto, corpo.centroCusto, "Centro de custo", erros);
    const centroLucroId = resolverCodigoOpcional(cadastros.mapaCentroLucro, corpo.centroLucro, "Centro de lucro", erros);
    const safraId = resolverCodigoOpcional(cadastros.mapaSafra, corpo.safra, "Safra", erros);
    const projetoId = resolverCodigoOpcional(cadastros.mapaProjeto, corpo.projeto, "Projeto", erros);

    if (erros.length > 0) {
      throw new ErroValidacaoApi(erros.join("; "));
    }

    const dados = lancamentoManualSchema.parse({
      contaBancariaId,
      data: corpo.data,
      tipo: corpo.tipo,
      valor: corpo.valor,
      descricao: corpo.descricao,
      categoriaFinanceiraId,
      centroCustoId,
      centroLucroId,
      safraId,
      projetoId,
    });

    const lancamento = await criarLancamentoManual(sessao, dados);
    return Response.json(lancamento, { status: 201 });
  });
}

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "lancamento:ler");
    const lancamentos = await listarLancamentos(sessao.filialId);
    return Response.json(lancamentos, { status: 200 });
  });
}
```

**Nota:** `resolverCodigoOpcional` usada para `categoriaFinanceira` aqui reaproveita `cadastros.mapaCategoria` — atenção ao nome do parâmetro `rotulo` ("Categoria financeira") na mensagem de erro, para diferenciar de "Categoria financeira" já usada em títulos (mesma redação, comportamento idêntico ao de título).

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/app/api/v1/lancamentos-bancarios/route.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/lancamentos-bancarios
git commit -m "feat: rotas POST/GET /api/v1/lancamentos-bancarios"
```

---

## Task 8: `POST /api/v1/baixas`

**Files:**
- Create: `src/app/api/v1/baixas/route.ts`
- Test: `src/app/api/v1/baixas/route.test.ts`

**Interfaces:**
- Consumes: `executarRotaApi`/`ErroValidacaoApi`, `carregarCadastrosParaResolucao`/`resolverContaBancariaOpcional`, `baixaSchema` (`@/lib/schemas/baixa`), `registrarBaixa` (`@/server/services/baixa`).
- Produces: `POST` de `route.ts`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/api/v1/baixas/route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { criarTitulo } from "@/server/services/titulo";
import { POST } from "./route";

describe("POST /api/v1/baixas", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;
  let parcelaId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APIBAIXA", "TESOURARIA");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave tesouraria")).chaveCompleta;

    const titulo = await criarTitulo(fixture.sessaoAdmin, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-BAIXA-API",
      dataEmissao: new Date("2026-09-01"),
      dataCompetencia: new Date("2026-09-01"),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date("2026-10-01"), valorOriginal: 300 }],
    });
    parcelaId = titulo.parcelas[0].id;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  function headers() {
    return {
      authorization: `Bearer ${chaveCompleta}`,
      "x-empresa-id": fixture.empresaId,
      "x-filial-id": fixture.filialId,
      "content-type": "application/json",
    };
  }

  test("registra a baixa resolvendo conta bancária por agência+conta", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });

    const request = new Request("http://localhost/api/v1/baixas", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        parcelaId,
        data: "2026-09-30",
        valorPago: 300,
        contaBancariaAgencia: conta.agencia,
        contaBancariaConta: conta.conta,
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(201);
    const corpo = await resposta.json();
    expect(corpo.parcelaId).toBe(parcelaId);
    expect(corpo.statusAprovacao).toBe("PENDENTE");
  });

  test("parcelaId inexistente -> 404", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });

    const request = new Request("http://localhost/api/v1/baixas", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        parcelaId: "00000000-0000-0000-0000-000000000000",
        data: "2026-09-30",
        valorPago: 300,
        contaBancariaAgencia: conta.agencia,
        contaBancariaConta: conta.conta,
      }),
    });

    expect((await POST(request)).status).toBe(404);
  });

  test("conta bancária não encontrada -> 422", async () => {
    const request = new Request("http://localhost/api/v1/baixas", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        parcelaId,
        data: "2026-09-30",
        valorPago: 300,
        contaBancariaAgencia: "0000",
        contaBancariaConta: "0000-0",
      }),
    });

    expect((await POST(request)).status).toBe(422);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/app/api/v1/baixas/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implementar `route.ts`**

Criar `src/app/api/v1/baixas/route.ts`:

```ts
import { executarRotaApi, ErroValidacaoApi } from "@/server/api/executarRotaApi";
import { carregarCadastrosParaResolucao, resolverContaBancariaOpcional } from "@/server/services/resolucaoCadastros";
import { baixaSchema } from "@/lib/schemas/baixa";
import { registrarBaixa } from "@/server/services/baixa";

type CorpoBaixa = {
  parcelaId: string;
  data: string;
  valorPago: number;
  valorJuros?: number;
  valorMulta?: number;
  valorDesconto?: number;
  contaBancariaAgencia: string;
  contaBancariaConta: string;
};

export async function POST(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    const corpo = (await request.json()) as CorpoBaixa;

    // "PAGAR" arbitrário — baixa não tem contraparte, só a conta bancária é resolvida aqui.
    const cadastros = await carregarCadastrosParaResolucao(sessao, "PAGAR");
    const erros: string[] = [];
    const contaBancariaId = resolverContaBancariaOpcional(
      cadastros,
      corpo.contaBancariaAgencia,
      corpo.contaBancariaConta,
      erros,
    );
    if (!contaBancariaId) {
      erros.push("Informe a conta bancária (agência e conta)");
    }
    if (erros.length > 0) {
      throw new ErroValidacaoApi(erros.join("; "));
    }

    const dados = baixaSchema.parse({
      data: corpo.data,
      valorPago: corpo.valorPago,
      valorJuros: corpo.valorJuros ?? 0,
      valorMulta: corpo.valorMulta ?? 0,
      valorDesconto: corpo.valorDesconto ?? 0,
      contaBancariaId,
    });

    const baixa = await registrarBaixa(sessao, corpo.parcelaId, dados);
    return Response.json(baixa, { status: 201 });
  });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/app/api/v1/baixas/route.test.ts`
Expected: PASS (3 testes). O caso de `parcelaId` inexistente passa pelo `findFirstOrThrow` dentro de `registrarBaixa` → `Prisma.PrismaClientKnownRequestError` código `P2025` → `executarRotaApi` mapeia para `404`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/baixas
git commit -m "feat: rota POST /api/v1/baixas"
```

---

## Task 9: `POST /api/v1/extratos/importar`

**Files:**
- Create: `src/app/api/v1/extratos/importar/route.ts`
- Test: `src/app/api/v1/extratos/importar/route.test.ts`

**Interfaces:**
- Consumes: `executarRotaApi`/`ErroValidacaoApi`, `carregarCadastrosParaResolucao`/`resolverContaBancariaOpcional`, `importarExtratoOfx`/`conciliarAutomaticamente` (`@/server/services/conciliacao`).
- Produces: `POST` de `route.ts`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/api/v1/extratos/importar/route.test.ts`. Usa exatamente o mesmo formato de OFX de exemplo já validado em `src/server/services/conciliacao.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { POST } from "./route";

const OFX_EXEMPLO = `
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260901120000
<TRNAMT>500.00
<FITID>APIEXTRATO1
<NAME>DEPOSITO TESTE
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
`;

describe("POST /api/v1/extratos/importar", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APIEXT", "TESOURARIA");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave tesouraria")).chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  function headers() {
    return {
      authorization: `Bearer ${chaveCompleta}`,
      "x-empresa-id": fixture.empresaId,
      "x-filial-id": fixture.filialId,
    };
  }

  test("importa o extrato resolvendo a conta bancária por agência+conta", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });

    const formData = new FormData();
    formData.set("contaBancariaAgencia", conta.agencia);
    formData.set("contaBancariaConta", conta.conta);
    formData.set("arquivo", new File([OFX_EXEMPLO], "extrato.ofx", { type: "application/x-ofx" }));

    const request = new Request("http://localhost/api/v1/extratos/importar", { method: "POST", headers: headers(), body: formData });

    const resposta = await POST(request);
    expect(resposta.status).toBe(201);
    const corpo = await resposta.json();
    expect(corpo.totalLinhas).toBe(1);
    expect(corpo.linhasNovas).toBe(1);
  });

  test("conta bancária não encontrada -> 422", async () => {
    const formData = new FormData();
    formData.set("contaBancariaAgencia", "0000");
    formData.set("contaBancariaConta", "0000-0");
    formData.set("arquivo", new File([OFX_EXEMPLO], "extrato.ofx", { type: "application/x-ofx" }));

    const request = new Request("http://localhost/api/v1/extratos/importar", { method: "POST", headers: headers(), body: formData });

    expect((await POST(request)).status).toBe(422);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/app/api/v1/extratos/importar/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implementar `route.ts`**

Criar `src/app/api/v1/extratos/importar/route.ts`:

```ts
import { executarRotaApi, ErroValidacaoApi } from "@/server/api/executarRotaApi";
import { carregarCadastrosParaResolucao, resolverContaBancariaOpcional } from "@/server/services/resolucaoCadastros";
import { importarExtratoOfx, conciliarAutomaticamente } from "@/server/services/conciliacao";

export async function POST(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    const formData = await request.formData();
    const arquivo = formData.get("arquivo");
    const agencia = formData.get("contaBancariaAgencia");
    const conta = formData.get("contaBancariaConta");

    if (!(arquivo instanceof File)) {
      throw new ErroValidacaoApi("Envie o arquivo OFX no campo 'arquivo'", ["arquivo"]);
    }

    // "PAGAR" arbitrário — só a conta bancária é resolvida aqui.
    const cadastros = await carregarCadastrosParaResolucao(sessao, "PAGAR");
    const erros: string[] = [];
    const contaBancariaId = resolverContaBancariaOpcional(
      cadastros,
      typeof agencia === "string" ? agencia : undefined,
      typeof conta === "string" ? conta : undefined,
      erros,
    );
    if (!contaBancariaId) {
      erros.push("Informe a conta bancária (agência e conta)");
    }
    if (erros.length > 0) {
      throw new ErroValidacaoApi(erros.join("; "));
    }

    const extrato = await importarExtratoOfx(sessao, contaBancariaId, arquivo);
    const resumoConciliacao = await conciliarAutomaticamente(sessao, extrato.id);

    return Response.json({ ...extrato, ...resumoConciliacao }, { status: 201 });
  });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/app/api/v1/extratos/importar/route.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/extratos
git commit -m "feat: rota POST /api/v1/extratos/importar"
```

---

## Task 10: GETs de cadastro de apoio (8 rotas)

**Files:**
- Create: `src/app/api/v1/fornecedores/route.ts`
- Create: `src/app/api/v1/clientes/route.ts`
- Create: `src/app/api/v1/categorias-financeiras/route.ts`
- Create: `src/app/api/v1/centros-de-custo/route.ts`
- Create: `src/app/api/v1/centros-de-lucro/route.ts`
- Create: `src/app/api/v1/safras/route.ts`
- Create: `src/app/api/v1/projetos/route.ts`
- Create: `src/app/api/v1/contas-bancarias/route.ts`
- Test: `src/app/api/v1/fornecedores/route.test.ts` (padrão a repetir nos outros 7, ver tabela no Step 3)

**Interfaces:**
- Consumes: `executarRotaApi` (`@/server/api/executarRotaApi`), `requirePermission` (`@/server/auth/permissions`), e o `listar*` de cada service (tabela abaixo).
- Produces: `GET` de cada `route.ts`.

Todas as 8 rotas seguem exatamente a mesma forma — só muda qual `listar*` é chamado e com qual argumento (`empresaId` ou `filialId`):

| Rota | Import | Chamada |
|---|---|---|
| `fornecedores/route.ts` | `listarFornecedores` de `@/server/services/fornecedor` | `listarFornecedores(sessao.empresaId)` |
| `clientes/route.ts` | `listarClientes` de `@/server/services/cliente` | `listarClientes(sessao.empresaId)` |
| `categorias-financeiras/route.ts` | `listarCategoriasFinanceiras` de `@/server/services/categoriaFinanceira` | `listarCategoriasFinanceiras(sessao.filialId)` |
| `centros-de-custo/route.ts` | `listarCentrosCusto` de `@/server/services/centroCusto` | `listarCentrosCusto(sessao.filialId)` |
| `centros-de-lucro/route.ts` | `listarCentrosLucro` de `@/server/services/centroLucro` | `listarCentrosLucro(sessao.filialId)` |
| `safras/route.ts` | `listarSafras` de `@/server/services/safra` | `listarSafras(sessao.filialId)` |
| `projetos/route.ts` | `listarProjetos` de `@/server/services/projeto` | `listarProjetos(sessao.filialId)` |
| `contas-bancarias/route.ts` | `listarContasBancarias` de `@/server/services/contaBancaria` | `listarContasBancarias(sessao.filialId)` |

- [ ] **Step 1: Escrever o teste que falha (representativo — `fornecedores`)**

Criar `src/app/api/v1/fornecedores/route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { GET } from "./route";

describe("GET /api/v1/fornecedores", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APIFORN");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave teste")).chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("lista os fornecedores da empresa", async () => {
    const request = new Request("http://localhost/api/v1/fornecedores", {
      headers: {
        authorization: `Bearer ${chaveCompleta}`,
        "x-empresa-id": fixture.empresaId,
        "x-filial-id": fixture.filialId,
      },
    });

    const resposta = await GET(request);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.some((f: { id: string }) => f.id === fixture.fornecedorId)).toBe(true);
  });

  test("sem chave -> 401", async () => {
    const request = new Request("http://localhost/api/v1/fornecedores", {
      headers: { "x-empresa-id": fixture.empresaId, "x-filial-id": fixture.filialId },
    });
    expect((await GET(request)).status).toBe(401);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/app/api/v1/fornecedores/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implementar as 8 rotas**

Criar `src/app/api/v1/fornecedores/route.ts`:

```ts
import { executarRotaApi } from "@/server/api/executarRotaApi";
import { requirePermission } from "@/server/auth/permissions";
import { listarFornecedores } from "@/server/services/fornecedor";

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "cadastro:ler");
    const fornecedores = await listarFornecedores(sessao.empresaId);
    return Response.json(fornecedores, { status: 200 });
  });
}
```

Criar `src/app/api/v1/clientes/route.ts`:

```ts
import { executarRotaApi } from "@/server/api/executarRotaApi";
import { requirePermission } from "@/server/auth/permissions";
import { listarClientes } from "@/server/services/cliente";

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "cadastro:ler");
    const clientes = await listarClientes(sessao.empresaId);
    return Response.json(clientes, { status: 200 });
  });
}
```

Criar `src/app/api/v1/categorias-financeiras/route.ts`:

```ts
import { executarRotaApi } from "@/server/api/executarRotaApi";
import { requirePermission } from "@/server/auth/permissions";
import { listarCategoriasFinanceiras } from "@/server/services/categoriaFinanceira";

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "cadastro:ler");
    const categorias = await listarCategoriasFinanceiras(sessao.filialId);
    return Response.json(categorias, { status: 200 });
  });
}
```

Criar `src/app/api/v1/centros-de-custo/route.ts`:

```ts
import { executarRotaApi } from "@/server/api/executarRotaApi";
import { requirePermission } from "@/server/auth/permissions";
import { listarCentrosCusto } from "@/server/services/centroCusto";

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "cadastro:ler");
    const centrosCusto = await listarCentrosCusto(sessao.filialId);
    return Response.json(centrosCusto, { status: 200 });
  });
}
```

Criar `src/app/api/v1/centros-de-lucro/route.ts`:

```ts
import { executarRotaApi } from "@/server/api/executarRotaApi";
import { requirePermission } from "@/server/auth/permissions";
import { listarCentrosLucro } from "@/server/services/centroLucro";

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "cadastro:ler");
    const centrosLucro = await listarCentrosLucro(sessao.filialId);
    return Response.json(centrosLucro, { status: 200 });
  });
}
```

Criar `src/app/api/v1/safras/route.ts`:

```ts
import { executarRotaApi } from "@/server/api/executarRotaApi";
import { requirePermission } from "@/server/auth/permissions";
import { listarSafras } from "@/server/services/safra";

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "cadastro:ler");
    const safras = await listarSafras(sessao.filialId);
    return Response.json(safras, { status: 200 });
  });
}
```

Criar `src/app/api/v1/projetos/route.ts`:

```ts
import { executarRotaApi } from "@/server/api/executarRotaApi";
import { requirePermission } from "@/server/auth/permissions";
import { listarProjetos } from "@/server/services/projeto";

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "cadastro:ler");
    const projetos = await listarProjetos(sessao.filialId);
    return Response.json(projetos, { status: 200 });
  });
}
```

Criar `src/app/api/v1/contas-bancarias/route.ts`:

```ts
import { executarRotaApi } from "@/server/api/executarRotaApi";
import { requirePermission } from "@/server/auth/permissions";
import { listarContasBancarias } from "@/server/services/contaBancaria";

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "cadastro:ler");
    const contasBancarias = await listarContasBancarias(sessao.filialId);
    return Response.json(contasBancarias, { status: 200 });
  });
}
```

- [ ] **Step 4: Escrever o teste das outras 7 rotas**

Criar `src/app/api/v1/clientes/route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { GET } from "./route";

describe("GET /api/v1/clientes", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APICLI");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave teste")).chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("lista os clientes da empresa", async () => {
    const request = new Request("http://localhost/api/v1/clientes", {
      headers: {
        authorization: `Bearer ${chaveCompleta}`,
        "x-empresa-id": fixture.empresaId,
        "x-filial-id": fixture.filialId,
      },
    });

    const resposta = await GET(request);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.some((c: { id: string }) => c.id === fixture.clienteId)).toBe(true);
  });

  test("sem chave -> 401", async () => {
    const request = new Request("http://localhost/api/v1/clientes", {
      headers: { "x-empresa-id": fixture.empresaId, "x-filial-id": fixture.filialId },
    });
    expect((await GET(request)).status).toBe(401);
  });
});
```

Criar `src/app/api/v1/categorias-financeiras/route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { GET } from "./route";

describe("GET /api/v1/categorias-financeiras", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APICAT");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave teste")).chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("lista as categorias financeiras da filial", async () => {
    const request = new Request("http://localhost/api/v1/categorias-financeiras", {
      headers: {
        authorization: `Bearer ${chaveCompleta}`,
        "x-empresa-id": fixture.empresaId,
        "x-filial-id": fixture.filialId,
      },
    });

    const resposta = await GET(request);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.some((c: { id: string }) => c.id === fixture.categoriaFinanceiraId)).toBe(true);
  });

  test("sem chave -> 401", async () => {
    const request = new Request("http://localhost/api/v1/categorias-financeiras", {
      headers: { "x-empresa-id": fixture.empresaId, "x-filial-id": fixture.filialId },
    });
    expect((await GET(request)).status).toBe(401);
  });
});
```

Criar `src/app/api/v1/centros-de-custo/route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { GET } from "./route";

describe("GET /api/v1/centros-de-custo", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;
  let centroCustoId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APICC");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave teste")).chaveCompleta;
    const centro = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Centro GET", codigo: "CC-GET" },
    });
    centroCustoId = centro.id;
  });

  afterAll(async () => {
    await prisma.centroCusto.delete({ where: { id: centroCustoId } });
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("lista os centros de custo da filial", async () => {
    const request = new Request("http://localhost/api/v1/centros-de-custo", {
      headers: {
        authorization: `Bearer ${chaveCompleta}`,
        "x-empresa-id": fixture.empresaId,
        "x-filial-id": fixture.filialId,
      },
    });

    const resposta = await GET(request);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.some((c: { id: string }) => c.id === centroCustoId)).toBe(true);
  });

  test("sem chave -> 401", async () => {
    const request = new Request("http://localhost/api/v1/centros-de-custo", {
      headers: { "x-empresa-id": fixture.empresaId, "x-filial-id": fixture.filialId },
    });
    expect((await GET(request)).status).toBe(401);
  });
});
```

Criar `src/app/api/v1/centros-de-lucro/route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { GET } from "./route";

describe("GET /api/v1/centros-de-lucro", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;
  let centroLucroId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APICL");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave teste")).chaveCompleta;
    const centro = await prisma.centroLucro.create({
      data: { filialId: fixture.filialId, nome: "Centro Lucro GET", codigo: "CL-GET" },
    });
    centroLucroId = centro.id;
  });

  afterAll(async () => {
    await prisma.centroLucro.delete({ where: { id: centroLucroId } });
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("lista os centros de lucro da filial", async () => {
    const request = new Request("http://localhost/api/v1/centros-de-lucro", {
      headers: {
        authorization: `Bearer ${chaveCompleta}`,
        "x-empresa-id": fixture.empresaId,
        "x-filial-id": fixture.filialId,
      },
    });

    const resposta = await GET(request);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.some((c: { id: string }) => c.id === centroLucroId)).toBe(true);
  });

  test("sem chave -> 401", async () => {
    const request = new Request("http://localhost/api/v1/centros-de-lucro", {
      headers: { "x-empresa-id": fixture.empresaId, "x-filial-id": fixture.filialId },
    });
    expect((await GET(request)).status).toBe(401);
  });
});
```

Criar `src/app/api/v1/safras/route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { GET } from "./route";

describe("GET /api/v1/safras", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;
  let safraId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APISAF");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave teste")).chaveCompleta;
    const safra = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra GET",
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2026-12-31"),
      },
    });
    safraId = safra.id;
  });

  afterAll(async () => {
    await prisma.safra.delete({ where: { id: safraId } });
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("lista as safras da filial", async () => {
    const request = new Request("http://localhost/api/v1/safras", {
      headers: {
        authorization: `Bearer ${chaveCompleta}`,
        "x-empresa-id": fixture.empresaId,
        "x-filial-id": fixture.filialId,
      },
    });

    const resposta = await GET(request);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.some((s: { id: string }) => s.id === safraId)).toBe(true);
  });

  test("sem chave -> 401", async () => {
    const request = new Request("http://localhost/api/v1/safras", {
      headers: { "x-empresa-id": fixture.empresaId, "x-filial-id": fixture.filialId },
    });
    expect((await GET(request)).status).toBe(401);
  });
});
```

Criar `src/app/api/v1/projetos/route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { GET } from "./route";

describe("GET /api/v1/projetos", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;
  let projetoId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APIPROJ");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave teste")).chaveCompleta;
    const projeto = await prisma.projeto.create({
      data: { filialId: fixture.filialId, nome: "Projeto GET", codigo: "PRJ-GET" },
    });
    projetoId = projeto.id;
  });

  afterAll(async () => {
    await prisma.projeto.delete({ where: { id: projetoId } });
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("lista os projetos da filial", async () => {
    const request = new Request("http://localhost/api/v1/projetos", {
      headers: {
        authorization: `Bearer ${chaveCompleta}`,
        "x-empresa-id": fixture.empresaId,
        "x-filial-id": fixture.filialId,
      },
    });

    const resposta = await GET(request);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.some((p: { id: string }) => p.id === projetoId)).toBe(true);
  });

  test("sem chave -> 401", async () => {
    const request = new Request("http://localhost/api/v1/projetos", {
      headers: { "x-empresa-id": fixture.empresaId, "x-filial-id": fixture.filialId },
    });
    expect((await GET(request)).status).toBe(401);
  });
});
```

Criar `src/app/api/v1/contas-bancarias/route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { GET } from "./route";

describe("GET /api/v1/contas-bancarias", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APICB");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave teste")).chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("lista as contas bancárias da filial", async () => {
    const request = new Request("http://localhost/api/v1/contas-bancarias", {
      headers: {
        authorization: `Bearer ${chaveCompleta}`,
        "x-empresa-id": fixture.empresaId,
        "x-filial-id": fixture.filialId,
      },
    });

    const resposta = await GET(request);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.some((c: { id: string }) => c.id === fixture.contaBancariaId)).toBe(true);
  });

  test("sem chave -> 401", async () => {
    const request = new Request("http://localhost/api/v1/contas-bancarias", {
      headers: { "x-empresa-id": fixture.empresaId, "x-filial-id": fixture.filialId },
    });
    expect((await GET(request)).status).toBe(401);
  });
});
```

- [ ] **Step 5: Rodar todos os testes das 8 rotas e confirmar que passam**

Run: `npx vitest run src/app/api/v1/fornecedores src/app/api/v1/clientes src/app/api/v1/categorias-financeiras src/app/api/v1/centros-de-custo src/app/api/v1/centros-de-lucro src/app/api/v1/safras src/app/api/v1/projetos src/app/api/v1/contas-bancarias`
Expected: PASS (16 testes — 2 por rota).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v1/fornecedores src/app/api/v1/clientes src/app/api/v1/categorias-financeiras src/app/api/v1/centros-de-custo src/app/api/v1/centros-de-lucro src/app/api/v1/safras src/app/api/v1/projetos src/app/api/v1/contas-bancarias
git commit -m "feat: rotas GET de leitura dos cadastros de apoio"
```

---

## Task 11: Gestão de chaves na tela de Usuários

**Files:**
- Create: `src/app/(dashboard)/usuarios/chaves-api-dialog.tsx`
- Modify: `src/app/(dashboard)/usuarios/actions.ts`
- Modify: `src/app/(dashboard)/usuarios/page.tsx`

**Interfaces:**
- Consumes: `gerarChave`/`revogarChave`/`listarChaves` (`@/server/services/apiKey`), `requireSessaoAtiva` (`@/server/auth/sessao`), `FormState` (já existe em `./actions.ts`).
- Produces: `listarChavesAction(usuarioId: string): Promise<{ id: string; nome: string; prefixo: string; ultimoUsoEm: Date | null; revogadaEm: Date | null; criadoEm: Date }[]>`, `gerarChaveAction(_prev: FormState, formData: FormData): Promise<FormState & { chaveCompleta?: string }>`, `revogarChaveAction(formData: FormData): Promise<void>`, componente `<ChavesApiDialog usuarioId={string} />`.

- [ ] **Step 1: Adicionar as server actions em `actions.ts`**

Em `src/app/(dashboard)/usuarios/actions.ts`, adicionar ao topo do arquivo, junto dos demais imports (logo abaixo de `import * as usuarioEmpresaFilialService from "@/server/services/usuarioEmpresaFilial";`):

```ts
import * as apiKeyService from "@/server/services/apiKey";
```

E adicionar ao final do arquivo (`requireSessaoAtiva` e `FormState` já existem no arquivo, não precisam de novo import):

```ts
export type GerarChaveState = FormState & { chaveCompleta?: string };

export async function listarChavesAction(usuarioId: string) {
  const sessao = await requireSessaoAtiva();
  return apiKeyService.listarChaves(sessao, usuarioId);
}

export async function gerarChaveAction(_prev: GerarChaveState, formData: FormData): Promise<GerarChaveState> {
  const sessao = await requireSessaoAtiva();
  const usuarioId = String(formData.get("usuarioId") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();

  if (!nome) {
    return { erro: "Informe um nome para a chave" };
  }

  try {
    const resultado = await apiKeyService.gerarChave(sessao, usuarioId, nome);
    return { sucesso: true, chaveCompleta: resultado.chaveCompleta };
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
}

export async function revogarChaveAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const chaveId = String(formData.get("chaveId") ?? "");
  await apiKeyService.revogarChave(sessao, chaveId);
}
```

(A importação `import { requireSessaoAtiva } from "@/server/auth/sessao";` já existe no topo do arquivo — confirmar antes de adicionar de novo.)

- [ ] **Step 2: Criar o componente do diálogo**

Criar `src/app/(dashboard)/usuarios/chaves-api-dialog.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listarChavesAction,
  gerarChaveAction,
  revogarChaveAction,
  type GerarChaveState,
} from "./actions";

type Chave = {
  id: string;
  nome: string;
  prefixo: string;
  ultimoUsoEm: Date | null;
  revogadaEm: Date | null;
  criadoEm: Date;
};

const ESTADO_INICIAL: GerarChaveState = {};

function formatarData(data: Date | null): string {
  return data ? new Date(data).toLocaleString("pt-BR") : "Nunca";
}

export function ChavesApiDialog({ usuarioId }: { usuarioId: string }) {
  const [aberto, setAberto] = useState(false);
  const [chaves, setChaves] = useState<Chave[]>([]);
  const [state, formAction, pendente] = useActionState(gerarChaveAction, ESTADO_INICIAL);

  async function recarregar() {
    setChaves(await listarChavesAction(usuarioId));
  }

  useEffect(() => {
    if (aberto) recarregar();
  }, [aberto]);

  useEffect(() => {
    if (state.sucesso) recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sucesso, state.chaveCompleta]);

  async function revogar(chaveId: string) {
    const formData = new FormData();
    formData.set("chaveId", chaveId);
    await revogarChaveAction(formData);
    await recarregar();
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Chaves de API</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chaves de API</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {state.chaveCompleta ? (
            <div className="space-y-2 rounded-md border border-amber-500 bg-amber-50 p-3 text-sm">
              <p className="font-medium">Copie a chave agora — ela não será mostrada novamente:</p>
              <Input readOnly value={state.chaveCompleta} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
            </div>
          ) : null}

          <div className="space-y-2">
            {chaves.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma chave gerada.</p>
            ) : (
              chaves.map((chave) => (
                <div key={chave.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <div>
                    <div className="font-medium">
                      {chave.nome} <span className="font-mono text-xs text-muted-foreground">{chave.prefixo}...</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Criada em {formatarData(chave.criadoEm)} — Último uso: {formatarData(chave.ultimoUsoEm)}
                      {chave.revogadaEm ? " — Revogada" : ""}
                    </div>
                  </div>
                  {!chave.revogadaEm && (
                    <Button type="button" variant="outline" size="sm" onClick={() => revogar(chave.id)}>
                      Revogar
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          <form action={formAction} className="flex items-end gap-2 border-t pt-4">
            <input type="hidden" name="usuarioId" value={usuarioId} />
            <div className="flex-1 space-y-2">
              <Label htmlFor="nome">Nova chave</Label>
              <Input id="nome" name="nome" placeholder="Ex.: Agente IA - lançamentos" required />
            </div>
            <Button type="submit" disabled={pendente}>
              {pendente ? "Gerando..." : "Gerar"}
            </Button>
          </form>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Adicionar o botão na tabela de usuários**

Em `src/app/(dashboard)/usuarios/page.tsx`, adicionar o import:

```ts
import { ChavesApiDialog } from "./chaves-api-dialog";
```

E, na célula de Ações (por volta da linha 61-69), envolver os dois elementos num container flex e adicionar o diálogo:

```tsx
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <ChavesApiDialog usuarioId={vinculo.usuarioId} />
                  <form action={alternarAtivoUsuarioAction}>
                    <input type="hidden" name="usuarioId" value={vinculo.usuarioId} />
                    <input type="hidden" name="ativo" value={(!vinculo.ativo).toString()} />
                    <Button type="submit" variant="outline" size="sm">
                      {vinculo.ativo ? "Desativar" : "Reativar"}
                    </Button>
                  </form>
                </div>
              </TableCell>
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Verificação manual**

Run: `npm run dev`, logar como ADMINISTRADOR, abrir `/usuarios`, clicar em "Chaves de API" numa linha, gerar uma chave, confirmar que o valor completo aparece uma vez, fechar e reabrir o diálogo e confirmar que só o prefixo aparece, revogar a chave e confirmar que o botão "Revogar" some pra ela.

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/usuarios
git commit -m "feat: tela de gestao de chaves de API na pagina de usuarios"
```

---

## Verificação final

- [ ] `npx tsc --noEmit` limpo.
- [ ] `npm test` — todos os testes (os já existentes + os novos desta feature) passando.
- [ ] `npm run build` sem erro (confirma que as novas rotas `src/app/api/v1/**` compilam como Route Handlers válidos).
- [ ] Teste manual ponta a ponta com `curl` (ou equivalente), usando uma chave gerada na tela: criar um título a pagar via `POST /api/v1/titulos`, listar via `GET /api/v1/titulos?tipo=PAGAR`, dar baixa via `POST /api/v1/baixas`, confirmar na tela `/financeiro/contas-a-pagar` que o título e a baixa aparecem exatamente como um lançamento feito pela UI apareceria.
