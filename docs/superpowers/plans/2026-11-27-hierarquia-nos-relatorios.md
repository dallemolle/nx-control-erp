# Hierarquia nos relatórios — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Orçamento (categorias) e o Fluxo de caixa por dimensão (centros de custo) mostram o pai com o total dele mais o dos descendentes, em linhas recolhíveis, e o cadastro exige categoria pai do mesmo tipo.

**Architecture:** Uma função pura (`montarArvore`) transforma linhas planas (com `parentId`) em lista ordenada em árvore com totais e linhas "Direto em…". Os serviços só passam a devolver `parentId`; a soma acontece na tela e na exportação. Um componente cliente pequeno (`LinhasRecolhiveis`) cuida de recolher/expandir.

**Tech Stack:** Next.js 16 (App Router, server components + server actions), React 19, Prisma 7, Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-11-27-hierarquia-nos-relatorios-design.md`

## Global Constraints

- Textos de tela, ajuda, mensagens e commits em português do Brasil.
- Somas de dinheiro em centavos (`Math.round(valor * 100)`), como `totalDoFluxo` e `montarLinhaComparativo`.
- Mensagem do cadastro: `A categoria pai precisa ser do mesmo tipo (Despesa ou Receita)`.
- Rótulo da linha do valor próprio do pai: `Direto em <nome do pai>`.
- Coluna nova das exportações: `Nível` (1 = topo), tipo `inteiro`.
- Não rodar Prettier em arquivo existente; formatar à mão, linhas até ~120 colunas. Preferir a ferramenta Edit (arquivos com CRLF).
- Rodar testes com `npx vitest run <arquivo>` a partir da raiz `D:\Projetos\nx-control-erp` (PowerShell: `Set-Location D:\Projetos\nx-control-erp; npx vitest run ...`). Os testes usam o Postgres de dev (docker `nx-control-erp-db`).
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Páginas com comentário "Espelhado na ajuda": mudou a tela, ajuste a cena da ajuda (Task 6).

---

### Task 1: Função pura da árvore

**Files:**
- Create: `src/lib/arvoreDeLinhas.ts`
- Test: `src/lib/arvoreDeLinhas.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type LinhaDaArvore = { id: string; parentId: string | null; grupo: string; nome: string };
  export type ItemDaArvore<L, V> = {
    chave: string;            // id da linha, ou `${id}:direto` na linha "Direto em…"
    origem: L;                // a linha de entrada (na "Direto em…", a do pai)
    nome: string;             // "Direto em <pai>" na linha do valor próprio
    nivel: number;            // 1 = topo
    paiChave: string | null;  // chave do pai efetivo na árvore
    temFilhos: boolean;
    direto: boolean;
    valores: V;               // próprio + descendentes (na "Direto em…", só o próprio)
  };
  export function montarArvore<L extends LinhaDaArvore, V extends Record<string, number>>(
    linhas: readonly L[],
    valoresDe: (linha: L) => V,
  ): ItemDaArvore<L, V>[];
  ```

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, expect, test } from "vitest";
import { montarArvore, type LinhaDaArvore } from "./arvoreDeLinhas";

type L = LinhaDaArvore & { valor: number };
const l = (id: string, parentId: string | null, valor: number, grupo = "DESPESA"): L => ({
  id,
  parentId,
  grupo,
  nome: id,
  valor,
});
const arvore = (linhas: L[]) => montarArvore(linhas, (x) => ({ valor: x.valor }));
const resumo = (linhas: L[]) =>
  arvore(linhas).map((i) => [i.chave, i.nivel, i.valores.valor, i.temFilhos, i.direto, i.paiChave]);

describe("montarArvore", () => {
  test("sem pais, devolve a lista na mesma ordem, tudo no nível 1", () => {
    expect(resumo([l("b", null, 1), l("a", null, 2)])).toEqual([
      ["b", 1, 1, false, false, null],
      ["a", 1, 2, false, false, null],
    ]);
  });

  test("pai sem valor próprio soma os filhos e não ganha linha Direto em", () => {
    expect(resumo([l("Bancárias", null, 0), l("Taxas", "Bancárias", 12.5), l("Tarifas", "Bancárias", 45.9)])).toEqual([
      ["Bancárias", 1, 58.4, true, false, null],
      ["Taxas", 2, 12.5, false, false, "Bancárias"],
      ["Tarifas", 2, 45.9, false, false, "Bancárias"],
    ]);
  });

  test("pai com valor próprio ganha a linha Direto em como primeira filha", () => {
    const itens = arvore([l("Bancárias", null, 45.9), l("Taxas", "Bancárias", 12.5)]);
    expect(itens.map((i) => [i.chave, i.nome, i.nivel, i.valores.valor, i.direto])).toEqual([
      ["Bancárias", "Bancárias", 1, 58.4, false],
      ["Bancárias:direto", "Direto em Bancárias", 2, 45.9, true],
      ["Taxas", "Taxas", 2, 12.5, false],
    ]);
    expect(itens[1].origem.id).toBe("Bancárias");
    expect(itens[1].paiChave).toBe("Bancárias");
  });

  test("três níveis: o avô soma netos, filhos e o próprio", () => {
    expect(resumo([l("A", null, 1), l("B", "A", 2), l("C", "B", 3), l("D", null, 4)])).toEqual([
      ["A", 1, 6, true, false, null],
      ["A:direto", 2, 1, false, true, "A"],
      ["B", 2, 5, true, false, "A"],
      ["B:direto", 3, 2, false, true, "B"],
      ["C", 3, 3, false, false, "B"],
      ["D", 1, 4, false, false, null],
    ]);
  });

  test("filho vem logo abaixo do pai mesmo listado antes dele", () => {
    expect(resumo([l("Z-filho", "pai", 1), l("pai", null, 0)]).map((x) => x[0])).toEqual(["pai", "Z-filho"]);
  });

  test("pai fora da lista ou de outro grupo: a linha vira topo", () => {
    expect(resumo([l("órfã", "sumiu", 1), l("pai", null, 0), l("receita", "pai", 2, "RECEITA")])).toEqual([
      ["órfã", 1, 1, false, false, null],
      ["pai", 1, 0, false, false, null],
      ["receita", 1, 2, false, false, null],
    ]);
  });

  test("ciclo não trava: a primeira linha do ciclo na entrada vira topo", () => {
    const itens = resumo([l("x", "y", 1), l("y", "x", 2)]);
    // x vira topo e y fica sob ele; x tem valor próprio, então ganha a linha "Direto em x".
    expect(itens.map((i) => [i[0], i[1], i[2]])).toEqual([
      ["x", 1, 3],
      ["x:direto", 2, 1],
      ["y", 2, 2],
    ]);
  });

  test("soma em centavos, sem resíduo de ponto flutuante", () => {
    expect(arvore([l("p", null, 0.1), l("f", "p", 0.2)])[0].valores.valor).toBe(0.3);
  });

  test("a soma das linhas de nível 1 é a soma plana", () => {
    const linhas = [l("A", null, 1.1), l("B", "A", 2.2), l("C", "B", 3.3), l("D", null, 4.4)];
    const topo = arvore(linhas).filter((i) => i.nivel === 1);
    const soma = topo.reduce((s, i) => s + Math.round(i.valores.valor * 100), 0) / 100;
    expect(soma).toBe(11);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/arvoreDeLinhas.test.ts`
Expected: FAIL (módulo `./arvoreDeLinhas` não existe).

- [ ] **Step 3: Implementar**

```ts
/**
 * Monta a árvore de um relatório a partir de linhas planas com `parentId` (categorias no Orçamento, centros de
 * custo no Fluxo por dimensão). O pai mostra o próprio valor mais o dos descendentes; quando tem valor próprio,
 * ganha uma primeira filha "Direto em <pai>" para a soma das filhas fechar com ele. Pai fora da lista, de outro
 * grupo (ex.: Receita dentro de Despesa) ou fechando um ciclo: a linha vira topo. A ordem entre irmãos é a de
 * entrada.
 */
export type LinhaDaArvore = { id: string; parentId: string | null; grupo: string; nome: string };

export type ItemDaArvore<L, V> = {
  chave: string;
  origem: L;
  nome: string;
  nivel: number;
  paiChave: string | null;
  temFilhos: boolean;
  direto: boolean;
  valores: V;
};

const centavos = (valor: number) => Math.round(valor * 100);

export function montarArvore<L extends LinhaDaArvore, V extends Record<string, number>>(
  linhas: readonly L[],
  valoresDe: (linha: L) => V,
): ItemDaArvore<L, V>[] {
  const porId = new Map(linhas.map((linha) => [linha.id, linha]));
  const paiEfetivo = (linha: L) => {
    const pai = linha.parentId ? porId.get(linha.parentId) : undefined;
    return pai && pai.grupo === linha.grupo && pai.id !== linha.id ? pai.id : null;
  };
  const filhos = new Map<string, L[]>();
  for (const linha of linhas) {
    const pai = paiEfetivo(linha);
    if (pai) filhos.set(pai, [...(filhos.get(pai) ?? []), linha]);
  }

  const visitados = new Set<string>();
  const saida: ItemDaArvore<L, V>[] = [];

  /** Empilha a linha e os descendentes; devolve o total em centavos de cada coluna. */
  function visitar(linha: L, nivel: number, paiChave: string | null): Record<string, number> {
    visitados.add(linha.id);
    const proprio = valoresDe(linha);
    const total: Record<string, number> = {};
    for (const [coluna, valor] of Object.entries(proprio)) total[coluna] = centavos(valor);

    const item: ItemDaArvore<L, V> = {
      chave: linha.id,
      origem: linha,
      nome: linha.nome,
      nivel,
      paiChave,
      temFilhos: false,
      direto: false,
      valores: proprio,
    };
    saida.push(item);

    const meusFilhos = (filhos.get(linha.id) ?? []).filter((filho) => !visitados.has(filho.id));
    if (meusFilhos.length === 0) return total;

    item.temFilhos = true;
    if (Object.values(proprio).some((valor) => centavos(valor) !== 0)) {
      saida.push({
        chave: `${linha.id}:direto`,
        origem: linha,
        nome: `Direto em ${linha.nome}`,
        nivel: nivel + 1,
        paiChave: linha.id,
        temFilhos: false,
        direto: true,
        valores: proprio,
      });
    }
    for (const filho of meusFilhos) {
      if (visitados.has(filho.id)) continue;
      const doFilho = visitar(filho, nivel + 1, linha.id);
      for (const [coluna, valor] of Object.entries(doFilho)) total[coluna] = (total[coluna] ?? 0) + valor;
    }
    const emReais: Record<string, number> = {};
    for (const [coluna, valor] of Object.entries(total)) emReais[coluna] = valor / 100;
    item.valores = emReais as V;
    return total;
  }

  for (const linha of linhas) {
    if (paiEfetivo(linha) === null && !visitados.has(linha.id)) visitar(linha, 1, null);
  }
  // Sobra só quem está num ciclo (o cadastro impede, mas o relatório não pode travar nem perder valor).
  for (const linha of linhas) {
    if (!visitados.has(linha.id)) visitar(linha, 1, null);
  }
  return saida;
}
```

Nota: no ciclo `x → y → x`, `x` é visitado como topo (com "Direto em x", por ter valor próprio) e `y` entra como filho dele (o filho `x` de `y` já foi visitado e é pulado), que é o que o teste espera.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/arvoreDeLinhas.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/arvoreDeLinhas.ts src/lib/arvoreDeLinhas.test.ts
git commit -m "feat(relatorios): árvore de linhas com total do pai e Direto em" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Categoria pai do mesmo tipo

**Files:**
- Modify: `src/server/services/categoriaFinanceira.ts` (`validarParentMesmaFilial`, `criarCategoriaFinanceira`, `atualizarCategoriaFinanceira`)
- Test: `src/server/services/categoriaFinanceira.test.ts` (dentro do `describe("categoriaFinanceira (filial-scoped)")`, antes do `});` da linha ~187)

**Interfaces:**
- Produces: `criarCategoriaFinanceira`/`atualizarCategoriaFinanceira` lançam `Error("A categoria pai precisa ser do mesmo tipo (Despesa ou Receita)")` (e, na troca de tipo com filhas de outro tipo, a mesma frase seguida de `: mude também <nomes>`). A action (`cadastros/categorias/actions.ts`) já devolve `erro.message` ao diálogo — nada a mudar lá.

- [ ] **Step 1: Escrever os testes** (usar `sessaoFilialA` e `filialAId`, já criados no `beforeAll` do arquivo)

```ts
  test("recusa categoria pai de outro tipo, ao criar e ao editar", async () => {
    const despesa = await criarCategoriaFinanceira(sessaoFilialA, { nome: "Despesas bancárias (tipo)", tipo: "DESPESA" });
    await expect(
      criarCategoriaFinanceira(sessaoFilialA, { nome: "Receita dentro", tipo: "RECEITA", parentId: despesa.id }),
    ).rejects.toThrow("A categoria pai precisa ser do mesmo tipo (Despesa ou Receita)");

    const receita = await criarCategoriaFinanceira(sessaoFilialA, { nome: "Venda solta", tipo: "RECEITA" });
    await expect(
      atualizarCategoriaFinanceira(sessaoFilialA, receita.id, { nome: "Venda solta", tipo: "RECEITA", parentId: despesa.id }),
    ).rejects.toThrow("A categoria pai precisa ser do mesmo tipo (Despesa ou Receita)");
  });

  test("recusa trocar o tipo de uma categoria que tem filhas do tipo antigo", async () => {
    const pai = await criarCategoriaFinanceira(sessaoFilialA, { nome: "Grupo que muda", tipo: "DESPESA" });
    await criarCategoriaFinanceira(sessaoFilialA, { nome: "Filha despesa", tipo: "DESPESA", parentId: pai.id });
    await expect(
      atualizarCategoriaFinanceira(sessaoFilialA, pai.id, { nome: "Grupo que muda", tipo: "RECEITA" }),
    ).rejects.toThrow("A categoria pai precisa ser do mesmo tipo (Despesa ou Receita): mude também Filha despesa");
  });

  test("pai do mesmo tipo continua aceito", async () => {
    const pai = await criarCategoriaFinanceira(sessaoFilialA, { nome: "Pai ok", tipo: "DESPESA" });
    const filha = await criarCategoriaFinanceira(sessaoFilialA, { nome: "Filha ok", tipo: "DESPESA", parentId: pai.id });
    expect(filha.parentId).toBe(pai.id);
  });
```

Se o tipo `CategoriaFinanceiraDados` exigir outros campos (ver o topo de `categoriaFinanceira.ts`), complete os objetos com o mínimo que os outros testes do arquivo usam.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/categoriaFinanceira.test.ts`
Expected: os 2 primeiros testes novos FALHAM (nada é recusado hoje); o terceiro passa.

- [ ] **Step 3: Implementar**

Trocar `validarParentMesmaFilial` por:

```ts
const MSG_TIPO_DO_PAI = "A categoria pai precisa ser do mesmo tipo (Despesa ou Receita)";

/** O pai é da mesma filial e do mesmo tipo: Receita dentro de Despesa não soma em nenhum relatório. */
async function validarPai(filialId: string, parentId: string | null, tipo: TipoCategoriaFinanceira) {
  if (!parentId) return;
  const parent = await prisma.categoriaFinanceira.findUnique({ where: { id: parentId } });
  if (!parent || parent.filialId !== filialId) {
    throw new Error("Categoria financeira pai inválida");
  }
  if (parent.tipo !== tipo) throw new Error(MSG_TIPO_DO_PAI);
}
```

(importar `TipoCategoriaFinanceira` de `@prisma/client` se o arquivo ainda não importar).

Em `criarCategoriaFinanceira`: `await validarPai(sessao.filialId, parentId, dados.tipo);`.

Em `atualizarCategoriaFinanceira`: `await validarPai(sessao.filialId, parentId, dados.tipo);` e, logo depois de buscar `anterior`, antes do `update`:

```ts
  if (anterior.tipo !== dados.tipo) {
    const filhasDoOutroTipo = await prisma.categoriaFinanceira.findMany({
      where: { parentId: id, tipo: { not: dados.tipo } },
      select: { nome: true },
      orderBy: { nome: "asc" },
    });
    if (filhasDoOutroTipo.length > 0) {
      throw new Error(`${MSG_TIPO_DO_PAI}: mude também ${filhasDoOutroTipo.map((f) => f.nome).join(", ")}`);
    }
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/services/categoriaFinanceira.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/categoriaFinanceira.ts src/server/services/categoriaFinanceira.test.ts
git commit -m "fix(categorias): categoria pai precisa ser do mesmo tipo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Orçamento — `parentId` e comparativo em árvore

**Files:**
- Modify: `src/server/services/orcamento.ts`
- Test: `src/server/services/orcamento.test.ts` (novo `describe` no fim do arquivo)

**Interfaces:**
- Consumes: `montarArvore` (Task 1).
- Produces:
  ```ts
  export type LinhaComparativoOrcamento = { /* campos atuais */ parentId: string | null };
  export function montarLinhaComparativo(/* mesma assinatura */): Omit<LinhaComparativoOrcamento, "parentId">;
  export type ItemComparativo = LinhaComparativoOrcamento & {
    chave: string; nivel: number; paiChave: string | null; temFilhos: boolean; direto: boolean;
  };
  export function comparativoEmArvore(linhasDoMes: readonly LinhaComparativoOrcamento[]): ItemComparativo[];
  ```

- [ ] **Step 1: Escrever os testes** (puros, sem banco)

```ts
describe("comparativoEmArvore", () => {
  const linha = (id: string, parentId: string | null, orcado: number, realizado: number, projetado = 0) => ({
    ...montarLinhaComparativo(id, id, "DESPESA", 2026, 11, orcado, realizado, projetado),
    parentId,
  });

  test("o pai soma as filhas e o Estouro do pai sai do total", () => {
    const itens = comparativoEmArvore([
      linha("Despesas bancárias", null, 50, 45.9),
      linha("Taxas de cartão", "Despesas bancárias", 30, 12.5),
    ]);
    expect(itens.map((i) => [i.chave, i.categoriaNome, i.nivel, i.orcado, i.previsto, i.alerta])).toEqual([
      ["Despesas bancárias", "Despesas bancárias", 1, 80, 58.4, false],
      ["Despesas bancárias:direto", "Direto em Despesas bancárias", 2, 50, 45.9, false],
      ["Taxas de cartão", "Taxas de cartão", 2, 30, 12.5, false],
    ]);
    expect(itens[1].direto).toBe(true);
    expect(itens[0].temFilhos).toBe(true);
  });

  test("uma filha estoura com o grupo dentro do orçado, e o grupo estoura sem filha estourar", () => {
    const filhaEstoura = comparativoEmArvore([linha("G", null, 100, 0), linha("F", "G", 10, 20)]);
    expect(filhaEstoura.find((i) => i.chave === "G")!.alerta).toBe(false);
    expect(filhaEstoura.find((i) => i.chave === "F")!.alerta).toBe(true);

    const grupoEstoura = comparativoEmArvore([linha("G", null, 0, 0), linha("F1", "G", 10, 10), linha("F2", "G", 0, 5)]);
    expect(grupoEstoura.find((i) => i.chave === "G")!.alerta).toBe(true);
    expect(grupoEstoura.find((i) => i.chave === "F1")!.alerta).toBe(false);
  });

  test("Receita dentro de Despesa fica no topo", () => {
    const receita = { ...montarLinhaComparativo("R", "R", "RECEITA", 2026, 11, 0, 10, 0), parentId: "D" };
    const itens = comparativoEmArvore([linha("D", null, 0, 0), receita]);
    expect(itens.map((i) => [i.chave, i.nivel])).toEqual([["D", 1], ["R", 1]]);
  });
});
```

Adicionar `comparativoEmArvore` ao import de `./orcamento` no topo do arquivo de teste.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/orcamento.test.ts`
Expected: FAIL (`comparativoEmArvore` não existe).

- [ ] **Step 3: Implementar**

1. Em `LinhaComparativoOrcamento`, acrescentar no fim: `/** Categoria pai no cadastro (a árvore decide se vale: mesmo tipo e presente). */ parentId: string | null;`
2. `montarLinhaComparativo` passa a declarar o retorno `Omit<LinhaComparativoOrcamento, "parentId">` (o corpo não muda).
3. Em `listarComparativoOrcamento`, o `linhas.push(montarLinhaComparativo(...))` vira `linhas.push({ ...montarLinhaComparativo(...), parentId: categoria.parentId })`.
4. Acrescentar no fim do arquivo:

```ts
export type ItemComparativo = LinhaComparativoOrcamento & {
  chave: string;
  nivel: number;
  paiChave: string | null;
  temFilhos: boolean;
  direto: boolean;
};

/**
 * O comparativo de um mês em árvore de categorias: o pai traz o orçado, o realizado e o projetado dele mais os
 * das filhas, e Previsto, Variação e Estouro são recalculados sobre esses totais (item 36 do backlog).
 */
export function comparativoEmArvore(linhasDoMes: readonly LinhaComparativoOrcamento[]): ItemComparativo[] {
  const itens = montarArvore(
    linhasDoMes.map((linha) => ({
      id: linha.categoriaFinanceiraId,
      parentId: linha.parentId,
      grupo: linha.tipoCategoria,
      nome: linha.categoriaNome,
      linha,
    })),
    ({ linha }) => ({ orcado: linha.orcado, realizado: linha.realizado, projetado: linha.projetado }),
  );
  return itens.map((item) => {
    const { linha } = item.origem;
    return {
      ...montarLinhaComparativo(
        linha.categoriaFinanceiraId,
        item.nome,
        linha.tipoCategoria,
        linha.ano,
        linha.mes,
        item.valores.orcado,
        item.valores.realizado,
        item.valores.projetado,
      ),
      parentId: linha.parentId,
      chave: item.chave,
      nivel: item.nivel,
      paiChave: item.paiChave,
      temFilhos: item.temFilhos,
      direto: item.direto,
    };
  });
}
```

Importar `montarArvore` de `@/lib/arvoreDeLinhas`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/services/orcamento.test.ts src/ajuda/orcamento/roteiros.test.ts`
Expected: PASS (o teste da ajuda chama `montarLinhaComparativo` sem `parentId` e continua valendo).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/orcamento.ts src/server/services/orcamento.test.ts
git commit -m "feat(orcamento): comparativo em árvore de categorias" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Linhas recolhíveis e tela/exportação do Orçamento

**Files:**
- Create: `src/app/(dashboard)/controladoria/_shared/linhas-recolhiveis.tsx`
- Modify: `src/app/(dashboard)/controladoria/orcamento/page.tsx`
- Modify: `src/app/(dashboard)/controladoria/orcamento/linha-orcamento-form.tsx` (prop `nivel`)
- Modify: `src/app/(dashboard)/controladoria/orcamento/export/route.ts`

**Interfaces:**
- Consumes: `comparativoEmArvore`, `ItemComparativo` (Task 3); `montarArvore` (Task 1).
- Produces:
  ```ts
  export type LinhaRecolhivel = {
    chave: string; paiChave: string | null; nivel: number; temFilhos: boolean; direto: boolean;
    nome: string; className?: string; celulas: React.ReactNode;
  };
  export function LinhasRecolhiveis({ linhas }: { linhas: LinhaRecolhivel[] }): JSX.Element;
  export function recuoDoNivel(nivel: number): React.CSSProperties; // { paddingLeft: `${(nivel - 1) * 1.25}rem` }
  ```

- [ ] **Step 1: Componente `LinhasRecolhiveis`**

```tsx
"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";

export type LinhaRecolhivel = {
  chave: string;
  paiChave: string | null;
  nivel: number;
  temFilhos: boolean;
  direto: boolean;
  nome: string;
  className?: string;
  /** As demais células da linha (TableCell), já prontas no servidor. */
  celulas: ReactNode;
};

/** Recuo do nome por nível da árvore (o nível 1 não recua). */
export function recuoDoNivel(nivel: number): CSSProperties {
  return { paddingLeft: `${(nivel - 1) * 1.25}rem` };
}

/**
 * Linhas de um relatório em árvore (Orçamento, Fluxo por dimensão): o pai tem ▸/▾ para recolher os
 * descendentes. Recolher não muda número nenhum: o total já está na linha do pai. Começa tudo aberto.
 */
export function LinhasRecolhiveis({ linhas }: { linhas: LinhaRecolhivel[] }) {
  const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(new Set());
  const paiDe = new Map(linhas.map((linha) => [linha.chave, linha.paiChave]));
  const escondida = (linha: LinhaRecolhivel) => {
    for (let pai = linha.paiChave; pai !== null; pai = paiDe.get(pai) ?? null) {
      if (recolhidos.has(pai)) return true;
    }
    return false;
  };
  const alternar = (chave: string) =>
    setRecolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });

  return (
    <>
      {linhas
        .filter((linha) => !escondida(linha))
        .map((linha) => {
          const aberto = !recolhidos.has(linha.chave);
          return (
            <TableRow key={linha.chave} className={linha.className}>
              <TableCell
                className={linha.direto ? "text-muted-foreground" : linha.temFilhos ? "font-semibold" : "font-medium"}
              >
                <div className="flex items-center gap-1" style={recuoDoNivel(linha.nivel)}>
                  {linha.temFilhos ? (
                    <button
                      type="button"
                      onClick={() => alternar(linha.chave)}
                      aria-expanded={aberto}
                      aria-label={`${aberto ? "Recolher" : "Expandir"} ${linha.nome}`}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                  ) : (
                    <span className="inline-block w-5" aria-hidden />
                  )}
                  {linha.nome}
                </div>
              </TableCell>
              {linha.celulas}
            </TableRow>
          );
        })}
    </>
  );
}
```

Conferir que `lucide-react` já é dependência (`grep -n lucide package.json`); se não for, usar `▸`/`▾` em texto no lugar dos ícones.

- [ ] **Step 2: Tabela do comparativo em `orcamento/page.tsx`**

Trocar `const linhasDoMes = linhas.filter((l) => l.mes === mes);` por
`const itensDoMes = comparativoEmArvore(linhas.filter((l) => l.mes === mes));` (importar `comparativoEmArvore` de `@/server/services/orcamento`) e o `<TableBody>` inteiro por:

```tsx
          <TableBody>
            <LinhasRecolhiveis
              linhas={itensDoMes.map((linha) => ({
                chave: linha.chave,
                paiChave: linha.paiChave,
                nivel: linha.nivel,
                temFilhos: linha.temFilhos,
                direto: linha.direto,
                nome: linha.categoriaNome,
                className: linha.alerta ? "bg-destructive/10" : undefined,
                celulas: (
                  <>
                    <TableCell>{formatarMoeda(linha.orcado)}</TableCell>
                    <TableCell>{formatarMoeda(linha.realizado)}</TableCell>
                    <TableCell>{formatarMoeda(linha.projetado)}</TableCell>
                    <TableCell className="font-medium">{formatarMoeda(linha.previsto)}</TableCell>
                    <TableCell className={linha.alerta ? "font-medium text-destructive" : undefined}>
                      <div className="flex items-center gap-2">
                        {formatarMoeda(linha.variacaoAbsoluta)}
                        {linha.alerta && <Badge variant="destructive">Estouro</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {linha.variacaoPercentual === null ? "—" : formatarPercentual(linha.variacaoPercentual)}
                    </TableCell>
                  </>
                ),
              }))}
            />
          </TableBody>
```

Importar `LinhasRecolhiveis` de `../_shared/linhas-recolhiveis`.

- [ ] **Step 3: Grade em ordem de árvore**

Em `categoriasUnicas`, guardar também `parentId: primeira.parentId`. Trocar `blocosDaGrade` por:

```tsx
  // Despesas primeiro (é onde mora o estouro); dentro de cada bloco, a árvore de categorias (filhas recuadas sob
  // a mãe). O campo da mãe é o orçamento próprio dela; o total do grupo fica no comparativo.
  const emArvore = (tipo: "DESPESA" | "RECEITA") =>
    montarArvore(
      categoriasUnicas.filter((c) => c.tipo === tipo).map((c) => ({ ...c, grupo: c.tipo })),
      () => ({}),
    ).map((item) => ({ ...item.origem, nivel: item.nivel }));
  const blocosDaGrade = [
    { titulo: "Despesas", categorias: emArvore("DESPESA") },
    { titulo: "Receitas", categorias: emArvore("RECEITA") },
  ].filter((bloco) => bloco.categorias.length > 0);
```

(`valoresDe` devolvendo `{}` nunca gera linha "Direto em…".) Passar `nivel={categoria.nivel}` ao `LinhaOrcamentoForm`.

Em `linha-orcamento-form.tsx`: acrescentar a prop `nivel?: number` (padrão 1) e aplicar `style={recuoDoNivel(nivel)}` no `<span>` do nome (linha ~50), importando `recuoDoNivel` de `../_shared/linhas-recolhiveis`. Atenção: esse arquivo é `"use client"`? Se não for, importar de um componente cliente num server component é permitido; `recuoDoNivel` é função simples — se o Next reclamar de importar função de módulo `"use client"` num server component, mova `recuoDoNivel` para `src/lib/recuoDoNivel.ts` (sem `"use client"`) e importe de lá nos dois lugares.

- [ ] **Step 4: Exportação**

Em `orcamento/export/route.ts`, trocar `COLUNAS` para `ColunaExport<ItemComparativo>[]`, inserindo depois de "Mês":
`{ rotulo: "Nível", valor: (l) => l.nivel, tipo: "inteiro" },` e trocando a de "Categoria" por
`{ rotulo: "Categoria", valor: (l) => `${"  ".repeat(l.nivel - 1)}${l.categoriaNome}` },`.
Trocar a montagem de `ordenadas` por:

```ts
  // Mês a mês, cada um em árvore de categorias (o pai com o total do grupo, como na tela).
  const ordenadas = Array.from({ length: 12 }, (_, i) => comparativoEmArvore(linhas.filter((l) => l.mes === i + 1))).flat();
```

(importar `comparativoEmArvore` e `type ItemComparativo`; tirar o import de `LinhaComparativoOrcamento` se ficar sem uso).

- [ ] **Step 5: Checar tipos e testes**

Run: `npx tsc --noEmit 2>&1 | grep -v "^\.next/"` → Expected: nada.
Run: `npx vitest run src/server/services/orcamento.test.ts src/ajuda/orcamento` → Expected: PASS.
Run: `npx eslint "src/app/(dashboard)/controladoria"` → Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/controladoria" src/lib
git commit -m "feat(orcamento): comparativo e grade em árvore, com linhas recolhíveis" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Fluxo de caixa por dimensão em árvore de centros de custo

**Files:**
- Modify: `src/server/services/fluxoDeCaixaPorDimensao.ts` (`LinhaFluxoPorDimensao`, `listarFluxoDeCaixaPorDimensao`)
- Modify: `src/app/(dashboard)/controladoria/fluxo-por-dimensao/page.tsx`
- Modify: `src/app/(dashboard)/controladoria/fluxo-por-dimensao/export/route.ts`
- Test: `src/server/services/fluxoDeCaixaPorDimensao.test.ts`

**Interfaces:**
- Consumes: `montarArvore` (Task 1), `LinhasRecolhiveis` (Task 4).
- Produces: `LinhaFluxoPorDimensao.parentId: string | null` (só Centro de custo preenche).

- [ ] **Step 1: Teste do serviço**

Ler o `describe` principal de `fluxoDeCaixaPorDimensao.test.ts` para ver as fixtures (sessão, filial). Acrescentar um teste que cria dois centros de custo (`pai` e `filho` com `parentId: pai.id`) na filial da fixture e confere:

```ts
  test("traz o parentId dos centros de custo; nas outras dimensões, null", async () => {
    const pai = await prisma.centroCusto.create({ data: { filialId, nome: "Fábrica (árvore)", codigo: "ARV-PAI" } });
    const filho = await prisma.centroCusto.create({
      data: { filialId, nome: "Câmara fria (árvore)", codigo: "ARV-FILHO", parentId: pai.id },
    });
    const linhas = await listarFluxoDeCaixaPorDimensao(sessao, "CENTRO_CUSTO", 2026, 11);
    expect(linhas.find((l) => l.dimensaoId === filho.id)?.parentId).toBe(pai.id);
    expect(linhas.find((l) => l.dimensaoId === pai.id)?.parentId).toBeNull();
    expect(linhas.find((l) => l.dimensaoId === null)?.parentId).toBeNull();

    const porSafra = await listarFluxoDeCaixaPorDimensao(sessao, "SAFRA", 2026, 11);
    expect(porSafra.every((l) => l.parentId === null)).toBe(true);
  });
```

Ajustar os nomes `filialId`/`sessao` aos que o arquivo usa, e apagar os dois centros no `afterAll` se a limpeza da fixture não os apagar (filho antes do pai).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/fluxoDeCaixaPorDimensao.test.ts`
Expected: FAIL (`parentId` é `undefined`).

- [ ] **Step 3: Implementar no serviço**

1. Em `LinhaFluxoPorDimensao`, acrescentar `/** Centro de custo pai (só nessa dimensão; nas outras, null). */ parentId: string | null;`.
2. Em `listarFluxoDeCaixaPorDimensao`, no `Promise.all`, acrescentar uma quarta busca:

```ts
    tipoDimensao === "CENTRO_CUSTO"
      ? prisma.centroCusto.findMany({ where: { filialId: sessao.filialId }, select: { id: true, parentId: true } })
      : Promise.resolve([]),
```

e, depois dele, `const paiPorId = new Map(pais.map((c) => [c.id, c.parentId]));` (nomeando a quarta posição `pais`).
3. Em cada objeto de linha montado (ativos, inativos e "Não classificado"), acrescentar `parentId: paiPorId.get(<id>) ?? null` — no "Não classificado", `parentId: null`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/services/fluxoDeCaixaPorDimensao.test.ts`
Expected: PASS.

- [ ] **Step 5: Tela**

Em `fluxo-por-dimensao/page.tsx`, depois de `const total = totalDoFluxo(linhas);` (o Total continua sobre as linhas planas: equivale a somar só o nível 1):

```tsx
  // Só o Centro de custo tem pai; nas outras dimensões todas as linhas ficam no nível 1.
  const itens = montarArvore(
    linhas.map((linha) => ({
      ...linha,
      id: linha.dimensaoId ?? "nao-classificado",
      grupo: "dimensao",
      nome: linha.dimensaoNome,
    })),
    (linha) => ({
      entradasRealizadas: linha.entradasRealizadas,
      saidasRealizadas: linha.saidasRealizadas,
      entradasProjetadas: linha.entradasProjetadas,
      saidasProjetadas: linha.saidasProjetadas,
    }),
  );
```

e trocar o `{linhas.map(...)}` do `<TableBody>` por:

```tsx
          <LinhasRecolhiveis
            linhas={itens.map((item) => {
              const resultado = resultadoDoMes(item.valores);
              return {
                chave: item.chave,
                paiChave: item.paiChave,
                nivel: item.nivel,
                temFilhos: item.temFilhos,
                direto: item.direto,
                nome: item.nome,
                celulas: (
                  <>
                    <TableCell>{formatarMoeda(item.valores.entradasRealizadas)}</TableCell>
                    <TableCell>{formatarMoeda(item.valores.saidasRealizadas)}</TableCell>
                    <TableCell>{formatarMoeda(item.valores.entradasProjetadas)}</TableCell>
                    <TableCell>{formatarMoeda(item.valores.saidasProjetadas)}</TableCell>
                    <TableCell className={resultado < 0 ? "font-medium text-destructive" : undefined}>
                      {formatarMoeda(resultado)}
                    </TableCell>
                  </>
                ),
              };
            })}
          />
```

Importar `montarArvore` de `@/lib/arvoreDeLinhas` e `LinhasRecolhiveis` de `../_shared/linhas-recolhiveis`.

- [ ] **Step 6: Exportação**

Em `fluxo-por-dimensao/export/route.ts`:

```ts
type LinhaExportada = { nivel: number | ""; nome: string } & ValoresDoFluxo;

function colunas(dimensao: TipoDimensao): ColunaExport<LinhaExportada>[] {
  return [
    { rotulo: "Nível", valor: (l) => l.nivel, tipo: "inteiro" },
    { rotulo: ROTULOS_DIMENSAO[dimensao], valor: (l) => l.nome },
    { rotulo: "Entradas realizadas", valor: (l) => l.entradasRealizadas },
    { rotulo: "Saídas realizadas", valor: (l) => l.saidasRealizadas },
    { rotulo: "Entradas projetadas", valor: (l) => l.entradasProjetadas },
    { rotulo: "Saídas projetadas", valor: (l) => l.saidasProjetadas },
    { rotulo: "Resultado do mês", valor: (l) => resultadoDoMes(l) },
  ];
}
```

No `GET`, montar `itens` com o mesmo `montarArvore` da tela, depois:

```ts
  const exportadas: LinhaExportada[] = itens.map((item) => ({
    nivel: item.nivel,
    nome: `${"  ".repeat(item.nivel - 1)}${item.nome}`,
    ...item.valores,
  }));
  const total = totalDoFluxo(linhas);
  const comTotal: LinhaExportada[] = [
    ...exportadas,
    {
      nivel: "",
      nome: "Total",
      entradasRealizadas: total.entradasRealizadas,
      saidasRealizadas: total.saidasRealizadas,
      entradasProjetadas: total.entradasProjetadas,
      saidasProjetadas: total.saidasProjetadas,
    },
  ];
```

Importar `type ValoresDoFluxo` de `@/lib/fluxoPorDimensao` e `montarArvore`; remover o `linhaTotal` antigo e o import de `LinhaFluxoPorDimensao` se ficar sem uso. Se `ColunaExport.valor` não aceitar `""` com `tipo: "inteiro"` no PDF, testar a exportação PDF no navegador (Task 7) e, se sair "NaN", trocar para `valor: (l) => (l.nivel === "" ? "" : l.nivel)` sem `tipo`.

- [ ] **Step 7: Checar e commitar**

Run: `npx tsc --noEmit 2>&1 | grep -v "^\.next/"` → nada.
Run: `npx vitest run src/server/services/fluxoDeCaixaPorDimensao.test.ts src/ajuda/fluxo-por-dimensao` → PASS.

```bash
git add src/server/services/fluxoDeCaixaPorDimensao.ts src/server/services/fluxoDeCaixaPorDimensao.test.ts "src/app/(dashboard)/controladoria/fluxo-por-dimensao"
git commit -m "feat(fluxo-por-dimensao): centros de custo em árvore, com total do pai" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ajuda e backlog

**Files:**
- Modify: `src/ajuda/categorias/index.tsx` (passo "Escolha a categoria pai, se quiser", ~linha 175–181)
- Modify: `src/ajuda/centros-de-custo/index.tsx` (passo "Escolha o centro pai", ~linha 189–193)
- Modify: `src/ajuda/orcamento/exemplo.ts`, `src/ajuda/orcamento/cenas.tsx`, `src/ajuda/orcamento/alvos.ts`, `src/ajuda/orcamento/roteiros.ts`, `src/ajuda/orcamento/roteiros.test.ts`
- Modify: `src/ajuda/fluxo-por-dimensao/roteiros.ts` (passo `linha.lavoura`)
- Modify: `docs/backlog.md` (remover o item 36)

- [ ] **Step 1: Textos de categorias e centros**

Categorias, a dica que hoje diz "Hoje o pai só aparece na lista: os relatórios e o Orçamento mostram cada categoria separada, sem somar as filhas no pai." passa a:

```ts
            "O Orçamento mostra a categoria pai com o total dela mais o das filhas, e as filhas recuadas logo abaixo. " +
            "A pai precisa ser do mesmo tipo (Despesa ou Receita).",
```

Centros de custo, a dica "Hoje o pai só organiza a lista: o Fluxo por dimensão mostra cada centro separado, sem somar os filhos no pai." passa a:

```ts
            "No Fluxo de caixa por dimensão, o centro pai mostra o total dele mais o dos filhos, e os filhos " +
            "aparecem recuados logo abaixo.",
```

(Manter a forma do campo — `explicacao` ou `dica` — que o passo já usa.)

- [ ] **Step 2: Exemplo do Orçamento com um grupo**

Em `exemplo.ts`: acrescentar a `CategoriaExemplo` o campo opcional `/** Chave da categoria pai, se houver. */ pai?: string;` e, logo depois de "Despesas bancárias" em `CATEGORIAS`, a filha:

```ts
  {
    chave: "taxas",
    nome: "Taxas de cartão",
    tipo: "DESPESA",
    pai: "bancarias",
    orcadoPorMes: todoMes(30),
    novembro: { realizado: 12.5, projetado: 0 },
    novembroFiscal: { realizado: 12.5, projetado: 0 },
  },
```

Atenção: "Taxas de cartão" vem depois de "Despesas bancárias" e antes de "Energia elétrica" na lista; a árvore mantém a filha sob a mãe de qualquer jeito.

- [ ] **Step 3: Cena do Orçamento em árvore**

Em `cenas.tsx`:
- Grade: em `BLOCOS_DA_GRADE`, montar cada bloco com `montarArvore(CATEGORIAS.filter(...).map((c) => ({ ...c, id: c.chave, parentId: c.pai ?? null, grupo: c.tipo })), () => ({}))` e passar `item.nivel` ao `LinhaGrade`, que aplica `style={recuoDoNivel(nivel)}` no `<span>` do nome.
- Comparativo: montar as linhas do mês (orçado/realizado/projetado de cada categoria, como hoje) e passar por `montarArvore` com `valoresDe = ({orcado, realizado, projetado})`; para cada item, `compararLinha(item.origem.tipo, v.orcado, v.realizado, v.projetado)`. Renderizar como a tela: recuo por nível, pai em negrito com ▾ (estático — a cena não recolhe), "Direto em…" em `text-muted-foreground`. O pai "Despesas bancárias" ganha alvo `comp.linha.bancarias` (acrescentar em `LINHAS_COM_ALVO` e em `alvos.ts`).
- Importar `montarArvore` de `@/lib/arvoreDeLinhas` e `recuoDoNivel` de onde a Task 4 o deixou.

- [ ] **Step 4: Passo novo no roteiro `ler-comparativo`**

Em `roteiros.ts`, no roteiro `ler-comparativo`, acrescentar como último passo:

```ts
      {
        cena: "painel",
        alvo: "comp.linha.bancarias",
        instrucao: "Leia o grupo de Despesas bancárias",
        explicacao:
          "Taxas de cartão está dentro de Despesas bancárias (o pai é escolhido em Cadastros → Categorias " +
          "financeiras). A linha de Despesas bancárias soma tudo: R$ 80,00 orçados e R$ 58,40 previstos. " +
          "“Direto em Despesas bancárias” é o que foi lançado na própria categoria (a tarifa de R$ 45,90), e " +
          "Taxas de cartão, o resto (R$ 12,50).",
        dica: "Clique na seta ao lado do nome para recolher as filhas: o total do grupo continua na linha.",
      },
```

Os números do passo devem bater com a réplica — o teste "os números citados nos roteiros batem com a réplica" confere.

- [ ] **Step 5: Testes da ajuda**

Run: `npx vitest run src/ajuda/orcamento src/ajuda/categorias src/ajuda/centros-de-custo src/ajuda/fluxo-por-dimensao`
Se `linhaDoComparativo(markup, "Despesas bancárias")` em `roteiros.test.ts` passar a achar a linha "Direto em Despesas bancárias" (usa `lastIndexOf`), ajustar o teste para procurar a linha pelo alvo ou pelo primeiro `indexOf`. Expected ao fim: PASS.

- [ ] **Step 6: Fluxo por dimensão — dica**

Em `src/ajuda/fluxo-por-dimensao/roteiros.ts`, no passo de `alvo: "linha.lavoura"`, acrescentar:

```ts
        dica:
          "Centro de custo com pai (ex.: Câmara fria dentro de Fábrica de polpa) aparece recuado logo abaixo dele, " +
          "e a linha do pai soma os dois. A seta ao lado do nome recolhe os filhos.",
```

- [ ] **Step 7: Backlog**

Remover de `docs/backlog.md` o bloco inteiro do `### 36. O "pai" das categorias e dos centros de custo não é usado` até a linha antes do `### 37.`.

- [ ] **Step 8: Commit**

```bash
git add src/ajuda docs/backlog.md
git commit -m "docs(ajuda): Orçamento e Fluxo por dimensão somam os filhos no pai; item 36 sai do backlog" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verificação final

- [ ] **Step 1: Suíte, tipos e lint**

Run: `npx vitest run` → Expected: todos passam.
Run: `npx tsc --noEmit 2>&1 | grep -v "^\.next/"` → Expected: nada.
Run: `npx eslint src` → Expected: sem erros.

- [ ] **Step 2: Navegador**

Subir `npm run dev` (se a porta 3000 estiver presa, matar o PID antes). Entrar como `admin@nx-control-erp.local` / `TrocarSenha123!`, Empresa Demonstração, **esperar** a tela trocar a cada escolha (empresa, filial Matriz). Por SQL (`docker exec -i nx-control-erp-db psql -U postgres -d nx_control_erp`), criar na Matriz (`e361993f-611c-4123-8b71-71047594272f`) um grupo de categorias de despesa em três níveis (`ids` começando com `teste36-`) e dois centros de custo pai/filho; orçar valores e conferir:
- Orçamento: comparativo em árvore, total do pai, "Direto em…", Estouro do pai, recolher/expandir; grade com recuo;
- Fluxo por dimensão (Centro de custo): árvore, Total igual ao de antes, outras dimensões iguais;
- Exportações CSV/Excel/PDF dos dois com a coluna Nível;
- Categorias: criar filha Receita sob pai Despesa mostra a mensagem no diálogo;
- Console sem erros.

- [ ] **Step 3: Limpar**

Apagar do banco tudo que começa com `teste36-` (orçamentos antes das categorias; filhos antes dos pais), apagar `.playwright-mcp/` e parar o servidor.
