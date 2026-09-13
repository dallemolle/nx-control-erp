# Filtros Globais Combináveis (Fase 6, sub-projeto 6c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a Contas a pagar/receber um mecanismo de filtros combináveis
por 8 dimensões (categoria, contraparte, centro de custo, centro de
lucro, safra, projeto, status, período de vencimento), reaproveitável por
telas futuras, e fazer o export CSV/Excel dessas telas respeitar os
mesmos filtros.

**Architecture:** Query string com um param por dimensão (mesmo padrão já
usado em `fluxo-por-dimensao`/`conciliacao`). `listarTitulos` ganha um 3º
parâmetro `FiltroTitulos` opcional: filtros de título entram no `where`
do Prisma, filtros de parcela (status/período) são aplicados em memória
logo após o recálculo de status que a função já faz. Um módulo
compartilhado de parsing de URL (`filtro-titulos-url.ts`) é consumido
tanto pelas 2 páginas quanto pelas 2 rotas de export, garantindo que tela
e export leem os mesmos params da mesma forma.

**Tech Stack:** Next.js App Router (Server Components + Route Handlers),
Prisma, TypeScript, Vitest (Postgres real, sem mocks).

**Spec:** `docs/superpowers/specs/2026-09-12-filtros-globais-design.md`

## Global Constraints

- 8 dimensões no v1, todas campo direto de `Titulo`/`Parcela`: categoria,
  contraparte (fornecedor OU cliente, conforme o tipo), centro de custo,
  centro de lucro, safra, projeto, status, período de vencimento. Banco e
  conta bancária ficam fora — vão para o backlog.
- Um valor por dimensão (sem multi-select). Sentinela `SEM_VALOR`
  (`"__nenhum__"`, de `@/lib/schemas/enums`) representa "sem filtro" —
  mesmo padrão já usado em `conciliacao/filtro-status.tsx`.
- Filtros de título (categoria, contraparte, centro de custo, centro de
  lucro, safra, projeto) entram no `where` do Prisma. Filtros de parcela
  (status, período de vencimento) são aplicados **em memória, depois do
  recálculo de status que `listarTitulos` já faz** — um título aparece se
  **a mesma parcela** casa com status **e** período simultaneamente
  (semântica de existência). As demais parcelas do título continuam
  todas visíveis.
- `vencimentoDe`/`vencimentoAte` são independentes um do outro e ambos
  inclusivos (`>=`/`<=`).
- "Empresa sem filial selecionada consolida todas as filiais" está **fora
  de escopo** deste plano (mudaria `SessaoAtiva.filialId` de obrigatório
  para opcional) — não implementar, não deixar hook para isso.
- O export (CSV/Excel) de contas a pagar/receber passa a respeitar os
  mesmos filtros da tela via `queryString` propagada ao `ExportarLinks`
  (mesmo mecanismo já usado pelo fluxo de caixa no sub-projeto 6b).
- **Sem testes automatizados para Route Handlers nem para `page.tsx`** —
  convenção já estabelecida neste projeto (`requireSessaoAtiva()` lê
  cookies internamente, não é injetável). A lógica de filtro é testada
  inteiramente em `titulo.ts` e no módulo `filtro-titulos-url.ts`; as
  rotas de export e as páginas são wiring fino sobre essa lógica já
  testada, verificado por `npx tsc --noEmit` + `npm run build`.
- Todo teste de integração usa a fixture existente
  `financeiroTestFixtures.ts` (`criarFixtureFinanceiro`/
  `limparFixtureFinanceiro`) — nunca criar empresa/filial à mão.

---

### Task 1: Filtro no serviço `listarTitulos`

**Files:**
- Modify: `src/server/services/titulo.ts`
- Test: `src/server/services/titulo.test.ts`

**Interfaces:**
- Produces: `export type FiltroTitulos = { categoriaId?: string; contraparteId?: string; centroCustoId?: string; centroLucroId?: string; safraId?: string; projetoId?: string; status?: StatusParcela; vencimentoDe?: Date; vencimentoAte?: Date }`; `export function parcelaBateFiltroDeParcela(parcela: { status: StatusParcela; dataVencimento: Date }, filtros: Pick<FiltroTitulos, "status" | "vencimentoDe" | "vencimentoAte">): boolean`; `listarTitulos(filialId: string, tipo: TipoTitulo, filtros?: FiltroTitulos)` (3º parâmetro opcional — chamadas existentes com 2 argumentos continuam funcionando).

- [ ] **Step 1: Escrever os testes puros de `parcelaBateFiltroDeParcela` (ainda não existe)**

No topo de `src/server/services/titulo.test.ts`, **antes** do `describe("titulo (filial-scoped)", ...)` existente, adicionar:

```ts
import { parcelaBateFiltroDeParcela } from "./titulo";

describe("parcelaBateFiltroDeParcela (pura)", () => {
  test("sem filtro nenhum, sempre bate", () => {
    expect(
      parcelaBateFiltroDeParcela({ status: "VENCIDO", dataVencimento: new Date("2026-01-01") }, {}),
    ).toBe(true);
  });

  test("filtra só por status", () => {
    const parcela = { status: "VENCIDO" as const, dataVencimento: new Date("2026-01-01") };
    expect(parcelaBateFiltroDeParcela(parcela, { status: "PAGO" })).toBe(false);
    expect(parcelaBateFiltroDeParcela(parcela, { status: "VENCIDO" })).toBe(true);
  });

  test("filtra só por período (inclusivo nas duas pontas)", () => {
    const parcela = { status: "VENCIDO" as const, dataVencimento: new Date("2026-06-15") };
    expect(parcelaBateFiltroDeParcela(parcela, { vencimentoDe: new Date("2026-06-15") })).toBe(true);
    expect(parcelaBateFiltroDeParcela(parcela, { vencimentoDe: new Date("2026-06-16") })).toBe(false);
    expect(parcelaBateFiltroDeParcela(parcela, { vencimentoAte: new Date("2026-06-15") })).toBe(true);
    expect(parcelaBateFiltroDeParcela(parcela, { vencimentoAte: new Date("2026-06-14") })).toBe(false);
  });

  test("status e período juntos exigem que a mesma parcela bata os dois", () => {
    const parcela = { status: "VENCIDO" as const, dataVencimento: new Date("2026-06-15") };
    expect(
      parcelaBateFiltroDeParcela(parcela, {
        status: "VENCIDO",
        vencimentoDe: new Date("2026-06-01"),
        vencimentoAte: new Date("2026-06-30"),
      }),
    ).toBe(true);
    expect(
      parcelaBateFiltroDeParcela(parcela, {
        status: "PAGO",
        vencimentoDe: new Date("2026-06-01"),
        vencimentoAte: new Date("2026-06-30"),
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- titulo.test.ts`
Expected: FAIL — `parcelaBateFiltroDeParcela` não existe em `./titulo`.

- [ ] **Step 3: Implementar `FiltroTitulos` e `parcelaBateFiltroDeParcela` em `titulo.ts`**

Adicionar, logo após os imports existentes no topo de `src/server/services/titulo.ts`:

```ts
export type FiltroTitulos = {
  categoriaId?: string;
  contraparteId?: string;
  centroCustoId?: string;
  centroLucroId?: string;
  safraId?: string;
  projetoId?: string;
  status?: StatusParcela;
  vencimentoDe?: Date;
  vencimentoAte?: Date;
};

export function parcelaBateFiltroDeParcela(
  parcela: { status: StatusParcela; dataVencimento: Date },
  filtros: Pick<FiltroTitulos, "status" | "vencimentoDe" | "vencimentoAte">,
): boolean {
  if (filtros.status !== undefined && parcela.status !== filtros.status) return false;
  if (filtros.vencimentoDe !== undefined && parcela.dataVencimento < filtros.vencimentoDe) return false;
  if (filtros.vencimentoAte !== undefined && parcela.dataVencimento > filtros.vencimentoAte) return false;
  return true;
}
```

- [ ] **Step 4: Rodar e confirmar que os testes puros passam**

Run: `npm test -- titulo.test.ts`
Expected: os 4 testes de `parcelaBateFiltroDeParcela` passam (os testes de integração existentes continuam passando também).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/titulo.ts src/server/services/titulo.test.ts
git commit -m "feat: adicionar FiltroTitulos e parcelaBateFiltroDeParcela (puros)"
```

- [ ] **Step 6: Escrever os testes de integração de `listarTitulos` com filtro (ainda não aceita 3º argumento)**

No final do `describe("titulo (filial-scoped)", ...)` existente em
`src/server/services/titulo.test.ts` (depois do último `test(...)`, antes
do `});` de fechamento do describe), adicionar:

```ts
  test("listarTitulos filtra por categoria", async () => {
    const categoria = await prisma.categoriaFinanceira.create({
      data: { filialId: fixture.filialId, nome: "Categoria Filtro Dimensao TIT", tipo: "DESPESA" },
    });

    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-CATEGORIA-DIM-TIT",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: categoria.id,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const filtrados = await listarTitulos(fixture.filialId, "PAGAR", { categoriaId: categoria.id });
    expect(filtrados.every((t) => t.categoriaFinanceiraId === categoria.id)).toBe(true);
    expect(filtrados.some((t) => t.id === titulo.id)).toBe(true);
  });

  test("listarTitulos filtra por contraparte (fornecedor)", async () => {
    const outroFornecedor = await prisma.fornecedor.create({
      data: { empresaId: fixture.empresaId, nome: "Fornecedor Filtro TIT", cnpjCpf: "77.777.TIT/0001-88" },
    });

    const tituloOutroFornecedor = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: outroFornecedor.id,
      documento: "NF-OUTRO-FORNECEDOR-TIT",
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

    const filtrados = await listarTitulos(fixture.filialId, "PAGAR", { contraparteId: fixture.fornecedorId });
    expect(filtrados.every((t) => t.fornecedorId === fixture.fornecedorId)).toBe(true);
    expect(filtrados.some((t) => t.id === tituloOutroFornecedor.id)).toBe(false);
  });

  test("listarTitulos filtra por centro de custo", async () => {
    const centroCusto = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Centro Custo Filtro TIT", codigo: "CC-FILTRO-TIT" },
    });

    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-CENTRO-CUSTO-TIT",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: centroCusto.id,
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const filtrados = await listarTitulos(fixture.filialId, "PAGAR", { centroCustoId: centroCusto.id });
    expect(filtrados.every((t) => t.centroCustoId === centroCusto.id)).toBe(true);
    expect(filtrados.some((t) => t.id === titulo.id)).toBe(true);
  });

  test("listarTitulos filtra por centro de lucro", async () => {
    const centroLucro = await prisma.centroLucro.create({
      data: { filialId: fixture.filialId, nome: "Centro Lucro Filtro TIT", codigo: "CL-FILTRO-TIT" },
    });

    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-CENTRO-LUCRO-TIT",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: centroLucro.id,
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const filtrados = await listarTitulos(fixture.filialId, "PAGAR", { centroLucroId: centroLucro.id });
    expect(filtrados.every((t) => t.centroLucroId === centroLucro.id)).toBe(true);
    expect(filtrados.some((t) => t.id === titulo.id)).toBe(true);
  });

  test("listarTitulos filtra por safra", async () => {
    const safra = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra Filtro TIT",
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2026-12-31"),
      },
    });

    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-SAFRA-TIT",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: safra.id,
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const filtrados = await listarTitulos(fixture.filialId, "PAGAR", { safraId: safra.id });
    expect(filtrados.every((t) => t.safraId === safra.id)).toBe(true);
    expect(filtrados.some((t) => t.id === titulo.id)).toBe(true);
  });

  test("listarTitulos filtra por projeto", async () => {
    const projeto = await prisma.projeto.create({
      data: { filialId: fixture.filialId, nome: "Projeto Filtro TIT", codigo: "PRJ-FILTRO-TIT" },
    });

    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-PROJETO-TIT",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: projeto.id,
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const filtrados = await listarTitulos(fixture.filialId, "PAGAR", { projetoId: projeto.id });
    expect(filtrados.every((t) => t.projetoId === projeto.id)).toBe(true);
    expect(filtrados.some((t) => t.id === titulo.id)).toBe(true);
  });

  test("listarTitulos filtra por status", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-STATUS-TIT",
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
    await cancelarParcela(fixture.sessao, titulo.parcelas[0].id);

    const cancelados = await listarTitulos(fixture.filialId, "PAGAR", { status: "CANCELADO" });
    expect(cancelados.some((t) => t.id === titulo.id)).toBe(true);

    const pagos = await listarTitulos(fixture.filialId, "PAGAR", { status: "PAGO" });
    expect(pagos.some((t) => t.id === titulo.id)).toBe(false);
  });

  test("listarTitulos filtra por período de vencimento (inclusivo)", async () => {
    const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-PERIODO-TIT",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date("2027-03-10T00:00:00.000Z"), valorOriginal: 100 }],
    });

    const dentro = await listarTitulos(fixture.filialId, "PAGAR", {
      vencimentoDe: new Date("2027-03-01T00:00:00.000Z"),
      vencimentoAte: new Date("2027-03-31T00:00:00.000Z"),
    });
    expect(dentro.some((t) => t.id === titulo.id)).toBe(true);

    const fora = await listarTitulos(fixture.filialId, "PAGAR", {
      vencimentoDe: new Date("2027-04-01T00:00:00.000Z"),
    });
    expect(fora.some((t) => t.id === titulo.id)).toBe(false);
  });

  test("listarTitulos combina categoria e status: interseção, não união", async () => {
    const categoriaCombo = await prisma.categoriaFinanceira.create({
      data: { filialId: fixture.filialId, nome: "Categoria Combo TIT", tipo: "DESPESA" },
    });

    const tituloBateOsDois = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-COMBO-BATE-TIT",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: categoriaCombo.id,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });
    await cancelarParcela(fixture.sessao, tituloBateOsDois.parcelas[0].id);

    const tituloSoCategoria = await criarTitulo(fixture.sessao, "PAGAR", {
      contraparteId: fixture.fornecedorId,
      documento: "NF-COMBO-SO-CATEGORIA-TIT",
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: categoriaCombo.id,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });

    const filtrados = await listarTitulos(fixture.filialId, "PAGAR", {
      categoriaId: categoriaCombo.id,
      status: "CANCELADO",
    });

    expect(filtrados.some((t) => t.id === tituloBateOsDois.id)).toBe(true);
    expect(filtrados.some((t) => t.id === tituloSoCategoria.id)).toBe(false);
  });

  test("listarTitulos com filtro que não bate nada devolve lista vazia", async () => {
    const filtrados = await listarTitulos(fixture.filialId, "PAGAR", { vencimentoDe: new Date("2200-01-01") });
    expect(filtrados).toEqual([]);
  });
```

- [ ] **Step 7: Rodar e confirmar que falha (compilação)**

Run: `npm test -- titulo.test.ts`
Expected: FAIL — erro de tipo, `listarTitulos` ainda não aceita um 3º
argumento.

- [ ] **Step 8: Implementar o filtro em `listarTitulos`**

Substituir a função `listarTitulos` existente (linhas 95-141 de
`src/server/services/titulo.ts`) por:

```ts
export async function listarTitulos(filialId: string, tipo: TipoTitulo, filtros: FiltroTitulos = {}) {
  const titulos = await prisma.titulo.findMany({
    where: {
      filialId,
      tipo,
      ...(filtros.categoriaId && { categoriaFinanceiraId: filtros.categoriaId }),
      ...(filtros.contraparteId &&
        (tipo === "PAGAR" ? { fornecedorId: filtros.contraparteId } : { clienteId: filtros.contraparteId })),
      ...(filtros.centroCustoId && { centroCustoId: filtros.centroCustoId }),
      ...(filtros.centroLucroId && { centroLucroId: filtros.centroLucroId }),
      ...(filtros.safraId && { safraId: filtros.safraId }),
      ...(filtros.projetoId && { projetoId: filtros.projetoId }),
    },
    include: {
      fornecedor: true,
      cliente: true,
      categoriaFinanceira: true,
      parcelas: { include: { baixas: true }, orderBy: { numero: "asc" } },
    },
    orderBy: { criadoEm: "desc" },
  });

  // Recalcula em memória a partir das parcelas/baixas já carregadas e persiste as
  // divergências com um `updateMany` por status — evita 1 SELECT + 1 UPDATE por parcela.
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
        // Mantém o objeto retornado coerente com o que acabou de ser persistido.
        parcela.status = statusCalculado;
      }
    }
  }

  for (const [status, ids] of idsPorStatus) {
    await prisma.parcela.updateMany({ where: { id: { in: ids } }, data: { status } });
  }

  const temFiltroDeParcela =
    filtros.status !== undefined || filtros.vencimentoDe !== undefined || filtros.vencimentoAte !== undefined;
  if (!temFiltroDeParcela) return titulos;

  return titulos.filter((titulo) => titulo.parcelas.some((parcela) => parcelaBateFiltroDeParcela(parcela, filtros)));
}
```

(Único trecho novo: o `where` ganha os 6 filtros de título condicionais, e
as 2 últimas linhas antes do `return` aplicam o filtro de parcela. O loop
de recálculo de status é copiado sem alteração.)

- [ ] **Step 9: Rodar e confirmar que todos os testes passam**

Run: `npm test -- titulo.test.ts`
Expected: PASS — todos os testes, incluindo os 9 novos de filtro e os já
existentes (chamadas com 2 argumentos continuam funcionando pelo default
`filtros: FiltroTitulos = {}`).

- [ ] **Step 10: Rodar toda a suíte e o typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: ambos limpos — nenhuma outra chamada existente de `listarTitulos`
quebrou.

- [ ] **Step 11: Commit**

```bash
git add src/server/services/titulo.ts src/server/services/titulo.test.ts
git commit -m "feat: listarTitulos aceita filtro combinavel por 8 dimensoes"
```

---

### Task 2: Módulo de URL — parsing e serialização do filtro

**Files:**
- Create: `src/app/(dashboard)/financeiro/_titulos/filtro-titulos-url.ts`
- Test: `src/app/(dashboard)/financeiro/_titulos/filtro-titulos-url.test.ts`

**Interfaces:**
- Consumes: `FiltroTitulos` de `@/server/services/titulo` (Task 1).
- Produces: `export const CAMPOS_FILTRO_TITULOS: readonly string[]` (na
  ordem `["categoria", "contraparte", "centroCusto", "centroLucro", "safra", "projeto", "status", "vencimentoDe", "vencimentoAte"]`);
  `export function filtroTitulosDaUrl(get: (campo: string) => string | undefined): FiltroTitulos`;
  `export function algumFiltroAtivo(filtros: FiltroTitulos): boolean`;
  `export function queryStringDosFiltros(get: (campo: string) => string | undefined): string`.

- [ ] **Step 1: Escrever os testes (arquivo/funções ainda não existem)**

Criar `src/app/(dashboard)/financeiro/_titulos/filtro-titulos-url.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { filtroTitulosDaUrl, algumFiltroAtivo, queryStringDosFiltros } from "./filtro-titulos-url";

describe("filtroTitulosDaUrl", () => {
  test("nenhum param presente devolve filtro totalmente vazio", () => {
    const filtro = filtroTitulosDaUrl(() => undefined);
    expect(filtro).toEqual({
      categoriaId: undefined,
      contraparteId: undefined,
      centroCustoId: undefined,
      centroLucroId: undefined,
      safraId: undefined,
      projetoId: undefined,
      status: undefined,
      vencimentoDe: undefined,
      vencimentoAte: undefined,
    });
  });

  test("parseia valores válidos de cada dimensão", () => {
    const valores: Record<string, string> = {
      categoria: "cat-1",
      contraparte: "forn-1",
      centroCusto: "cc-1",
      centroLucro: "cl-1",
      safra: "safra-1",
      projeto: "proj-1",
      status: "VENCIDO",
      vencimentoDe: "2026-01-01",
      vencimentoAte: "2026-01-31",
    };
    const filtro = filtroTitulosDaUrl((campo) => valores[campo]);
    expect(filtro.categoriaId).toBe("cat-1");
    expect(filtro.contraparteId).toBe("forn-1");
    expect(filtro.centroCustoId).toBe("cc-1");
    expect(filtro.centroLucroId).toBe("cl-1");
    expect(filtro.safraId).toBe("safra-1");
    expect(filtro.projetoId).toBe("proj-1");
    expect(filtro.status).toBe("VENCIDO");
    expect(filtro.vencimentoDe?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(filtro.vencimentoAte?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  test('sentinela "__nenhum__" vira undefined', () => {
    const filtro = filtroTitulosDaUrl((campo) => (campo === "categoria" ? "__nenhum__" : undefined));
    expect(filtro.categoriaId).toBeUndefined();
  });

  test("status inválido vira undefined (nunca lança erro)", () => {
    const filtro = filtroTitulosDaUrl((campo) => (campo === "status" ? "NAO_EXISTE" : undefined));
    expect(filtro.status).toBeUndefined();
  });

  test("data malformada vira undefined (nunca lança erro)", () => {
    const filtro = filtroTitulosDaUrl((campo) => (campo === "vencimentoDe" ? "31/01/2026" : undefined));
    expect(filtro.vencimentoDe).toBeUndefined();
  });
});

describe("algumFiltroAtivo", () => {
  test("false quando nenhum filtro está definido", () => {
    expect(algumFiltroAtivo({})).toBe(false);
  });

  test("true quando ao menos um filtro está definido", () => {
    expect(algumFiltroAtivo({ categoriaId: "cat-1" })).toBe(true);
  });
});

describe("queryStringDosFiltros", () => {
  test("vazia quando nenhum param está presente", () => {
    expect(queryStringDosFiltros(() => undefined)).toBe("");
  });

  test("inclui só os params presentes, url-encoded, na ordem de CAMPOS_FILTRO_TITULOS", () => {
    const valores: Record<string, string> = { categoria: "cat 1", status: "VENCIDO" };
    const query = queryStringDosFiltros((campo) => valores[campo]);
    expect(query).toBe("categoria=cat%201&status=VENCIDO");
  });

  test('omite params com sentinela "__nenhum__"', () => {
    const query = queryStringDosFiltros((campo) => (campo === "categoria" ? "__nenhum__" : undefined));
    expect(query).toBe("");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- filtro-titulos-url.test.ts`
Expected: FAIL — o módulo `./filtro-titulos-url` não existe.

- [ ] **Step 3: Implementar o módulo**

Criar `src/app/(dashboard)/financeiro/_titulos/filtro-titulos-url.ts`:

```ts
import type { StatusParcela } from "@prisma/client";
import type { FiltroTitulos } from "@/server/services/titulo";
import { SEM_VALOR } from "@/lib/schemas/enums";

const STATUS_VALIDOS: StatusParcela[] = [
  "EM_ABERTO",
  "A_VENCER",
  "VENCIDO",
  "PARCIALMENTE_PAGO",
  "PAGO",
  "CANCELADO",
  "RENEGOCIADO",
];

/** Nomes dos params na URL, na ordem usada tanto pelas páginas quanto pelas rotas de export. */
export const CAMPOS_FILTRO_TITULOS = [
  "categoria",
  "contraparte",
  "centroCusto",
  "centroLucro",
  "safra",
  "projeto",
  "status",
  "vencimentoDe",
  "vencimentoAte",
] as const;

function valorOuUndefined(valor: string | undefined): string | undefined {
  return valor && valor.length > 0 && valor !== SEM_VALOR ? valor : undefined;
}

function statusOuUndefined(valor: string | undefined): StatusParcela | undefined {
  return STATUS_VALIDOS.includes(valor as StatusParcela) ? (valor as StatusParcela) : undefined;
}

function dataOuUndefined(valor: string | undefined): Date | undefined {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return undefined;
  const data = new Date(`${valor}T00:00:00Z`);
  return Number.isNaN(data.getTime()) ? undefined : data;
}

export function filtroTitulosDaUrl(get: (campo: string) => string | undefined): FiltroTitulos {
  return {
    categoriaId: valorOuUndefined(get("categoria")),
    contraparteId: valorOuUndefined(get("contraparte")),
    centroCustoId: valorOuUndefined(get("centroCusto")),
    centroLucroId: valorOuUndefined(get("centroLucro")),
    safraId: valorOuUndefined(get("safra")),
    projetoId: valorOuUndefined(get("projeto")),
    status: statusOuUndefined(get("status")),
    vencimentoDe: dataOuUndefined(get("vencimentoDe")),
    vencimentoAte: dataOuUndefined(get("vencimentoAte")),
  };
}

export function algumFiltroAtivo(filtros: FiltroTitulos): boolean {
  return Object.values(filtros).some((valor) => valor !== undefined);
}

export function queryStringDosFiltros(get: (campo: string) => string | undefined): string {
  return CAMPOS_FILTRO_TITULOS.map((campo) => [campo, get(campo)] as const)
    .filter(([, valor]) => valor !== undefined && valor.length > 0 && valor !== SEM_VALOR)
    .map(([campo, valor]) => `${campo}=${encodeURIComponent(valor as string)}`)
    .join("&");
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- filtro-titulos-url.test.ts`
Expected: PASS — todos os testes.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/financeiro/_titulos/filtro-titulos-url.ts src/app/\(dashboard\)/financeiro/_titulos/filtro-titulos-url.test.ts
git commit -m "feat: modulo de parsing/serializacao de filtro de titulos na URL"
```

---

### Task 3: Componente `BarraDeFiltros`

**Files:**
- Create: `src/app/(dashboard)/financeiro/_titulos/barra-de-filtros.tsx`
- Test: `src/app/(dashboard)/financeiro/_titulos/barra-de-filtros.test.ts`

**Interfaces:**
- Consumes: nada de Task 1/2 diretamente — os nomes de param que este
  componente escreve na URL (`categoria`, `contraparte`, `centroCusto`,
  `centroLucro`, `safra`, `projeto`, `status`, `vencimentoDe`,
  `vencimentoAte`) precisam ser **exatamente** os mesmos nomes que
  `filtro-titulos-url.ts` (Task 2) lê — mesma string literal nos dois
  lados.
- Produces: `export type OpcoesFiltro = { categorias: { id: string; nome: string }[]; contrapartes: { id: string; nome: string }[]; centrosCusto: { id: string; nome: string }[]; centrosLucro: { id: string; nome: string }[]; safras: { id: string; nome: string }[]; projetos: { id: string; nome: string }[] }`;
  `export function construirUrlComFiltro(searchParamsAtual: URLSearchParams, pathname: string, campo: string, valor: string): string`;
  `export function BarraDeFiltros({ rotuloContraparte, opcoes }: { rotuloContraparte: string; opcoes: OpcoesFiltro }): JSX.Element`.

- [ ] **Step 1: Escrever os testes de `construirUrlComFiltro` (arquivo ainda não existe)**

Criar `src/app/(dashboard)/financeiro/_titulos/barra-de-filtros.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { construirUrlComFiltro } from "./barra-de-filtros";

describe("construirUrlComFiltro", () => {
  test("adiciona um novo filtro preservando os demais params da URL", () => {
    const atual = new URLSearchParams("status=VENCIDO");
    const resultado = construirUrlComFiltro(atual, "/financeiro/contas-a-pagar", "categoria", "cat-1");
    expect(resultado).toBe("/financeiro/contas-a-pagar?status=VENCIDO&categoria=cat-1");
  });

  test('sentinela "__nenhum__" remove o param', () => {
    const atual = new URLSearchParams("status=VENCIDO&categoria=cat-1");
    const resultado = construirUrlComFiltro(atual, "/financeiro/contas-a-pagar", "categoria", "__nenhum__");
    expect(resultado).toBe("/financeiro/contas-a-pagar?status=VENCIDO");
  });

  test("string vazia remove o param (usado pelos campos de data)", () => {
    const atual = new URLSearchParams("vencimentoDe=2026-01-01");
    const resultado = construirUrlComFiltro(atual, "/financeiro/contas-a-pagar", "vencimentoDe", "");
    expect(resultado).toBe("/financeiro/contas-a-pagar");
  });

  test("sem nenhum param restante devolve só o pathname", () => {
    const atual = new URLSearchParams("categoria=cat-1");
    const resultado = construirUrlComFiltro(atual, "/financeiro/contas-a-pagar", "categoria", "__nenhum__");
    expect(resultado).toBe("/financeiro/contas-a-pagar");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- barra-de-filtros.test.ts`
Expected: FAIL — o módulo `./barra-de-filtros` não existe.

- [ ] **Step 3: Implementar o componente**

Criar `src/app/(dashboard)/financeiro/_titulos/barra-de-filtros.tsx`:

```tsx
"use client";

import type { ChangeEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SEM_VALOR } from "@/lib/schemas/enums";
import type { StatusParcela } from "@prisma/client";

const STATUS_OPCOES: StatusParcela[] = [
  "EM_ABERTO",
  "A_VENCER",
  "VENCIDO",
  "PARCIALMENTE_PAGO",
  "PAGO",
  "CANCELADO",
  "RENEGOCIADO",
];

export type OpcoesFiltro = {
  categorias: { id: string; nome: string }[];
  contrapartes: { id: string; nome: string }[];
  centrosCusto: { id: string; nome: string }[];
  centrosLucro: { id: string; nome: string }[];
  safras: { id: string; nome: string }[];
  projetos: { id: string; nome: string }[];
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
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function BarraDeFiltros({
  rotuloContraparte,
  opcoes,
}: {
  rotuloContraparte: string;
  opcoes: OpcoesFiltro;
}) {
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
    return (valor: string) => router.push(construirUrlComFiltro(searchParams, pathname, campo, valor));
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
        <span className="text-xs text-muted-foreground">Categoria</span>
        <Select value={valorSelect("categoria")} onValueChange={aoMudarSelect("categoria")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todas</SelectItem>
            {opcoes.categorias.map((categoria) => (
              <SelectItem key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{rotuloContraparte}</span>
        <Select value={valorSelect("contraparte")} onValueChange={aoMudarSelect("contraparte")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todos</SelectItem>
            {opcoes.contrapartes.map((contraparte) => (
              <SelectItem key={contraparte.id} value={contraparte.id}>
                {contraparte.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Centro de custo</span>
        <Select value={valorSelect("centroCusto")} onValueChange={aoMudarSelect("centroCusto")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todos</SelectItem>
            {opcoes.centrosCusto.map((centroCusto) => (
              <SelectItem key={centroCusto.id} value={centroCusto.id}>
                {centroCusto.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Centro de lucro</span>
        <Select value={valorSelect("centroLucro")} onValueChange={aoMudarSelect("centroLucro")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todos</SelectItem>
            {opcoes.centrosLucro.map((centroLucro) => (
              <SelectItem key={centroLucro.id} value={centroLucro.id}>
                {centroLucro.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Safra</span>
        <Select value={valorSelect("safra")} onValueChange={aoMudarSelect("safra")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todas</SelectItem>
            {opcoes.safras.map((safra) => (
              <SelectItem key={safra.id} value={safra.id}>
                {safra.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Projeto</span>
        <Select value={valorSelect("projeto")} onValueChange={aoMudarSelect("projeto")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todos</SelectItem>
            {opcoes.projetos.map((projeto) => (
              <SelectItem key={projeto.id} value={projeto.id}>
                {projeto.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Status</span>
        <Select value={valorSelect("status")} onValueChange={aoMudarSelect("status")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todos os status</SelectItem>
            {STATUS_OPCOES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Vencimento de</span>
        <Input
          type="date"
          className="w-40"
          value={valorData("vencimentoDe")}
          onChange={aoMudarData("vencimentoDe")}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Vencimento até</span>
        <Input
          type="date"
          className="w-40"
          value={valorData("vencimentoAte")}
          onChange={aoMudarData("vencimentoAte")}
        />
      </div>

      <Button type="button" variant="outline" size="sm" onClick={limparFiltros}>
        Limpar filtros
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- barra-de-filtros.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/financeiro/_titulos/barra-de-filtros.tsx src/app/\(dashboard\)/financeiro/_titulos/barra-de-filtros.test.ts
git commit -m "feat: componente BarraDeFiltros para contas a pagar/receber"
```

---

### Task 4: Wiring nas páginas de contas a pagar/receber

**Files:**
- Modify: `src/app/(dashboard)/financeiro/_titulos/titulo-table.tsx`
- Modify: `src/app/(dashboard)/financeiro/_titulos/contas-client-panel.tsx`
- Modify: `src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx`
- Modify: `src/app/(dashboard)/financeiro/contas-a-receber/page.tsx`

**Interfaces:**
- Consumes: `listarTitulos(filialId, tipo, filtros)` (Task 1);
  `filtroTitulosDaUrl`, `algumFiltroAtivo`, `queryStringDosFiltros` (Task
  2); `BarraDeFiltros`, `OpcoesFiltro` (Task 3).
- Produces: `TituloTable`/`ContasClientePanel` ganham a prop
  `filtroAtivo: boolean`.

Não há testes automatizados neste task (páginas Server Component e client
components sem lógica pura nova — só JSX e passagem de props; convenção
já estabelecida no projeto de não testar `page.tsx`). Verificação é
`npx tsc --noEmit` + `npm run build` ao final.

- [ ] **Step 1: Adicionar prop `filtroAtivo` e o estado vazio em `titulo-table.tsx`**

Em `src/app/(dashboard)/financeiro/_titulos/titulo-table.tsx`, no tipo de
props da função `TituloTable` (linhas 86-94), adicionar `filtroAtivo:
boolean;` à lista de props:

```ts
export function TituloTable({
  tipo,
  titulos,
  opcoes,
  podeEscrever,
  podeBaixar,
  filtroAtivo,
  onAbrirBaixa,
  onAbrirRenegociacao,
}: {
  tipo: TipoTitulo;
  titulos: TituloLinha[];
  opcoes: OpcoesTitulo;
  podeEscrever: boolean;
  podeBaixar: boolean;
  filtroAtivo: boolean;
  onAbrirBaixa: (parcelaId: string) => void;
  onAbrirRenegociacao: (parcelaId: string) => void;
}) {
```

Dentro de `<TableBody>`, imediatamente depois do `{titulos.map((titulo) => (...))}` (antes do `</TableBody>` de fechamento), adicionar:

```tsx
        {titulos.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              {filtroAtivo ? "Nenhum título encontrado para os filtros selecionados" : "Nenhum título cadastrado"}
            </TableCell>
          </TableRow>
        )}
```

- [ ] **Step 2: Repassar `filtroAtivo` em `contas-client-panel.tsx`**

Em `src/app/(dashboard)/financeiro/_titulos/contas-client-panel.tsx`,
adicionar `filtroAtivo: boolean;` ao tipo de props de `ContasClientePanel`
(junto de `podeEscrever`/`podeBaixar`) e passá-lo para `<TituloTable>`:

```ts
export function ContasClientePanel({
  tipo,
  titulos,
  opcoes,
  podeEscrever,
  podeBaixar,
  filtroAtivo,
}: {
  tipo: TipoTitulo;
  titulos: Parameters<typeof TituloTable>[0]["titulos"];
  opcoes: OpcoesTitulo;
  podeEscrever: boolean;
  podeBaixar: boolean;
  filtroAtivo: boolean;
}) {
```

E no JSX de `<TituloTable>` dentro do mesmo componente, adicionar
`filtroAtivo={filtroAtivo}` junto das demais props já passadas.

- [ ] **Step 3: Wiring em `contas-a-pagar/page.tsx`**

Substituir o conteúdo inteiro de
`src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx` por:

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
import { BarraDeFiltros } from "../_titulos/barra-de-filtros";
import { filtroTitulosDaUrl, algumFiltroAtivo, queryStringDosFiltros } from "../_titulos/filtro-titulos-url";
import { ExportarLinks } from "../../_shared/exportar-links";

function paramCru(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

type SearchParams = {
  categoria?: string | string[];
  contraparte?: string | string[];
  centroCusto?: string | string[];
  centroLucro?: string | string[];
  safra?: string | string[];
  projeto?: string | string[];
  status?: string | string[];
  vencimentoDe?: string | string[];
  vencimentoAte?: string | string[];
};

export default async function ContasAPagarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:ler");
  const podeEscrever = podeEscreverTitulo(sessao.perfil, sessao.podeAlterarFilial);
  const podeBaixar = podeBaixarTitulo(sessao.perfil, sessao.podeAlterarFilial);

  const sp = await searchParams;
  const get = (campo: string) => paramCru((sp as Record<string, string | string[] | undefined>)[campo]);
  const filtros = filtroTitulosDaUrl(get);
  const queryString = queryStringDosFiltros(get);

  const [titulos, fornecedores, categorias, centrosCusto, centrosLucro, safras, projetos, contasBancarias] =
    await Promise.all([
      listarTitulos(sessao.filialId, "PAGAR", filtros),
      listarFornecedores(sessao.empresaId),
      listarCategoriasFinanceiras(sessao.filialId),
      listarCentrosCusto(sessao.filialId),
      listarCentrosLucro(sessao.filialId),
      listarSafras(sessao.filialId),
      listarProjetos(sessao.filialId),
      listarContasBancarias(sessao.filialId),
    ]);

  const opcoes = {
    contrapartes: fornecedores,
    categorias,
    centrosCusto,
    centrosLucro,
    safras,
    projetos,
    contasBancarias: contasBancarias.map((conta) => ({
      id: conta.id,
      nome: `${conta.banco.nome} - Ag ${conta.agencia}/CC ${conta.conta}`,
    })),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Contas a pagar</h1>
          <p className="text-sm text-muted-foreground">Títulos e parcelas a pagar da filial ativa.</p>
        </div>
        <div className="flex items-center gap-4">
          <ExportarLinks baseHref="/financeiro/contas-a-pagar/export" queryString={queryString} />
          {podeEscrever && (
            <TituloDialogForm
              tipo="PAGAR"
              contrapartes={opcoes.contrapartes}
              categorias={opcoes.categorias}
              centrosCusto={opcoes.centrosCusto}
              centrosLucro={opcoes.centrosLucro}
              safras={opcoes.safras}
              projetos={opcoes.projetos}
              contasBancarias={opcoes.contasBancarias}
            />
          )}
        </div>
      </div>
      <BarraDeFiltros
        rotuloContraparte="Fornecedor"
        opcoes={{
          categorias: opcoes.categorias,
          contrapartes: opcoes.contrapartes,
          centrosCusto: opcoes.centrosCusto,
          centrosLucro: opcoes.centrosLucro,
          safras: opcoes.safras,
          projetos: opcoes.projetos,
        }}
      />
      <ContasClientePanel
        tipo="PAGAR"
        titulos={titulos}
        opcoes={opcoes}
        podeEscrever={podeEscrever}
        podeBaixar={podeBaixar}
        filtroAtivo={algumFiltroAtivo(filtros)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Wiring em `contas-a-receber/page.tsx`**

Substituir o conteúdo inteiro de
`src/app/(dashboard)/financeiro/contas-a-receber/page.tsx` por:

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
import { BarraDeFiltros } from "../_titulos/barra-de-filtros";
import { filtroTitulosDaUrl, algumFiltroAtivo, queryStringDosFiltros } from "../_titulos/filtro-titulos-url";
import { ExportarLinks } from "../../_shared/exportar-links";

function paramCru(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

type SearchParams = {
  categoria?: string | string[];
  contraparte?: string | string[];
  centroCusto?: string | string[];
  centroLucro?: string | string[];
  safra?: string | string[];
  projeto?: string | string[];
  status?: string | string[];
  vencimentoDe?: string | string[];
  vencimentoAte?: string | string[];
};

export default async function ContasAReceberPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:ler");
  const podeEscrever = podeEscreverTitulo(sessao.perfil, sessao.podeAlterarFilial);
  const podeBaixar = podeBaixarTitulo(sessao.perfil, sessao.podeAlterarFilial);

  const sp = await searchParams;
  const get = (campo: string) => paramCru((sp as Record<string, string | string[] | undefined>)[campo]);
  const filtros = filtroTitulosDaUrl(get);
  const queryString = queryStringDosFiltros(get);

  const [titulos, clientes, categorias, centrosCusto, centrosLucro, safras, projetos, contasBancarias] =
    await Promise.all([
      listarTitulos(sessao.filialId, "RECEBER", filtros),
      listarClientes(sessao.empresaId),
      listarCategoriasFinanceiras(sessao.filialId),
      listarCentrosCusto(sessao.filialId),
      listarCentrosLucro(sessao.filialId),
      listarSafras(sessao.filialId),
      listarProjetos(sessao.filialId),
      listarContasBancarias(sessao.filialId),
    ]);

  const opcoes = {
    contrapartes: clientes,
    categorias,
    centrosCusto,
    centrosLucro,
    safras,
    projetos,
    contasBancarias: contasBancarias.map((conta) => ({
      id: conta.id,
      nome: `${conta.banco.nome} - Ag ${conta.agencia}/CC ${conta.conta}`,
    })),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Contas a receber</h1>
          <p className="text-sm text-muted-foreground">Títulos e parcelas a receber da filial ativa.</p>
        </div>
        <div className="flex items-center gap-4">
          <ExportarLinks baseHref="/financeiro/contas-a-receber/export" queryString={queryString} />
          {podeEscrever && (
            <TituloDialogForm
              tipo="RECEBER"
              contrapartes={opcoes.contrapartes}
              categorias={opcoes.categorias}
              centrosCusto={opcoes.centrosCusto}
              centrosLucro={opcoes.centrosLucro}
              safras={opcoes.safras}
              projetos={opcoes.projetos}
              contasBancarias={opcoes.contasBancarias}
            />
          )}
        </div>
      </div>
      <BarraDeFiltros
        rotuloContraparte="Cliente"
        opcoes={{
          categorias: opcoes.categorias,
          contrapartes: opcoes.contrapartes,
          centrosCusto: opcoes.centrosCusto,
          centrosLucro: opcoes.centrosLucro,
          safras: opcoes.safras,
          projetos: opcoes.projetos,
        }}
      />
      <ContasClientePanel
        tipo="RECEBER"
        titulos={titulos}
        opcoes={opcoes}
        podeEscrever={podeEscrever}
        podeBaixar={podeBaixar}
        filtroAtivo={algumFiltroAtivo(filtros)}
      />
    </div>
  );
}
```

- [ ] **Step 5: Typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: ambos limpos (o `npx next typegen` só é necessário se `npm run
build`/`tsc` acusar erro em `layout.tsx` — sintoma conhecido de worktree
novo, nunca editar `layout.tsx` para resolver).

- [ ] **Step 6: Rodar a suíte completa**

Run: `npm test`
Expected: PASS — nenhuma regressão nos testes de `titulo.test.ts` já
cobertos no Task 1.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/financeiro/_titulos/titulo-table.tsx src/app/\(dashboard\)/financeiro/_titulos/contas-client-panel.tsx src/app/\(dashboard\)/financeiro/contas-a-pagar/page.tsx src/app/\(dashboard\)/financeiro/contas-a-receber/page.tsx
git commit -m "feat: wiring da barra de filtros nas telas de contas a pagar/receber"
```

---

### Task 5: Export CSV/Excel respeita os filtros

**Files:**
- Modify: `src/app/(dashboard)/financeiro/contas-a-pagar/export/route.ts`
- Modify: `src/app/(dashboard)/financeiro/contas-a-receber/export/route.ts`
- Modify: `docs/backlog.md`

**Interfaces:**
- Consumes: `listarTitulos(filialId, tipo, filtros)` (Task 1);
  `filtroTitulosDaUrl` (Task 2).

Sem testes automatizados (Route Handler — convenção já estabelecida no
projeto). Verificação é `npx tsc --noEmit` + `npm run build` + teste
manual.

- [ ] **Step 1: Aplicar o filtro em `contas-a-pagar/export/route.ts`**

Substituir o conteúdo inteiro de
`src/app/(dashboard)/financeiro/contas-a-pagar/export/route.ts` por:

```ts
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarTitulos } from "@/server/services/titulo";
import { filtroTitulosDaUrl } from "../../_titulos/filtro-titulos-url";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";

type LinhaExport = {
  documento: string;
  contraparte: string;
  categoria: string;
  numeroParcela: number;
  vencimento: Date;
  valorAtualizado: number;
  status: string;
};

const COLUNAS: ColunaExport<LinhaExport>[] = [
  { rotulo: "Documento", valor: (l) => l.documento },
  { rotulo: "Fornecedor", valor: (l) => l.contraparte },
  { rotulo: "Categoria", valor: (l) => l.categoria },
  { rotulo: "Nº parcela", valor: (l) => l.numeroParcela },
  { rotulo: "Vencimento", valor: (l) => l.vencimento },
  { rotulo: "Valor atualizado", valor: (l) => l.valorAtualizado },
  { rotulo: "Status", valor: (l) => l.status },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "titulo:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const filtros = filtroTitulosDaUrl((campo) => url.searchParams.get(campo) ?? undefined);

  const titulos = await listarTitulos(sessao.filialId, "PAGAR", filtros);
  const linhas: LinhaExport[] = titulos.flatMap((titulo) =>
    titulo.parcelas.map((parcela) => ({
      documento: titulo.documento,
      contraparte: titulo.fornecedor?.nome ?? titulo.cliente?.nome ?? "",
      categoria: titulo.categoriaFinanceira.nome,
      numeroParcela: parcela.numero,
      vencimento: parcela.dataVencimento,
      valorAtualizado: Number(parcela.valorAtualizado),
      status: parcela.status,
    })),
  );

  const formato = url.searchParams.get("formato");
  return responderExport(linhas, COLUNAS, { nomeArquivo: "contas-a-pagar", nomeAba: "Contas a pagar", formato });
}
```

- [ ] **Step 2: Aplicar o filtro em `contas-a-receber/export/route.ts`**

Substituir o conteúdo inteiro de
`src/app/(dashboard)/financeiro/contas-a-receber/export/route.ts` por:

```ts
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarTitulos } from "@/server/services/titulo";
import { filtroTitulosDaUrl } from "../../_titulos/filtro-titulos-url";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";

type LinhaExport = {
  documento: string;
  contraparte: string;
  categoria: string;
  numeroParcela: number;
  vencimento: Date;
  valorAtualizado: number;
  status: string;
};

const COLUNAS: ColunaExport<LinhaExport>[] = [
  { rotulo: "Documento", valor: (l) => l.documento },
  { rotulo: "Cliente", valor: (l) => l.contraparte },
  { rotulo: "Categoria", valor: (l) => l.categoria },
  { rotulo: "Nº parcela", valor: (l) => l.numeroParcela },
  { rotulo: "Vencimento", valor: (l) => l.vencimento },
  { rotulo: "Valor atualizado", valor: (l) => l.valorAtualizado },
  { rotulo: "Status", valor: (l) => l.status },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "titulo:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const filtros = filtroTitulosDaUrl((campo) => url.searchParams.get(campo) ?? undefined);

  const titulos = await listarTitulos(sessao.filialId, "RECEBER", filtros);
  const linhas: LinhaExport[] = titulos.flatMap((titulo) =>
    titulo.parcelas.map((parcela) => ({
      documento: titulo.documento,
      contraparte: titulo.cliente?.nome ?? titulo.fornecedor?.nome ?? "",
      categoria: titulo.categoriaFinanceira.nome,
      numeroParcela: parcela.numero,
      vencimento: parcela.dataVencimento,
      valorAtualizado: Number(parcela.valorAtualizado),
      status: parcela.status,
    })),
  );

  const formato = url.searchParams.get("formato");
  return responderExport(linhas, COLUNAS, { nomeArquivo: "contas-a-receber", nomeAba: "Contas a receber", formato });
}
```

- [ ] **Step 3: Typecheck, build e suíte completa**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: todos limpos/verdes.

- [ ] **Step 4: Registrar no backlog o que ficou fora do escopo**

Adicionar ao final de `docs/backlog.md` (depois da última seção
existente, `## Relatórios exportáveis (Fase 6, sub-projeto 6b)`):

```markdown
## Filtros globais (Fase 6, sub-projeto 6c)

- **Consolidação por empresa ("empresa sem filial selecionada = todas as
  filiais")** ficou fora do v1 — exige tornar `SessaoAtiva.filialId`
  opcional (mudança de sessão/autenticação, não de tela). Quando for
  retomado, os filtros de dimensão já combinam livremente com qualquer
  jeito de escopo de filial que vier a existir — não há acoplamento entre
  os dois.
- **Banco e conta bancária como filtro** ficaram fora do v1 — exigem 1
  hop extra (`contaBancaria.bancoId`), mesmo padrão dos demais filtros de
  título, só que indireto. Adicionar como filtros de título normais
  quando houver demanda.
- **Multi-select por dimensão** (ex.: filtrar por 2 categorias ao mesmo
  tempo) ficou fora do v1 — cada dimensão aceita hoje só um valor por
  vez. Se necessário no futuro, a mudança troca `categoriaId?: string`
  etc. por `categoriaIds?: string[]` em `FiltroTitulos` e o `where` do
  Prisma passa a usar `in: [...]` em vez de igualdade — mecânica direta,
  sem redesenho.
- **Extensão do mecanismo para as demais telas financeiras** (fluxo de
  caixa realizado/projetado, dashboard executivo, conciliação, fluxo por
  dimensão) — este sub-projeto só aplicou o mecanismo a Contas a
  pagar/receber. Estender é wiring repetitivo sobre o mesmo padrão
  (`FiltroTitulos`-equivalente + `BarraDeFiltros`-equivalente por tela),
  não redesenho.
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/financeiro/contas-a-pagar/export/route.ts src/app/\(dashboard\)/financeiro/contas-a-receber/export/route.ts docs/backlog.md
git commit -m "feat: export de contas a pagar/receber respeita os filtros da tela"
```
