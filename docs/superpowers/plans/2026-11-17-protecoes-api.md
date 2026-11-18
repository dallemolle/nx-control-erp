# Proteções da API v1 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paginação por cursor nos `GET` de títulos e lançamentos, limite de 60 requisições por minuto por chave (`429`) e validade opcional da chave de API.

**Architecture:** Três colunas novas em `api_keys` (`expiraEm`, `janelaLimiteEm`, `requisicoesNaJanela`). O limite é um `UPDATE ... RETURNING` atômico que substitui a gravação de `ultimoUsoEm` em `requireSessaoApi`. A paginação usa cursor do Prisma (`take: limite+1`, `cursor`, `skip: 1`) em funções irmãs `listarTitulosPaginado`/`listarLancamentosPaginado`. As telas continuam nas funções atuais.

**Tech Stack:** Next.js (route handlers), Prisma 7 + Postgres, Vitest (contra o Postgres de dev), React (diálogo client).

**Spec:** `docs/superpowers/specs/2026-11-17-protecoes-api-design.md`

## Global Constraints

- Limite: `LIMITE_REQUISICOES_POR_MINUTO = 60`, janela fixa de 1 minuto, todas as rotas somadas, por chave.
- Paginação: `?limite=` de 1 a 500, padrão 100. Resposta `{ "itens": [...], "proximoCursor": "<id>" | null }`.
- Validade: Sem validade (padrão), 30 dias, 90 dias, 1 ano (365 dias). As chaves existentes ficam `null`.
- Mensagens exatas:
  - `"Chave de API expirada"` (401);
  - `"Limite de 60 requisições por minuto atingido. Tente de novo em N s."` (429 + `Retry-After: N`);
  - `"Cursor inválido para esta listagem"` (422, `campos: ["cursor"]`);
  - `"Use ?limite= entre 1 e 500"` (422, `campos: ["limite"]`);
  - `"Validade inválida"` (action).
- SQL do limite usa `now() AT TIME ZONE 'UTC'`, porque as colunas são `TIMESTAMP(3)` sem fuso, gravadas em UTC.
- Ambiente (Windows):
  - testes pelo **PowerShell**: `Set-Location D:\Projetos\nx-control-erp; npx vitest run <arquivo>`;
  - os testes usam o Postgres de dev (docker `nx-control-erp-db`);
  - depois de `prisma migrate dev`, rodar `npx prisma generate`.
- Edição de arquivos:
  - **nunca rodar prettier**; formatar à mão, linhas até ~120;
  - editar com a ferramenta Edit (arquivos misturam CRLF/LF);
  - nunca `Get-Content | Set-Content`.
- Commits:
  - `feat(api): ...` / `docs(api): ...` em português;
  - terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Colunas novas e validade da chave (serviço + autenticação)

**Files:**
- Modify: `prisma/schema.prisma` (model `ApiKey`, ~linha 205)
- Create: `prisma/migrations/<timestamp>_protecoes_api/migration.sql` (gerado)
- Create: `src/lib/validadeChaveApi.ts`
- Create: `src/lib/validadeChaveApi.test.ts`
- Modify: `src/server/services/apiKey.ts`
- Modify: `src/server/services/apiKey.test.ts`
- Modify: `src/server/api/sessaoApi.ts:32-34`
- Modify: `src/server/api/sessaoApi.test.ts`

**Interfaces:**
- Produces:
  - `OPCOES_VALIDADE_CHAVE: readonly { dias: 30 | 90 | 365; rotulo: string }[]`;
  - `type ValidadeChaveDias = 30 | 90 | 365`;
  - `lerValidadeChave(valor: string): ValidadeChaveDias | null | undefined` (`""` → `null`, inválido → `undefined`);
  - `gerarChave(sessao, usuarioId, nome, validadeDias: ValidadeChaveDias | null = null)`;
  - `listarChaves` passa a devolver `expiraEm`;
  - colunas Prisma `expiraEm`, `janelaLimiteEm`, `requisicoesNaJanela`.

- [ ] **Step 1: Schema e migração**

Em `prisma/schema.prisma`, model `ApiKey`, depois de `revogadaEm DateTime?`:

```prisma
  expiraEm            DateTime?
  /// Início (truncado no minuto, UTC) da janela do limite de requisições da API.
  janelaLimiteEm      DateTime?
  requisicoesNaJanela Int       @default(0)
```

Run (PowerShell): `Set-Location D:\Projetos\nx-control-erp; npx prisma migrate dev --name protecoes_api; npx prisma generate`

Esperado: a pasta `prisma/migrations/<timestamp>_protecoes_api/migration.sql` contém:

```sql
ALTER TABLE "api_keys" ADD COLUMN     "expiraEm" TIMESTAMP(3),
ADD COLUMN     "janelaLimiteEm" TIMESTAMP(3),
ADD COLUMN     "requisicoesNaJanela" INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Testes que falham**

Criar `src/lib/validadeChaveApi.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { lerValidadeChave, OPCOES_VALIDADE_CHAVE } from "./validadeChaveApi";

describe("lerValidadeChave", () => {
  test("vazio = sem validade", () => {
    expect(lerValidadeChave("")).toBeNull();
  });

  test("aceita só os prazos da lista", () => {
    expect(lerValidadeChave("30")).toBe(30);
    expect(lerValidadeChave("90")).toBe(90);
    expect(lerValidadeChave("365")).toBe(365);
    expect(lerValidadeChave("31")).toBeUndefined();
    expect(lerValidadeChave("abc")).toBeUndefined();
  });

  test("a lista tem os rótulos da tela", () => {
    expect(OPCOES_VALIDADE_CHAVE.map((o) => o.rotulo)).toEqual(["30 dias", "90 dias", "1 ano"]);
  });
});
```

Em `src/server/services/apiKey.test.ts`:

- trocar o array esperado no teste "listarChaves não expõe chaveHash..." por
  `["criadoEm", "expiraEm", "id", "nome", "prefixo", "revogadaEm", "ultimoUsoEm"].sort()`;
- adicionar dentro do `describe`:

```ts
  test("gerarChave sem validade deixa expiraEm vazio; com validade grava agora + dias", async () => {
    const semValidade = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Sem validade");
    expect((await prisma.apiKey.findUniqueOrThrow({ where: { id: semValidade.id } })).expiraEm).toBeNull();

    const antes = Date.now();
    const comValidade = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Validade 30", 30);
    const { expiraEm } = await prisma.apiKey.findUniqueOrThrow({ where: { id: comValidade.id } });
    const trintaDias = 30 * 24 * 60 * 60 * 1000;
    expect(expiraEm!.getTime()).toBeGreaterThanOrEqual(antes + trintaDias);
    expect(expiraEm!.getTime()).toBeLessThanOrEqual(Date.now() + trintaDias);
  });
```

Em `src/server/api/sessaoApi.test.ts`, adicionar:

```ts
  test("chave expirada -> 401 'Chave de API expirada'; com validade futura passa", async () => {
    const gerada = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave com validade", 30);
    const req = () =>
      requireSessaoApi(
        requisicao({ authorization: `Bearer ${gerada.chaveCompleta}`, "x-filial-cnpjcpf": fixture.filialCnpjCpf }),
      );

    await expect(req()).resolves.toMatchObject({ usuarioId: fixture.usuarioId });

    await prisma.apiKey.update({ where: { id: gerada.id }, data: { expiraEm: new Date(Date.now() - 1000) } });
    await expect(req()).rejects.toMatchObject({ status: 401, message: "Chave de API expirada" });
  });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/lib/validadeChaveApi.test.ts src/server/services/apiKey.test.ts src/server/api/sessaoApi.test.ts`

Esperado: FAIL (módulo `validadeChaveApi` não existe; `expiraEm` ausente na listagem; chave expirada passa).

- [ ] **Step 4: Implementar**

Criar `src/lib/validadeChaveApi.ts`:

```ts
/** Prazos oferecidos ao gerar uma chave de API. Sem validade = `null`. */
export const OPCOES_VALIDADE_CHAVE = [
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
  { dias: 365, rotulo: "1 ano" },
] as const;

export type ValidadeChaveDias = (typeof OPCOES_VALIDADE_CHAVE)[number]["dias"];

/** Valor do formulário: "" = sem validade (`null`); prazo fora da lista = `undefined`. */
export function lerValidadeChave(valor: string): ValidadeChaveDias | null | undefined {
  if (valor === "") return null;
  return OPCOES_VALIDADE_CHAVE.find((opcao) => String(opcao.dias) === valor)?.dias;
}
```

Em `src/server/services/apiKey.ts`:

- import: `import type { ValidadeChaveDias } from "@/lib/validadeChaveApi";`
- assinatura: `gerarChave(sessao, usuarioId, nome, validadeDias: ValidadeChaveDias | null = null)`
- antes do `prisma.apiKey.create`:

```ts
  const expiraEm = validadeDias === null ? null : new Date(Date.now() + validadeDias * 24 * 60 * 60 * 1000);
```

- `data: { usuarioId, nome, prefixo, chaveHash, expiraEm }`
- `listarChaves`: `select` ganha `expiraEm: true`.

Em `src/server/api/sessaoApi.ts`, logo depois do bloco `if (apiKey.revogadaEm) {...}`:

```ts
  if (apiKey.expiraEm && apiKey.expiraEm <= new Date()) {
    throw new ApiAuthError(401, "Chave de API expirada");
  }
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/validadeChaveApi.test.ts src/server/services/apiKey.test.ts src/server/api/sessaoApi.test.ts`

Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/validadeChaveApi.ts src/lib/validadeChaveApi.test.ts src/server/services/apiKey.ts src/server/services/apiKey.test.ts src/server/api/sessaoApi.ts src/server/api/sessaoApi.test.ts
git commit -m "feat(api): validade opcional da chave de API"
```

---

### Task 2: Validade na tela de chaves

**Files:**
- Modify: `src/app/(dashboard)/usuarios/actions.ts:108-123`
- Modify: `src/app/(dashboard)/usuarios/chaves-api-dialog.tsx`

**Interfaces:**
- Consumes (Task 1): `OPCOES_VALIDADE_CHAVE`, `lerValidadeChave`, `gerarChave(..., validadeDias)`, `expiraEm` em `listarChaves`.

- [ ] **Step 1: Action**

Em `actions.ts`, importar `import { lerValidadeChave } from "@/lib/validadeChaveApi";`. Em `gerarChaveAction`, depois da checagem do nome:

```ts
  const validadeDias = lerValidadeChave(String(formData.get("validade") ?? ""));
  if (validadeDias === undefined) {
    return { erro: "Validade inválida" };
  }
```

Trocar a chamada por `apiKeyService.gerarChave(sessao, usuarioId, nome, validadeDias)`.

- [ ] **Step 2: Diálogo**

Em `chaves-api-dialog.tsx`:

- import: `import { OPCOES_VALIDADE_CHAVE } from "@/lib/validadeChaveApi";`
- tipo `Chave` ganha `expiraEm: Date | null;`
- helper, ao lado de `formatarData`:

```ts
function descreverValidade(expiraEm: Date | null): string {
  if (!expiraEm) return "Sem validade";
  const data = new Date(expiraEm);
  return data <= new Date() ? "Expirada" : `Expira em ${data.toLocaleDateString("pt-BR")}`;
}
```

- na linha de cada chave, trocar o bloco do texto e do botão por:

```tsx
                    <div className="text-xs text-muted-foreground">
                      Criada em {formatarData(chave.criadoEm)} — Último uso: {formatarData(chave.ultimoUsoEm)}
                      {" — "}
                      {chave.revogadaEm ? "Revogada" : descreverValidade(chave.expiraEm)}
                    </div>
                  </div>
                  {!chave.revogadaEm && descreverValidade(chave.expiraEm) !== "Expirada" && (
```

  (O resto, `<Button ...>Revogar</Button>` e `)}`, fica igual.)

- no `<form>`, entre o `<div className="flex-1 space-y-2">` do nome e o `<Button type="submit">`:

```tsx
            <div className="space-y-2">
              <Label htmlFor="validade">Validade</Label>
              <select
                id="validade"
                name="validade"
                defaultValue=""
                className="h-8 rounded-lg border bg-transparent px-2 text-sm"
              >
                <option value="">Sem validade</option>
                {OPCOES_VALIDADE_CHAVE.map((opcao) => (
                  <option key={opcao.dias} value={opcao.dias}>
                    {opcao.rotulo}
                  </option>
                ))}
              </select>
            </div>
```

- [ ] **Step 3: Tipos e lint**

Run: `npx tsc --noEmit; npx eslint "src/app/(dashboard)/usuarios"`

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/usuarios/actions.ts" "src/app/(dashboard)/usuarios/chaves-api-dialog.tsx"
git commit -m "feat(api): escolha da validade ao gerar chave e estado na lista"
```

---

### Task 3: Limite de requisições por chave

**Files:**
- Create: `src/server/api/limiteRequisicoes.ts`
- Create: `src/server/api/limiteRequisicoes.test.ts`
- Modify: `src/server/api/sessaoApi.ts:39` (o `prisma.apiKey.update` de `ultimoUsoEm`)
- Modify: `src/server/api/executarRotaApi.ts`
- Modify: `src/server/api/executarRotaApi.test.ts`

**Interfaces:**
- Consumes (Task 1): colunas `janelaLimiteEm`, `requisicoesNaJanela`.
- Produces:
  - `LIMITE_REQUISICOES_POR_MINUTO = 60`;
  - `class ErroLimiteRequisicoes extends Error { status: 429; segundosParaLiberar: number }`;
  - `registrarUsoDaChave(apiKeyId: string): Promise<void>`.

- [ ] **Step 1: Testes que falham**

Criar `src/server/api/limiteRequisicoes.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { ErroLimiteRequisicoes, LIMITE_REQUISICOES_POR_MINUTO, registrarUsoDaChave } from "./limiteRequisicoes";
import { requireSessaoApi } from "./sessaoApi";

/** Evita que a virada do minuto caia no meio do teste e zere o contador. */
async function aguardarJanelaSegura() {
  const segundos = new Date().getUTCSeconds();
  if (segundos >= 55) await new Promise((resolve) => setTimeout(resolve, (61 - segundos) * 1000));
}

describe("limite de requisições por chave", () => {
  let fixture: FixtureFinanceiro;
  let chaveId: string;
  let chaveCompleta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("LIMREQ");
    const gerada = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave limite");
    chaveId = gerada.id;
    chaveCompleta = gerada.chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  async function posicionarContador(requisicoes: number, minutosAtras = 0) {
    await prisma.$executeRaw`
      UPDATE api_keys SET
        "janelaLimiteEm" = date_trunc('minute', now() AT TIME ZONE 'UTC') - ${minutosAtras}::int * interval '1 minute',
        "requisicoesNaJanela" = ${requisicoes}::int
      WHERE id = ${chaveId}`;
  }

  test("a 60ª requisição da janela passa e a 61ª é bloqueada com segundos para liberar", async () => {
    await aguardarJanelaSegura();
    await posicionarContador(LIMITE_REQUISICOES_POR_MINUTO - 1);

    await expect(registrarUsoDaChave(chaveId)).resolves.toBeUndefined();

    const erro = await registrarUsoDaChave(chaveId).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroLimiteRequisicoes);
    expect(erro.status).toBe(429);
    expect(erro.segundosParaLiberar).toBeGreaterThanOrEqual(1);
    expect(erro.segundosParaLiberar).toBeLessThanOrEqual(60);
    expect(erro.message).toBe(
      `Limite de 60 requisições por minuto atingido. Tente de novo em ${erro.segundosParaLiberar} s.`,
    );
  }, 15_000);

  test("janela anterior não conta: o contador volta para 1", async () => {
    await aguardarJanelaSegura();
    await posicionarContador(500, 1);

    await expect(registrarUsoDaChave(chaveId)).resolves.toBeUndefined();

    const chave = await prisma.apiKey.findUniqueOrThrow({ where: { id: chaveId } });
    expect(chave.requisicoesNaJanela).toBe(1);
    expect(chave.ultimoUsoEm).not.toBeNull();
  }, 15_000);

  test("requireSessaoApi aplica o limite", async () => {
    await aguardarJanelaSegura();
    await posicionarContador(LIMITE_REQUISICOES_POR_MINUTO);

    const requisicao = new Request("http://localhost/api/v1/teste", {
      headers: { authorization: `Bearer ${chaveCompleta}`, "x-filial-cnpjcpf": fixture.filialCnpjCpf },
    });
    await expect(requireSessaoApi(requisicao)).rejects.toBeInstanceOf(ErroLimiteRequisicoes);

    await posicionarContador(0);
  }, 15_000);
});
```

Em `src/server/api/executarRotaApi.test.ts`, importar
`import { ErroLimiteRequisicoes } from "./limiteRequisicoes";` e adicionar:

```ts
  test("ErroLimiteRequisicoes vira 429 com Retry-After", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async () => {
      throw new ErroLimiteRequisicoes(17);
    });

    expect(resposta.status).toBe(429);
    expect(resposta.headers.get("Retry-After")).toBe("17");
    expect((await resposta.json()).erro).toBe("Limite de 60 requisições por minuto atingido. Tente de novo em 17 s.");
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/api/limiteRequisicoes.test.ts src/server/api/executarRotaApi.test.ts`

Esperado: FAIL (módulo `limiteRequisicoes` não existe).

- [ ] **Step 3: Implementar**

Criar `src/server/api/limiteRequisicoes.ts`:

```ts
import { prisma } from "@/server/db/client";

export const LIMITE_REQUISICOES_POR_MINUTO = 60;

export class ErroLimiteRequisicoes extends Error {
  readonly status = 429;
  segundosParaLiberar: number;

  constructor(segundosParaLiberar: number) {
    super(
      `Limite de ${LIMITE_REQUISICOES_POR_MINUTO} requisições por minuto atingido. ` +
        `Tente de novo em ${segundosParaLiberar} s.`,
    );
    this.name = "ErroLimiteRequisicoes";
    this.segundosParaLiberar = segundosParaLiberar;
  }
}

type UsoDaChave = { requisicoesNaJanela: number; janelaLimiteEm: Date; agora: Date };

/**
 * Grava o último uso e conta a requisição na janela fixa de 1 minuto, num único
 * UPDATE atômico: requisições simultâneas da mesma chave ficam em fila no lock da
 * linha. Usa o relógio do banco para todas as instâncias serverless concordarem.
 * As colunas são TIMESTAMP sem fuso gravadas em UTC, daí o `AT TIME ZONE 'UTC'`.
 */
export async function registrarUsoDaChave(apiKeyId: string): Promise<void> {
  const [uso] = await prisma.$queryRaw<UsoDaChave[]>`
    UPDATE api_keys SET
      "ultimoUsoEm" = now() AT TIME ZONE 'UTC',
      "requisicoesNaJanela" = CASE
        WHEN "janelaLimiteEm" = date_trunc('minute', now() AT TIME ZONE 'UTC')
          THEN "requisicoesNaJanela" + 1
        ELSE 1 END,
      "janelaLimiteEm" = date_trunc('minute', now() AT TIME ZONE 'UTC')
    WHERE id = ${apiKeyId}
    RETURNING "requisicoesNaJanela", "janelaLimiteEm", now() AT TIME ZONE 'UTC' AS agora`;
  if (!uso || uso.requisicoesNaJanela <= LIMITE_REQUISICOES_POR_MINUTO) return;

  const msParaLiberar = uso.janelaLimiteEm.getTime() + 60_000 - uso.agora.getTime();
  throw new ErroLimiteRequisicoes(Math.min(60, Math.max(1, Math.ceil(msParaLiberar / 1000))));
}
```

Em `src/server/api/sessaoApi.ts`:

- import `import { registrarUsoDaChave } from "./limiteRequisicoes";`
- trocar
  `await prisma.apiKey.update({ where: { id: apiKey.id }, data: { ultimoUsoEm: new Date() } });`
  por `await registrarUsoDaChave(apiKey.id);`

Em `src/server/api/executarRotaApi.ts`:

- import `import { ErroLimiteRequisicoes } from "./limiteRequisicoes";`
- no `catch`, antes do bloco `ApiAuthError`:

```ts
    if (erro instanceof ErroLimiteRequisicoes) {
      return Response.json(
        { erro: erro.message },
        { status: 429, headers: { "Retry-After": String(erro.segundosParaLiberar) } },
      );
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/api`

Esperado: PASS, incluindo o teste existente "atualiza ultimoUsoEm a cada chamada bem-sucedida" em `sessaoApi.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/server/api
git commit -m "feat(api): limite de 60 requisições por minuto por chave"
```

---

### Task 4: Base da paginação (helpers e erros)

**Files:**
- Create: `src/server/services/paginacao.ts`
- Create: `src/server/services/paginacao.test.ts`
- Modify: `src/server/api/executarRotaApi.ts`
- Modify: `src/server/api/executarRotaApi.test.ts`

**Interfaces:**
- Produces (`paginacao.ts`):
  - `LIMITE_PADRAO_PAGINA = 100`, `LIMITE_MAXIMO_PAGINA = 500`;
  - `type Paginacao = { limite: number; cursor?: string }`;
  - `type Pagina<T> = { itens: T[]; proximoCursor: string | null }`;
  - `class CursorInvalidoError`;
  - `montarPagina<T extends { id: string }>(linhas: T[], limite: number): Pagina<T>`;
  - `argumentosDeCursor(p: Paginacao)` → `{ take; cursor?; skip? }`.
- Produces (`executarRotaApi.ts`): `paginacaoDaQuery(url: URL): Paginacao`.

- [ ] **Step 1: Testes que falham**

Criar `src/server/services/paginacao.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { argumentosDeCursor, montarPagina } from "./paginacao";

const linhas = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${i + 1}` }));

describe("montarPagina", () => {
  test("menos linhas que o limite: tudo, sem próximo cursor", () => {
    expect(montarPagina(linhas(2), 3)).toEqual({ itens: linhas(2), proximoCursor: null });
  });

  test("exatamente o limite: tudo, sem próximo cursor", () => {
    expect(montarPagina(linhas(3), 3)).toEqual({ itens: linhas(3), proximoCursor: null });
  });

  test("linha extra: corta no limite e o cursor é o último item devolvido", () => {
    expect(montarPagina(linhas(4), 3)).toEqual({ itens: linhas(3), proximoCursor: "id-3" });
  });
});

describe("argumentosDeCursor", () => {
  test("sem cursor busca limite + 1", () => {
    expect(argumentosDeCursor({ limite: 10 })).toEqual({ take: 11 });
  });

  test("com cursor pula o próprio cursor", () => {
    expect(argumentosDeCursor({ limite: 10, cursor: "abc" })).toEqual({ take: 11, cursor: { id: "abc" }, skip: 1 });
  });
});
```

Em `src/server/api/executarRotaApi.test.ts`, trocar o import por
`import { executarRotaApi, ErroValidacaoApi, paginacaoDaQuery } from "./executarRotaApi";`,
importar `import { CursorInvalidoError } from "@/server/services/paginacao";` e adicionar:

```ts
  test("CursorInvalidoError vira 422 com campo cursor", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async () => {
      throw new CursorInvalidoError();
    });

    expect(resposta.status).toBe(422);
    expect(await resposta.json()).toEqual({ erro: "Cursor inválido para esta listagem", campos: ["cursor"] });
  });
```

e, fora do `describe("executarRotaApi")`:

```ts
describe("paginacaoDaQuery", () => {
  const ler = (query: string) => paginacaoDaQuery(new URL(`http://localhost/api/v1/x${query}`));

  test("padrão 100 sem cursor", () => {
    expect(ler("")).toEqual({ limite: 100, cursor: undefined });
    expect(ler("?limite=")).toEqual({ limite: 100, cursor: undefined });
  });

  test("lê limite e cursor", () => {
    expect(ler("?limite=500&cursor=abc")).toEqual({ limite: 500, cursor: "abc" });
    expect(ler("?limite=1")).toEqual({ limite: 1, cursor: undefined });
  });

  test.each(["0", "501", "abc", "1.5", "-3"])("limite %s -> ErroValidacaoApi no campo limite", (valor) => {
    expect(() => ler(`?limite=${valor}`)).toThrow(ErroValidacaoApi);
    try {
      ler(`?limite=${valor}`);
    } catch (erro) {
      expect((erro as ErroValidacaoApi).message).toBe("Use ?limite= entre 1 e 500");
      expect((erro as ErroValidacaoApi).campos).toEqual(["limite"]);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/paginacao.test.ts src/server/api/executarRotaApi.test.ts`

Esperado: FAIL (módulo `paginacao` e `paginacaoDaQuery` não existem).

- [ ] **Step 3: Implementar**

Criar `src/server/services/paginacao.ts`:

```ts
export const LIMITE_PADRAO_PAGINA = 100;
export const LIMITE_MAXIMO_PAGINA = 500;

export type Paginacao = { limite: number; cursor?: string };
export type Pagina<T> = { itens: T[]; proximoCursor: string | null };

/** O cursor não é um registro da listagem pedida (outra filial, outro tipo ou inexistente). */
export class CursorInvalidoError extends Error {
  constructor() {
    super("Cursor inválido para esta listagem");
    this.name = "CursorInvalidoError";
  }
}

/** Argumentos do `findMany`: busca uma linha a mais para saber se existe próxima página. */
export function argumentosDeCursor(paginacao: Paginacao) {
  return {
    take: paginacao.limite + 1,
    ...(paginacao.cursor && { cursor: { id: paginacao.cursor }, skip: 1 }),
  };
}

/** Recebe até `limite + 1` linhas; a linha extra só indica que há próxima página. */
export function montarPagina<T extends { id: string }>(linhas: T[], limite: number): Pagina<T> {
  const temMais = linhas.length > limite;
  const itens = temMais ? linhas.slice(0, limite) : linhas;
  return { itens, proximoCursor: temMais ? itens[itens.length - 1].id : null };
}
```

Em `src/server/api/executarRotaApi.ts`:

- import:

```ts
import {
  CursorInvalidoError,
  LIMITE_MAXIMO_PAGINA,
  LIMITE_PADRAO_PAGINA,
  type Paginacao,
} from "@/server/services/paginacao";
```

- depois de `classificacaoDaQuery`:

```ts
/** Lê `?limite=` (1 a 500, padrão 100) e `?cursor=` das listagens paginadas. */
export function paginacaoDaQuery(url: URL): Paginacao {
  const limiteBruto = url.searchParams.get("limite");
  let limite = LIMITE_PADRAO_PAGINA;
  if (limiteBruto !== null && limiteBruto !== "") {
    const valor = Number(limiteBruto);
    if (!/^\d+$/.test(limiteBruto) || valor < 1 || valor > LIMITE_MAXIMO_PAGINA) {
      throw new ErroValidacaoApi(`Use ?limite= entre 1 e ${LIMITE_MAXIMO_PAGINA}`, ["limite"]);
    }
    limite = valor;
  }
  return { limite, cursor: url.searchParams.get("cursor") || undefined };
}
```

- no `catch`, logo depois do bloco `ErroValidacaoApi || ErroClassificacaoFiscal`:

```ts
    if (erro instanceof CursorInvalidoError) {
      return Response.json({ erro: erro.message, campos: ["cursor"] }, { status: 422 });
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/services/paginacao.test.ts src/server/api/executarRotaApi.test.ts`

Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/paginacao.ts src/server/services/paginacao.test.ts src/server/api/executarRotaApi.ts src/server/api/executarRotaApi.test.ts
git commit -m "feat(api): base da paginação por cursor"
```

---

### Task 5: Listagens paginadas nos serviços

**Files:**
- Modify: `src/server/services/titulo.ts:188-255` (`listarTitulos`)
- Modify: `src/server/services/lancamentoBancario.ts:67-73` (`listarLancamentos`)
- Create: `src/server/services/listagemPaginada.test.ts`

**Interfaces:**
- Consumes (Task 4): `Paginacao`, `Pagina`, `CursorInvalidoError`, `argumentosDeCursor`, `montarPagina`.
- Produces:
  - `type FiltroTitulosApi = Pick<FiltroTitulos, "categoriaId" | "contraparteId" | "centroCustoId" | "centroLucroId" | "safraId" | "projetoId" | "classificacao">`
    (sem os filtros de parcela, que filtram depois da busca e encolheriam a página);
  - `listarTitulosPaginado(filialId: string, tipo: TipoTitulo, filtros: FiltroTitulosApi, paginacao: Paginacao)`;
  - `listarLancamentosPaginado(filialId: string, opcoes: { classificacao?: FiltroClassificacao }, paginacao: Paginacao)`;
  - `listarTitulos`/`listarLancamentos` mantêm assinatura e retorno (array); a ordenação ganha `id desc` como desempate.

- [ ] **Step 1: Testes que falham**

Criar `src/server/services/listagemPaginada.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { listarTitulos, listarTitulosPaginado } from "./titulo";
import { listarLancamentos, listarLancamentosPaginado } from "./lancamentoBancario";
import { CursorInvalidoError, type Pagina } from "./paginacao";

// Todos com o mesmo criadoEm/data: força o desempate por id.
const MESMO_INSTANTE = new Date("2026-01-15T12:00:00Z");

async function percorrer<T extends { id: string }>(buscar: (cursor?: string) => Promise<Pagina<T>>) {
  const paginas: string[][] = [];
  let cursor: string | undefined;
  do {
    const pagina = await buscar(cursor);
    paginas.push(pagina.itens.map((item) => item.id));
    cursor = pagina.proximoCursor ?? undefined;
  } while (cursor);
  return paginas;
}

describe("listagens paginadas", () => {
  let fixture: FixtureFinanceiro;
  let outraFilial: FixtureFinanceiro;
  let idsTitulosPagar: string[];
  let idTituloReceber: string;
  let idsLancamentos: string[];
  let idLancamentoOutraFilial: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("PAGIN");
    outraFilial = await criarFixtureFinanceiro("PAGIN2");

    const base = {
      filialId: fixture.filialId,
      documento: "PAG",
      dataEmissao: MESMO_INSTANTE,
      dataCompetencia: MESMO_INSTANTE,
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      criadoEm: MESMO_INSTANTE,
    };
    idsTitulosPagar = [];
    for (let i = 0; i < 5; i++) {
      const titulo = await prisma.titulo.create({
        data: { ...base, tipo: "PAGAR", fornecedorId: fixture.fornecedorId, documento: `PAG-${i}` },
      });
      idsTitulosPagar.push(titulo.id);
    }
    idTituloReceber = (
      await prisma.titulo.create({ data: { ...base, tipo: "RECEBER", clienteId: fixture.clienteId } })
    ).id;

    const lancamento = {
      filialId: fixture.filialId,
      contaBancariaId: fixture.contaBancariaId,
      data: MESMO_INSTANTE,
      tipo: "ENTRADA" as const,
      valor: 10,
      origem: "MANUAL" as const,
      usuarioId: fixture.usuarioId,
      conciliado: true,
    };
    idsLancamentos = [];
    for (let i = 0; i < 5; i++) {
      idsLancamentos.push((await prisma.lancamentoBancario.create({ data: { ...lancamento, descricao: `L-${i}` } })).id);
    }
    idLancamentoOutraFilial = (
      await prisma.lancamentoBancario.create({
        data: {
          ...lancamento,
          filialId: outraFilial.filialId,
          contaBancariaId: outraFilial.contaBancariaId,
          usuarioId: outraFilial.usuarioId,
          descricao: "Outra filial",
        },
      })
    ).id;
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await limparFixtureFinanceiro(outraFilial);
    await prisma.$disconnect();
  });

  const desc = (ids: string[]) => [...ids].sort().reverse();

  test("títulos: percorre tudo em páginas de 2, sem repetir nem pular, em id desc no empate", async () => {
    const paginas = await percorrer((cursor) =>
      listarTitulosPaginado(fixture.filialId, "PAGAR", {}, { limite: 2, cursor }),
    );

    expect(paginas.map((p) => p.length)).toEqual([2, 2, 1]);
    expect(paginas.flat()).toEqual(desc(idsTitulosPagar));
  });

  test("títulos: cursor de outro tipo ou inexistente -> CursorInvalidoError", async () => {
    await expect(
      listarTitulosPaginado(fixture.filialId, "PAGAR", {}, { limite: 2, cursor: idTituloReceber }),
    ).rejects.toBeInstanceOf(CursorInvalidoError);
    await expect(
      listarTitulosPaginado(fixture.filialId, "PAGAR", {}, { limite: 2, cursor: "nao-existe" }),
    ).rejects.toBeInstanceOf(CursorInvalidoError);
  });

  test("títulos: a listagem das telas continua devolvendo o array na mesma ordem", async () => {
    const titulos = await listarTitulos(fixture.filialId, "PAGAR");
    expect(titulos.map((t) => t.id)).toEqual(desc(idsTitulosPagar));
  });

  test("lançamentos: percorre tudo em páginas de 2, sem repetir nem pular", async () => {
    const paginas = await percorrer((cursor) =>
      listarLancamentosPaginado(fixture.filialId, {}, { limite: 2, cursor }),
    );

    expect(paginas.map((p) => p.length)).toEqual([2, 2, 1]);
    expect(paginas.flat()).toEqual(desc(idsLancamentos));
  });

  test("lançamentos: cursor de outra filial -> CursorInvalidoError", async () => {
    await expect(
      listarLancamentosPaginado(fixture.filialId, {}, { limite: 2, cursor: idLancamentoOutraFilial }),
    ).rejects.toBeInstanceOf(CursorInvalidoError);
  });

  test("lançamentos: a listagem das telas continua devolvendo o array", async () => {
    const lancamentos = await listarLancamentos(fixture.filialId);
    expect(lancamentos.map((l) => l.id)).toEqual(desc(idsLancamentos));
  });
});
```

Antes de rodar, conferir em `financeiroTestFixtures.ts` (`limparFixtureFinanceiro`, ~linha 124) que títulos e lançamentos da filial são apagados. Se não forem, apagar no `afterAll` deste teste com `prisma.lancamentoBancario.deleteMany({ where: { filialId } })` e `prisma.titulo.deleteMany({ where: { filialId } })` antes de limpar a fixture. Conferir também, no model `LancamentoBancario`, que os campos usados acima (`origem`, `usuarioId`, `conciliado`) são os obrigatórios. Eles são os mesmos de `fluxoDeCaixaEstrategico.test.ts:125`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/listagemPaginada.test.ts`

Esperado: FAIL (`listarTitulosPaginado` não existe).

- [ ] **Step 3: Implementar em `titulo.ts`**

- No import de tipos de `@prisma/client`, acrescentar `Prisma`.
- Importar:

```ts
import {
  argumentosDeCursor,
  CursorInvalidoError,
  montarPagina,
  type Pagina,
  type Paginacao,
} from "@/server/services/paginacao";
```

- Substituir `listarTitulos` (linhas 188-255) por:

```ts
/** Filtros aceitos pela API: sem os de parcela, que filtram depois da busca e encolheriam a página. */
export type FiltroTitulosApi = Pick<
  FiltroTitulos,
  "categoriaId" | "contraparteId" | "centroCustoId" | "centroLucroId" | "safraId" | "projetoId" | "classificacao"
>;

const INCLUDE_LISTAGEM_TITULOS = {
  _count: { select: { anexos: true } },
  fornecedor: true,
  cliente: true,
  categoriaFinanceira: true,
  centroCusto: true,
  centroLucro: true,
  safra: true,
  projeto: true,
  contaBancaria: { include: { banco: true } },
  parcelas: { include: { baixas: true }, orderBy: { numero: "asc" } },
} satisfies Prisma.TituloInclude;

/** `id` desempata títulos criados no mesmo instante — sem ele a paginação repete ou pula itens. */
const ORDEM_LISTAGEM_TITULOS = [
  { criadoEm: "desc" },
  { id: "desc" },
] satisfies Prisma.TituloOrderByWithRelationInput[];

type TituloListado = Prisma.TituloGetPayload<{ include: typeof INCLUDE_LISTAGEM_TITULOS }>;

function whereListagemTitulos(filialId: string, tipo: TipoTitulo, filtros: FiltroTitulosApi): Prisma.TituloWhereInput {
  return {
    filialId,
    tipo,
    ...(filtros.categoriaId && { categoriaFinanceiraId: filtros.categoriaId }),
    ...(filtros.contraparteId &&
      (tipo === "PAGAR" ? { fornecedorId: filtros.contraparteId } : { clienteId: filtros.contraparteId })),
    ...(filtros.centroCustoId && { centroCustoId: filtros.centroCustoId }),
    ...(filtros.centroLucroId && { centroLucroId: filtros.centroLucroId }),
    ...(filtros.safraId && { safraId: filtros.safraId }),
    ...(filtros.projetoId && { projetoId: filtros.projetoId }),
    ...(filtros.classificacao && { classificacaoFiscal: filtros.classificacao }),
  };
}

/**
 * Recalcula em memória a partir das parcelas/baixas já carregadas e persiste as
 * divergências com um `updateMany` por status — evita 1 SELECT + 1 UPDATE por parcela.
 * Atualiza os objetos recebidos para ficarem coerentes com o que foi persistido.
 */
async function sincronizarStatusDasParcelas(titulos: TituloListado[]): Promise<void> {
  const hoje = new Date();
  const idsPorStatus = new Map<StatusParcela, string[]>();

  for (const titulo of titulos) {
    for (const parcela of titulo.parcelas) {
      const statusCalculado = calcularStatusParcela(
        {
          valorAtualizado: Number(parcela.valorAtualizado),
          dataVencimento: parcela.dataVencimento,
          status: parcela.status,
        },
        parcela.baixas
          .filter((baixa) => baixa.statusAprovacao === "APROVADO")
          .map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
        hoje,
      );

      if (statusCalculado !== parcela.status) {
        const ids = idsPorStatus.get(statusCalculado);
        if (ids) ids.push(parcela.id);
        else idsPorStatus.set(statusCalculado, [parcela.id]);
        parcela.status = statusCalculado;
      }
    }
  }

  for (const [status, ids] of idsPorStatus) {
    await prisma.parcela.updateMany({ where: { id: { in: ids } }, data: { status } });
  }
}

export async function listarTitulos(filialId: string, tipo: TipoTitulo, filtros: FiltroTitulos = {}) {
  const titulos = await prisma.titulo.findMany({
    where: whereListagemTitulos(filialId, tipo, filtros),
    include: INCLUDE_LISTAGEM_TITULOS,
    orderBy: ORDEM_LISTAGEM_TITULOS,
  });
  await sincronizarStatusDasParcelas(titulos);

  const temFiltroDeParcela =
    filtros.status !== undefined || filtros.vencimentoDe !== undefined || filtros.vencimentoAte !== undefined;
  if (!temFiltroDeParcela) return titulos;

  return titulos.filter((titulo) => titulo.parcelas.some((parcela) => parcelaBateFiltroDeParcela(parcela, filtros)));
}

/** Versão da API: uma página por vez, ordenada por criação (mais novo primeiro). */
export async function listarTitulosPaginado(
  filialId: string,
  tipo: TipoTitulo,
  filtros: FiltroTitulosApi,
  paginacao: Paginacao,
): Promise<Pagina<TituloListado>> {
  if (paginacao.cursor) {
    const doCursor = await prisma.titulo.findFirst({
      where: { id: paginacao.cursor, filialId, tipo },
      select: { id: true },
    });
    if (!doCursor) throw new CursorInvalidoError();
  }

  const linhas = await prisma.titulo.findMany({
    where: whereListagemTitulos(filialId, tipo, filtros),
    include: INCLUDE_LISTAGEM_TITULOS,
    orderBy: ORDEM_LISTAGEM_TITULOS,
    ...argumentosDeCursor(paginacao),
  });
  const pagina = montarPagina(linhas, paginacao.limite);
  await sincronizarStatusDasParcelas(pagina.itens);
  return pagina;
}
```

Se `satisfies` com array de `orderBy` der erro de tipo (literal `"desc"` alargado), declarar como
`const ORDEM_LISTAGEM_TITULOS: Prisma.TituloOrderByWithRelationInput[] = [{ criadoEm: "desc" }, { id: "desc" }];`.

- [ ] **Step 4: Implementar em `lancamentoBancario.ts`**

- Imports: `import type { Prisma, TipoComprovante } from "@prisma/client";` (troca o import atual de `TipoComprovante`) e

```ts
import {
  argumentosDeCursor,
  CursorInvalidoError,
  montarPagina,
  type Paginacao,
} from "@/server/services/paginacao";
```

- Substituir `listarLancamentos` (linhas 67-73) por:

```ts
/** `id` desempata lançamentos da mesma data — sem ele a paginação repete ou pula itens. */
const ORDEM_LISTAGEM_LANCAMENTOS: Prisma.LancamentoBancarioOrderByWithRelationInput[] = [
  { data: "desc" },
  { id: "desc" },
];

export async function listarLancamentos(filialId: string, opcoes: { classificacao?: FiltroClassificacao } = {}) {
  return prisma.lancamentoBancario.findMany({
    where: { filialId, ...whereLancamentoPorClassificacao(opcoes.classificacao) },
    include: { contaBancaria: { include: { banco: true } } },
    orderBy: ORDEM_LISTAGEM_LANCAMENTOS,
  });
}

/** Versão da API: uma página por vez, ordenada por data (mais recente primeiro). */
export async function listarLancamentosPaginado(
  filialId: string,
  opcoes: { classificacao?: FiltroClassificacao },
  paginacao: Paginacao,
) {
  if (paginacao.cursor) {
    const doCursor = await prisma.lancamentoBancario.findFirst({
      where: { id: paginacao.cursor, filialId },
      select: { id: true },
    });
    if (!doCursor) throw new CursorInvalidoError();
  }

  const linhas = await prisma.lancamentoBancario.findMany({
    where: { filialId, ...whereLancamentoPorClassificacao(opcoes.classificacao) },
    include: { contaBancaria: { include: { banco: true } } },
    orderBy: ORDEM_LISTAGEM_LANCAMENTOS,
    ...argumentosDeCursor(paginacao),
  });
  return montarPagina(linhas, paginacao.limite);
}
```

- [ ] **Step 5: Rodar e ver passar, mais regressão das telas**

Run: `npx vitest run src/server/services/listagemPaginada.test.ts src/server/services/titulo src/server/services/lancamentoBancario; npx tsc --noEmit`

Esperado: PASS e sem erros de tipo. Os testes existentes de `titulo`/`lancamentoBancario` continuam passando.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/titulo.ts src/server/services/lancamentoBancario.ts src/server/services/listagemPaginada.test.ts
git commit -m "feat(api): listagens paginadas de títulos e lançamentos"
```

---

### Task 6: Rotas `GET` paginadas

**Files:**
- Modify: `src/app/api/v1/titulos/route.ts:141-154`
- Modify: `src/app/api/v1/titulos/route.test.ts`
- Modify: `src/app/api/v1/lancamentos-bancarios/route.ts:120-127`
- Modify: `src/app/api/v1/lancamentos-bancarios/route.test.ts`

**Interfaces:**
- Consumes: `paginacaoDaQuery` (Task 4), `listarTitulosPaginado`, `listarLancamentosPaginado` (Task 5).

- [ ] **Step 1: Ajustar testes existentes e escrever os novos**

Em `titulos/route.test.ts`:

- teste "GET lista os títulos PAGAR da filial...": trocar as duas últimas linhas por

```ts
    expect(Array.isArray(corpo.itens)).toBe(true);
    expect(corpo).toHaveProperty("proximoCursor");
    expect(corpo.itens.some((t: { documento: string }) => t.documento === "NF-API-1")).toBe(true);
```

- teste "GET ?classificacao= filtra...": cada `await (await get(...)).json()` vira `(await (await get(...)).json()).itens`;
- adicionar no fim do `describe` principal:

```ts
  describe("paginação do GET", () => {
    const get = (query: string) =>
      GET(new Request(`http://localhost/api/v1/titulos?tipo=PAGAR${query}`, { headers: headers(chaveCompleta) }));

    test("percorre pelo proximoCursor e chega no mesmo resultado da página grande", async () => {
      const tudo = (await (await get("&limite=500")).json()).itens.map((t: { id: string }) => t.id);
      expect(tudo.length).toBeGreaterThan(3);

      const percorridos: string[] = [];
      let cursor: string | null = null;
      do {
        const resposta = await get(`&limite=3${cursor ? `&cursor=${cursor}` : ""}`);
        expect(resposta.status).toBe(200);
        const corpo = await resposta.json();
        expect(corpo.itens.length).toBeLessThanOrEqual(3);
        percorridos.push(...corpo.itens.map((t: { id: string }) => t.id));
        cursor = corpo.proximoCursor;
      } while (cursor);

      expect(percorridos).toEqual(tudo);
    });

    test("limite fora de 1..500 -> 422 no campo limite", async () => {
      for (const limite of ["0", "501", "abc"]) {
        const resposta = await get(`&limite=${limite}`);
        expect(resposta.status).toBe(422);
        expect((await resposta.json()).campos).toEqual(["limite"]);
      }
    });

    test("cursor inválido -> 422 no campo cursor", async () => {
      const resposta = await get("&cursor=nao-existe");
      expect(resposta.status).toBe(422);
      expect(await resposta.json()).toEqual({ erro: "Cursor inválido para esta listagem", campos: ["cursor"] });
    });
  });
```

Em `lancamentos-bancarios/route.test.ts`:

- teste "GET lista os lançamentos da filial": trocar `corpo.some(` por `corpo.itens.some(` e acrescentar
  `expect(corpo.proximoCursor).toBeNull();`;
- teste de classificação: `const gerenciais = (await lista.json()).itens;`;
- adicionar:

```ts
  test("GET paginado: limite=1 devolve um item e o cursor leva ao próximo", async () => {
    const get = (query: string) =>
      GET(new Request(`http://localhost/api/v1/lancamentos-bancarios${query}`, { headers: headers() }));

    const primeira = await (await get("?limite=1")).json();
    expect(primeira.itens).toHaveLength(1);
    expect(primeira.proximoCursor).toBe(primeira.itens[0].id);

    const segunda = await (await get(`?limite=1&cursor=${primeira.proximoCursor}`)).json();
    expect(segunda.itens).toHaveLength(1);
    expect(segunda.itens[0].id).not.toBe(primeira.itens[0].id);

    expect((await get("?cursor=nao-existe")).status).toBe(422);
  });
```

(Esse teste fica depois do de classificação, que já criou 2 lançamentos além do primeiro.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/api/v1/titulos src/app/api/v1/lancamentos-bancarios`

Esperado: FAIL (a resposta ainda é array; `corpo.itens` indefinido).

- [ ] **Step 3: Implementar**

Em `titulos/route.ts`:

- import:
  `import { executarRotaApi, ErroValidacaoApi, classificacaoDaQuery, paginacaoDaQuery } from "@/server/api/executarRotaApi";`
- import:
  `import { criarTitulo, listarTitulosPaginado } from "@/server/services/titulo";`
- no `GET`, trocar as duas últimas linhas por:

```ts
    const pagina = await listarTitulosPaginado(
      sessao.filialId,
      tipo,
      { classificacao: classificacaoDaQuery(url) },
      paginacaoDaQuery(url),
    );
    return Response.json(pagina, { status: 200 });
```

Em `lancamentos-bancarios/route.ts`:

- import:
  `import { executarRotaApi, ErroValidacaoApi, classificacaoDaQuery, paginacaoDaQuery } from "@/server/api/executarRotaApi";`
- import:
  `import { criarLancamentoManual, listarLancamentosPaginado } from "@/server/services/lancamentoBancario";`
- `GET`:

```ts
export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "lancamento:ler");
    const url = new URL(request.url);
    const pagina = await listarLancamentosPaginado(
      sessao.filialId,
      { classificacao: classificacaoDaQuery(url) },
      paginacaoDaQuery(url),
    );
    return Response.json(pagina, { status: 200 });
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/app/api/v1`

Esperado: PASS em todas as rotas da API.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/titulos src/app/api/v1/lancamentos-bancarios
git commit -m "feat(api): GET de títulos e lançamentos paginados por cursor"
```

---

### Task 7: Documentação, verificação final e conferência na tela

**Files:**
- Modify: `docs/api-v1.md`
- Modify: `docs/backlog.md:215-224`
- Modify: `docs/superpowers/specs/2026-09-15-api-rest-automacao-design.md:412-414`
- Modify: `docs/superpowers/specs/2026-11-17-protecoes-api-design.md:3`

- [ ] **Step 1: `docs/api-v1.md`**

1. Seção 1, depois do passo 4 ("Em 'Nova chave'..."), inserir o passo e renumerar o seguinte para 6:

```markdown
5. Escolha a **Validade**: Sem validade (padrão), 30 dias, 90 dias ou 1 ano. Depois do prazo a chave para de funcionar (`401 "Chave de API expirada"`) e a lista mostra "Expirada"; gere outra para substituir.
```

2. Tabela da seção 2, depois da linha "Chave inválida, revogada...":

```markdown
| Chave expirada | 401 |
```

3. Tabela da seção 4, antes de "Erro inesperado":

```markdown
| Limite de requisições atingido (ver abaixo) | 429 |
```

4. Logo depois da tabela da seção 4, nova subseção:

```markdown
### Limite de requisições

Cada chave pode fazer **60 requisições por minuto**, somando todas as rotas (`GET` e `POST`). A janela é o minuto do relógio: o contador zera na virada. Passou disso, a resposta é `429` com o header `Retry-After` (segundos até a próxima janela):

```json
{ "erro": "Limite de 60 requisições por minuto atingido. Tente de novo em 17 s." }
```

Espere `Retry-After` segundos e reenvie. Uma requisição bloqueada não grava nada (nem reserva a `Idempotency-Key`).
```

5. Em `GET /titulos`, depois do item `?classificacao=`, acrescentar:

```markdown
- **Paginado:** `?limite=` (1 a 500, padrão 100) e `?cursor=`. A resposta é `{ "itens": [...], "proximoCursor": "<id>" | null }`, do mais novo para o mais antigo. Para a próxima página, repita a mesma URL com `&cursor=<proximoCursor>`; `null` = acabou. `limite` fora da faixa ou cursor que não é desta listagem → `422` (`campos: ["limite"]` ou `["cursor"]`).

```
GET /titulos?tipo=PAGAR&limite=100
→ { "itens": [ ...100 títulos... ], "proximoCursor": "8c1e..." }
GET /titulos?tipo=PAGAR&limite=100&cursor=8c1e...
→ { "itens": [ ...37 títulos... ], "proximoCursor": null }
```
```

6. Em `GET /lancamentos-bancarios`, acrescentar:

```markdown
- **Paginado** igual a `GET /titulos` (`?limite=`, `?cursor=`, resposta `{ itens, proximoCursor }`), da data mais recente para a mais antiga.
```

7. Seção 6, `POST /titulos`, linha "Resposta `201`... (guarde esse id...)": trocar a referência de onde pegar o id da parcela de `GET /titulos` por "`GET /titulos` (em `itens[].parcelas[].id`)". Na seção `POST /baixas`, ajustar igual: "cada título em `itens` vem com `parcelas[].id`".

8. Seção 8 (Postman), passo 6: "Pegue o `parcelas[0].id` da resposta do `POST /titulos`" (sem mudança de sentido; conferir que não fala de array no `GET`).

- [ ] **Step 2: Backlog e specs**

- `docs/backlog.md`: remover a seção inteira `## API REST — robustez` (título e item).
- `docs/superpowers/specs/2026-09-15-api-rest-automacao-design.md`, linhas 412-414: trocar `**→ backlog.**` por `**feito ([proteções da API](2026-11-17-protecoes-api-design.md)).**` nos três itens.
- `docs/superpowers/specs/2026-11-17-protecoes-api-design.md`, linha 3: `Status: desenho aprovado` → `Status: implementada (2026-11-17)`.

- [ ] **Step 3: Verificação completa**

Run (PowerShell): `Set-Location D:\Projetos\nx-control-erp; npx tsc --noEmit; npm run lint; npx vitest run`

Esperado: sem erros de tipo, lint limpo e a suíte inteira passando. Se algum teste fora da API quebrar, a causa provável é a ordenação nova com `id` (`listarTitulos`/`listarLancamentos`). Investigar antes de mexer.

- [ ] **Step 4: Conferir a tela no navegador**

1. Subir `npm run dev` e entrar com `admin@nx-control-erp.local` / `TrocarSenha123!` (Empresa Demonstração).
2. Ir em **Usuários** e abrir **Chaves de API** de um usuário.
3. Gerar "Teste validade" com 30 dias. A lista mostra "Expira em <hoje+30>" e o botão Revogar.
4. Gerar "Teste sem validade" sem mudar o select. A lista mostra "Sem validade".
5. No banco, expirar a primeira:
   `docker exec -i nx-control-erp-db psql -U postgres -d nx_control_erp -c "UPDATE api_keys SET \"expiraEm\" = now() - interval '1 day' WHERE nome = 'Teste validade';"`
6. Reabrir o diálogo. Ela mostra "Expirada" e não tem Revogar.
7. Fazer uma chamada `GET /api/v1/fornecedores` com a chave expirada (curl). Esperado: `401 {"erro":"Chave de API expirada"}`.
8. Apagar as duas chaves de teste do banco:
   `DELETE FROM api_keys WHERE nome IN ('Teste validade','Teste sem validade');`
9. Apagar `.playwright-mcp/` se foi criada.

- [ ] **Step 5: Commit**

```bash
git add docs/api-v1.md docs/backlog.md docs/superpowers/specs/2026-09-15-api-rest-automacao-design.md docs/superpowers/specs/2026-11-17-protecoes-api-design.md
git commit -m "docs(api): paginação, limite de requisições e validade da chave"
```
