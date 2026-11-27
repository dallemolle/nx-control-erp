# Ano-base do estratégico sem empréstimos e aportes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O ano-base do Fluxo de caixa estratégico passa a somar receita e custo por categoria, sem as categorias marcadas como "Não operacional" (empréstimo, aporte, amortização) e sem lançamentos sem categoria, avisando na tela quanto ficou de fora.

**Architecture:** Nova coluna `CategoriaFinanceira.naoOperacional`. Uma função pura (`src/lib/financeiro/anoBaseEstrategico.ts`) soma receita/custo e o que ficou fora a partir dos lançamentos já com a categoria resolvida; `buscarAnoBaseConsolidado` busca os lançamentos (categoria própria ou do título da baixa) e chama a função. A tela mostra o aviso montado por `textoForaDaBase`.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 + Postgres 16, Zod 4, Vitest 4, Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-11-26-estrategico-sem-financiamento-design.md`

## Global Constraints

- Textos de tela, ajuda, commits e testes em pt-BR.
- Rótulo da caixa: "Não operacional". Explicação: "Empréstimos, aportes de sócio e amortização de dívida. Ficam fora da receita e do custo do Fluxo de caixa estratégico."
- Selo na lista de categorias: "Não operacional".
- Receita = entradas − saídas nas categorias de RECEITA operacionais; Custo = saídas − entradas nas de DESPESA operacionais.
- Categoria do lançamento = `lancamento.categoriaFinanceira` ou, se vazia, a do título da baixa (`baixa.parcela.titulo.categoriaFinanceira`).
- Saldo de partida (`saldoCaixaBase`) não muda.
- Arquivos do repo têm CRLF/LF misturados: editar com a ferramenta Edit; **nunca rodar prettier** nem `prisma format`. Linhas até ~120 colunas.
- Vitest pelo PowerShell: `Set-Location D:\Projetos\nx-control-erp; npx vitest run <arquivo>` (pelo Bash o cwd quebra os testes). Os testes usam o Postgres de dev.
- Todo commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (conferir com `git log -1 --format=%B`).
- Não mexer na exportação do estratégico, no realizado, no projetado, no dashboard nem no fluxo por dimensão.

---

### Task 1: Coluna `naoOperacional` e cadastro de categoria (serviço)

**Files:**
- Modify: `prisma/schema.prisma` (model `CategoriaFinanceira`)
- Create: `prisma/migrations/20261126180000_categoria_nao_operacional/migration.sql`
- Modify: `src/lib/schemas/categoriaFinanceira.ts`
- Modify: `src/server/services/categoriaFinanceira.ts`
- Test: `src/server/services/categoriaFinanceira.test.ts`

**Interfaces:**
- Produces: `CategoriaFinanceira.naoOperacional: boolean` (Prisma); `categoriaFinanceiraSchema` com `naoOperacional` (checkbox → boolean); tipo `CategoriaFinanceiraDados` aceito por `criarCategoriaFinanceira(sessao, dados)` e `atualizarCategoriaFinanceira(sessao, id, dados)` com `naoOperacional?: boolean` (ausente = `false`).

- [ ] **Step 1: Schema Prisma**

No model `CategoriaFinanceira`, logo depois de `parentId     String?`, acrescentar (alinhado com os demais campos):

```prisma
  naoOperacional Boolean                @default(false)
```

- [ ] **Step 2: Migration**

Criar `prisma/migrations/20261126180000_categoria_nao_operacional/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "categorias_financeiras" ADD COLUMN     "naoOperacional" BOOLEAN NOT NULL DEFAULT false;
```

Aplicar e gerar o client (PowerShell):

```
npx prisma migrate deploy; npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: o `diff` final sai com código 0 (sem diferença).

- [ ] **Step 3: Testes que falham**

Em `src/server/services/categoriaFinanceira.test.ts`, dentro do `describe` existente, acrescentar:

```ts
  test("grava naoOperacional ao criar e ao atualizar, e audita o campo", async () => {
    const categoria = await criarCategoriaFinanceira(sessaoFilialA, {
      nome: "Empréstimos recebidos",
      tipo: "RECEITA",
      naoOperacional: true,
    });
    expect(categoria.naoOperacional).toBe(true);

    const atualizada = await atualizarCategoriaFinanceira(sessaoFilialA, categoria.id, {
      nome: "Empréstimos recebidos",
      tipo: "RECEITA",
      naoOperacional: false,
    });
    expect(atualizada.naoOperacional).toBe(false);

    const auditoria = await prisma.auditLog.findFirstOrThrow({
      where: { entidade: "CategoriaFinanceira", entidadeId: categoria.id, acao: "ATUALIZAR" },
    });
    expect(auditoria.anterior).toMatchObject({ naoOperacional: true });
    expect(auditoria.novo).toMatchObject({ naoOperacional: false });
  });

  test("sem naoOperacional, a categoria nasce operacional", async () => {
    const categoria = await criarCategoriaFinanceira(sessaoFilialA, { nome: "Vendas", tipo: "RECEITA" });
    expect(categoria.naoOperacional).toBe(false);
  });
```

E um teste do schema (mesmo arquivo, fora do `describe` de integração, importando `categoriaFinanceiraSchema` de `@/lib/schemas/categoriaFinanceira`):

```ts
describe("categoriaFinanceiraSchema", () => {
  test("a caixa marcada vira true e a ausente vira false", () => {
    expect(categoriaFinanceiraSchema.parse({ nome: "Aporte", tipo: "RECEITA", naoOperacional: "on" }).naoOperacional)
      .toBe(true);
    expect(categoriaFinanceiraSchema.parse({ nome: "Vendas", tipo: "RECEITA" }).naoOperacional).toBe(false);
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run src/server/services/categoriaFinanceira.test.ts`
Expected: FAIL (`naoOperacional` undefined / não gravado).

- [ ] **Step 5: Implementar**

`src/lib/schemas/categoriaFinanceira.ts`:

```ts
import { z } from "zod";
import { TIPO_CATEGORIA_FINANCEIRA } from "./enums";
import { checkboxSchema } from "./campos";

export const categoriaFinanceiraSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  tipo: z.enum(TIPO_CATEGORIA_FINANCEIRA),
  parentId: z.string().trim().optional().or(z.literal("")),
  naoOperacional: checkboxSchema,
});

export type CategoriaFinanceiraFormValues = z.infer<typeof categoriaFinanceiraSchema>;

/** O que o serviço aceita: igual ao formulário, mas `naoOperacional` ausente vale `false`. */
export type CategoriaFinanceiraDados = Omit<CategoriaFinanceiraFormValues, "naoOperacional"> & {
  naoOperacional?: boolean;
};
```

(Não usar `.optional()` no `checkboxSchema`: no zod 4.6 o preprocess não roda com a chave ausente.)

`src/server/services/categoriaFinanceira.ts`:
- trocar o import para `import type { CategoriaFinanceiraDados } from "@/lib/schemas/categoriaFinanceira";` e o tipo de `dados` nas duas funções para `CategoriaFinanceiraDados`;
- em `criarCategoriaFinanceira`: `const naoOperacional = dados.naoOperacional ?? false;`, `data: { nome: dados.nome, tipo: dados.tipo, parentId, naoOperacional, filialId: sessao.filialId }` e `novo: { nome: dados.nome, tipo: dados.tipo, parentId, naoOperacional }`;
- em `atualizarCategoriaFinanceira`: mesma constante, `data: { nome: dados.nome, tipo: dados.tipo, parentId, naoOperacional }`, `anterior: { nome: anterior.nome, tipo: anterior.tipo, parentId: anterior.parentId, naoOperacional: anterior.naoOperacional }`, `novo: { nome: dados.nome, tipo: dados.tipo, parentId, naoOperacional }`.

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/server/services/categoriaFinanceira.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261126180000_categoria_nao_operacional src/lib/schemas/categoriaFinanceira.ts src/server/services/categoriaFinanceira.ts src/server/services/categoriaFinanceira.test.ts
git commit -m "feat(categorias): marca de categoria não operacional

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Caixa e selo no cadastro de categorias, ajuda e doc da API

**Files:**
- Modify: `src/app/(dashboard)/cadastros/categorias/categoria-financeira-dialog-form.tsx`
- Modify: `src/app/(dashboard)/cadastros/categorias/page.tsx`
- Modify: `src/ajuda/categorias/index.tsx`
- Modify: `docs/api-v1.md` (seção das rotas de consulta, perto de `GET /categorias-financeiras`)
- Test: `src/ajuda/cadastros-financeiros.test.ts`

**Interfaces:**
- Consumes: `naoOperacional` do schema/serviço (Task 1). A API `GET /categorias-financeiras` já devolve o objeto inteiro do Prisma, então o campo sai sem mudar a rota.

- [ ] **Step 1: Teste da ajuda que falha**

Em `src/ajuda/cadastros-financeiros.test.ts` (já importa `createElement`, `renderToStaticMarkup`, `ajudaCategorias` e tem o helper `roteiroDe`), acrescentar:

```ts
  test("categorias: o formulário mostra a caixa Não operacional e o roteiro explica quando marcar", () => {
    const html = renderToStaticMarkup(createElement(ajudaCategorias.cenas.nova, { valores: {} }));
    expect(html).toContain("Não operacional");
    const passo = roteiroDe(ajudaCategorias, "cadastrar-categoria").passos.find((p) => p.alvo === "form.naoOperacional");
    expect(passo?.explicacao).toContain("estratégico");
  });
```

Run: `npx vitest run src/ajuda/cadastros-financeiros.test.ts`
Expected: FAIL.

- [ ] **Step 2: Diálogo**

Em `categoria-financeira-dialog-form.tsx`:
- no tipo local `CategoriaFinanceira`, acrescentar `naoOperacional: boolean;`;
- depois do bloco "Categoria pai" e antes da mensagem de erro:

```tsx
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="naoOperacional"
                defaultChecked={categoria?.naoOperacional ?? false}
                className="size-4"
              />
              Não operacional
            </label>
            <p className="text-xs text-muted-foreground">
              Empréstimos, aportes de sócio e amortização de dívida. Ficam fora da receita e do custo do Fluxo de caixa
              estratégico.
            </p>
          </div>
```

- [ ] **Step 3: Lista**

Em `page.tsx`, na célula do nome:

```tsx
              <TableCell className="font-medium">
                {categoria.nome}
                {categoria.naoOperacional && (
                  <Badge variant="outline" className="ml-2">
                    Não operacional
                  </Badge>
                )}
              </TableCell>
```

- [ ] **Step 4: Ajuda de categorias (espelho)**

Em `src/ajuda/categorias/index.tsx`:
- `ALVOS.nova` passa a ser `["form.nome", "form.tipo", "form.pai", "form.naoOperacional", "form.salvar"]`;
- `campos-simulados` não tem caixa simulada: desenhar com `Alvo` (já importado):

```tsx
      <Alvo nome="form.naoOperacional" className="space-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled checked={valores["form.naoOperacional"] === "sim"} className="size-4" readOnly />
          Não operacional
        </label>
        <p className="text-xs text-muted-foreground">
          Empréstimos, aportes de sócio e amortização de dívida. Ficam fora da receita e do custo do Fluxo de caixa
          estratégico.
        </p>
      </Alvo>
```

colocado em `CenaNova` entre o `SelectSimulado` do pai e o botão Salvar;
- no roteiro `cadastrar-categoria`, entre o passo `form.pai` e o `form.salvar`:

```ts
        {
          cena: "nova",
          alvo: "form.naoOperacional",
          instrucao: "Deixe “Não operacional” desmarcado",
          explicacao:
            "Taxa de cartão é custo da operação. Marque só as categorias de empréstimo recebido, aporte de sócio e " +
            "amortização de dívida: elas ficam fora da receita e do custo do Fluxo de caixa estratégico, que projeta " +
            "a operação. O resto do sistema (Tesouraria, fluxos, Orçamento) continua mostrando esses lançamentos.",
        },
```

- [ ] **Step 5: Doc da API**

Em `docs/api-v1.md`, depois do parágrafo de `GET /fornecedores` e `GET /clientes` (`classificacaoFiscalPadrao`), acrescentar:

```md
`GET /categorias-financeiras` traz também `naoOperacional` (`true` ou `false`): categorias de empréstimo, aporte e amortização marcadas assim ficam fora da receita e do custo do Fluxo de caixa estratégico.
```

- [ ] **Step 6: Rodar testes e tipos**

Run: `npx vitest run src/ajuda/cadastros-financeiros.test.ts src/app/api/v1/categorias-financeiras/route.test.ts; npx tsc --noEmit`
Expected: PASS e tsc sem erros.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/cadastros/categorias" src/ajuda/categorias/index.tsx src/ajuda/cadastros-financeiros.test.ts docs/api-v1.md
git commit -m "feat(categorias): caixa Não operacional no cadastro e na ajuda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Soma pura do ano-base e texto do aviso

**Files:**
- Create: `src/lib/financeiro/anoBaseEstrategico.ts`
- Test: `src/lib/financeiro/anoBaseEstrategico.test.ts`

**Interfaces:**
- Produces:

```ts
export type CategoriaDoAnoBase = { tipo: "RECEITA" | "DESPESA"; naoOperacional: boolean };
export type LancamentoDoAnoBase = { tipo: "ENTRADA" | "SAIDA"; valor: number; categoria: CategoriaDoAnoBase | null };
export type EntradasESaidas = { entradas: number; saidas: number };
export type ForaDaBase = { naoOperacional: EntradasESaidas; semCategoria: EntradasESaidas };
export type SomaDoAnoBase = { receitaBase: number; custoBase: number; foraDaBase: ForaDaBase };
export function somarAnoBase(lancamentos: readonly LancamentoDoAnoBase[]): SomaDoAnoBase;
export function textoForaDaBase(fora: ForaDaBase): string | null;
```

- [ ] **Step 1: Testes que falham**

```ts
import { describe, expect, test } from "vitest";
import { formatarMoeda } from "@/lib/formatacao";
import { somarAnoBase, textoForaDaBase, type LancamentoDoAnoBase } from "./anoBaseEstrategico";

const RECEITA = { tipo: "RECEITA" as const, naoOperacional: false };
const DESPESA = { tipo: "DESPESA" as const, naoOperacional: false };
const EMPRESTIMO = { tipo: "RECEITA" as const, naoOperacional: true };
const AMORTIZACAO = { tipo: "DESPESA" as const, naoOperacional: true };

describe("somarAnoBase", () => {
  test("exemplo da spec: vendas, insumos com devolução, custeio, amortização e tarifa sem categoria", () => {
    const lancamentos: LancamentoDoAnoBase[] = [
      { tipo: "ENTRADA", valor: 220_000, categoria: RECEITA },
      { tipo: "SAIDA", valor: 90_000, categoria: DESPESA },
      { tipo: "ENTRADA", valor: 200, categoria: DESPESA },
      { tipo: "ENTRADA", valor: 100_000, categoria: EMPRESTIMO },
      { tipo: "SAIDA", valor: 20_000, categoria: AMORTIZACAO },
      { tipo: "SAIDA", valor: 50, categoria: null },
    ];
    expect(somarAnoBase(lancamentos)).toEqual({
      receitaBase: 220_000,
      custoBase: 89_800,
      foraDaBase: {
        naoOperacional: { entradas: 100_000, saidas: 20_000 },
        semCategoria: { entradas: 0, saidas: 50 },
      },
    });
  });

  test("estorno lançado como saída numa categoria de receita reduz a receita", () => {
    const soma = somarAnoBase([
      { tipo: "ENTRADA", valor: 1000, categoria: RECEITA },
      { tipo: "SAIDA", valor: 150, categoria: RECEITA },
    ]);
    expect(soma.receitaBase).toBe(850);
    expect(soma.custoBase).toBe(0);
  });

  test("sem lançamentos, tudo zero", () => {
    expect(somarAnoBase([])).toEqual({
      receitaBase: 0,
      custoBase: 0,
      foraDaBase: { naoOperacional: { entradas: 0, saidas: 0 }, semCategoria: { entradas: 0, saidas: 0 } },
    });
  });

  test("soma centavos sem erro de ponto flutuante", () => {
    const soma = somarAnoBase([
      { tipo: "ENTRADA", valor: 0.1, categoria: RECEITA },
      { tipo: "ENTRADA", valor: 0.2, categoria: RECEITA },
    ]);
    expect(soma.receitaBase).toBe(0.3);
  });
});

describe("textoForaDaBase", () => {
  const zerado = { entradas: 0, saidas: 0 };

  test("nada fora: sem aviso", () => {
    expect(textoForaDaBase({ naoOperacional: zerado, semCategoria: zerado })).toBeNull();
  });

  test("lista só as partes diferentes de zero", () => {
    expect(
      textoForaDaBase({ naoOperacional: { entradas: 100_000, saidas: 20_000 }, semCategoria: { entradas: 1500, saidas: 0 } }),
    ).toBe(
      `Ficaram fora do ano-base: ${formatarMoeda(100_000)} de entradas e ${formatarMoeda(20_000)} de saídas em ` +
        `categorias não operacionais; ${formatarMoeda(1500)} de entradas sem categoria.`,
    );
    expect(textoForaDaBase({ naoOperacional: zerado, semCategoria: { entradas: 0, saidas: 50 } })).toBe(
      `Ficaram fora do ano-base: ${formatarMoeda(50)} de saídas sem categoria.`,
    );
  });
});
```

Run: `npx vitest run src/lib/financeiro/anoBaseEstrategico.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 2: Implementar**

`src/lib/financeiro/anoBaseEstrategico.ts`:

```ts
import { formatarMoeda } from "@/lib/formatacao";

/**
 * Ano-base do Fluxo de caixa estratégico, por categoria (item 63 do backlog): receita = entradas − saídas nas
 * categorias de receita operacionais; custo = saídas − entradas nas de despesa operacionais. Categoria não
 * operacional (empréstimo, aporte, amortização) e lançamento sem categoria ficam fora e voltam à parte.
 * Pura (sem banco): o serviço resolve a categoria de cada lançamento antes.
 */
export type CategoriaDoAnoBase = { tipo: "RECEITA" | "DESPESA"; naoOperacional: boolean };
export type LancamentoDoAnoBase = { tipo: "ENTRADA" | "SAIDA"; valor: number; categoria: CategoriaDoAnoBase | null };
export type EntradasESaidas = { entradas: number; saidas: number };
export type ForaDaBase = { naoOperacional: EntradasESaidas; semCategoria: EntradasESaidas };
export type SomaDoAnoBase = { receitaBase: number; custoBase: number; foraDaBase: ForaDaBase };

const emCentavos = (valor: number) => Math.round(valor * 100);
const emReais = (centavos: number) => centavos / 100;

export function somarAnoBase(lancamentos: readonly LancamentoDoAnoBase[]): SomaDoAnoBase {
  let receita = 0;
  let custo = 0;
  const fora = { naoOperacional: { entradas: 0, saidas: 0 }, semCategoria: { entradas: 0, saidas: 0 } };

  for (const l of lancamentos) {
    const centavos = emCentavos(l.valor);
    const entrada = l.tipo === "ENTRADA";
    if (!l.categoria || l.categoria.naoOperacional) {
      const grupo = l.categoria ? fora.naoOperacional : fora.semCategoria;
      if (entrada) grupo.entradas += centavos;
      else grupo.saidas += centavos;
    } else if (l.categoria.tipo === "RECEITA") {
      receita += entrada ? centavos : -centavos;
    } else {
      custo += entrada ? -centavos : centavos;
    }
  }

  return {
    receitaBase: emReais(receita),
    custoBase: emReais(custo),
    foraDaBase: {
      naoOperacional: { entradas: emReais(fora.naoOperacional.entradas), saidas: emReais(fora.naoOperacional.saidas) },
      semCategoria: { entradas: emReais(fora.semCategoria.entradas), saidas: emReais(fora.semCategoria.saidas) },
    },
  };
}

function partes({ entradas, saidas }: EntradasESaidas): string | null {
  const itens = [
    entradas !== 0 ? `${formatarMoeda(entradas)} de entradas` : null,
    saidas !== 0 ? `${formatarMoeda(saidas)} de saídas` : null,
  ].filter((item): item is string => item !== null);
  return itens.length > 0 ? itens.join(" e ") : null;
}

/** O aviso da tela; `null` quando nada ficou fora. */
export function textoForaDaBase(fora: ForaDaBase): string | null {
  const naoOperacional = partes(fora.naoOperacional);
  const semCategoria = partes(fora.semCategoria);
  const frases = [
    naoOperacional ? `${naoOperacional} em categorias não operacionais` : null,
    semCategoria ? `${semCategoria} sem categoria` : null,
  ].filter((frase): frase is string => frase !== null);
  return frases.length > 0 ? `Ficaram fora do ano-base: ${frases.join("; ")}.` : null;
}
```

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run src/lib/financeiro/anoBaseEstrategico.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/financeiro/anoBaseEstrategico.ts src/lib/financeiro/anoBaseEstrategico.test.ts
git commit -m "feat(estrategico): soma do ano-base por categoria

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `buscarAnoBaseConsolidado` por categoria

**Files:**
- Modify: `src/server/services/fluxoDeCaixaEstrategico.ts` (`buscarAnoBaseConsolidado`, `listarProjecaoEstrategica`)
- Test: `src/server/services/fluxoDeCaixaEstrategico.test.ts`
- Test: `src/server/services/filiaisConsolidadas.test.ts`

**Interfaces:**
- Consumes: `somarAnoBase`, `ForaDaBase`, `LancamentoDoAnoBase` (Task 3); `CategoriaFinanceira.naoOperacional` (Task 1).
- Produces: `buscarAnoBaseConsolidado(empresaId, opcoes?) → Promise<{ receitaBase: number; custoBase: number; saldoCaixaBase: number; foraDaBase: ForaDaBase }>`; `listarProjecaoEstrategica(sessao, opcoes?) → Promise<{ cenarios; projecoes; foraDaBase: ForaDaBase }>`.

- [ ] **Step 1: Ajustar os testes existentes para lançar com categoria**

Os testes atuais criam lançamentos sem categoria; pela regra nova eles ficariam fora da base.

Em `fluxoDeCaixaEstrategico.test.ts`:
- no teste "soma os últimos 12 meses de 2 filiais": criar uma categoria de RECEITA em cada filial e passar `categoriaFinanceiraId` nos dois lançamentos:

```ts
    const receitaFilial1 = await prisma.categoriaFinanceira.create({
      data: { filialId: fixture.filialId, nome: "Vendas FCE", tipo: "RECEITA" },
    });
    const receitaFilial2 = await prisma.categoriaFinanceira.create({
      data: { filialId: filial2.id, nome: "Vendas FCE2", tipo: "RECEITA" },
    });
```

(`categoriaFinanceiraId: receitaFilial1.id` no primeiro lançamento, `receitaFilial2.id` no segundo; no fim do teste, depois de apagar os lançamentos da filial 2 e antes de apagar a filial: `await prisma.categoriaFinanceira.deleteMany({ where: { filialId: filial2.id } });`. A da filial 1 sai no `limparFixtureFinanceiro`, que apaga lançamentos antes das categorias.)
- no `describe` FG5: criar no `beforeAll`, antes dos `lancar`, `receitaId` (RECEITA) e `despesaId` (DESPESA) na filial da fixture; `lancar` ganha o parâmetro `categoriaFinanceiraId: string | null` (padrão: `receitaId` para ENTRADA, `despesaId` para SAIDA) e grava `categoriaFinanceiraId` (a transferência vai com `null`). Os lançamentos criados direto nos testes "aguardando conciliação" e "data futura" ganham `categoriaFinanceiraId: despesaId` (são SAÍDAS). As expectativas com `toEqual` passam a incluir `foraDaBase: { naoOperacional: { entradas: 0, saidas: 0 }, semCategoria: { entradas: 0, saidas: 0 } }` (a transferência é excluída antes da soma e não conta como "sem categoria").

Em `filiaisConsolidadas.test.ts`: os dois lançamentos de ENTRADA (filial ativa e desativada) ganham categoria de RECEITA da própria filial: na ativa, criar `prisma.categoriaFinanceira.create({ data: { filialId: fixture.filialId, nome: "Vendas FCONS", tipo: "RECEITA" } })`; na desativada, uma igual com `filialId: comPendencia.id` (e apagá-la na limpeza do arquivo, antes da filial).

- [ ] **Step 2: Testes novos que falham**

No `describe` FG5 de `fluxoDeCaixaEstrategico.test.ts`, acrescentar ao fim (os valores se somam ao que o `beforeAll` já lançou: receita 1300, custo 100 na visão "Todos"; os testes anteriores do bloco acrescentam SAÍDAS futuras/não conciliadas que não entram no ano-base, e a de 300 conciliada é futura — fora da janela). Para não depender da ordem, cada teste mede a diferença contra uma leitura anterior:

```ts
  test("empréstimo e amortização em categoria não operacional ficam fora, e voltam à parte", async () => {
    const emprestimo = await prisma.categoriaFinanceira.create({
      data: { filialId: fixture.filialId, nome: "Empréstimos FG5", tipo: "RECEITA", naoOperacional: true },
    });
    const amortizacao = await prisma.categoriaFinanceira.create({
      data: { filialId: fixture.filialId, nome: "Amortização FG5", tipo: "DESPESA", naoOperacional: true },
    });
    const antes = await buscarAnoBaseConsolidado(fixture.empresaId);
    await lancar("ENTRADA", 100_000, "FISCAL", "MANUAL", emprestimo.id);
    await lancar("SAIDA", 20_000, "FISCAL", "MANUAL", amortizacao.id);
    const depois = await buscarAnoBaseConsolidado(fixture.empresaId);
    expect(depois.receitaBase).toBe(antes.receitaBase);
    expect(depois.custoBase).toBe(antes.custoBase);
    expect(depois.foraDaBase.naoOperacional).toEqual({
      entradas: antes.foraDaBase.naoOperacional.entradas + 100_000,
      saidas: antes.foraDaBase.naoOperacional.saidas + 20_000,
    });
  });

  test("devolução lançada como entrada numa categoria de despesa reduz o custo", async () => {
    const antes = await buscarAnoBaseConsolidado(fixture.empresaId);
    await lancar("ENTRADA", 200, "FISCAL", "MANUAL", despesaId);
    const depois = await buscarAnoBaseConsolidado(fixture.empresaId);
    expect(depois.custoBase).toBe(antes.custoBase - 200);
    expect(depois.receitaBase).toBe(antes.receitaBase);
  });

  test("lançamento sem categoria fica fora e aparece em semCategoria", async () => {
    const antes = await buscarAnoBaseConsolidado(fixture.empresaId);
    await lancar("SAIDA", 50, "FISCAL", "MANUAL", null);
    const depois = await buscarAnoBaseConsolidado(fixture.empresaId);
    expect(depois.custoBase).toBe(antes.custoBase);
    expect(depois.foraDaBase.semCategoria.saidas).toBe(antes.foraDaBase.semCategoria.saidas + 50);
  });

  test("lançamento de baixa sem categoria própria usa a categoria do título", async () => {
    const titulo = await prisma.titulo.create({
      data: {
        filialId: fixture.filialId,
        tipo: "RECEBER",
        clienteId: fixture.clienteId,
        categoriaFinanceiraId: receitaId,
        documento: "FG5-BAIXA",
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        parcelas: {
          create: { numero: 1, dataVencimento: new Date(), valorOriginal: 400, valorAtualizado: 400, status: "PAGO" },
        },
      },
      include: { parcelas: true },
    });
    const baixa = await prisma.baixa.create({
      data: {
        parcelaId: titulo.parcelas[0].id,
        data: new Date(),
        valorPago: 400,
        contaBancariaId: fixture.contaBancariaId,
        usuarioId: fixture.usuarioId,
        statusAprovacao: "APROVADO",
      },
    });
    const antes = await buscarAnoBaseConsolidado(fixture.empresaId);
    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date(),
        tipo: "ENTRADA",
        valor: 400,
        descricao: "Baixa FG5 sem categoria no lançamento",
        origem: "BAIXA",
        baixaId: baixa.id,
        usuarioId: fixture.usuarioId,
        conciliado: true,
        classificacaoFiscal: "FISCAL",
      },
    });
    const depois = await buscarAnoBaseConsolidado(fixture.empresaId);
    expect(depois.receitaBase).toBe(antes.receitaBase + 400);
    expect(depois.foraDaBase.semCategoria).toEqual(antes.foraDaBase.semCategoria);
  });

  test("listarProjecaoEstrategica devolve o que ficou fora do ano-base", async () => {
    const { foraDaBase } = await listarProjecaoEstrategica(fixture.sessao);
    expect(foraDaBase).toEqual((await buscarAnoBaseConsolidado(fixture.empresaId)).foraDaBase);
  });
```

Os campos acima foram conferidos no schema (Titulo: `documento`, `dataEmissao`, `dataCompetencia`; Parcela: `dataVencimento`, `valorOriginal`, `valorAtualizado`; Baixa: `data`, `statusAprovacao: "APROVADO"`). `limparFixtureFinanceiro` já apaga lançamentos, baixas, parcelas e títulos antes das categorias.

Run: `npx vitest run src/server/services/fluxoDeCaixaEstrategico.test.ts src/server/services/filiaisConsolidadas.test.ts`
Expected: FAIL (`foraDaBase` ausente; receitas somando sem categoria).

- [ ] **Step 3: Implementar**

Em `fluxoDeCaixaEstrategico.ts`:
- importar `import { somarAnoBase, type ForaDaBase, type LancamentoDoAnoBase } from "@/lib/financeiro/anoBaseEstrategico";`
- substituir o `groupBy` por um `findMany` e a montagem do retorno:

```ts
const CATEGORIA_DO_ANO_BASE = { select: { tipo: true, naoOperacional: true } } as const;

export async function buscarAnoBaseConsolidado(
  empresaId: string,
  opcoes: { classificacao?: FiltroClassificacao } = {},
): Promise<{ receitaBase: number; custoBase: number; saldoCaixaBase: number; foraDaBase: ForaDaBase }> {
  const filialIds = await idsDasFiliaisAtivas(empresaId);
  const hoje = new Date();
  const inicioJanela = new Date(hoje);
  inicioJanela.setUTCFullYear(inicioJanela.getUTCFullYear() - 1);

  const [saldoCaixaBase, lancamentos] = await Promise.all([
    opcoes.classificacao
      ? Promise.resolve(0)
      : Promise.all([
          buscarSaldoConciliadoDasFiliais(filialIds),
          buscarAguardandoConciliacaoDasFiliais(filialIds),
        ]).then(([conciliado, aguardando]) => saldoComAguardando(conciliado, aguardando)),
    prisma.lancamentoBancario.findMany({
      where: {
        filialId: { in: filialIds },
        conciliado: true,
        ...SEM_TRANSFERENCIA,
        data: { gte: inicioJanela, lte: hoje },
        contaBancaria: { ativo: true },
        ...whereLancamentoPorClassificacao(opcoes.classificacao),
      },
      select: {
        tipo: true,
        valor: true,
        categoriaFinanceira: CATEGORIA_DO_ANO_BASE,
        baixa: { select: { parcela: { select: { titulo: { select: { categoriaFinanceira: CATEGORIA_DO_ANO_BASE } } } } } },
      },
    }),
  ]);

  const paraSomar: LancamentoDoAnoBase[] = lancamentos.map((l) => ({
    tipo: l.tipo,
    valor: Number(l.valor),
    categoria: l.categoriaFinanceira ?? l.baixa?.parcela.titulo.categoriaFinanceira ?? null,
  }));
  return { ...somarAnoBase(paraSomar), saldoCaixaBase };
}
```

- atualizar o comentário JSDoc da função: receita e custo por categoria (regra da spec), categorias não operacionais e lançamentos sem categoria em `foraDaBase`; manter as frases sobre classificação, transferências e saldo de partida.
- `listarProjecaoEstrategica`: tipo de retorno ganha `foraDaBase: ForaDaBase` e o `return { cenarios, projecoes, foraDaBase: anoBase.foraDaBase };`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/services/fluxoDeCaixaEstrategico.test.ts src/server/services/filiaisConsolidadas.test.ts; npx tsc --noEmit`
Expected: PASS e tsc sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/fluxoDeCaixaEstrategico.ts src/server/services/fluxoDeCaixaEstrategico.test.ts src/server/services/filiaisConsolidadas.test.ts
git commit -m "fix(estrategico): ano-base por categoria, sem empréstimos e aportes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Aviso na tela do estratégico

**Files:**
- Create: `src/app/(dashboard)/financeiro/fluxo-de-caixa-estrategico/aviso-fora-da-base.tsx`
- Modify: `src/app/(dashboard)/financeiro/fluxo-de-caixa-estrategico/page.tsx`

**Interfaces:**
- Consumes: `textoForaDaBase`, `ForaDaBase` (Task 3); `foraDaBase` de `listarProjecaoEstrategica` (Task 4).

- [ ] **Step 1: Componente**

```tsx
import Link from "next/link";
import { textoForaDaBase, type ForaDaBase } from "@/lib/financeiro/anoBaseEstrategico";

/** O que ficou fora do ano-base (categorias não operacionais e lançamentos sem categoria). */
export function AvisoForaDaBase({ foraDaBase }: { foraDaBase: ForaDaBase }) {
  const texto = textoForaDaBase(foraDaBase);
  if (!texto) return null;
  const temSemCategoria = foraDaBase.semCategoria.entradas !== 0 || foraDaBase.semCategoria.saidas !== 0;
  return (
    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="note">
      {texto}
      {temSemCategoria && (
        <>
          {" "}
          Para incluir os lançamentos sem categoria, classifique-os na{" "}
          <Link href="/financeiro/tesouraria" className="underline">
            Tesouraria
          </Link>
          .
        </>
      )}
    </p>
  );
}
```

(Conferir a rota da Tesouraria: `src/app/(dashboard)/financeiro/tesouraria/page.tsx` → `/financeiro/tesouraria`.)

- [ ] **Step 2: Página**

Em `page.tsx`:
- desestruturar `const [{ cenarios, projecoes, foraDaBase }, desativadas] = ...`;
- importar `AvisoForaDaBase` de `./aviso-fora-da-base`;
- renderizar `<AvisoForaDaBase foraDaBase={foraDaBase} />` logo depois de `<AvisoFiliaisDesativadas ... />`;
- trocar o texto do cabeçalho por:

```tsx
          Projeção de 5 anos por cenário, consolidando as filiais ativas
          da empresa a partir da receita e do custo conciliados dos últimos
          12 meses, por categoria (sem as categorias não operacionais:
          empréstimos, aportes e amortização). Não considera prazo de
          recebimento/pagamento, capital de giro nem amortização de dívida
          (juros incidem sobre o saldo devedor acumulado, que nunca é
          amortizado).
```

- [ ] **Step 3: Tipos e lint**

Run: `npx tsc --noEmit; npx eslint "src/app/(dashboard)/financeiro/fluxo-de-caixa-estrategico"`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/financeiro/fluxo-de-caixa-estrategico"
git commit -m "feat(estrategico): aviso do que ficou fora do ano-base

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ajuda do estratégico

**Files:**
- Modify: `src/ajuda/fluxo-de-caixa-estrategico/exemplo.ts`
- Modify: `src/ajuda/fluxo-de-caixa-estrategico/alvos.ts`
- Modify: `src/ajuda/fluxo-de-caixa-estrategico/cenas.tsx`
- Modify: `src/ajuda/fluxo-de-caixa-estrategico/roteiros.ts`
- Test: `src/ajuda/fluxo-de-caixa-estrategico/roteiros.test.ts`

**Interfaces:**
- Consumes: `textoForaDaBase`, `ForaDaBase` (Task 3).

- [ ] **Step 1: Teste que falha**

Em `roteiros.test.ts`:

```ts
  test("a cena mostra o aviso do que ficou fora do ano-base, com os números do exemplo", () => {
    const html = renderToStaticMarkup(createElement(cenas.painel, { valores: {} }));
    expect(html).toContain("categorias não operacionais");
    const passo = roteiros[0].passos.find((p) => p.alvo === "painel.foraDaBase");
    expect(passo?.explicacao).toContain("Não operacional");
    expect(roteiros[0].passos.some((p) => (p.dica ?? "").includes("entram como receita"))).toBe(false);
  });
```

Run: `npx vitest run src/ajuda/fluxo-de-caixa-estrategico/roteiros.test.ts`
Expected: FAIL.

- [ ] **Step 2: Exemplo, alvo e cena**

`exemplo.ts`: trocar o comentário de `ANO_BASE` por "Ano-base: receita e custo conciliados dos últimos 12 meses, por categoria (sem as não operacionais); saldo em caixa de hoje (conciliado + aguardando conciliação, o mesmo de onde parte o Fluxo de caixa projetado)." e acrescentar:

```ts
import type { ForaDaBase } from "@/lib/financeiro/anoBaseEstrategico";

/** O custeio de R$ 100.000,00 e as parcelas pagas dele, nas categorias não operacionais; uma tarifa sem categoria. */
export const FORA_DA_BASE: ForaDaBase = {
  naoOperacional: { entradas: 100_000, saidas: 20_000 },
  semCategoria: { entradas: 0, saidas: 1_500 },
};
```

`alvos.ts`: acrescentar `"painel.foraDaBase",` depois de `"painel.aviso",`.

`cenas.tsx`: importar `FORA_DA_BASE` de `./exemplo` e `textoForaDaBase` de `@/lib/financeiro/anoBaseEstrategico`; logo depois do bloco `{filtro && (<Alvo nome="painel.aviso">…)}`, desenhar sempre (o espelho da tela, sem o link):

```tsx
      <Alvo nome="painel.foraDaBase">
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {textoForaDaBase(FORA_DA_BASE)} Para incluir os lançamentos sem categoria, classifique-os na Tesouraria.
        </p>
      </Alvo>
```

- [ ] **Step 3: Roteiro `ler-projecao`**

No passo `BASE.linha.receita`, trocar `explicacao` e `dica`:

```ts
        explicacao:
          "O ponto de partida (o ano-base) é a receita e o custo conciliados nos últimos 12 meses, pela categoria de " +
          "cada lançamento. O Ano 1 é o ano-base mais o crescimento, o Ano 2 é o Ano 1 mais o crescimento, e assim " +
          "por diante. No exemplo, R$ 220.000,00 de receita com 5% a.a. viram R$ 231.000,00 no Ano 1.",
        dica:
          "Receita é o que entrou menos o que saiu nas categorias de receita; custo é o que saiu menos o que entrou " +
          "nas de despesa. Uma devolução de adubo lançada como entrada em Insumos diminui o custo. Transferências " +
          "entre contas ficam de fora.",
```

E inserir, logo depois desse passo:

```ts
      {
        cena: "painel",
        alvo: "painel.foraDaBase",
        instrucao: "O que ficou fora do ano-base",
        explicacao:
          "Empréstimo recebido, aporte de sócio e amortização de dívida não são operação: lançados em categorias " +
          "marcadas como “Não operacional” (Cadastros → Categorias financeiras), ficam fora da receita e do custo. " +
          "Lançamento sem categoria também fica fora. O aviso mostra quanto foi, para você conferir.",
        dica:
          "A amortização da dívida antiga também sai do custo, e a projeção só conta a dívida nova das premissas. " +
          "Se as categorias de empréstimo ainda não estiverem marcadas, elas entram como receita e custo: marque-as " +
          "no cadastro.",
      },
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run src/ajuda/fluxo-de-caixa-estrategico src/ajuda/registro.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ajuda/fluxo-de-caixa-estrategico
git commit -m "docs(ajuda): estratégico explica o ano-base por categoria

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Backlog, verificação geral e navegador

**Files:**
- Modify: `docs/backlog.md` (item 63)
- Modify: `docs/superpowers/specs/2026-11-26-estrategico-sem-financiamento-design.md` (Status)

- [ ] **Step 1: Suíte inteira, tipos e lint**

Run (PowerShell): `npx tsc --noEmit; npx eslint; npx vitest run`
Expected: tudo verde. Falha em teste que lança sem categoria e mede `receitaBase`/`custoBase` → dar categoria ao lançamento do teste (como na Task 4), nunca mudar a regra.

- [ ] **Step 2: Conferir no navegador**

Subir `npm run dev`, entrar (admin@nx-control-erp.local / TrocarSenha123!, Empresa Demonstração):
1. Cadastros → Categorias financeiras: criar "Empréstimos (teste)" do tipo Receita com "Não operacional" marcado; ver o selo na lista; editar e conferir a caixa marcada.
2. Tesouraria: lançar uma entrada de R$ 1.000,00 nessa categoria e conciliar (ou criar conciliado por script); Fluxo de caixa estratégico: o aviso mostra R$ 1.000,00 de entradas em categorias não operacionais e a receita do ano-base não muda.
3. Abrir a ajuda (?) do estratégico e da tela de categorias e passar pelos passos novos.
4. Apagar do banco de dev a categoria e o lançamento de teste; apagar `.playwright-mcp/` se criado.

- [ ] **Step 3: Backlog e spec**

Em `docs/backlog.md`, remover a seção inteira `### 63. Ano-base do estratégico conta empréstimos e aportes como receita` (como foi feito com os itens 61 e 62). Na spec, `Status: implementada (2026-11-26)`.

- [ ] **Step 4: Commit**

```bash
git add docs/backlog.md docs/superpowers/specs/2026-11-26-estrategico-sem-financiamento-design.md
git commit -m "docs(backlog): item 63 sai do backlog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
