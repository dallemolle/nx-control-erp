# Rateio do custo da OP — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dividir o custo da OP entre as polpas proporcionalmente ao preço de referência/kg de cada produto, bloqueando o encerramento quando faltar preço.

**Architecture:** Uma função pura `ratearCustoOP` em `src/lib/producao/op.ts` calcula o custo/kg por produto (ou o médio + a lista de produtos sem preço). O serviço `ordemProducao.ts` usa essa função no custo provisório, no encerramento (recusa sem preço, grava por produto, audita o rateio) e no `obterOP` (aviso). A UI só troca rótulos, ganha a coluna "Custo/kg" na produção e o aviso. Sem migration.

**Tech Stack:** Next.js (App Router, server components), Prisma/Postgres, Vitest (testes de serviço contra Postgres real).

**Spec:** `docs/superpowers/specs/2026-11-16-rateio-custo-op-design.md`

## Global Constraints

- Sem migration: o custo por produto vai em `Lote.custoKg`; `OrdemProducao.custoKgPolpa` passa a ser o custo médio (total ÷ kg de polpa).
- Custo/kg com 4 casas (`arredondar(x, 4)`); totais com 2.
- Preço nulo ou ≤ 0 conta como "sem preço". Um único produto distinto na OP nunca precisa de preço.
- Mensagem ao encerrar sem preço: `Cadastre o preço de referência de: <descrição>, <descrição>` (descrições sem repetir, na ordem das linhas).
- Rótulos novos: "Custo médio/kg", "Custo médio/kg (provisório)", "Custo médio" (relatório), "Custo médio/kg (R$)" (export).
- Execução inline, sem subagentes (preferência do usuário). Push/PR/merge ficam com o usuário.
- Comandos de teste: `npx vitest run <arquivo>`; antes de testar serviço, `npx prisma generate` se o client estiver desatualizado.

**Ajuste em relação à spec:** a função pura recebe o `CustoOP` (para reaproveitar o médio já calculado por `custoOP`) e devolve sempre `{ custoKgPorProduto, semPreco }` — quando `semPreco` não está vazio, o mapa já vem com o médio para todos os produtos. Isso simplifica os chamadores (sempre gravam o mapa) sem mudar o comportamento descrito na spec.

---

### Task 1: Função pura `ratearCustoOP`

**Files:**
- Modify: `src/lib/producao/op.ts` (depois de `custoOP`, ~linha 63)
- Test: `src/lib/producao/op.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ProducaoParaRateio = { produtoId: string; descricao: string; quantidadeKg: number; precoKg: number | null };
  export type RateioOP = { custoKgPorProduto: Map<string, number>; semPreco: string[] };
  export function ratearCustoOP(custo: Pick<CustoOP, "custoTotal" | "custoKgPolpa">, producoes: ProducaoParaRateio[]): RateioOP;
  ```

- [ ] **Step 1: Escrever os testes (falhando)**

Em `op.test.ts`, trocar o import da linha 2 por:

```ts
import { balancoMassa, custoOP, prefixoDaOP, ratearCustoOP, rendimento, resumirOP, statusBranqueamento } from "./op";
```

e acrescentar depois do `describe("custoOP (RN-13)")`:

```ts
describe("ratearCustoOP (RN-13, D-06)", () => {
  const p = (produtoId: string, quantidadeKg: number, precoKg: number | null, descricao = `Polpa ${produtoId}`) => ({
    produtoId,
    descricao,
    quantidadeKg,
    precoKg,
  });

  test("exemplo da spec: custo/kg proporcional ao preço e soma ≈ total", () => {
    const r = ratearCustoOP({ custoTotal: 1200, custoKgPolpa: 4 }, [p("g", 100, 30), p("m", 150, 20), p("f", 50, 10)]);
    expect(r.semPreco).toEqual([]);
    expect(Object.fromEntries(r.custoKgPorProduto)).toEqual({ g: 5.5385, m: 3.6923, f: 1.8462 });
    expect(100 * 5.5385 + 150 * 3.6923 + 50 * 1.8462).toBeCloseTo(1200, 1);
  });

  test("duas linhas do mesmo produto somam no peso", () => {
    const r = ratearCustoOP({ custoTotal: 180, custoKgPolpa: 3 }, [p("g", 20, 30), p("f", 20, 10), p("g", 20, 30)]);
    // valor = 40×30 + 20×10 = 1400 → g = 180×30/1400, f = 180×10/1400
    expect(Object.fromEntries(r.custoKgPorProduto)).toEqual({ g: 3.8571, f: 1.2857 });
  });

  test("produto único: médio, mesmo sem preço", () => {
    const r = ratearCustoOP({ custoTotal: 180, custoKgPolpa: 3 }, [p("g", 40, null), p("g", 20, null)]);
    expect(r.semPreco).toEqual([]);
    expect(Object.fromEntries(r.custoKgPorProduto)).toEqual({ g: 3 });
  });

  test("mesmo preço em todos: igual ao médio", () => {
    const r = ratearCustoOP({ custoTotal: 180, custoKgPolpa: 3 }, [p("g", 40, 10), p("f", 20, 10)]);
    expect(Object.fromEntries(r.custoKgPorProduto)).toEqual({ g: 3, f: 3 });
  });

  test("preço faltando ou zero: semPreco sem repetir, na ordem, e médio em todos", () => {
    const r = ratearCustoOP({ custoTotal: 180, custoKgPolpa: 3 }, [
      p("g", 20, 30),
      p("x", 20, null, "Polpa X"),
      p("y", 10, 0, "Polpa Y"),
      p("x", 10, null, "Polpa X"),
    ]);
    expect(r.semPreco).toEqual(["Polpa X", "Polpa Y"]);
    expect(Object.fromEntries(r.custoKgPorProduto)).toEqual({ g: 3, x: 3, y: 3 });
  });

  test("sem produção: mapa vazio", () => {
    const r = ratearCustoOP({ custoTotal: 180, custoKgPolpa: 0 }, []);
    expect(r).toEqual({ custoKgPorProduto: new Map(), semPreco: [] });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/producao/op.test.ts`
Expected: FAIL — `ratearCustoOP` não exportado.

- [ ] **Step 3: Implementar**

Em `op.ts`, trocar o comentário de `custoOP` para `/** RN-13: custo total (fruto + insumos) e custo médio/kg da polpa. */` e acrescentar depois de `export type CustoOP = ...`:

```ts
export type ProducaoParaRateio = { produtoId: string; descricao: string; quantidadeKg: number; precoKg: number | null };
export type RateioOP = { custoKgPorProduto: Map<string, number>; semPreco: string[] };

/**
 * RN-13/D-06: custo/kg de cada produto proporcional ao preço de referência
 * (custo total × preço ÷ Σ kg × preço). Com um só produto, ou faltando preço,
 * todos recebem o médio; `semPreco` lista o que impede o rateio.
 */
export function ratearCustoOP(
  custo: Pick<CustoOP, "custoTotal" | "custoKgPolpa">,
  producoes: ProducaoParaRateio[],
): RateioOP {
  const produtos = [...new Set(producoes.map((p) => p.produtoId))];
  const comMedio = () => new Map(produtos.map((id) => [id, custo.custoKgPolpa]));
  if (produtos.length <= 1) return { custoKgPorProduto: comMedio(), semPreco: [] };

  const semPreco = [
    ...new Set(producoes.filter((p) => p.precoKg === null || p.precoKg <= 0).map((p) => p.descricao)),
  ];
  if (semPreco.length > 0) return { custoKgPorProduto: comMedio(), semPreco };

  const valor = producoes.reduce((s, p) => s + p.quantidadeKg * (p.precoKg as number), 0);
  if (valor <= 0) return { custoKgPorProduto: comMedio(), semPreco: [] };
  const custoKgPorProduto = new Map<string, number>();
  for (const p of producoes) {
    custoKgPorProduto.set(p.produtoId, arredondar((custo.custoTotal * (p.precoKg as number)) / valor, 4));
  }
  return { custoKgPorProduto, semPreco: [] };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/producao/op.test.ts`
Expected: PASS (todos, inclusive os antigos de `custoOP`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/producao/op.ts src/lib/producao/op.test.ts
git commit -m "feat(producao): rateio do custo da OP pelo preço de referência"
```

---

### Task 2: Serviço — provisório, encerramento e aviso

**Files:**
- Modify: `src/server/services/producaoTestFixtures.ts:124-161` (preço 10 em AGC e AFN)
- Modify: `src/server/services/ordemProducao.ts` (imports, `recalcularCustoProvisorio` ~115, `encerrarOP` ~523, `obterOP` ~750)
- Test: `src/server/services/ordemProducao.test.ts`

**Interfaces:**
- Consumes: `ratearCustoOP`, `ProducaoParaRateio`, `RateioOP` (Task 1).
- Produces: `obterOP(...)` passa a devolver `semPrecoReferencia: string[]` (vazio fora de OP aberta) e, em `producoes[]`, `lote.custoKg` e `produto.precoReferenciaKg`. Usados na Task 3.

- [ ] **Step 1: Fixture com preço igual nas polpas de açaí**

Em `criarCatalogoDeTeste`, acrescentar `precoReferenciaKg: 10,` no `data` de `produtoPolpa` (AGC) e de `polpaFino` (AFN). Com o mesmo preço, o rateio dá o médio e os testes atuais (custo 3, 3,5 etc.) continuam valendo. Atualizar o comentário do tipo: `/** "AFN", polpa de açaí fino (mesma fruta); AGC e AFN com preço de referência 10. */`.

- [ ] **Step 2: Escrever os testes (falhando)**

Em `ordemProducao.test.ts`, dentro de `describe("encerrar, reabrir e cancelar")`, depois do teste `"listarOPs e obterOP"` (ou ao fim desse describe), acrescentar:

```ts
    describe("rateio do custo pelo preço de referência (D-06)", () => {
      const polpa = (codigo: string, descricao: string, precoReferenciaKg: number | null) =>
        prisma.produto.create({
          data: {
            empresaId: fx.empresaId,
            codigo,
            descricao,
            categoria: "POLPA",
            frutaId: cat.frutaId,
            conservacao: "CONGELADO",
            validadeDias: 365,
            precoReferenciaKg,
          },
        });

      /** 100 kg de fruto a 1,5 + 60 embalagens a 0,5 = R$ 180; as polpas dadas. */
      async function opCom(linhas: [produtoId: string, kg: number][]) {
        const op = await nova({ data: "2026-11-13" });
        const lote = await fruto(100, { data: d("2026-11-13"), validade: d("2026-11-14") });
        await adicionarConsumo(adm(), op.id, consumo(lote.id, 100));
        const lotes: string[] = [];
        for (const [produtoId, quantidadeKg] of linhas) {
          const linha = await adicionarProducao(
            adm(),
            op.id,
            producaoSchema.parse({ produtoId, quantidadeKg, localId: cat.localCamaraId }),
          );
          lotes.push(linha.loteId);
        }
        await adicionarInsumo(adm(), op.id, insumoOPSchema.parse({ insumoId: cat.insumoId, quantidade: 60 }));
        await atualizarProcessoOP(adm(), op.id, processoOPSchema.parse(PROCESSO_OK));
        return { op, lotes };
      }

      const custoDo = async (loteId: string) =>
        Number((await prisma.lote.findUniqueOrThrow({ where: { id: loteId } })).custoKg);

      test("provisório e encerramento rateiam; a OP guarda o médio e a auditoria o rateio", async () => {
        const g = await polpa("RGR", "Rateio grosso", 30);
        const m = await polpa("RMD", "Rateio médio", 20);
        const f = await polpa("RFN", "Rateio fino", 10);
        const { op, lotes } = await opCom([
          [g.id, 20],
          [m.id, 30],
          [f.id, 10],
        ]);
        // valor = 600 + 600 + 100 = 1300 → 180×30/1300, 180×20/1300, 180×10/1300
        expect(await Promise.all(lotes.map(custoDo))).toEqual([4.1538, 2.7692, 1.3846]);

        await encerrarOP(adm(), op.id, { confirmarVerificar: true });
        expect(await Promise.all(lotes.map(custoDo))).toEqual([4.1538, 2.7692, 1.3846]);
        const encerrada = await prisma.ordemProducao.findUniqueOrThrow({ where: { id: op.id } });
        expect(Number(encerrada.custoKgPolpa)).toBe(3);
        const auditoria = await prisma.auditLog.findFirstOrThrow({ where: { entidadeId: op.id, acao: "ENCERRAR" } });
        expect(auditoria.valorNovo).toMatchObject({
          rateio: [
            { produto: "Rateio grosso", kg: 20, precoKg: 30, custoKg: 4.1538 },
            { produto: "Rateio médio", kg: 30, precoKg: 20, custoKg: 2.7692 },
            { produto: "Rateio fino", kg: 10, precoKg: 10, custoKg: 1.3846 },
          ],
        });
      });

      test("sem preço: provisório no médio, aviso no obterOP e encerramento recusado até cadastrar", async () => {
        const g = await polpa("SGR", "Sem preço grosso", 30);
        const x = await polpa("SXX", "Polpa sem preço", null);
        const { op, lotes } = await opCom([
          [g.id, 40],
          [x.id, 20],
        ]);
        expect(await Promise.all(lotes.map(custoDo))).toEqual([3, 3]);
        expect((await obterOP(fx.filialAId, op.numero))!.semPrecoReferencia).toEqual(["Polpa sem preço"]);

        await expect(encerrarOP(adm(), op.id, { confirmarVerificar: true })).rejects.toThrow(
          "Cadastre o preço de referência de: Polpa sem preço",
        );
        expect((await prisma.ordemProducao.findUniqueOrThrow({ where: { id: op.id } })).status).toBe("ABERTA");

        await prisma.produto.update({ where: { id: x.id }, data: { precoReferenciaKg: 15 } });
        await encerrarOP(adm(), op.id, { confirmarVerificar: true });
        // valor = 40×30 + 20×15 = 1500 → 180×30/1500 = 3,6; 180×15/1500 = 1,8
        expect(await Promise.all(lotes.map(custoDo))).toEqual([3.6, 1.8]);
        expect((await obterOP(fx.filialAId, op.numero))!.semPrecoReferencia).toEqual([]);
      });

      test("reabrir, mudar o preço e encerrar de novo recalcula com o preço atual", async () => {
        const a = await polpa("RA1", "Reabre A", 10);
        const b = await polpa("RB1", "Reabre B", 10);
        const { op, lotes } = await opCom([
          [a.id, 30],
          [b.id, 30],
        ]);
        await encerrarOP(adm(), op.id, { confirmarVerificar: true });
        expect(await Promise.all(lotes.map(custoDo))).toEqual([3, 3]);

        await reabrirOP(adm(), op.id, "Preço do fino mudou");
        await prisma.produto.update({ where: { id: b.id }, data: { precoReferenciaKg: 20 } });
        await encerrarOP(adm(), op.id, { confirmarVerificar: true });
        // valor = 300 + 600 = 900 → 180×10/900 = 2; 180×20/900 = 4
        expect(await Promise.all(lotes.map(custoDo))).toEqual([2, 4]);
      });
    });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/server/services/ordemProducao.test.ts`
Expected: FAIL nos três testes novos (custos iguais em vez de rateados; `semPrecoReferencia` indefinido; encerramento não recusado). Os testes antigos passam.

- [ ] **Step 4: Implementar no serviço**

1. Import (linhas 16-25): acrescentar `ratearCustoOP,` e `type ProducaoParaRateio,` ao import de `@/lib/producao/op`.

2. Substituir `recalcularCustoProvisorio` (linhas 114-127) por:

```ts
function producaoParaRateio(p: {
  produtoId: string;
  quantidadeKg: Prisma.Decimal;
  produto: { descricao: string; precoReferenciaKg: Prisma.Decimal | null };
}): ProducaoParaRateio {
  return {
    produtoId: p.produtoId,
    descricao: p.produto.descricao,
    quantidadeKg: Number(p.quantidadeKg),
    precoKg: p.produto.precoReferenciaKg === null ? null : Number(p.produto.precoReferenciaKg),
  };
}

/** Linhas de produção ativas com o preço de referência atual do produto (D-06). */
async function producoesParaRateio(db: ClientePrisma, opId: string): Promise<ProducaoParaRateio[]> {
  const linhas = await db.producaoOP.findMany({
    where: { ordemProducaoId: opId, removidoEm: null },
    select: { produtoId: true, quantidadeKg: true, produto: { select: { descricao: true, precoReferenciaKg: true } } },
    orderBy: { criadoEm: "asc" },
  });
  return linhas.map(producaoParaRateio);
}

/** Grava o custo/kg de cada produto nos lotes de polpa ativos da OP. */
async function gravarCustoDosLotes(tx: Prisma.TransactionClient, opId: string, custoKgPorProduto: Map<string, number>) {
  for (const [produtoId, custoKg] of custoKgPorProduto) {
    await tx.lote.updateMany({
      where: { producaoOP: { is: { ordemProducaoId: opId, removidoEm: null, produtoId } } },
      data: { custoKg },
    });
  }
}

/** Custo provisório: rateado pelo preço de referência, ou o médio enquanto faltar preço (D-06). */
export async function recalcularCustoProvisorio(tx: Prisma.TransactionClient, opId: string) {
  const linhas = await linhasAtivas(tx, opId);
  const custo = custoOP({
    consumos: linhas.consumos,
    insumos: linhas.insumos,
    polpaKg: linhas.producoes.reduce((s, p) => s + p.quantidadeKg, 0),
  });
  const rateio = ratearCustoOP(custo, await producoesParaRateio(tx, opId));
  await gravarCustoDosLotes(tx, opId, rateio.custoKgPorProduto);
  return custo;
}
```

3. Em `encerrarOP`, logo depois de `const resumo = resumirOP(...)` (linha 537) e **antes** da checagem de `aVerificar`:

```ts
    const producoes = await producoesParaRateio(tx, id);
    const rateio = ratearCustoOP(resumo.custo, producoes);
    if (rateio.semPreco.length > 0) {
      throw new Error(`Cadastre o preço de referência de: ${rateio.semPreco.join(", ")}`);
    }
```

Trocar o `tx.lote.updateMany(...)` das linhas 552-555 por `await gravarCustoDosLotes(tx, id, rateio.custoKgPorProduto);` e, no `valorNovo` da auditoria `ENCERRAR`, acrescentar depois de `custo: resumo.custo,`:

```ts
        rateio: resumoDoRateio(producoes, rateio.custoKgPorProduto),
```

Acrescentar, junto de `producoesParaRateio`:

```ts
/** Para a auditoria: um item por produto, na ordem das linhas. */
function resumoDoRateio(producoes: ProducaoParaRateio[], custoKgPorProduto: Map<string, number>) {
  const porProduto = new Map<string, { produto: string; kg: number; precoKg: number | null; custoKg: number }>();
  for (const p of producoes) {
    const item = porProduto.get(p.produtoId);
    if (item) item.kg = arredondar(item.kg + p.quantidadeKg, 3);
    else
      porProduto.set(p.produtoId, {
        produto: p.descricao,
        kg: p.quantidadeKg,
        precoKg: p.precoKg,
        custoKg: custoKgPorProduto.get(p.produtoId) ?? 0,
      });
  }
  return [...porProduto.values()];
}
```

Atualizar o comentário de `encerrarOP`: "Encerra a OP: grava o custo total e o médio (RN-13) e o custo/kg rateado por produto nos lotes de polpa (D-06), que ficam liberados para venda e ajuste (D-07). Sem preço de referência em algum produto, recusa. Balanço ou branqueamento ..." (resto igual).

4. Em `obterOP`, no `include.producoes.include`, trocar `lote: { select: { id: true, codigo: true, validade: true } }` por `lote: { select: { id: true, codigo: true, validade: true, custoKg: true } }` e `produto: { select: { codigo: true, descricao: true } }` por `produto: { select: { codigo: true, descricao: true, precoReferenciaKg: true } }`. No retorno:

```ts
  const configuracao = await obterConfiguracaoProducao(filialId);
  const resumo = resumoComCustoGravado(op, linhasEmNumeros(op), configuracao);
  return {
    ...op,
    resumo,
    /** Produtos sem preço de referência que impedem o rateio (só OP aberta). */
    semPrecoReferencia:
      op.status === "ABERTA" ? ratearCustoOP(resumo.custo, op.producoes.map(producaoParaRateio)).semPreco : [],
    situacaoDesfazer: await situacaoParaDesfazer(op),
  };
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/server/services/ordemProducao.test.ts`
Expected: PASS (novos e antigos).

- [ ] **Step 6: Rodar os demais testes que encerram OP**

Run: `npx vitest run src/server/services/rastreabilidade.test.ts src/server/services/relatorioProducao`
Expected: PASS (as polpas da fixture têm o mesmo preço, então os números não mudam).

- [ ] **Step 7: Typecheck e commit**

Run: `npx tsc --noEmit`
Expected: sem erros (a página da OP ainda não usa os campos novos, mas não quebra).

```bash
git add src/server/services/ordemProducao.ts src/server/services/ordemProducao.test.ts src/server/services/producaoTestFixtures.ts
git commit -m "feat(producao): OP grava o custo rateado por produto e não encerra sem preço"
```

---

### Task 3: Telas e exportações

**Files:**
- Modify: `src/app/(dashboard)/producao/processamento/[numero]/page.tsx:175-177` (rótulo), `:260-300` (aviso e coluna)
- Modify: `src/app/(dashboard)/producao/processamento/page.tsx:102` (cabeçalho)
- Modify: `src/app/(dashboard)/producao/processamento/export/route.ts:38`
- Modify: `src/app/(dashboard)/producao/relatorios/processamento/page.tsx:159`
- Modify: `src/server/export/relatorioProcessamento.ts:72,122`
- Modify: `src/app/(dashboard)/cadastros/produtos/produto-dialog-form.tsx:133-143`

**Interfaces:**
- Consumes: `op.semPrecoReferencia: string[]`, `p.lote.custoKg` (Task 2).

- [ ] **Step 1: Detalhe da OP — rótulo do resumo**

Em `[numero]/page.tsx`, linha 175:

```tsx
            <Dado rotulo={encerrada ? "Custo médio/kg" : "Custo médio/kg (provisório)"}>
```

- [ ] **Step 2: Detalhe da OP — aviso de preço e coluna Custo/kg**

Logo depois do bloco `{aberta ? (<p className="text-xs text-muted-foreground">Cada linha cria um lote ...</p>) : null}` (~linha 269-273), acrescentar:

```tsx
          {aberta && op.semPrecoReferencia.length > 0 ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              Sem preço de referência: {op.semPrecoReferencia.join(", ")}. Cadastre o preço para encerrar a OP; até
              lá o custo é o médio.{" "}
              {podeEditarProdutos ? (
                <Link href="/cadastros/produtos" className="underline underline-offset-4">
                  Editar produtos
                </Link>
              ) : null}
            </p>
          ) : null}
```

e, junto das outras variáveis no topo do componente (depois de `const encerrada = ...`, linha 66):

```tsx
  const podeEditarProdutos = podeExecutar(sessao.perfil, "cadastroProducao:escrever");
```

Na tabela de produção: depois de `<TableHead>Embalagens</TableHead>` (linha 281) acrescentar `<TableHead className="text-right">Custo/kg</TableHead>`; depois da célula de embalagens (linha 296) acrescentar:

```tsx
                    <TableCell className="text-right tabular-nums">{formatarMoeda(p.lote.custoKg)}</TableCell>
```

e trocar `<Vazio colunas={7} texto="Nenhuma polpa lançada." />` por `<Vazio colunas={8} texto="Nenhuma polpa lançada." />`.

Confirmar que `formatarMoeda` aceita `Prisma.Decimal` como na linha 243 (`formatarMoeda(c.custoKg)`); se não aceitar, usar `formatarMoeda(Number(p.lote.custoKg))`.

- [ ] **Step 3: Listagem, export e relatório — rótulos**

- `processamento/page.tsx:102`: `<TableHead className="text-right">Custo médio/kg</TableHead>`.
- `processamento/export/route.ts:38`: `{ rotulo: "Custo médio/kg", valor: (op) => op.resumo.custo.custoKgPolpa },`.
- `relatorios/processamento/page.tsx:159`: `n("Custo médio", "R$/kg"),`.
- `src/server/export/relatorioProcessamento.ts:72` e `:122`: `"Custo/kg (R$)"` → `"Custo médio/kg (R$)"`.

- [ ] **Step 4: Dica no cadastro de produto**

Em `produto-dialog-form.tsx`, depois do `<Input id="precoReferenciaKg" ... />` (antes do `</div>` da linha 143):

```tsx
              <p className="text-xs text-muted-foreground">
                Sugerido na venda e usado para dividir o custo da OP entre as polpas.
              </p>
```

(Se o formulário já tiver um padrão de dica — ex.: no campo "Dias de liberação após vencimento" —, usar a mesma classe/estrutura daquele campo.)

- [ ] **Step 5: Testes, lint e typecheck**

Run: `npx tsc --noEmit; npx eslint "src/app/(dashboard)/producao" "src/app/(dashboard)/cadastros/produtos" src/server/export/relatorioProcessamento.ts; npx vitest run src/server/export`
Expected: sem erros; testes de export passam (nenhum compara o rótulo trocado — se algum comparar, atualizar o esperado para o rótulo novo).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/producao" "src/app/(dashboard)/cadastros/produtos/produto-dialog-form.tsx" src/server/export/relatorioProcessamento.ts
git commit -m "feat(producao): custo/kg por polpa na OP, aviso de preço e rótulos de custo médio"
```

---

### Task 4: Documentação e fechamento da Fase 7

**Files:**
- Modify: `docs/modulos/producao-estoque-vendas/03-regras-de-negocio.md:92-98` (RN-13)
- Modify: `docs/modulos/producao-estoque-vendas/08-duvidas-decisoes.md:25,36` (D-06, D-17)
- Modify: `docs/modulos/producao-estoque-vendas/README.md:42-48` (Situação)
- Modify: `docs/backlog.md:188-194`
- Modify: `content/ajuda/passo-a-passo.md:189,193,373`
- Modify: `docs/fases/fase-7-producao-estoque-vendas.md:3,45`
- Modify: `docs/superpowers/specs/2026-11-16-rateio-custo-op-design.md:3` (status)

- [ ] **Step 1: RN-13 (doc 03)** — substituir o parágrafo da RN-13 por:

```markdown
**RN-13 — Custo da OP e da polpa.** *(PROCESSAMENTO!R–U, ESTOQUE_LOTES!T)*
`custo total = custo do fruto consumido + custo dos insumos`;
`custo médio/kg = custo total ÷ polpa produzida`. **Mudança (D-06):** o custo
é dividido entre as polpas pelo **preço de referência/kg** do produto:
`custo/kg do produto = custo total × preço ÷ Σ(kg × preço)`. Uma OP com um só
produto, ou com o mesmo preço em todos, fica no médio. Faltando preço em
algum produto (de uma OP com mais de um), a OP **não encerra**; enquanto
aberta, o custo provisório é o médio. **Mudança:** o custo é calculado e
gravado quando a OP é encerrada, e o custo dos insumos usa o preço do insumo
**naquele momento** (a planilha busca o preço atual do cadastro e reescreve
o passado: D-05); o preço de referência usado no rateio também é o do
momento do encerramento.
```

- [ ] **Step 2: D-06 e D-17 (doc 08)** — na coluna Decisão:
  - D-06: `**Mesmo R$/kg** na v1; rateio no backlog (2026-11-10, spec da 7e). **Rateio pelo preço de referência** (2026-11-16): custo/kg proporcional ao preço do produto; sem preço, a OP não encerra.`
  - D-17: acrescentar ao texto atual: ` **Fechada** (2026-11-16): sem importação de arquivo; a filial é criada pelo Administrador e implantada do zero. Mudança de plano vira tarefa nova.` e trocar a coluna Bloqueia `🔴 7d Importação` por `—`.

- [ ] **Step 3: README do módulo** — trocar o item "Situação (2026-11-14)" por:

```markdown
- **Situação (2026-11-16): Fase 7 concluída.** Sub-projetos 7a, 7b, 7c, 7e,
  7f e 7g implementados, mais a liberação de lote vencido no lote (D-35) e o
  rateio do custo da OP pelo preço de referência (D-06); 7d (importação da
  planilha) cancelada. Todas as decisões do doc 8 estão fechadas: a etiqueta
  (D-10) com campos configuráveis e a implantação da Hortitex (D-17) do
  zero, com a filial criada pelo Administrador.
```

- [ ] **Step 4: Backlog** — remover a seção `## Produção — processamento (Fase 7e)` inteira (com o item do rateio) e acrescentar no fim:

```markdown
## Produção — custo da OP

- **Histórico do preço de referência do produto** (rateio do custo da OP,
  2026-11-16). O rateio usa o preço do cadastro no momento do encerramento e
  o resultado fica congelado no `custoKg` do lote; o preço usado fica só na
  auditoria `ENCERRAR` da OP. Se for preciso consultar "qual preço valia em
  tal data" (ex.: para explicar um custo antigo sem abrir a auditoria),
  criar um histórico de preços por produto.
```

- [ ] **Step 5: Ajuda** (`content/ajuda/passo-a-passo.md`):
  - Linha 189: trocar "e o custo: fruto + insumos, dividido igualmente por kg entre todas as polpas da OP. Enquanto a OP está aberta, o custo é provisório." por "e o custo: fruto + insumos, com o custo médio por kg de polpa. O custo de cada polpa é dividido pelo **preço de referência** do produto: a polpa que vale mais por kg recebe um custo por kg maior (a coluna Custo/kg da aba Produção mostra o de cada lote). Enquanto a OP está aberta, o custo é provisório; se algum produto estiver sem preço de referência, o custo fica no médio e a tela avisa."
  - Linha 193: depois de "**Encerrar OP** grava o custo e libera a polpa." acrescentar " Se a OP produziu mais de um produto e algum está sem preço de referência, o encerramento é recusado até o preço ser cadastrado."
  - Linha 373: trocar "validade em dias, preço de referência, texto" por "validade em dias, **preço de referência** (sugerido na venda e usado para dividir o custo da OP entre as polpas; obrigatório para encerrar uma OP com mais de um produto), texto".

- [ ] **Step 6: Registro da Fase 7** (`docs/fases/fase-7-producao-estoque-vendas.md`):
  - Linha 3: `Status: 🟡 **Em desenvolvimento.**` → `Status: ✅ **Concluída** (2026-11-16).`
  - No fim do parágrafo de status (depois de "...ficou fechada com os campos configuráveis."), acrescentar: ` Rateio do custo da OP concluído em 2026-11-16 (D-06): o custo de cada polpa é proporcional ao preço de referência do produto, e a OP não encerra sem preço. Implantação (D-17) fechada: a filial da Hortitex é criada pelo Administrador e implantada do zero, sem importação.`

- [ ] **Step 7: Spec** — linha 3: `Data: 2026-11-16 · Status: implementada (2026-11-16)`; se a implementação divergiu (ex.: a forma do retorno de `ratearCustoOP`), acrescentar uma linha "Ajustes na implementação: ...".

- [ ] **Step 8: Commit**

```bash
git add docs content/ajuda/passo-a-passo.md
git commit -m "docs(producao): rateio do custo da OP e Fase 7 concluída"
```

---

### Task 5: Conferência no navegador

**Files:**
- Create (temporário, não commitar): `scripts/cenario-rateio-op.ts`

- [ ] **Step 1: Cenário por script**

Seguir o padrão dos cenários anteriores (fixtures + `usuarioEmpresa` do admin com `filiais`, modo `limpar` no fim). Na filial de demonstração do admin local: fruta "Açaí rateio", produto fruto `FRT`, polpas `PRG` "Polpa rateio grosso" (preço 30), `PRF` "Polpa rateio fino" (preço 10) e `PRX` "Polpa rateio sem preço" (sem preço), um lote de fruto de 100 kg a R$ 1,50, insumo de R$ 0,50. Rodar com `npx tsx scripts/cenario-rateio-op.ts` e `... limpar`.

- [ ] **Step 2: Conferir na tela** (`npm run dev`, login local)

1. Nova OP da fruta: consumir 100 kg; produção 40 kg PRG + 20 kg PRF → coluna Custo/kg diferente por lote (provisório), resumo "Custo médio/kg (provisório)".
2. Lançar 10 kg de PRX → aviso "Sem preço de referência: Polpa rateio sem preço…" com link; todos os lotes no médio.
3. Encerrar → erro "Cadastre o preço de referência de: Polpa rateio sem preço" no diálogo.
4. Cadastrar preço 5 em PRX (Cadastros → Produtos, conferir a dica do campo) → voltar, encerrar → custo/kg por lote rateado; rótulo "Custo médio/kg".
5. Estoque: Custo/kg dos lotes de polpa = o rateado. Listagem de processamento e relatório de processamento: rótulos "Custo médio".
6. Rodar o script com `limpar`.

- [ ] **Step 3: Relatório final ao usuário**

O que foi entregue, ajustes em relação à spec, D-06 e D-17 fechadas, Fase 7 concluída, lembrete: push/PR/merge com o usuário; próxima tarefa combinada: varredura dos "fora do escopo" das specs para o backlog (branch de docs própria).
