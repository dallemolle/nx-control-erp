# Conciliação em grupo (N:1 / 1:N / N:M) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir conciliar N linhas do extrato com M lançamentos (somas com sinal iguais), manualmente, com lançamento opcional da diferença.

**Architecture:** Um model `GrupoConciliacao` substitui o vínculo `LinhaExtrato.lancamentoBancarioId @unique`; linhas e lançamentos apontam para o grupo. Todo vínculo (1:1 automático, 1:1 manual, criar a partir da linha e o grupo novo) passa por um helper `vincularEmGrupo`; desconciliar desfaz o grupo inteiro. A conta da diferença é uma função pura em `src/lib`, usada pelo serviço e pelo dialog.

**Tech Stack:** Next.js (App Router, server actions), Prisma + PostgreSQL 16, Zod, Vitest, Base UI (componentes em `src/components/ui`).

**Spec:** `docs/superpowers/specs/2026-11-16-conciliacao-grupo-design.md`

## Global Constraints

- Só conciliação **manual** em grupo; o automático (`processarLinhasPendentes`) continua 1:1.
- Soma **exata**, em centavos inteiros, com sinal (ENTRADA positiva, SAIDA negativa). Sem tolerância.
- N:M permitido. Grupo exige ≥ 1 linha e ≥ 1 lançamento (o lançamento da diferença conta).
- Todas as linhas e lançamentos do grupo são da mesma `contaBancariaId`, da filial ativa.
- `LancamentoBancario.conciliado` permanece; em conta não-Caixa, `conciliado = true` ⇔ `grupoConciliacaoId != null`.
- Valor e tipo do lançamento da diferença são calculados no servidor, nunca vêm do cliente; data = maior data entre as linhas do grupo.
- Desconciliar desfaz o grupo inteiro; lançamentos criados (diferença / a partir da linha) não são apagados.
- Ambiente: rodar Vitest pelo **PowerShell** (`Set-Location D:\Projetos\nx-control-erp; npx vitest run ...`), nunca pelo Bash. Após migration, rodar `npx prisma generate`.
- Arquivos têm CRLF no working tree: editar com a ferramenta Edit. **Nunca** rodar Prettier. Linhas até ~120 colunas.
- Nunca reescrever arquivo com `Get-Content -Raw | Set-Content` (corrompe acentos).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File Structure

| Arquivo | Papel |
|---|---|
| `src/lib/conciliacaoGrupo.ts` (novo) | `somaEmCentavos`, `diferencaDoGrupo` — puras, usadas no servidor e no cliente |
| `src/lib/conciliacaoGrupo.test.ts` (novo) | testes unitários das funções puras |
| `prisma/schema.prisma` | model `GrupoConciliacao`; troca de vínculo em `LinhaExtrato`/`LancamentoBancario` |
| `prisma/migrations/20261117000000_conciliacao_grupo/migration.sql` (novo) | DDL + conversão dos vínculos 1:1 em grupos |
| `src/server/services/conciliacao.ts` | `vincularEmGrupo`, refator das funções 1:1, `conciliarEmGrupo`, `buscarCandidatosParaGrupo` |
| `src/server/services/conciliacao.test.ts` | ajuste dos testes 1:1 + testes de grupo |
| `src/server/services/pedidoVenda.ts` / `.test.ts` | checagem de "conciliado" pelo grupo |
| `src/server/services/financeiroTestFixtures.ts`, `producaoTestFixtures.ts` | limpar grupos |
| `src/app/(dashboard)/financeiro/conciliacao/export/route.ts` | coluna "Lançamento vinculado" pelo grupo |
| `src/lib/schemas/conciliacao.ts` | `lancamentoAvulsoSchema` (sem `linhaExtratoId`) |
| `src/app/(dashboard)/financeiro/conciliacao/actions.ts` | `buscarCandidatosParaGrupoAction`, `conciliarEmGrupoAction` |
| `src/app/(dashboard)/financeiro/conciliacao/campos-lancamento-avulso.tsx` (novo) | campos de descrição/classificação/categoria/dimensões, extraídos do dialog "Criar lançamento" |
| `src/app/(dashboard)/financeiro/conciliacao/criar-lancamento-dialog-form.tsx` | passa a usar `CamposLancamentoAvulso` |
| `src/app/(dashboard)/financeiro/conciliacao/conciliar-grupo-dialog.tsx` (novo) | dialog "Conciliar em grupo" |
| `src/app/(dashboard)/financeiro/conciliacao/linha-extrato-actions.tsx`, `page.tsx` | botão do grupo, resumo do grupo, confirmação ao desconciliar |
| `content/ajuda/passo-a-passo.md`, `docs/fases/fase-3-conciliacao.md`, `docs/backlog.md` | documentação |

---

### Task 1: Funções puras da diferença do grupo

**Files:**
- Create: `src/lib/conciliacaoGrupo.ts`
- Test: `src/lib/conciliacaoGrupo.test.ts`

**Interfaces:**
- Produces:
  - `type ItemComSinal = { valor: number; tipo: "ENTRADA" | "SAIDA" }`
  - `somaEmCentavos(itens: ItemComSinal[]): number` — inteiro, ENTRADA soma, SAIDA subtrai
  - `diferencaDoGrupo(linhas: ItemComSinal[], lancamentos: ItemComSinal[]): number` — `somaEmCentavos(linhas) - somaEmCentavos(lancamentos)`

- [ ] **Step 1: Write the failing test**

`src/lib/conciliacaoGrupo.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { diferencaDoGrupo, somaEmCentavos } from "./conciliacaoGrupo";

describe("somaEmCentavos", () => {
  test("entrada soma e saída subtrai", () => {
    expect(
      somaEmCentavos([
        { valor: 100, tipo: "ENTRADA" },
        { valor: 30.5, tipo: "SAIDA" },
      ]),
    ).toBe(6950);
  });

  test("não acumula erro de ponto flutuante", () => {
    expect(
      somaEmCentavos([
        { valor: 0.1, tipo: "ENTRADA" },
        { valor: 0.2, tipo: "ENTRADA" },
      ]),
    ).toBe(30);
  });

  test("lista vazia é zero", () => {
    expect(somaEmCentavos([])).toBe(0);
  });
});

describe("diferencaDoGrupo", () => {
  test("PIX de 1.000 quitando duas parcelas de 500 fecha", () => {
    expect(
      diferencaDoGrupo(
        [{ valor: 1000, tipo: "ENTRADA" }],
        [
          { valor: 500, tipo: "ENTRADA" },
          { valor: 500, tipo: "ENTRADA" },
        ],
      ),
    ).toBe(0);
  });

  test("PIX de 995 contra 1.000 lançados: falta uma saída de 5,00", () => {
    expect(
      diferencaDoGrupo(
        [{ valor: 995, tipo: "ENTRADA" }],
        [{ valor: 1000, tipo: "ENTRADA" }],
      ),
    ).toBe(-500);
  });

  test("entrada e tarifa misturadas fecham com sinal", () => {
    expect(
      diferencaDoGrupo(
        [{ valor: 995, tipo: "ENTRADA" }],
        [
          { valor: 1000, tipo: "ENTRADA" },
          { valor: 5, tipo: "SAIDA" },
        ],
      ),
    ).toBe(0);
  });

  test("sem lançamentos, a diferença é o total das linhas", () => {
    expect(diferencaDoGrupo([{ valor: 12.34, tipo: "SAIDA" }], [])).toBe(-1234);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (PowerShell): `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/lib/conciliacaoGrupo.test.ts`
Expected: FAIL — `Failed to resolve import "./conciliacaoGrupo"`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/conciliacaoGrupo.ts`:

```ts
/**
 * Conta da conciliação em grupo, sem I/O — usada pelo serviço (que confere)
 * e pelo dialog (que mostra os totais enquanto o usuário marca os itens).
 * Tudo em centavos inteiros para não acumular erro de ponto flutuante.
 */
export type ItemComSinal = { valor: number; tipo: "ENTRADA" | "SAIDA" };

export function somaEmCentavos(itens: ItemComSinal[]): number {
  return itens.reduce((total, item) => {
    const centavos = Math.round(item.valor * 100);
    return item.tipo === "ENTRADA" ? total + centavos : total - centavos;
  }, 0);
}

/** Σ linhas − Σ lançamentos. Zero = o grupo fecha; positivo = falta uma ENTRADA; negativo = falta uma SAIDA. */
export function diferencaDoGrupo(linhas: ItemComSinal[], lancamentos: ItemComSinal[]): number {
  return somaEmCentavos(linhas) - somaEmCentavos(lancamentos);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/lib/conciliacaoGrupo.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/conciliacaoGrupo.ts src/lib/conciliacaoGrupo.test.ts
git commit -m @'
feat(conciliacao): conta da diferença do grupo em centavos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 2: Model `GrupoConciliacao`, migration e vínculo 1:1 via grupo

Troca o vínculo no schema e mantém todo o comportamento 1:1 atual funcionando sobre grupos. Tudo nesta task precisa entrar junto: o schema novo quebra a compilação de quem usa `lancamentoBancarioId`.

**Files:**
- Modify: `prisma/schema.prisma` (models `Filial` ~l.158, `Usuario` ~l.192, `ContaBancaria` ~l.519, `LancamentoBancario` ~l.710, `LinhaExtrato` ~l.775)
- Create: `prisma/migrations/20261117000000_conciliacao_grupo/migration.sql`
- Modify: `src/server/services/conciliacao.ts`
- Modify: `src/server/services/conciliacao.test.ts`
- Modify: `src/server/services/financeiroTestFixtures.ts:124-127`
- Modify: `src/server/services/producaoTestFixtures.ts:59-62`
- Modify: `src/server/services/pedidoVenda.ts:288-298`
- Modify: `src/server/services/pedidoVenda.test.ts:618-650`
- Modify: `src/app/(dashboard)/financeiro/conciliacao/export/route.ts:28`
- Modify: `src/app/(dashboard)/financeiro/conciliacao/page.tsx:109-119`
- Modify: `src/app/(dashboard)/financeiro/conciliacao/linha-extrato-actions.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  - Prisma: `prisma.grupoConciliacao`; campos `LinhaExtrato.grupoConciliacaoId: string | null`, `LancamentoBancario.grupoConciliacaoId: string | null`; relações `grupoConciliacao`, `GrupoConciliacao.linhas`, `GrupoConciliacao.lancamentos`.
  - Em `conciliacao.ts` (internos, não exportados): `class ItemJaConciliadoError extends Error`; `vincularEmGrupo(tx: Prisma.TransactionClient, dados: { filialId: string; contaBancariaId: string; usuarioId: string; linhaIds: string[]; lancamentoIds: string[] }): Promise<string>` (retorna o id do grupo); `janelaDeBusca(data: Date): { gte: Date; lte: Date }`.
  - `listarLinhasExtrato` passa a incluir `grupoConciliacao: { lancamentos: { id, descricao }[]; _count: { linhas: number } } | null` (sem `lancamentoBancario`).
  - `LinhaExtratoActions` recebe a prop `grupo: { linhas: number; lancamentos: string[] } | null` no lugar de `lancamentoVinculadoDescricao`.

- [ ] **Step 1: Ajustar os testes existentes para o vínculo por grupo (falham)**

Em `src/server/services/conciliacao.test.ts`, logo após `function arquivoOfx(...)` (l.86-88), adicionar:

```ts
async function lancamentosDoGrupoDaLinha(linhaId: string): Promise<string[]> {
  const linha = await prisma.linhaExtrato.findUniqueOrThrow({
    where: { id: linhaId },
    include: { grupoConciliacao: { include: { lancamentos: { select: { id: true } } } } },
  });
  return linha.grupoConciliacao?.lancamentos.map((l) => l.id) ?? [];
}
```

Trocar cada asserção sobre `lancamentoBancarioId`:

- l.199: `expect(linhaConciliada?.lancamentoBancarioId).toBe(lancamento.id);` →
  `expect(await lancamentosDoGrupoDaLinha(linhaConciliada!.id)).toEqual([lancamento.id]);`
- l.258: `expect(linha?.lancamentoBancarioId).toBeNull();` → `expect(linha?.grupoConciliacaoId).toBeNull();`
- l.308: `expect(linhaDepois.lancamentoBancarioId).toBe(lancamento.id);` →
  `expect(await lancamentosDoGrupoDaLinha(linhaDepois.id)).toEqual([lancamento.id]);`
- l.426: `expect(linhaAtualizada.lancamentoBancarioId).toBe(lancamento.id);` →
  `expect(await lancamentosDoGrupoDaLinha(linhaAtualizada.id)).toEqual([lancamento.id]);`
- l.487: `expect(linhaFinal.lancamentoBancarioId).toBeNull();` → `expect(linhaFinal.grupoConciliacaoId).toBeNull();`
  e, logo depois de `expect(lancamentoFinal.conciliado).toBe(false);` (l.490), acrescentar:
  `expect(lancamentoFinal.grupoConciliacaoId).toBeNull();`
- l.534: `expect(linhaFinal.lancamentoBancarioId).toBe(lancamentoA.id);` →
  `expect(await lancamentosDoGrupoDaLinha(linhaFinal.id)).toEqual([lancamentoA.id]);`
- l.584: `expect(linhaAtualizada.lancamentoBancarioId).toBe(lancamento.id);` →
  `expect(await lancamentosDoGrupoDaLinha(linhaAtualizada.id)).toEqual([lancamento.id]);`

Em `src/server/services/pedidoVenda.test.ts`, no teste "recusado quando o recebimento já foi conciliado com o extrato" (l.618-650), trocar o `prisma.linhaExtrato.create({...})` (l.634-646) por:

```ts
      const grupo = await prisma.grupoConciliacao.create({
        data: { filialId: fx.filialAId, contaBancariaId: cad.contaCorrenteId, usuarioId: fx.usuarioId },
      });
      await prisma.linhaExtrato.create({
        data: {
          extratoImportadoId: extrato.id,
          contaBancariaId: cad.contaCorrenteId,
          data: d("2026-11-10"),
          valor: 50,
          tipo: "ENTRADA",
          historico: "PIX RECEBIDO",
          identificadorBancario: `ID-${Date.now()}`,
          status: "CONCILIADO",
          grupoConciliacaoId: grupo.id,
        },
      });
      await prisma.lancamentoBancario.update({
        where: { id: lancamento.id },
        data: { grupoConciliacaoId: grupo.id, conciliado: true },
      });
```

(Conferir que o `valor: 50` do original se mantém — copie o valor exatamente como estava na l.639.)

- [ ] **Step 2: Schema**

Em `prisma/schema.prisma`:

`model Filial` — junto de `extratosImportados ExtratoImportado[]` (l.158), adicionar:
```prisma
  gruposConciliacao       GrupoConciliacao[]
```

`model Usuario` — junto de `extratosImportados ExtratoImportado[]` (l.192), adicionar:
```prisma
  gruposConciliacao         GrupoConciliacao[]
```

`model ContaBancaria` — junto de `linhasExtrato LinhaExtrato[]` (l.520), adicionar:
```prisma
  gruposConciliacao              GrupoConciliacao[]
```

`model LancamentoBancario`: depois de `transferenciaId String?` adicionar `grupoConciliacaoId    String?`; trocar a linha `linhaExtrato        LinhaExtrato?` por
```prisma
  grupoConciliacao    GrupoConciliacao?    @relation(fields: [grupoConciliacaoId], references: [id])
```
e adicionar `@@index([grupoConciliacaoId])` junto dos outros índices.

`model LinhaExtrato`: trocar `lancamentoBancarioId  String?            @unique` por
```prisma
  grupoConciliacaoId    String?
```
trocar `lancamentoBancario LancamentoBancario? @relation(fields: [lancamentoBancarioId], references: [id])` por
```prisma
  grupoConciliacao   GrupoConciliacao?   @relation(fields: [grupoConciliacaoId], references: [id])
```
e adicionar `@@index([grupoConciliacaoId])`.

Novo model, logo depois de `model LinhaExtrato { ... }`:

```prisma
/// Conciliação: N linhas do extrato ↔ M lançamentos da mesma conta, com somas
/// (ENTRADA positiva, SAIDA negativa) iguais. O 1:1 é um grupo 1+1.
model GrupoConciliacao {
  id              String   @id @default(uuid())
  filialId        String
  contaBancariaId String
  usuarioId       String
  criadoEm        DateTime @default(now())

  filial        Filial               @relation(fields: [filialId], references: [id], onDelete: Cascade)
  contaBancaria ContaBancaria        @relation(fields: [contaBancariaId], references: [id])
  usuario       Usuario              @relation(fields: [usuarioId], references: [id])
  linhas        LinhaExtrato[]
  lancamentos   LancamentoBancario[]

  @@index([filialId])
  @@index([contaBancariaId])
  @@map("grupos_conciliacao")
}
```

- [ ] **Step 3: Migration escrita à mão**

Antes de aplicar, garantir um vínculo 1:1 no banco de dev para conferir a conversão. Rodar (PowerShell):

```powershell
@'
SELECT count(*) AS vinculos FROM "linhas_extrato" WHERE "lancamentoBancarioId" IS NOT NULL;
'@ | docker exec -i nx-control-erp-db psql -U postgres -d nx_control_erp
```

Anotar o número (`N`). Se for 0, conciliar uma linha qualquer pela tela antes de seguir (ou seguir e conferir apenas que nada quebrou — registrar no commit que N = 0).

Criar `prisma/migrations/20261117000000_conciliacao_grupo/migration.sql`:

```sql
-- Conciliação em grupo: N linhas do extrato ↔ M lançamentos com somas iguais.
CREATE TABLE "grupos_conciliacao" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grupos_conciliacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "grupos_conciliacao_filialId_idx" ON "grupos_conciliacao"("filialId");
CREATE INDEX "grupos_conciliacao_contaBancariaId_idx" ON "grupos_conciliacao"("contaBancariaId");

ALTER TABLE "grupos_conciliacao" ADD CONSTRAINT "grupos_conciliacao_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grupos_conciliacao" ADD CONSTRAINT "grupos_conciliacao_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grupos_conciliacao" ADD CONSTRAINT "grupos_conciliacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "linhas_extrato" ADD COLUMN "grupoConciliacaoId" TEXT;
ALTER TABLE "lancamentos_bancarios" ADD COLUMN "grupoConciliacaoId" TEXT;

CREATE INDEX "linhas_extrato_grupoConciliacaoId_idx" ON "linhas_extrato"("grupoConciliacaoId");
CREATE INDEX "lancamentos_bancarios_grupoConciliacaoId_idx" ON "lancamentos_bancarios"("grupoConciliacaoId");

ALTER TABLE "linhas_extrato" ADD CONSTRAINT "linhas_extrato_grupoConciliacaoId_fkey" FOREIGN KEY ("grupoConciliacaoId") REFERENCES "grupos_conciliacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lancamentos_bancarios" ADD CONSTRAINT "lancamentos_bancarios_grupoConciliacaoId_fkey" FOREIGN KEY ("grupoConciliacaoId") REFERENCES "grupos_conciliacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vínculos 1:1 já gravados viram grupos 1+1. O grupo reaproveita o id da linha
-- (uuid já único), quem importou o extrato fica como autor.
INSERT INTO "grupos_conciliacao" ("id", "filialId", "contaBancariaId", "usuarioId")
SELECT l."id", c."filialId", l."contaBancariaId", e."usuarioId"
FROM "linhas_extrato" l
JOIN "contas_bancarias" c ON c."id" = l."contaBancariaId"
JOIN "extratos_importados" e ON e."id" = l."extratoImportadoId"
WHERE l."lancamentoBancarioId" IS NOT NULL;

UPDATE "linhas_extrato" SET "grupoConciliacaoId" = "id" WHERE "lancamentoBancarioId" IS NOT NULL;

UPDATE "lancamentos_bancarios" lb
SET "grupoConciliacaoId" = l."id"
FROM "linhas_extrato" l
WHERE l."lancamentoBancarioId" = lb."id";

-- O vínculo antigo sai.
ALTER TABLE "linhas_extrato" DROP CONSTRAINT "linhas_extrato_lancamentoBancarioId_fkey";
DROP INDEX "linhas_extrato_lancamentoBancarioId_key";
ALTER TABLE "linhas_extrato" DROP COLUMN "lancamentoBancarioId";
```

- [ ] **Step 4: Aplicar a migration e conferir**

```powershell
Set-Location D:\Projetos\nx-control-erp; npx prisma migrate dev; npx prisma generate
```

Expected: migration `20261117000000_conciliacao_grupo` aplicada, sem pedir para gerar outra (se o Prisma propuser uma migration extra, o SQL diverge do schema — comparar nomes de índices/FKs e corrigir o SQL, não o schema).

Conferir que o schema bate com as migrations:

```powershell
npx prisma migrate dev --create-only --name verificacao
```

Expected: "Already in sync, no schema change or pending migration was found." (Se criar uma pasta `*_verificacao`, apagar a pasta e corrigir a divergência.)

Conferir a conversão:

```powershell
@'
SELECT count(*) AS grupos FROM "grupos_conciliacao";
SELECT count(*) AS linhas_com_grupo FROM "linhas_extrato" WHERE "grupoConciliacaoId" IS NOT NULL;
SELECT count(*) AS lancamentos_com_grupo FROM "lancamentos_bancarios" WHERE "grupoConciliacaoId" IS NOT NULL;
'@ | docker exec -i nx-control-erp-db psql -U postgres -d nx_control_erp
```

Expected: os três números iguais a `N` (do Step 3).

- [ ] **Step 5: Fixtures limpam os grupos**

`src/server/services/financeiroTestFixtures.ts`, em `limparFixtureFinanceiro`, depois de
`await prisma.lancamentoBancario.deleteMany({ where: { filialId: fixture.filialId } });` adicionar:

```ts
  await prisma.grupoConciliacao.deleteMany({ where: { filialId: fixture.filialId } });
```

`src/server/services/producaoTestFixtures.ts`, em `limpar`, depois de
`await prisma.lancamentoBancario.deleteMany({ where: filiais });` adicionar:

```ts
      await prisma.grupoConciliacao.deleteMany({ where: filiais });
```

- [ ] **Step 6: Serviço — helper de vínculo e refator das funções 1:1**

Em `src/server/services/conciliacao.ts`:

Imports: trocar o bloco `import type { ... Prisma } from "@prisma/client";` para não importar `Prisma` como tipo e adicionar import de valor:

```ts
import type { ClassificacaoFiscal, StatusLinhaExtrato, TipoComprovante, TipoLancamento } from "@prisma/client";
import { Prisma } from "@prisma/client";
```

Depois de `const UM_DIA_MS = ...` / `dentroDaJanela`, adicionar:

```ts
function janelaDeBusca(data: Date): { gte: Date; lte: Date } {
  return {
    gte: new Date(data.getTime() - JANELA_BUSCA_DIAS * UM_DIA_MS),
    lte: new Date(data.getTime() + JANELA_BUSCA_DIAS * UM_DIA_MS),
  };
}
```

Trocar `buscarCandidatosLancamento` por:

```ts
async function buscarCandidatosLancamento(contaBancariaId: string, tipo: TipoLancamento, data: Date) {
  return prisma.lancamentoBancario.findMany({
    where: { contaBancariaId, tipo, data: janelaDeBusca(data) },
    orderBy: { data: "desc" },
  });
}
```

Logo abaixo, adicionar o helper de vínculo:

```ts
class ItemJaConciliadoError extends Error {
  constructor() {
    super("Algum item foi conciliado por outra pessoa; recarregue a tela");
  }
}

/**
 * Único ponto que grava vínculo de conciliação. Cria o grupo e prende linhas e
 * lançamentos a ele só se ainda estiverem soltos (`grupoConciliacaoId: null`);
 * se outra transação chegou antes, a contagem não bate e tudo é desfeito.
 * Quem chama já conferiu filial, conta e soma.
 */
async function vincularEmGrupo(
  tx: Prisma.TransactionClient,
  dados: { filialId: string; contaBancariaId: string; usuarioId: string; linhaIds: string[]; lancamentoIds: string[] },
): Promise<string> {
  const grupo = await tx.grupoConciliacao.create({
    data: { filialId: dados.filialId, contaBancariaId: dados.contaBancariaId, usuarioId: dados.usuarioId },
  });
  const linhas = await tx.linhaExtrato.updateMany({
    where: { id: { in: dados.linhaIds }, contaBancariaId: dados.contaBancariaId, grupoConciliacaoId: null },
    data: { grupoConciliacaoId: grupo.id, status: "CONCILIADO" },
  });
  const lancamentos = await tx.lancamentoBancario.updateMany({
    where: {
      id: { in: dados.lancamentoIds },
      contaBancariaId: dados.contaBancariaId,
      grupoConciliacaoId: null,
      conciliado: false,
    },
    data: { grupoConciliacaoId: grupo.id, conciliado: true },
  });
  if (linhas.count !== dados.linhaIds.length || lancamentos.count !== dados.lancamentoIds.length) {
    throw new ItemJaConciliadoError();
  }
  return grupo.id;
}
```

Em `processarLinhasPendentes`, trocar o bloco `if (resultado.status === "CONCILIADO" && resultado.lancamentoAutoVinculadoId) { ... }` (até antes do `else`) por:

```ts
    if (resultado.status === "CONCILIADO" && resultado.lancamentoAutoVinculadoId) {
      const lancamentoId = resultado.lancamentoAutoVinculadoId;
      let grupoConciliacaoId: string;
      try {
        grupoConciliacaoId = await prisma.$transaction((tx) =>
          vincularEmGrupo(tx, {
            filialId: sessao.filialId,
            contaBancariaId: linha.contaBancariaId,
            usuarioId: sessao.usuarioId,
            linhaIds: [linha.id],
            lancamentoIds: [lancamentoId],
          }),
        );
      } catch (erro) {
        // Outra pessoa conciliou a linha ou o lançamento no meio da rodada: segue para a próxima.
        if (erro instanceof ItemJaConciliadoError) continue;
        throw erro;
      }

      await registrarAuditoria({
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Conciliacao",
        entidadeId: linha.id,
        acao: "CONCILIAR_AUTOMATICO",
        anterior: { status: "NAO_CONCILIADO" },
        novo: { status: "CONCILIADO", lancamentoBancarioId: lancamentoId, grupoConciliacaoId },
      });
      conciliadasAutomaticamente += 1;
    } else {
```

`listarLinhasExtrato`: trocar `lancamentoBancario: true,` no `include` por:

```ts
      grupoConciliacao: {
        include: {
          lancamentos: { select: { id: true, descricao: true }, orderBy: { data: "asc" } },
          _count: { select: { linhas: true } },
        },
      },
```

`confirmarConciliacaoManual`: trocar `if (linha.lancamentoBancarioId) {` por `if (linha.grupoConciliacaoId) {`, e trocar o `await prisma.$transaction([...]);` + auditoria por:

```ts
  const grupoConciliacaoId = await prisma.$transaction((tx) =>
    vincularEmGrupo(tx, {
      filialId: sessao.filialId,
      contaBancariaId: linha.contaBancariaId,
      usuarioId: sessao.usuarioId,
      linhaIds: [linhaExtratoId],
      lancamentoIds: [lancamentoBancarioId],
    }),
  );

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Conciliacao",
    entidadeId: linhaExtratoId,
    acao: "CONCILIAR",
    anterior: { status: linha.status },
    novo: { status: "CONCILIADO", lancamentoBancarioId, grupoConciliacaoId },
  });
```

`desconciliar`: substituir o corpo inteiro (depois dos dois `require*`) por:

```ts
  const linha = await prisma.linhaExtrato.findFirst({
    where: { id: linhaExtratoId, contaBancaria: { filialId: sessao.filialId } },
    include: {
      grupoConciliacao: {
        include: { linhas: { select: { id: true } }, lancamentos: { select: { id: true } } },
      },
    },
  });
  if (!linha) {
    throw new Error("Linha de extrato não pertence à filial ativa");
  }
  const grupo = linha.grupoConciliacao;
  if (!grupo) {
    throw new Error("Esta linha não está conciliada");
  }

  // Desfaz o grupo inteiro: conciliação parcial não existe.
  await prisma.$transaction([
    prisma.linhaExtrato.updateMany({
      where: { grupoConciliacaoId: grupo.id },
      data: { status: "NAO_CONCILIADO", grupoConciliacaoId: null },
    }),
    prisma.lancamentoBancario.updateMany({
      where: { grupoConciliacaoId: grupo.id },
      data: { conciliado: false, grupoConciliacaoId: null },
    }),
    prisma.grupoConciliacao.delete({ where: { id: grupo.id } }),
  ]);

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Conciliacao",
    entidadeId: linhaExtratoId,
    acao: "DESCONCILIAR",
    anterior: {
      status: "CONCILIADO",
      grupoConciliacaoId: grupo.id,
      linhaIds: grupo.linhas.map((l) => l.id),
      lancamentoIds: grupo.lancamentos.map((l) => l.id),
    },
    novo: { status: "NAO_CONCILIADO" },
  });
```

`criarLancamentoDaLinha`: trocar `if (linha.lancamentoBancarioId) {` por `if (linha.grupoConciliacaoId) {`; no `tx.lancamentoBancario.create`, trocar `conciliado: true,` por `conciliado: false,`; trocar o `await tx.linhaExtrato.update({...}); return criado;` por:

```ts
    await vincularEmGrupo(tx, {
      filialId: sessao.filialId,
      contaBancariaId: linha.contaBancariaId,
      usuarioId: sessao.usuarioId,
      linhaIds: [linhaExtratoId],
      lancamentoIds: [criado.id],
    });

    // Relido depois do vínculo: o retorno já sai com `conciliado` e o grupo.
    return tx.lancamentoBancario.findUniqueOrThrow({ where: { id: criado.id } });
```

- [ ] **Step 7: Pedido de venda, exportação e tela**

`src/server/services/pedidoVenda.ts`, em `situacaoParaCancelar`, trocar:

```ts
    const conciliadas = await db.linhaExtrato.count({
      where: { lancamentoBancario: { baixaId: pedido.baixaAutomaticaId } },
    });
```
por:
```ts
    const conciliadas = await db.lancamentoBancario.count({
      where: { baixaId: pedido.baixaAutomaticaId, grupoConciliacaoId: { not: null } },
    });
```
e no comentário da função (l.268-271) trocar "por isso a checagem é pela linha, não pela flag." por "por isso a checagem é pelo grupo de conciliação, não pela flag."

`src/app/(dashboard)/financeiro/conciliacao/export/route.ts` l.28:

```ts
  {
    rotulo: "Lançamento vinculado",
    valor: (l) => l.grupoConciliacao?.lancamentos.map((lancamento) => lancamento.descricao).join("; ") ?? "",
  },
```

`src/app/(dashboard)/financeiro/conciliacao/page.tsx`, no `<LinhaExtratoActions ...>`, trocar
`lancamentoVinculadoDescricao={linha.lancamentoBancario?.descricao ?? null}` por:

```tsx
                  grupo={
                    linha.grupoConciliacao
                      ? {
                          linhas: linha.grupoConciliacao._count.linhas,
                          lancamentos: linha.grupoConciliacao.lancamentos.map((l) => l.descricao),
                        }
                      : null
                  }
```

`src/app/(dashboard)/financeiro/conciliacao/linha-extrato-actions.tsx`:
- Na desestruturação e no tipo das props, trocar `lancamentoVinculadoDescricao` / `lancamentoVinculadoDescricao: string | null;` por `grupo` / `grupo: { linhas: number; lancamentos: string[] } | null;`.
- Trocar a função `desconciliar` por:

```tsx
  const grupoMaior = grupo !== null && (grupo.linhas > 1 || grupo.lancamentos.length > 1);

  function desconciliar() {
    if (
      grupo &&
      grupoMaior &&
      !window.confirm(
        `Desfaz o grupo inteiro: ${grupo.linhas} ${grupo.linhas === 1 ? "linha" : "linhas"} e ` +
          `${grupo.lancamentos.length} ${grupo.lancamentos.length === 1 ? "lançamento" : "lançamentos"} ` +
          "voltam a pendentes.",
      )
    ) {
      return;
    }
    iniciarTransicao(async () => {
      const resultado = await desconciliarAction(linhaExtratoId);
      if (resultado.erro) setErro(resultado.erro);
    });
  }
```

- No bloco `if (status === "CONCILIADO")`, trocar
  `{lancamentoVinculadoDescricao ? (<span ...>{lancamentoVinculadoDescricao}</span>) : null}` por:

```tsx
        {grupo && grupoMaior ? (
          <div className="text-right text-sm text-muted-foreground">
            <p>
              Grupo: {grupo.linhas} {grupo.linhas === 1 ? "linha" : "linhas"} · {grupo.lancamentos.length}{" "}
              {grupo.lancamentos.length === 1 ? "lançamento" : "lançamentos"}
            </p>
            <ul>
              {grupo.lancamentos.map((descricao, indice) => (
                <li key={indice}>{descricao}</li>
              ))}
            </ul>
          </div>
        ) : grupo?.lancamentos[0] ? (
          <span className="text-sm text-muted-foreground">{grupo.lancamentos[0]}</span>
        ) : null}
```

- [ ] **Step 8: Rodar typecheck e testes**

```powershell
Set-Location D:\Projetos\nx-control-erp; npx tsc --noEmit; npx vitest run src/server/services/conciliacao.test.ts src/server/services/pedidoVenda.test.ts src/lib/conciliacaoGrupo.test.ts
```

Expected: `tsc` sem erros; todos os testes PASS.

Conferir que nada mais usa o vínculo antigo:

Grep `lancamentoBancarioId|linhaExtrato\b|lancamentoBancario:` em `src/` — só podem sobrar: parâmetros/variáveis chamados `lancamentoBancarioId` em `conciliacao.ts`/`actions.ts`/`linha-extrato-actions.tsx`, o campo de auditoria `lancamentoBancarioId` em `baixa.ts:171` e nos `novo:` das auditorias. Nenhum `include`/`where` com `lancamentoBancario` em `linhaExtrato`.

- [ ] **Step 9: Rodar a suíte inteira**

```powershell
Set-Location D:\Projetos\nx-control-erp; npx vitest run
```

Expected: tudo PASS (os relatórios de realizado dependem de `conciliado`, que não mudou de significado).

- [ ] **Step 10: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations/20261117000000_conciliacao_grupo src/server/services/conciliacao.ts src/server/services/conciliacao.test.ts src/server/services/financeiroTestFixtures.ts src/server/services/producaoTestFixtures.ts src/server/services/pedidoVenda.ts src/server/services/pedidoVenda.test.ts "src/app/(dashboard)/financeiro/conciliacao/export/route.ts" "src/app/(dashboard)/financeiro/conciliacao/page.tsx" "src/app/(dashboard)/financeiro/conciliacao/linha-extrato-actions.tsx"
git commit -m @'
feat(conciliacao): vínculo por grupo de conciliação no lugar do 1:1

Os vínculos 1:1 existentes viram grupos 1+1 na migration. Desconciliar
desfaz o grupo inteiro.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 3: `conciliarEmGrupo` e `buscarCandidatosParaGrupo`

**Files:**
- Modify: `src/server/services/conciliacao.ts`
- Test: `src/server/services/conciliacao.test.ts`

**Interfaces:**
- Consumes: `vincularEmGrupo`, `janelaDeBusca`, `ItemJaConciliadoError` (Task 2, internos de `conciliacao.ts`); `diferencaDoGrupo` de `@/lib/conciliacaoGrupo` (Task 1).
- Produces (exportados de `conciliacao.ts`):
  - `type DadosLancamentoAvulso = { descricao: string; categoriaFinanceiraId: string | null; centroCustoId: string | null; centroLucroId: string | null; safraId: string | null; projetoId: string | null; classificacaoFiscal?: ClassificacaoFiscal; tipoComprovante?: TipoComprovante | null }`
  - `conciliarEmGrupo(sessao: SessaoAtiva, entrada: { linhaIds: string[]; lancamentoIds: string[]; lancamentoDiferenca?: DadosLancamentoAvulso }): Promise<{ grupoConciliacaoId: string; lancamentoDiferencaId: string | null }>`
  - `buscarCandidatosParaGrupo(sessao: SessaoAtiva, linhaExtratoId: string): Promise<{ linhaPartida: LinhaExtrato; linhas: LinhaExtrato[]; lancamentos: LancamentoBancario[] }>` (tipos Prisma)
  - `criarLancamentoDaLinha` passa a tipar `dados` como `DadosLancamentoAvulso` (mesma forma de hoje).

- [ ] **Step 1: Write the failing tests**

No fim de `src/server/services/conciliacao.test.ts`:

```ts
import { conciliarEmGrupo, buscarCandidatosParaGrupo } from "./conciliacao";

type TransacaoOfx = { fitid: string; data: string; valor: string; nome: string };

/** OFX com transações arbitrárias; `valor` com sinal ("-150.00" = débito). */
function ofxCom(transacoes: TransacaoOfx[]): File {
  const blocos = transacoes
    .map(
      (t) => `<STMTTRN>
<TRNTYPE>${t.valor.startsWith("-") ? "DEBIT" : "CREDIT"}
<DTPOSTED>${t.data}120000
<TRNAMT>${t.valor}
<FITID>${t.fitid}
<NAME>${t.nome}
</STMTTRN>`,
    )
    .join("\n");
  return arquivoOfx(`<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
${blocos}
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`);
}

describe("conciliarEmGrupo", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBG", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  async function lancamento(valor: number, tipo: "ENTRADA" | "SAIDA", descricao: string, data = "2026-09-10") {
    return prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date(`${data}T00:00:00Z`),
        tipo,
        valor,
        descricao,
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
      },
    });
  }

  async function linhas(transacoes: TransacaoOfx[]) {
    const extrato = await importarExtratoOfx(fixture.sessao, fixture.contaBancariaId, ofxCom(transacoes));
    const criadas = await prisma.linhaExtrato.findMany({ where: { extratoImportadoId: extrato.id } });
    return transacoes.map((t) => criadas.find((l) => l.identificadorBancario === t.fitid)!);
  }

  const SEM_DIMENSOES = {
    categoriaFinanceiraId: null,
    centroCustoId: null,
    centroLucroId: null,
    safraId: null,
    projetoId: null,
  };

  test("N:1 — um PIX quita duas parcelas", async () => {
    const [pix] = await linhas([{ fitid: "GRP-A-1", data: "20260910", valor: "1000.00", nome: "PIX" }]);
    const p1 = await lancamento(600, "ENTRADA", "Parcela 1");
    const p2 = await lancamento(400, "ENTRADA", "Parcela 2");

    const { grupoConciliacaoId } = await conciliarEmGrupo(fixture.sessao, {
      linhaIds: [pix.id],
      lancamentoIds: [p1.id, p2.id],
    });

    const linha = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: pix.id } });
    expect(linha.status).toBe("CONCILIADO");
    expect(linha.grupoConciliacaoId).toBe(grupoConciliacaoId);
    const lancs = await prisma.lancamentoBancario.findMany({ where: { id: { in: [p1.id, p2.id] } } });
    expect(lancs.every((l) => l.conciliado && l.grupoConciliacaoId === grupoConciliacaoId)).toBe(true);
  });

  test("1:N — duas transferências pagam uma parcela", async () => {
    const [t1, t2] = await linhas([
      { fitid: "GRP-B-1", data: "20260910", valor: "300.00", nome: "TED 1" },
      { fitid: "GRP-B-2", data: "20260911", valor: "700.00", nome: "TED 2" },
    ]);
    const parcela = await lancamento(1000, "ENTRADA", "Parcela única");

    const { grupoConciliacaoId } = await conciliarEmGrupo(fixture.sessao, {
      linhaIds: [t1.id, t2.id],
      lancamentoIds: [parcela.id],
    });

    const vinculadas = await prisma.linhaExtrato.findMany({ where: { grupoConciliacaoId } });
    expect(vinculadas.map((l) => l.id).sort()).toEqual([t1.id, t2.id].sort());
    expect(vinculadas.every((l) => l.status === "CONCILIADO")).toBe(true);
  });

  test("N:M com entrada e saída misturadas fecha pela soma com sinal", async () => {
    const [entrada, tarifa] = await linhas([
      { fitid: "GRP-C-1", data: "20260910", valor: "1000.00", nome: "PIX" },
      { fitid: "GRP-C-2", data: "20260910", valor: "-50.00", nome: "TARIFA" },
    ]);
    const a = await lancamento(600, "ENTRADA", "A");
    const b = await lancamento(400, "ENTRADA", "B");
    const c = await lancamento(50, "SAIDA", "Tarifa");

    const { grupoConciliacaoId } = await conciliarEmGrupo(fixture.sessao, {
      linhaIds: [entrada.id, tarifa.id],
      lancamentoIds: [a.id, b.id, c.id],
    });

    expect(await prisma.lancamentoBancario.count({ where: { grupoConciliacaoId } })).toBe(3);
  });

  test("soma diferente é rejeitada e nada é gravado", async () => {
    const [pix] = await linhas([{ fitid: "GRP-D-1", data: "20260910", valor: "995.00", nome: "PIX" }]);
    const parcela = await lancamento(1000, "ENTRADA", "Parcela");

    await expect(
      conciliarEmGrupo(fixture.sessao, { linhaIds: [pix.id], lancamentoIds: [parcela.id] }),
    ).rejects.toThrow(/não bate/);

    expect((await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: pix.id } })).grupoConciliacaoId).toBeNull();
    expect((await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: parcela.id } })).conciliado).toBe(false);
  });

  test("lança a diferença com valor, tipo e data calculados no servidor", async () => {
    const [pix] = await linhas([{ fitid: "GRP-E-1", data: "20260912", valor: "995.00", nome: "PIX" }]);
    const p1 = await lancamento(500, "ENTRADA", "Parcela 1");
    const p2 = await lancamento(500, "ENTRADA", "Parcela 2");

    const { grupoConciliacaoId, lancamentoDiferencaId } = await conciliarEmGrupo(fixture.sessao, {
      linhaIds: [pix.id],
      lancamentoIds: [p1.id, p2.id],
      lancamentoDiferenca: { descricao: "Tarifa PIX", ...SEM_DIMENSOES },
    });

    const diferenca = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lancamentoDiferencaId! } });
    expect(diferenca.tipo).toBe("SAIDA");
    expect(Number(diferenca.valor)).toBe(5);
    expect(diferenca.data.toISOString().slice(0, 10)).toBe("2026-09-12");
    expect(diferenca.conciliado).toBe(true);
    expect(diferenca.grupoConciliacaoId).toBe(grupoConciliacaoId);
    expect(diferenca.classificacaoFiscal).toBe("FISCAL");
  });

  test("rejeita lançar diferença quando a soma já fecha", async () => {
    const [pix] = await linhas([{ fitid: "GRP-F-1", data: "20260910", valor: "100.00", nome: "PIX" }]);
    const parcela = await lancamento(100, "ENTRADA", "Parcela");

    await expect(
      conciliarEmGrupo(fixture.sessao, {
        linhaIds: [pix.id],
        lancamentoIds: [parcela.id],
        lancamentoDiferenca: { descricao: "Nada", ...SEM_DIMENSOES },
      }),
    ).rejects.toThrow(/Não há diferença/);
  });

  test("rejeita item já conciliado", async () => {
    const [l1, l2] = await linhas([
      { fitid: "GRP-G-1", data: "20260910", valor: "200.00", nome: "PIX 1" },
      { fitid: "GRP-G-2", data: "20260910", valor: "200.00", nome: "PIX 2" },
    ]);
    const parcela = await lancamento(200, "ENTRADA", "Parcela");
    await conciliarEmGrupo(fixture.sessao, { linhaIds: [l1.id], lancamentoIds: [parcela.id] });

    await expect(
      conciliarEmGrupo(fixture.sessao, { linhaIds: [l2.id], lancamentoIds: [parcela.id] }),
    ).rejects.toThrow(/já está conciliado/);
  });

  test("rejeita lançamento de outra conta bancária", async () => {
    const outraConta = await prisma.contaBancaria.create({
      data: { filialId: fixture.filialId, bancoId: fixture.bancoId, agencia: "0002", conta: "CBG-2", saldoInicial: 0 },
    });
    const [pix] = await linhas([{ fitid: "GRP-H-1", data: "20260910", valor: "80.00", nome: "PIX" }]);
    const deOutraConta = await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: outraConta.id,
        data: new Date("2026-09-10T00:00:00Z"),
        tipo: "ENTRADA",
        valor: 80,
        descricao: "Outra conta",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
      },
    });

    await expect(
      conciliarEmGrupo(fixture.sessao, { linhaIds: [pix.id], lancamentoIds: [deOutraConta.id] }),
    ).rejects.toThrow(/mesma conta bancária/);
  });

  test("rejeita linha de outra filial", async () => {
    const outra = await criarFixtureFinanceiro("CBG2", "TESOURARIA");
    try {
      const parcela = await lancamento(10, "ENTRADA", "Parcela");
      const extrato = await importarExtratoOfx(
        outra.sessao,
        outra.contaBancariaId,
        ofxCom([{ fitid: "GRP-I-1", data: "20260910", valor: "10.00", nome: "PIX" }]),
      );
      const linhaDeFora = await prisma.linhaExtrato.findFirstOrThrow({ where: { extratoImportadoId: extrato.id } });

      await expect(
        conciliarEmGrupo(fixture.sessao, { linhaIds: [linhaDeFora.id], lancamentoIds: [parcela.id] }),
      ).rejects.toThrow(/não pertence à filial ativa/);
    } finally {
      await limparFixtureFinanceiro(outra);
    }
  });

  test("desconciliar desfaz o grupo inteiro", async () => {
    const [t1, t2] = await linhas([
      { fitid: "GRP-J-1", data: "20260910", valor: "300.00", nome: "TED 1" },
      { fitid: "GRP-J-2", data: "20260910", valor: "700.00", nome: "TED 2" },
    ]);
    const parcela = await lancamento(1000, "ENTRADA", "Parcela");
    const { grupoConciliacaoId } = await conciliarEmGrupo(fixture.sessao, {
      linhaIds: [t1.id, t2.id],
      lancamentoIds: [parcela.id],
    });

    await desconciliar(fixture.sessao, t2.id);

    const linhasDepois = await prisma.linhaExtrato.findMany({ where: { id: { in: [t1.id, t2.id] } } });
    expect(linhasDepois.every((l) => l.status === "NAO_CONCILIADO" && l.grupoConciliacaoId === null)).toBe(true);
    const parcelaDepois = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(parcelaDepois.conciliado).toBe(false);
    expect(parcelaDepois.grupoConciliacaoId).toBeNull();
    expect(await prisma.grupoConciliacao.findUnique({ where: { id: grupoConciliacaoId } })).toBeNull();
  });

  test("perfil sem conciliacao:escrever não concilia", async () => {
    const fixtureFinanceiro = await criarFixtureFinanceiro("CBG3");
    try {
      await expect(
        conciliarEmGrupo(fixtureFinanceiro.sessao, { linhaIds: ["x"], lancamentoIds: ["y"] }),
      ).rejects.toThrow(PermissionError);
    } finally {
      await limparFixtureFinanceiro(fixtureFinanceiro);
    }
  });
});

describe("buscarCandidatosParaGrupo", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBK", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("traz outras linhas e lançamentos soltos da conta, dos dois tipos, dentro da janela", async () => {
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      ofxCom([
        { fitid: "CAND-1", data: "20260910", valor: "100.00", nome: "PIX" },
        { fitid: "CAND-2", data: "20260912", valor: "-5.00", nome: "TARIFA" },
        { fitid: "CAND-3", data: "20261201", valor: "100.00", nome: "FORA DA JANELA" },
      ]),
    );
    const partida = await prisma.linhaExtrato.findFirstOrThrow({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "CAND-1" },
    });
    const base = {
      filialId: fixture.filialId,
      contaBancariaId: fixture.contaBancariaId,
      origem: "MANUAL" as const,
      usuarioId: fixture.usuarioId,
    };
    const entrada = await prisma.lancamentoBancario.create({
      data: { ...base, data: new Date("2026-09-09T00:00:00Z"), tipo: "ENTRADA", valor: 105, descricao: "Venda" },
    });
    const saida = await prisma.lancamentoBancario.create({
      data: { ...base, data: new Date("2026-09-11T00:00:00Z"), tipo: "SAIDA", valor: 5, descricao: "Tarifa" },
    });
    const jaConciliado = await prisma.lancamentoBancario.create({
      data: {
        ...base,
        data: new Date("2026-09-10T00:00:00Z"),
        tipo: "ENTRADA",
        valor: 100,
        descricao: "Já conciliado",
        conciliado: true,
      },
    });

    const resultado = await buscarCandidatosParaGrupo(fixture.sessao, partida.id);

    expect(resultado.linhaPartida.id).toBe(partida.id);
    expect(resultado.linhas.map((l) => l.identificadorBancario)).toEqual(["CAND-2"]);
    const ids = resultado.lancamentos.map((l) => l.id);
    expect(ids).toContain(entrada.id);
    expect(ids).toContain(saida.id);
    expect(ids).not.toContain(jaConciliado.id);
  });

  test("linha já conciliada é rejeitada", async () => {
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      ofxCom([{ fitid: "CAND-X", data: "20260915", valor: "77.00", nome: "PIX" }]),
    );
    const linha = await prisma.linhaExtrato.findFirstOrThrow({ where: { extratoImportadoId: extrato.id } });
    await criarLancamentoDaLinha(fixture.sessao, linha.id, {
      descricao: "Criado",
      categoriaFinanceiraId: null,
      centroCustoId: null,
      centroLucroId: null,
      safraId: null,
      projetoId: null,
    });

    await expect(buscarCandidatosParaGrupo(fixture.sessao, linha.id)).rejects.toThrow(/já está conciliada/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/conciliacao.test.ts`
Expected: FAIL — `conciliarEmGrupo is not a function` / `buscarCandidatosParaGrupo is not a function` (import undefined).

- [ ] **Step 3: Implementar**

Em `src/server/services/conciliacao.ts`:

Import novo no topo:

```ts
import { diferencaDoGrupo } from "@/lib/conciliacaoGrupo";
import { formatarMoeda } from "@/lib/formatacao";
```

Antes de `export async function criarLancamentoDaLinha`, adicionar o tipo e o preparo comum:

```ts
/** Dados de um lançamento avulso criado na conciliação (a partir da linha ou da diferença do grupo). */
export type DadosLancamentoAvulso = {
  descricao: string;
  categoriaFinanceiraId: string | null;
  centroCustoId: string | null;
  centroLucroId: string | null;
  safraId: string | null;
  projetoId: string | null;
  /** Omitida = FISCAL (tarifas, IOF e rendimentos são documentos bancários). */
  classificacaoFiscal?: ClassificacaoFiscal;
  tipoComprovante?: TipoComprovante | null;
};

/** Valida dimensões e comprovante e devolve os campos prontos para o `create`. */
async function prepararLancamentoAvulso(filialId: string, dados: DadosLancamentoAvulso) {
  await validarDimensoesDaFilial(filialId, {
    centroCustoId: dados.centroCustoId,
    centroLucroId: dados.centroLucroId,
    safraId: dados.safraId,
    projetoId: dados.projetoId,
  });
  const classificacaoFiscal = dados.classificacaoFiscal ?? "FISCAL";
  const tipoComprovante = dados.tipoComprovante ?? null;
  garantirComprovanteValido({ classificacaoFiscal, tipoComprovante });
  return {
    descricao: dados.descricao,
    categoriaFinanceiraId: dados.categoriaFinanceiraId,
    centroCustoId: dados.centroCustoId,
    centroLucroId: dados.centroLucroId,
    safraId: dados.safraId,
    projetoId: dados.projetoId,
    classificacaoFiscal,
    tipoComprovante,
  };
}
```

Em `criarLancamentoDaLinha`: trocar o tipo do parâmetro `dados: { ... }` por `dados: DadosLancamentoAvulso`; trocar o trecho de `await validarDimensoesDaFilial(...)` até `garantirComprovanteValido(...)` por

```ts
  const campos = await prepararLancamentoAvulso(sessao.filialId, dados);
```

e no `tx.lancamentoBancario.create({ data: {...} })` substituir as linhas `descricao` … `tipoComprovante` por `...campos,` (mantendo `filialId`, `contaBancariaId`, `data`, `tipo`, `valor`, `origem: "MANUAL"`, `usuarioId`, `conciliado: false`).

No fim do arquivo, adicionar:

```ts
/**
 * Concilia N linhas do extrato com M lançamentos da mesma conta, desde que as
 * somas com sinal sejam iguais. Se não forem, o usuário pode lançar a
 * diferença (ex.: tarifa) no próprio grupo — valor, tipo e data saem daqui.
 */
export async function conciliarEmGrupo(
  sessao: SessaoAtiva,
  entrada: { linhaIds: string[]; lancamentoIds: string[]; lancamentoDiferenca?: DadosLancamentoAvulso },
): Promise<{ grupoConciliacaoId: string; lancamentoDiferencaId: string | null }> {
  requirePermission(sessao.perfil, "conciliacao:escrever");
  if (entrada.lancamentoDiferenca) {
    requirePermission(sessao.perfil, "lancamento:escrever");
  }
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const linhaIds = [...new Set(entrada.linhaIds)];
  const lancamentoIds = [...new Set(entrada.lancamentoIds)];
  if (linhaIds.length === 0) {
    throw new Error("Marque ao menos uma linha do extrato");
  }
  if (lancamentoIds.length === 0 && !entrada.lancamentoDiferenca) {
    throw new Error("Marque ao menos um lançamento");
  }

  const linhas = await prisma.linhaExtrato.findMany({
    where: { id: { in: linhaIds }, contaBancaria: { filialId: sessao.filialId } },
  });
  if (linhas.length !== linhaIds.length) {
    throw new Error("Linha de extrato não pertence à filial ativa");
  }
  const contaBancariaId = linhas[0].contaBancariaId;
  if (linhas.some((l) => l.contaBancariaId !== contaBancariaId)) {
    throw new Error("Todas as linhas do grupo devem ser da mesma conta bancária");
  }
  if (linhas.some((l) => l.grupoConciliacaoId)) {
    throw new Error("Alguma linha marcada já está conciliada");
  }

  const lancamentos = await prisma.lancamentoBancario.findMany({
    where: { id: { in: lancamentoIds }, filialId: sessao.filialId },
  });
  if (lancamentos.length !== lancamentoIds.length) {
    throw new Error("Lançamento não pertence à filial ativa");
  }
  if (lancamentos.some((l) => l.contaBancariaId !== contaBancariaId)) {
    throw new Error("Os lançamentos do grupo devem ser da mesma conta bancária das linhas");
  }
  if (lancamentos.some((l) => l.conciliado || l.grupoConciliacaoId)) {
    throw new Error("Algum lançamento marcado já está conciliado");
  }

  const diferenca = diferencaDoGrupo(
    linhas.map((l) => ({ valor: Number(l.valor), tipo: l.tipo })),
    lancamentos.map((l) => ({ valor: Number(l.valor), tipo: l.tipo })),
  );

  let camposDiferenca: Awaited<ReturnType<typeof prepararLancamentoAvulso>> | null = null;
  if (entrada.lancamentoDiferenca) {
    if (diferenca === 0) {
      throw new Error("Não há diferença a lançar: as somas já batem");
    }
    camposDiferenca = await prepararLancamentoAvulso(sessao.filialId, entrada.lancamentoDiferenca);
  } else if (diferenca !== 0) {
    throw new Error(
      `A soma das linhas e dos lançamentos não bate (diferença de ${formatarMoeda(Math.abs(diferenca) / 100)})`,
    );
  }

  const dataDiferenca = new Date(Math.max(...linhas.map((l) => l.data.getTime())));

  const resultado = await prisma.$transaction(async (tx) => {
    let lancamentoDiferencaId: string | null = null;
    if (camposDiferenca) {
      const criado = await tx.lancamentoBancario.create({
        data: {
          ...camposDiferenca,
          filialId: sessao.filialId,
          contaBancariaId,
          data: dataDiferenca,
          tipo: diferenca > 0 ? "ENTRADA" : "SAIDA",
          valor: new Prisma.Decimal(Math.abs(diferenca)).div(100),
          origem: "MANUAL",
          usuarioId: sessao.usuarioId,
          conciliado: false,
        },
      });
      lancamentoDiferencaId = criado.id;
    }

    const grupoConciliacaoId = await vincularEmGrupo(tx, {
      filialId: sessao.filialId,
      contaBancariaId,
      usuarioId: sessao.usuarioId,
      linhaIds,
      lancamentoIds: lancamentoDiferencaId ? [...lancamentoIds, lancamentoDiferencaId] : lancamentoIds,
    });
    return { grupoConciliacaoId, lancamentoDiferencaId };
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "GrupoConciliacao",
    entidadeId: resultado.grupoConciliacaoId,
    acao: "CONCILIAR_GRUPO",
    anterior: null,
    novo: {
      linhaIds,
      lancamentoIds,
      lancamentoDiferencaId: resultado.lancamentoDiferencaId,
      totalLinhas: linhas.reduce((t, l) => t + (l.tipo === "ENTRADA" ? 1 : -1) * Number(l.valor), 0),
      totalLancamentos: lancamentos.reduce((t, l) => t + (l.tipo === "ENTRADA" ? 1 : -1) * Number(l.valor), 0),
    },
  });

  return resultado;
}

/**
 * Itens que podem entrar num grupo junto com a linha de partida: as outras
 * linhas e os lançamentos ainda soltos da mesma conta, dos dois tipos, dentro
 * de ±JANELA_BUSCA_DIAS. Sempre consulta ao vivo.
 */
export async function buscarCandidatosParaGrupo(sessao: SessaoAtiva, linhaExtratoId: string) {
  const linhaPartida = await prisma.linhaExtrato.findFirst({
    where: { id: linhaExtratoId, contaBancaria: { filialId: sessao.filialId } },
  });
  if (!linhaPartida) {
    throw new Error("Linha de extrato não pertence à filial ativa");
  }
  if (linhaPartida.grupoConciliacaoId) {
    throw new Error("Esta linha já está conciliada");
  }

  const janela = janelaDeBusca(linhaPartida.data);
  const [linhas, lancamentos] = await Promise.all([
    prisma.linhaExtrato.findMany({
      where: {
        contaBancariaId: linhaPartida.contaBancariaId,
        grupoConciliacaoId: null,
        id: { not: linhaPartida.id },
        data: janela,
      },
      orderBy: { data: "asc" },
    }),
    prisma.lancamentoBancario.findMany({
      where: { contaBancariaId: linhaPartida.contaBancariaId, grupoConciliacaoId: null, conciliado: false, data: janela },
      orderBy: { data: "asc" },
    }),
  ]);

  return { linhaPartida, linhas, lancamentos };
}
```

Nota: o teste "rejeita item já conciliado" espera `/já está conciliado/` — a mensagem "Algum lançamento marcado já está conciliado" casa.

Nota: a spec pede testar que lançar a diferença exige `lancamento:escrever`, mas nenhum perfil tem
`conciliacao:escrever` sem `lancamento:escrever` (só TESOURARIA e ADMINISTRADOR escrevem conciliação), então não há
como montar o cenário; a checagem fica no código (`requirePermission` acima) sem teste dedicado.

- [ ] **Step 4: Run tests to verify they pass**

Run: `Set-Location D:\Projetos\nx-control-erp; npx tsc --noEmit; npx vitest run src/server/services/conciliacao.test.ts`
Expected: `tsc` limpo; todos PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/server/services/conciliacao.ts src/server/services/conciliacao.test.ts
git commit -m @'
feat(conciliacao): conciliar em grupo com lançamento da diferença

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 4: Schema Zod, actions e campos compartilhados do lançamento avulso

**Files:**
- Modify: `src/lib/schemas/conciliacao.ts`
- Modify: `src/app/(dashboard)/financeiro/conciliacao/actions.ts`
- Create: `src/app/(dashboard)/financeiro/conciliacao/campos-lancamento-avulso.tsx`
- Modify: `src/app/(dashboard)/financeiro/conciliacao/criar-lancamento-dialog-form.tsx`

**Interfaces:**
- Consumes: `conciliarEmGrupo`, `buscarCandidatosParaGrupo`, `DadosLancamentoAvulso` (Task 3).
- Produces:
  - `lancamentoAvulsoSchema` e `type LancamentoAvulsoFormValues` em `@/lib/schemas/conciliacao`.
  - Em `actions.ts`: `type ItemDoGrupo = { id: string; data: string; valor: number; tipo: "ENTRADA" | "SAIDA"; descricao: string }`; `type CandidatosDoGrupo = { linhaPartida: ItemDoGrupo; linhas: ItemDoGrupo[]; lancamentos: ItemDoGrupo[] }`; `buscarCandidatosParaGrupoAction(linhaExtratoId: string): Promise<{ erro?: string; candidatos?: CandidatosDoGrupo }>`; `conciliarEmGrupoAction(_prev: FormState, formData: FormData): Promise<FormState>` — lê `linhaIds` (vários), `lancamentoIds` (vários), `lancarDiferenca` (`"on"`) e os campos do lançamento avulso.
  - `CamposLancamentoAvulso({ sufixoId, categorias, centrosCusto, centrosLucro, safras, projetos })` — renderiza descrição, classificação/comprovante, categoria e as 4 dimensões, com os `name` que o schema espera.

- [ ] **Step 1: Schema Zod**

Substituir o conteúdo de `src/lib/schemas/conciliacao.ts` por:

```ts
import { z } from "zod";
import { SEM_VALOR } from "./enums";
import { camposClassificacaoLancamento, refinarComprovanteDoLancamento } from "./lancamentoBancario";

/** Lançamento criado na conciliação: a partir de uma linha ou como diferença de um grupo. */
const camposLancamentoAvulso = {
  descricao: z.string().trim().min(2, "Informe uma descrição"),
  categoriaFinanceiraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  centroCustoId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  centroLucroId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  safraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  projetoId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  ...camposClassificacaoLancamento,
};

export const lancamentoAvulsoSchema = z.object(camposLancamentoAvulso).superRefine(refinarComprovanteDoLancamento);
export type LancamentoAvulsoFormValues = z.infer<typeof lancamentoAvulsoSchema>;

export const lancamentoDaLinhaSchema = z
  .object({ linhaExtratoId: z.string().trim().min(1), ...camposLancamentoAvulso })
  .superRefine(refinarComprovanteDoLancamento);
export type LancamentoDaLinhaFormValues = z.infer<typeof lancamentoDaLinhaSchema>;
```

(Escrever com a ferramenta Write — o arquivo tem acentos; não usar PowerShell para gravar.)

- [ ] **Step 2: Actions**

Em `src/app/(dashboard)/financeiro/conciliacao/actions.ts`:

Trocar o import do schema por:

```ts
import { lancamentoAvulsoSchema, lancamentoDaLinhaSchema, type LancamentoAvulsoFormValues } from "@/lib/schemas/conciliacao";
```

Depois de `function mensagemErro`, adicionar:

```ts
function semValor(valor: string | undefined): string | null {
  return valor && valor !== SEM_VALOR ? valor : null;
}

function dadosDoLancamentoAvulso(dados: LancamentoAvulsoFormValues): conciliacaoService.DadosLancamentoAvulso {
  return {
    descricao: dados.descricao,
    categoriaFinanceiraId: semValor(dados.categoriaFinanceiraId),
    centroCustoId: semValor(dados.centroCustoId),
    centroLucroId: semValor(dados.centroLucroId),
    safraId: semValor(dados.safraId),
    projetoId: semValor(dados.projetoId),
    classificacaoFiscal: dados.classificacaoFiscal,
    tipoComprovante: semValor(dados.tipoComprovante) as conciliacaoService.DadosLancamentoAvulso["tipoComprovante"],
  };
}
```

Em `criarLancamentoDaLinhaAction`, trocar o objeto literal passado a `criarLancamentoDaLinha` (de `{ descricao: ...` até o `}` antes de `);`) por `dadosDoLancamentoAvulso(parsed.data)`.

No fim do arquivo, adicionar:

```ts
export type ItemDoGrupo = { id: string; data: string; valor: number; tipo: "ENTRADA" | "SAIDA"; descricao: string };
export type CandidatosDoGrupo = { linhaPartida: ItemDoGrupo; linhas: ItemDoGrupo[]; lancamentos: ItemDoGrupo[] };

export async function buscarCandidatosParaGrupoAction(
  linhaExtratoId: string,
): Promise<{ erro?: string; candidatos?: CandidatosDoGrupo }> {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "conciliacao:ler");
  try {
    const { linhaPartida, linhas, lancamentos } = await conciliacaoService.buscarCandidatosParaGrupo(
      sessao,
      linhaExtratoId,
    );
    const daLinha = (l: (typeof linhas)[number]): ItemDoGrupo => ({
      id: l.id,
      data: formatarData(l.data),
      valor: Number(l.valor),
      tipo: l.tipo,
      descricao: l.historico,
    });
    return {
      candidatos: {
        linhaPartida: daLinha(linhaPartida),
        linhas: linhas.map(daLinha),
        lancamentos: lancamentos.map((l) => ({
          id: l.id,
          data: formatarData(l.data),
          valor: Number(l.valor),
          tipo: l.tipo,
          descricao: l.descricao,
        })),
      },
    };
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
}

export async function conciliarEmGrupoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const linhaIds = formData.getAll("linhaIds").map(String);
  const lancamentoIds = formData.getAll("lancamentoIds").map(String);

  let lancamentoDiferenca: conciliacaoService.DadosLancamentoAvulso | undefined;
  if (formData.get("lancarDiferenca") === "on") {
    const parsed = lancamentoAvulsoSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    }
    lancamentoDiferenca = dadosDoLancamentoAvulso(parsed.data);
  }

  try {
    await conciliacaoService.conciliarEmGrupo(sessao, { linhaIds, lancamentoIds, lancamentoDiferenca });
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/conciliacao");
  return { sucesso: true };
}
```

Se o tipo de `tipoComprovante` em `LancamentoAvulsoFormValues` já for o enum `TipoComprovante | typeof SEM_VALOR`, o cast acima resolve; se o `tsc` acusar outro formato, ajustar só o cast, mantendo `semValor`.

- [ ] **Step 3: Componente de campos compartilhado**

Criar `src/app/(dashboard)/financeiro/conciliacao/campos-lancamento-avulso.tsx` com o conteúdo das l.44-128 de `criar-lancamento-dialog-form.tsx` (descrição até projeto), parametrizado:

```tsx
// src/app/(dashboard)/financeiro/conciliacao/campos-lancamento-avulso.tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEM_VALOR } from "@/lib/schemas/enums";
import { CamposClassificacaoLancamento } from "../../_shared/campos-classificacao-lancamento";

type Opcao = { id: string; nome: string };

function SelectOpcional({
  id,
  name,
  rotulo,
  rotuloVazio,
  opcoes,
}: {
  id: string;
  name: string;
  rotulo: string;
  rotuloVazio: string;
  opcoes: Opcao[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{rotulo}</Label>
      <Select name={name} defaultValue={SEM_VALOR}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SEM_VALOR}>{rotuloVazio}</SelectItem>
          {opcoes.map((opcao) => (
            <SelectItem key={opcao.id} value={opcao.id}>
              {opcao.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Descrição, classificação, categoria e dimensões de um lançamento criado na conciliação. */
export function CamposLancamentoAvulso({
  sufixoId,
  categorias,
  centrosCusto,
  centrosLucro,
  safras,
  projetos,
}: {
  sufixoId: string;
  categorias: Opcao[];
  centrosCusto: Opcao[];
  centrosLucro: Opcao[];
  safras: Opcao[];
  projetos: Opcao[];
}) {
  const id = (campo: string) => `${campo}-${sufixoId}`;
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={id("descricao")}>Descrição</Label>
        <Input id={id("descricao")} name="descricao" required />
      </div>
      <CamposClassificacaoLancamento sufixoId={sufixoId} />
      <SelectOpcional
        id={id("categoriaFinanceiraId")}
        name="categoriaFinanceiraId"
        rotulo="Categoria financeira"
        rotuloVazio="Nenhuma"
        opcoes={categorias}
      />
      <SelectOpcional
        id={id("centroCustoId")}
        name="centroCustoId"
        rotulo="Centro de custo"
        rotuloVazio="Nenhum"
        opcoes={centrosCusto}
      />
      <SelectOpcional
        id={id("centroLucroId")}
        name="centroLucroId"
        rotulo="Centro de lucro"
        rotuloVazio="Nenhum"
        opcoes={centrosLucro}
      />
      <SelectOpcional id={id("safraId")} name="safraId" rotulo="Safra" rotuloVazio="Nenhuma" opcoes={safras} />
      <SelectOpcional id={id("projetoId")} name="projetoId" rotulo="Projeto" rotuloVazio="Nenhum" opcoes={projetos} />
    </>
  );
}
```

Em `criar-lancamento-dialog-form.tsx`: trocar o trecho das l.44-128 (do `<div className="space-y-2">` da descrição até o `</div>` do projeto) por:

```tsx
          <CamposLancamentoAvulso
            sufixoId={linhaExtratoId}
            categorias={categorias}
            centrosCusto={centrosCusto}
            centrosLucro={centrosLucro}
            safras={safras}
            projetos={projetos}
          />
```

e ajustar os imports: remover `Input`, `Label`, `Select*`, `SEM_VALOR`, `CamposClassificacaoLancamento` se não forem mais usados; adicionar `import { CamposLancamentoAvulso } from "./campos-lancamento-avulso";`.

- [ ] **Step 4: Verificar**

```powershell
Set-Location D:\Projetos\nx-control-erp; npx tsc --noEmit; npm run lint; npx vitest run src/server/services/conciliacao.test.ts
```

Expected: sem erros de tipo nem de lint; testes PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/schemas/conciliacao.ts "src/app/(dashboard)/financeiro/conciliacao/actions.ts" "src/app/(dashboard)/financeiro/conciliacao/campos-lancamento-avulso.tsx" "src/app/(dashboard)/financeiro/conciliacao/criar-lancamento-dialog-form.tsx"
git commit -m @'
feat(conciliacao): actions do grupo e campos do lançamento avulso compartilhados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 5: Dialog "Conciliar em grupo"

**Files:**
- Create: `src/app/(dashboard)/financeiro/conciliacao/conciliar-grupo-dialog.tsx`
- Modify: `src/app/(dashboard)/financeiro/conciliacao/linha-extrato-actions.tsx`

**Interfaces:**
- Consumes: `buscarCandidatosParaGrupoAction`, `conciliarEmGrupoAction`, `CandidatosDoGrupo`, `ItemDoGrupo`, `FormState` (Task 4); `CamposLancamentoAvulso` (Task 4); `diferencaDoGrupo`, `somaEmCentavos` (Task 1); `useAcaoDoDialogo` (`../../_shared/use-acao-do-dialogo`); `Checkbox` (`@/components/ui/checkbox`, Base UI: `checked`, `onCheckedChange`, `disabled`).
- Produces: `ConciliarGrupoDialog({ linhaExtratoId, categorias, centrosCusto, centrosLucro, safras, projetos })`.

- [ ] **Step 1: Componente**

Criar `src/app/(dashboard)/financeiro/conciliacao/conciliar-grupo-dialog.tsx`:

```tsx
// src/app/(dashboard)/financeiro/conciliacao/conciliar-grupo-dialog.tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { diferencaDoGrupo, somaEmCentavos } from "@/lib/conciliacaoGrupo";
import { formatarMoeda } from "@/lib/formatacao";
import {
  buscarCandidatosParaGrupoAction,
  conciliarEmGrupoAction,
  type CandidatosDoGrupo,
  type FormState,
  type ItemDoGrupo,
} from "./actions";
import { CamposLancamentoAvulso } from "./campos-lancamento-avulso";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

const ESTADO_INICIAL: FormState = {};

type Opcao = { id: string; nome: string };

function valorComSinal(centavos: number): string {
  const sinal = centavos > 0 ? "+ " : centavos < 0 ? "− " : "";
  return `${sinal}${formatarMoeda(Math.abs(centavos) / 100)}`;
}

function ItemMarcavel({
  item,
  marcado,
  fixo = false,
  onTrocar,
}: {
  item: ItemDoGrupo;
  marcado: boolean;
  fixo?: boolean;
  onTrocar?: () => void;
}) {
  return (
    <label className="flex items-center gap-3 py-1 text-sm">
      <Checkbox checked={marcado} disabled={fixo} onCheckedChange={() => onTrocar?.()} />
      <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{item.data}</span>
      <span className="min-w-0 flex-1 truncate">{item.descricao}</span>
      <span className="shrink-0 tabular-nums">
        {valorComSinal(somaEmCentavos([{ valor: item.valor, tipo: item.tipo }]))}
      </span>
    </label>
  );
}

function trocar(conjunto: Set<string>, id: string): Set<string> {
  const novo = new Set(conjunto);
  if (novo.has(id)) novo.delete(id);
  else novo.add(id);
  return novo;
}

export function ConciliarGrupoDialog({
  linhaExtratoId,
  categorias,
  centrosCusto,
  centrosLucro,
  safras,
  projetos,
}: {
  linhaExtratoId: string;
  categorias: Opcao[];
  centrosCusto: Opcao[];
  centrosLucro: Opcao[];
  safras: Opcao[];
  projetos: Opcao[];
}) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(conciliarEmGrupoAction, ESTADO_INICIAL);
  const [candidatos, setCandidatos] = useState<CandidatosDoGrupo | null>(null);
  const [erroCarga, setErroCarga] = useState<string>();
  const [linhasMarcadas, setLinhasMarcadas] = useState<Set<string>>(new Set());
  const [lancamentosMarcados, setLancamentosMarcados] = useState<Set<string>>(new Set());
  const [lancarDiferenca, setLancarDiferenca] = useState(false);

  function mudarAberto(novo: boolean) {
    setAberto(novo);
    if (!novo) return;
    setCandidatos(null);
    setErroCarga(undefined);
    setLinhasMarcadas(new Set());
    setLancamentosMarcados(new Set());
    setLancarDiferenca(false);
    buscarCandidatosParaGrupoAction(linhaExtratoId).then((resultado) => {
      if (resultado.erro) setErroCarga(resultado.erro);
      else setCandidatos(resultado.candidatos ?? null);
    });
  }

  const linhasDoGrupo = candidatos
    ? [candidatos.linhaPartida, ...candidatos.linhas.filter((l) => linhasMarcadas.has(l.id))]
    : [];
  const lancamentosDoGrupo = candidatos ? candidatos.lancamentos.filter((l) => lancamentosMarcados.has(l.id)) : [];
  const diferenca = diferencaDoGrupo(linhasDoGrupo, lancamentosDoGrupo);
  const lancandoDiferenca = lancarDiferenca && diferenca !== 0;
  const podeConciliar =
    candidatos !== null &&
    (diferenca === 0 || lancandoDiferenca) &&
    (lancamentosDoGrupo.length > 0 || lancandoDiferenca);

  return (
    <Dialog open={aberto} onOpenChange={mudarAberto}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>Conciliar em grupo</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conciliar em grupo</DialogTitle>
        </DialogHeader>
        {erroCarga ? <p className="text-sm text-destructive">{erroCarga}</p> : null}
        {!candidatos && !erroCarga ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
        {candidatos ? (
          <form action={formAction} className="space-y-4">
            {linhasDoGrupo.map((l) => (
              <input key={l.id} type="hidden" name="linhaIds" value={l.id} />
            ))}
            {lancamentosDoGrupo.map((l) => (
              <input key={l.id} type="hidden" name="lancamentoIds" value={l.id} />
            ))}
            {lancandoDiferenca ? <input type="hidden" name="lancarDiferenca" value="on" /> : null}

            <section className="space-y-1">
              <h3 className="text-sm font-medium">Linhas do extrato</h3>
              <ItemMarcavel item={candidatos.linhaPartida} marcado fixo />
              {candidatos.linhas.map((linha) => (
                <ItemMarcavel
                  key={linha.id}
                  item={linha}
                  marcado={linhasMarcadas.has(linha.id)}
                  onTrocar={() => setLinhasMarcadas((atual) => trocar(atual, linha.id))}
                />
              ))}
            </section>

            <section className="space-y-1">
              <h3 className="text-sm font-medium">Lançamentos</h3>
              {candidatos.lancamentos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum lançamento pendente nesta conta perto dessa data.</p>
              ) : null}
              {candidatos.lancamentos.map((lancamento) => (
                <ItemMarcavel
                  key={lancamento.id}
                  item={lancamento}
                  marcado={lancamentosMarcados.has(lancamento.id)}
                  onTrocar={() => setLancamentosMarcados((atual) => trocar(atual, lancamento.id))}
                />
              ))}
            </section>

            <div className="space-y-1 rounded-md border p-3 text-sm tabular-nums">
              <p>
                Linhas: {valorComSinal(somaEmCentavos(linhasDoGrupo))} · Lançamentos:{" "}
                {valorComSinal(somaEmCentavos(lancamentosDoGrupo))}
              </p>
              <p className={diferenca === 0 ? "text-muted-foreground" : "font-medium"}>
                Diferença: {valorComSinal(diferenca)}
              </p>
              {diferenca !== 0 ? (
                <label className="flex items-center gap-2 pt-1">
                  <Checkbox checked={lancarDiferenca} onCheckedChange={(marcado) => setLancarDiferenca(marcado)} />
                  Lançar a diferença ({diferenca > 0 ? "entrada" : "saída"} de{" "}
                  {formatarMoeda(Math.abs(diferenca) / 100)})
                </label>
              ) : null}
            </div>

            {lancandoDiferenca ? (
              <CamposLancamentoAvulso
                sufixoId={`grupo-${linhaExtratoId}`}
                categorias={categorias}
                centrosCusto={centrosCusto}
                centrosLucro={centrosLucro}
                safras={safras}
                projetos={projetos}
              />
            ) : null}

            {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!podeConciliar || pendente}>
                {pendente ? "Conciliando..." : "Conciliar"}
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
```

Se o `onCheckedChange` do Checkbox Base UI tiver assinatura `(checked: boolean, eventDetails) => void`, o código acima já serve; se o `tsc` acusar, ajustar só a assinatura do callback.

- [ ] **Step 2: Botão na linha pendente**

Em `linha-extrato-actions.tsx`: adicionar `import { ConciliarGrupoDialog } from "./conciliar-grupo-dialog";` e, logo antes de `<CriarLancamentoDialogForm`, inserir:

```tsx
      <ConciliarGrupoDialog
        linhaExtratoId={linhaExtratoId}
        categorias={categorias}
        centrosCusto={centrosCusto}
        centrosLucro={centrosLucro}
        safras={safras}
        projetos={projetos}
      />
```

- [ ] **Step 3: Verificar**

```powershell
Set-Location D:\Projetos\nx-control-erp; npx tsc --noEmit; npm run lint
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```powershell
git add "src/app/(dashboard)/financeiro/conciliacao/conciliar-grupo-dialog.tsx" "src/app/(dashboard)/financeiro/conciliacao/linha-extrato-actions.tsx"
git commit -m @'
feat(conciliacao): dialog para conciliar linhas e lançamentos em grupo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 6: Documentação e conferência no navegador

**Files:**
- Modify: `content/ajuda/passo-a-passo.md:112-124`
- Modify: `docs/fases/fase-3-conciliacao.md:46-48,55`
- Modify: `docs/backlog.md:190-197,211`

**Interfaces:**
- Consumes: tudo das tasks anteriores (só documenta e confere).
- Produces: nada para outras tasks.

- [ ] **Step 1: Ajuda**

Em `content/ajuda/passo-a-passo.md`, depois do parágrafo que começa com `O botão "Reconciliar pendentes"` (l.124), acrescentar:

```markdown

**Conciliar em grupo**

Quando uma linha do extrato corresponde a mais de um lançamento (um PIX que quita duas parcelas) ou vários movimentos do extrato correspondem a um lançamento (duas transferências que pagam uma parcela), use "Conciliar em grupo" na linha. Marque as outras linhas e os lançamentos que fazem parte do mesmo movimento; o sistema mostra o total de cada lado e a diferença, e só concilia quando os dois totais são iguais, centavo a centavo. Se faltar pouco porque o banco descontou uma tarifa, marque "Lançar a diferença": o sistema cria o lançamento com o valor que falta (entrada ou saída) e concilia tudo junto. "Desconciliar" numa linha de grupo desfaz o grupo inteiro — todas as linhas e lançamentos voltam a pendentes.
```

E na tabela de status, trocar a linha `| Conciliado | A linha já está vinculada a um lançamento bancário do sistema. |` por:

```markdown
| Conciliado | A linha já está vinculada a um ou mais lançamentos bancários do sistema (sozinha ou em grupo com outras linhas). |
```

- [ ] **Step 2: Fase 3 e backlog**

`docs/fases/fase-3-conciliacao.md`: trocar o item das l.46-48 (`- Conciliação é 1:1 nesta fase — ...`) por:

```markdown
- Conciliação 1:1 no automático; em grupo (N:1, 1:N, N:M) na conciliação
  manual, com soma exata e lançamento opcional da diferença — ver
  `docs/superpowers/specs/2026-11-16-conciliacao-grupo-design.md`.
```

e trocar `- Conciliação N:1/1:N.` (l.55) por:

```markdown
- ~~Conciliação N:1/1:N.~~ — **feito** (conciliação em grupo, 2026-11-16).
```

`docs/backlog.md`: remover o item `- **Conciliação N:1 / 1:N** ...` inteiro (l.190-197, incluindo a linha em branco depois dele). No item de cartão, trocar `depósito que junta várias vendas encosta no item de conciliação N:1 acima.` por `depósito que junta várias vendas já concilia com a conciliação em grupo.`

- [ ] **Step 3: Suíte completa**

```powershell
Set-Location D:\Projetos\nx-control-erp; npx tsc --noEmit; npm run lint; npx vitest run
```

Expected: tudo limpo e PASS.

- [ ] **Step 4: Conferência no navegador**

1. `npm run dev` (se a porta 3000 estiver presa, matar o PID indicado). Entrar com admin@nx-control-erp.local / TrocarSenha123!, "Empresa Demonstração".
2. Montar cenário numa conta corrente da filial: criar pela Tesouraria dois lançamentos de entrada de R$ 500,00 com a mesma data; importar um OFX com uma linha de crédito de R$ 995,00 nessa data e outra linha de duas transferências (R$ 300,00 e R$ 700,00) contra um lançamento manual de R$ 1.000,00.
3. Na linha de R$ 995,00: "Conciliar em grupo" → marcar os dois lançamentos de R$ 500 → conferir "Diferença: − R$ 5,00" e botão desabilitado → marcar "Lançar a diferença", preencher descrição "Tarifa PIX" → Conciliar. Conferir a linha CONCILIADO com "Grupo: 1 linha · 3 lançamentos".
4. Na linha de R$ 300,00: grupo com a linha de R$ 700,00 + lançamento de R$ 1.000,00 → Conciliar. Conferir "Grupo: 2 linhas · 1 lançamento" nas duas linhas.
5. "Desconciliar" na linha de R$ 700,00 → confirmar o aviso → as duas linhas voltam a "Não conciliado".
6. Conferir o console sem erros (ignorar o falso erro de hidratação de `caret-color` da captura).
7. Apagar os dados criados para o teste (linhas, extrato, lançamentos, grupos) e a pasta `.playwright-mcp/` se usada.

- [ ] **Step 5: Commit**

```powershell
git add content/ajuda/passo-a-passo.md docs/fases/fase-3-conciliacao.md docs/backlog.md
git commit -m @'
docs(conciliacao): conciliação em grupo na ajuda, na fase 3 e no backlog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```
