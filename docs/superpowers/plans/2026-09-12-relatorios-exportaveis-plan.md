# Relatórios exportáveis (Fase 6, sub-projeto 6b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable CSV/Excel export mechanism and wire it into 3 report screens (contas a pagar, contas a receber, fluxo de caixa realizado) via Route Handlers.

**Architecture:** Two generic, framework-agnostic utilities (`gerarCsv`/`gerarExcel`) in `src/lib/export/`, each taking a `ColunaExport<T>[]` (label + value-accessor) and a data array — no report-specific serialization logic lives outside these two files. Each report gets a colocated `export/route.ts` (a plain `GET` handler, same shape as the existing `src/app/api/anexos/[anexoId]/route.ts`) that fetches data via the report's existing service function, maps it to flat rows, and returns a CSV or Excel file with `Content-Disposition: attachment`. A tiny shared `ExportarLinks` component renders the two download links (plain `<a>` tags — no JS, no client component needed for the download itself).

**Tech Stack:** Next.js 16 Route Handlers, `papaparse` (already in the project, CSV), `exceljs` (new dependency, Excel), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-12-relatorios-exportaveis-design.md`

## Global Constraints

- Só CSV e Excel nesta versão — PDF fica fora de escopo (spec, decisão 1).
- CSV usa `;` como separador (não `,`) e leva um BOM UTF-8 (`﻿`) no início — configuração regional pt-BR do Excel trata `,` como separador decimal.
- Excel escreve números/datas como células nativas, não texto formatado.
- Cada rota de export replica a checagem de permissão do relatório correspondente, usando o mesmo padrão já estabelecido em `src/app/api/anexos/[anexoId]/route.ts`: `podeExecutar(sessao.perfil, "<acao>")` retornando `403` explícito — não capturar `PermissionError` via try/catch.
- Toda resposta de arquivo leva os mesmos headers de `anexos/route.ts`: `Content-Disposition: attachment; filename="..."`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`.
- Nenhuma lógica de serialização CSV/Excel duplicada fora de `src/lib/export/csv.ts`/`excel.ts`.

## Referências de padrão (não editar, só ler)

- `src/app/api/anexos/[anexoId]/route.ts` — molde exato de Route Handler de download neste projeto (permissão via `podeExecutar` + `403`, headers de resposta).
- `src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx`, `.../contas-a-receber/page.tsx` — estrutura idêntica entre si (tipo PAGAR/RECEBER, fornecedor/cliente).
- `src/app/(dashboard)/financeiro/_titulos/titulo-table.tsx` — mostra a forma exata dos dados de `listarTitulos` (título com `parcelas[]`, `fornecedor`/`cliente` opcionais).
- `src/app/(dashboard)/financeiro/fluxo-de-caixa/page.tsx` — mesmos nomes de query param (`granularidade`, `data`) que a rota de export deste relatório precisa aceitar.
- `src/app/(dashboard)/financeiro/_fluxo-de-caixa/data-valida.ts`, `formatar-rotulo-periodo.ts` — reaproveitados tal como estão pela rota de export do fluxo de caixa.
- Este projeto não tem nenhum arquivo `.test.tsx` nem teste de Route Handler/`page.tsx` — ambos dependem de sessão real via NextAuth (`requireSessaoAtiva()` lê cookies internamente, sem parâmetro injetável), o que os torna arquitetonicamente equivalentes a páginas para fins de teste. Os 3 `route.ts` deste plano **não têm teste dedicado**, verificados só por `tsc`/`lint`/revisão de código — mesma convenção já aplicada a `anexos/route.ts` e a todo `page.tsx` do projeto. As duas únicas peças com lógica própria testável sem sessão/DB (`gerarCsv`/`gerarExcel`) têm teste completo.

---

### Task 1: Dependência `exceljs` e `src/lib/export/csv.ts`

**Files:**
- Modify: `package.json` (via `npm install exceljs`)
- Create: `src/lib/export/csv.ts`
- Test: `src/lib/export/csv.test.ts`

**Interfaces:**
- Produces: `type ColunaExport<T> = { rotulo: string; valor: (linha: T) => string | number | Date }`, `gerarCsv<T>(linhas: T[], colunas: ColunaExport<T>[]): string`. Consumido pela Task 2 (reexporta `ColunaExport`) e pelas Tasks 4-5 (rotas de export).

- [ ] **Step 1: Instalar a dependência**

Run: `npm install exceljs`
Expected: `exceljs` adicionado a `dependencies` em `package.json` e ao lockfile.

(A Task 1 instala a dependência de Excel mesmo só implementando o CSV agora, porque ambos os arquivos de `src/lib/export/` normalmente seriam instalados juntos — a Task 2 já parte do pressuposto de que `exceljs` está disponível.)

- [ ] **Step 2: Escrever os testes de `gerarCsv`**

Criar `src/lib/export/csv.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { gerarCsv, type ColunaExport } from "./csv";

type Linha = { nome: string; valor: number; data: Date };

const COLUNAS: ColunaExport<Linha>[] = [
  { rotulo: "Nome", valor: (l) => l.nome },
  { rotulo: "Valor", valor: (l) => l.valor },
  { rotulo: "Data", valor: (l) => l.data },
];

describe("gerarCsv", () => {
  test("usa ; como separador, não ,", () => {
    const csv = gerarCsv([{ nome: "Item A", valor: 100, data: new Date("2026-01-15T00:00:00Z") }], COLUNAS);
    const semBom = csv.replace("﻿", "");
    const primeiraLinha = semBom.split("\n")[0];
    expect(primeiraLinha).toBe("Nome;Valor;Data");
  });

  test("inclui BOM UTF-8 no início do arquivo", () => {
    const csv = gerarCsv([{ nome: "X", valor: 1, data: new Date("2026-01-01T00:00:00Z") }], COLUNAS);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  test("mantém o cabeçalho mesmo sem nenhuma linha de dado", () => {
    const csv = gerarCsv([], COLUNAS);
    const semBom = csv.replace("﻿", "");
    expect(semBom.trim()).toBe("Nome;Valor;Data");
  });

  test("formata Date como dd/mm/aaaa", () => {
    const csv = gerarCsv([{ nome: "Item A", valor: 100, data: new Date("2026-01-15T00:00:00Z") }], COLUNAS);
    expect(csv).toContain("15/01/2026");
  });

  test("uma linha por item, na ordem das colunas", () => {
    const csv = gerarCsv(
      [
        { nome: "A", valor: 1, data: new Date("2026-01-01T00:00:00Z") },
        { nome: "B", valor: 2, data: new Date("2026-01-02T00:00:00Z") },
      ],
      COLUNAS,
    );
    const linhas = csv.replace("﻿", "").trim().split("\n");
    expect(linhas).toHaveLength(3);
    expect(linhas[1]).toBe("A;1;01/01/2026");
    expect(linhas[2]).toBe("B;2;02/01/2026");
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/export/csv.test.ts`
Expected: FAIL — `./csv` não existe.

- [ ] **Step 4: Implementar `gerarCsv`**

Criar `src/lib/export/csv.ts`:

```ts
import Papa from "papaparse";

export type ColunaExport<T> = {
  rotulo: string;
  valor: (linha: T) => string | number | Date;
};

function formatarValorCsv(valor: string | number | Date): string | number {
  if (valor instanceof Date) {
    return valor.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  }
  return valor;
}

/**
 * `;` como separador (não `,`) e BOM UTF-8 no início — configuração
 * regional pt-BR do Excel trata `,` como separador decimal, não de
 * coluna, e sem o BOM os acentos corrompem ao abrir o arquivo no Excel.
 * Usa a forma `{ fields, data }` do papaparse (matriz), não array de
 * objetos, para o cabeçalho aparecer mesmo com `linhas` vazio — array de
 * objetos vazio não tem chaves pra papaparse inferir os nomes de coluna.
 */
export function gerarCsv<T>(linhas: T[], colunas: ColunaExport<T>[]): string {
  const fields = colunas.map((coluna) => coluna.rotulo);
  const data = linhas.map((linha) => colunas.map((coluna) => formatarValorCsv(coluna.valor(linha))));

  const csv = Papa.unparse({ fields, data }, { delimiter: ";", newline: "\n" });
  return "﻿" + csv;
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/export/csv.test.ts`
Expected: PASS — todos os 5 testes.

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/export/csv.ts src/lib/export/csv.test.ts
git commit -m "feat: adicionar exceljs e gerarCsv para relatorios exportaveis"
```

---

### Task 2: `src/lib/export/excel.ts`

**Files:**
- Create: `src/lib/export/excel.ts`
- Test: `src/lib/export/excel.test.ts`

**Interfaces:**
- Consumes: `type ColunaExport<T>` de `./csv` (Task 1).
- Produces: `gerarExcel<T>(linhas: T[], colunas: ColunaExport<T>[], nomeAba: string): Promise<ExcelJS.Buffer>`. Consumido pelas Tasks 4-5 (rotas de export).

- [ ] **Step 1: Escrever os testes de `gerarExcel`**

Criar `src/lib/export/excel.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import ExcelJS from "exceljs";
import { gerarExcel } from "./excel";
import type { ColunaExport } from "./csv";

type Linha = { nome: string; valor: number; data: Date };

const COLUNAS: ColunaExport<Linha>[] = [
  { rotulo: "Nome", valor: (l) => l.nome },
  { rotulo: "Valor", valor: (l) => l.valor },
  { rotulo: "Data", valor: (l) => l.data },
];

describe("gerarExcel", () => {
  test("gera uma planilha com o nome informado, cabeçalho e uma linha por item", async () => {
    const linhas: Linha[] = [{ nome: "Item A", valor: 100, data: new Date("2026-01-15T00:00:00Z") }];
    const buffer = await gerarExcel(linhas, COLUNAS, "Teste");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const planilha = workbook.getWorksheet("Teste");

    expect(planilha).toBeDefined();
    expect(planilha!.getRow(1).getCell(1).value).toBe("Nome");
    expect(planilha!.getRow(1).getCell(2).value).toBe("Valor");
    expect(planilha!.getRow(1).getCell(3).value).toBe("Data");
    expect(planilha!.getRow(2).getCell(1).value).toBe("Item A");
  });

  test("valor numérico é escrito como número, não texto", async () => {
    const buffer = await gerarExcel([{ nome: "Item A", valor: 100, data: new Date("2026-01-15T00:00:00Z") }], COLUNAS, "Teste");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const planilha = workbook.getWorksheet("Teste")!;
    expect(typeof planilha.getRow(2).getCell(2).value).toBe("number");
  });

  test("planilha vazia (só cabeçalho) quando não há linhas", async () => {
    const buffer = await gerarExcel([], COLUNAS, "Vazio");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const planilha = workbook.getWorksheet("Vazio")!;
    expect(planilha.rowCount).toBe(1);
  });

  test("várias linhas mantêm a ordem original", async () => {
    const linhas: Linha[] = [
      { nome: "A", valor: 1, data: new Date("2026-01-01T00:00:00Z") },
      { nome: "B", valor: 2, data: new Date("2026-01-02T00:00:00Z") },
    ];
    const buffer = await gerarExcel(linhas, COLUNAS, "Teste");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const planilha = workbook.getWorksheet("Teste")!;
    expect(planilha.getRow(2).getCell(1).value).toBe("A");
    expect(planilha.getRow(3).getCell(1).value).toBe("B");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/export/excel.test.ts`
Expected: FAIL — `./excel` não existe.

- [ ] **Step 3: Implementar `gerarExcel`**

Criar `src/lib/export/excel.ts`:

```ts
import ExcelJS from "exceljs";
import type { ColunaExport } from "./csv";

/**
 * Números e datas como células nativas do Excel (não texto formatado) —
 * permite ao usuário somar/filtrar/ordenar direto na planilha.
 */
export async function gerarExcel<T>(
  linhas: T[],
  colunas: ColunaExport<T>[],
  nomeAba: string,
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const planilha = workbook.addWorksheet(nomeAba);

  planilha.addRow(colunas.map((coluna) => coluna.rotulo));
  for (const linha of linhas) {
    planilha.addRow(colunas.map((coluna) => coluna.valor(linha)));
  }

  return workbook.xlsx.writeBuffer();
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/export/excel.test.ts`
Expected: PASS — todos os 4 testes.

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/excel.ts src/lib/export/excel.test.ts
git commit -m "feat: adicionar gerarExcel para relatorios exportaveis"
```

---

### Task 3: Componente compartilhado `ExportarLinks`

**Files:**
- Create: `src/app/(dashboard)/_shared/exportar-links.tsx`

**Interfaces:**
- Produces: `ExportarLinks({ baseHref, queryString? }: { baseHref: string; queryString?: string }): JSX.Element`. Consumido pelas Tasks 4-5.

- [ ] **Step 1: Verificar se a pasta `_shared` já existe**

Run (PowerShell): `Test-Path "src/app/(dashboard)/_shared"`
Se não existir, será criada pelo próprio `Write`/`New-Item` do Step 2 — nenhuma ação extra necessária.

- [ ] **Step 2: Implementar o componente**

Criar `src/app/(dashboard)/_shared/exportar-links.tsx`:

```tsx
function montarHref(baseHref: string, formato: "csv" | "xlsx", queryString?: string): string {
  const separador = queryString ? "&" : "";
  return `${baseHref}?formato=${formato}${separador}${queryString ?? ""}`;
}

export function ExportarLinks({ baseHref, queryString }: { baseHref: string; queryString?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <a href={montarHref(baseHref, "csv", queryString)} className="text-primary underline-offset-4 hover:underline">
        Exportar CSV
      </a>
      <a href={montarHref(baseHref, "xlsx", queryString)} className="text-primary underline-offset-4 hover:underline">
        Exportar Excel
      </a>
    </div>
  );
}
```

Este componente não tem teste dedicado — é puramente apresentacional (monta 2 hrefs e renderiza 2 links), e não existe nenhum arquivo `.test.tsx` neste projeto (todos os testes são de serviço, contra Postgres real). Verificado por `tsc`/`lint` e pelo uso real nas Tasks 4-5.

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/_shared/exportar-links.tsx"
git commit -m "feat: componente compartilhado ExportarLinks"
```

---

### Task 4: Rotas de export de Contas a pagar/receber

**Files:**
- Create: `src/app/(dashboard)/financeiro/contas-a-pagar/export/route.ts`
- Create: `src/app/(dashboard)/financeiro/contas-a-receber/export/route.ts`
- Modify: `src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx`
- Modify: `src/app/(dashboard)/financeiro/contas-a-receber/page.tsx`

**Interfaces:**
- Consumes: `gerarCsv`, `type ColunaExport` de `@/lib/export/csv` (Task 1); `gerarExcel` de `@/lib/export/excel` (Task 2); `ExportarLinks` de `../../_shared/exportar-links` (Task 3); `listarTitulos` de `@/server/services/titulo` (já existe); `podeExecutar` de `@/server/auth/permissions` (já existe); `requireSessaoAtiva` de `@/server/auth/sessao` (já existe).
- Produces: rotas navegáveis `/financeiro/contas-a-pagar/export`, `/financeiro/contas-a-receber/export` (terminais — nenhuma outra task consome estas).

- [ ] **Step 1: Implementar a rota de export de Contas a pagar**

Criar `src/app/(dashboard)/financeiro/contas-a-pagar/export/route.ts`:

```ts
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarTitulos } from "@/server/services/titulo";
import { gerarCsv, type ColunaExport } from "@/lib/export/csv";
import { gerarExcel } from "@/lib/export/excel";

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

  const titulos = await listarTitulos(sessao.filialId, "PAGAR");
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

  const formato = new URL(request.url).searchParams.get("formato");
  const dataDeHoje = new Date().toISOString().slice(0, 10);

  if (formato === "xlsx") {
    const buffer = await gerarExcel(linhas, COLUNAS, "Contas a pagar");
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="contas-a-pagar-${dataDeHoje}.xlsx"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const csv = gerarCsv(linhas, COLUNAS);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contas-a-pagar-${dataDeHoje}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
```

- [ ] **Step 2: Implementar a rota de export de Contas a receber**

Criar `src/app/(dashboard)/financeiro/contas-a-receber/export/route.ts`:

```ts
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarTitulos } from "@/server/services/titulo";
import { gerarCsv, type ColunaExport } from "@/lib/export/csv";
import { gerarExcel } from "@/lib/export/excel";

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

  const titulos = await listarTitulos(sessao.filialId, "RECEBER");
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

  const formato = new URL(request.url).searchParams.get("formato");
  const dataDeHoje = new Date().toISOString().slice(0, 10);

  if (formato === "xlsx") {
    const buffer = await gerarExcel(linhas, COLUNAS, "Contas a receber");
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="contas-a-receber-${dataDeHoje}.xlsx"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const csv = gerarCsv(linhas, COLUNAS);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contas-a-receber-${dataDeHoje}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Adicionar `ExportarLinks` às duas páginas**

Em `src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx`, adicionar o import:

```tsx
import { ExportarLinks } from "../../_shared/exportar-links";
```

O `<div className="flex items-center justify-between">` atual envolve direto o bloco do título e `{podeEscrever && (<TituloDialogForm ... />)}` como os 2 únicos filhos — inserir `ExportarLinks` como um 3º filho direto quebraria o `justify-between` (que distribui espaço igualmente entre todos os filhos, não só entre o primeiro e o último). Envolver o título e o `TituloDialogForm` existente num `<div className="flex items-center gap-4">` junto com `ExportarLinks`, agrupando as 2 ações à direita. Trocar:

```tsx
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Contas a pagar</h1>
          <p className="text-sm text-muted-foreground">Títulos e parcelas a pagar da filial ativa.</p>
        </div>
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
```

por:

```tsx
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Contas a pagar</h1>
          <p className="text-sm text-muted-foreground">Títulos e parcelas a pagar da filial ativa.</p>
        </div>
        <div className="flex items-center gap-4">
          <ExportarLinks baseHref="/financeiro/contas-a-pagar/export" />
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
```

Em `src/app/(dashboard)/financeiro/contas-a-receber/page.tsx`, mesmo import (`ExportarLinks`) e o mesmo problema de `justify-between` com 3 filhos. Trocar:

```tsx
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Contas a receber</h1>
          <p className="text-sm text-muted-foreground">Títulos e parcelas a receber da filial ativa.</p>
        </div>
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
```

por:

```tsx
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Contas a receber</h1>
          <p className="text-sm text-muted-foreground">Títulos e parcelas a receber da filial ativa.</p>
        </div>
        <div className="flex items-center gap-4">
          <ExportarLinks baseHref="/financeiro/contas-a-receber/export" />
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
```

- [ ] **Step 5: Verificar tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros novos (erros pré-existentes e não relacionados a este diff, se houver, não bloqueiam).

- [ ] **Step 6: Rodar a suíte completa de testes**

Run: `npm test`
Expected: PASS — todos os testes do projeto, incluindo os novos das Tasks 1-2 (nenhum teste novo nesta task).

- [ ] **Step 7: Verificação manual**

Sem acesso a browser neste ambiente de execução automatizada — pular este passo e reportar explicitamente que não foi feito, em vez de simular. O controlador verifica manualmente depois: `npm run dev`, abrir `/financeiro/contas-a-pagar`, clicar em "Exportar CSV" e "Exportar Excel", confirmar que os arquivos baixam e abrem corretamente (CSV com colunas separadas no Excel pt-BR, acentos corretos; planilha Excel com números como número). Repetir em `/financeiro/contas-a-receber`.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/financeiro/contas-a-pagar/export" "src/app/(dashboard)/financeiro/contas-a-receber/export" "src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx" "src/app/(dashboard)/financeiro/contas-a-receber/page.tsx"
git commit -m "feat: export CSV/Excel de contas a pagar e contas a receber"
```

---

### Task 5: Rota de export de Fluxo de caixa realizado e backlog

**Files:**
- Create: `src/app/(dashboard)/financeiro/fluxo-de-caixa/export/route.ts`
- Modify: `src/app/(dashboard)/financeiro/fluxo-de-caixa/page.tsx`
- Modify: `docs/backlog.md`

**Interfaces:**
- Consumes: `gerarCsv`, `type ColunaExport` de `@/lib/export/csv` (Task 1); `gerarExcel` de `@/lib/export/excel` (Task 2); `ExportarLinks` de `../../_shared/exportar-links` (Task 3); `listarFluxoDeCaixaRealizado`, `type Granularidade` de `@/server/services/fluxoDeCaixa` (já existe); `formatarRotuloPeriodo` de `../_fluxo-de-caixa/formatar-rotulo-periodo` (já existe); `dataValida` de `../_fluxo-de-caixa/data-valida` (já existe); `podeExecutar` de `@/server/auth/permissions` (já existe).
- Produces: rota navegável `/financeiro/fluxo-de-caixa/export` (terminal — nenhuma outra task consome esta).

- [ ] **Step 1: Implementar a rota de export**

Criar `src/app/(dashboard)/financeiro/fluxo-de-caixa/export/route.ts`:

```ts
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarFluxoDeCaixaRealizado, type Granularidade } from "@/server/services/fluxoDeCaixa";
import { formatarRotuloPeriodo } from "../../_fluxo-de-caixa/formatar-rotulo-periodo";
import { dataValida } from "../../_fluxo-de-caixa/data-valida";
import { gerarCsv, type ColunaExport } from "@/lib/export/csv";
import { gerarExcel } from "@/lib/export/excel";

const GRANULARIDADES_VALIDAS: Granularidade[] = ["DIA", "SEMANA", "MES", "ANO"];

function granularidadeValida(valor: string | null): Granularidade {
  return GRANULARIDADES_VALIDAS.includes(valor as Granularidade) ? (valor as Granularidade) : "MES";
}

type LinhaExport = {
  periodo: string;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  geracaoLiquida: number;
  saldoFinal: number;
};

const COLUNAS: ColunaExport<LinhaExport>[] = [
  { rotulo: "Período", valor: (l) => l.periodo },
  { rotulo: "Saldo inicial", valor: (l) => l.saldoInicial },
  { rotulo: "Entradas", valor: (l) => l.entradas },
  { rotulo: "Saídas", valor: (l) => l.saidas },
  { rotulo: "Geração líquida", valor: (l) => l.geracaoLiquida },
  { rotulo: "Saldo final", valor: (l) => l.saldoFinal },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "lancamento:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const granularidade = granularidadeValida(url.searchParams.get("granularidade"));
  const dataReferencia = dataValida(url.searchParams.get("data") ?? undefined);

  const periodos = await listarFluxoDeCaixaRealizado(sessao, granularidade, dataReferencia);
  const linhas: LinhaExport[] = periodos.map((periodo) => ({
    periodo: formatarRotuloPeriodo(granularidade, periodo.inicio, periodo.fim),
    saldoInicial: periodo.saldoInicial,
    entradas: periodo.entradas,
    saidas: periodo.saidas,
    geracaoLiquida: periodo.geracaoLiquida,
    saldoFinal: periodo.saldoFinal,
  }));

  const formato = url.searchParams.get("formato");
  const dataDeHoje = new Date().toISOString().slice(0, 10);

  if (formato === "xlsx") {
    const buffer = await gerarExcel(linhas, COLUNAS, "Fluxo de caixa");
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="fluxo-de-caixa-${dataDeHoje}.xlsx"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const csv = gerarCsv(linhas, COLUNAS);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fluxo-de-caixa-${dataDeHoje}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Adicionar `ExportarLinks` à página, propagando o período atual**

Em `src/app/(dashboard)/financeiro/fluxo-de-caixa/page.tsx`, importar:

```tsx
import { ExportarLinks } from "../../_shared/exportar-links";
```

E, depois de calcular `granularidade`/`dataReferencia` (já existem no `page.tsx`), adicionar no JSX — logo abaixo do `<SeletorPeriodo ... />` já existente:

```tsx
<ExportarLinks
  baseHref="/financeiro/fluxo-de-caixa/export"
  queryString={`granularidade=${granularidade}&data=${dataReferencia.toISOString().slice(0, 10)}`}
/>
```

Isso garante que o arquivo exportado reflita exatamente o período que está sendo mostrado na tela no momento do clique.

- [ ] **Step 4: Registrar o trabalho restante no backlog**

Adicionar ao final de `docs/backlog.md`, em uma nova seção:

```markdown
## Relatórios exportáveis (Fase 6, sub-projeto 6b)

- **Export em PDF.** Cortado da v1 — é o formato mais caro (layout de
  página, cabeçalho/rodapé, paginação) e os 2 formatos escolhidos (CSV,
  Excel) já cobrem os casos de uso reais levantados. O mecanismo genérico
  (`ColunaExport<T>`) já existe em `src/lib/export/`; adicionar PDF é
  criar um terceiro `gerarPdf` ao lado de `gerarCsv`/`gerarExcel`, sem
  tocar nas rotas já existentes além de adicionar o novo `formato=pdf`.

- **Wiring dos ~8 relatórios restantes.** O mecanismo genérico está
  validado com 2 relatórios (contas a pagar/receber, fluxo de caixa
  realizado). Os demais da lista original da Fase 6 — fluxo de caixa
  projetado, conciliação bancária, orçado x realizado, caixa por centro
  de custo/lucro/safra, obrigações e recebimentos futuros, movimentação
  bancária, auditoria de alterações — ficam para wiring futuro repetitivo
  sobre o mesmo `gerarCsv`/`gerarExcel`/`ExportarLinks`. "Necessidade de
  capital de giro" fica de fora até existir modelo de dados para o
  conceito (mesma decisão já registrada para o Dashboard executivo).
```

- [ ] **Step 5: Verificar tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros novos.

- [ ] **Step 6: Rodar a suíte completa de testes**

Run: `npm test`
Expected: PASS — todos os testes do projeto (Tasks 1-2 já cobertas, sem teste novo nesta task).

- [ ] **Step 7: Verificação manual**

Sem acesso a browser neste ambiente — pular e reportar explicitamente. O controlador verifica depois: abrir `/financeiro/fluxo-de-caixa` em diferentes granularidades/datas, clicar em "Exportar CSV"/"Exportar Excel", confirmar que o arquivo reflete o período exibido na tela.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/financeiro/fluxo-de-caixa/export" "src/app/(dashboard)/financeiro/fluxo-de-caixa/page.tsx" docs/backlog.md
git commit -m "feat: export CSV/Excel de fluxo de caixa realizado"
```
