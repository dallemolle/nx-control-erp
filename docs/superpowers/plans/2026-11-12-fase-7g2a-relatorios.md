# Fase 7g2a — Relatório mensal e relatório de vendas — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar as telas `/producao/relatorios/mensal` e `/producao/relatorios/vendas`, com gráficos e exportação em PDF, CSV e Excel.

**Architecture:** As funções puras ficam em `src/lib/producao/relatorios.ts` e reaproveitam `agregarRecepcoes`, `agregarOPs` e `agregarVendas` do painel: o mensal separa as linhas em 12 baldes por mês UTC e agrega cada balde. Os serviços em `src/server/services/relatorioProducao/` fazem uma consulta por fonte e compartilham com o painel as consultas de itens vendidos e de saldos a receber (`consultas.ts`). As telas são componentes de servidor, os gráficos são componentes cliente com recharts e a exportação usa `responderExport` e `gerarPdfSecoes`.

**Tech Stack:** Next.js (App Router, `searchParams` como Promise), Prisma/Postgres, Vitest, recharts, `@/lib/export`.

**Spec:** `docs/superpowers/specs/2026-11-12-fase-7g2a-relatorios-design.md`

## Global Constraints

- Sem migration e sem mudança no schema.
- Tudo na filial da sessão; os serviços chamam `requirePermission(sessao.perfil, "producao:ler")` antes de consultar.
- D-29: cancelados fora; OP aberta conta no volume; custo da polpa só com OPs encerradas; a receber = posição de hoje, de qualquer data.
- Mês = mês UTC da data do evento (`getUTCMonth`).
- Nada fixo em açaí ou acerola: as colunas por fruta saem das frutas com movimento.
- Nenhuma consulta por mês, por produto ou por cliente; as consultas independentes rodam em `Promise.all`.
- Divisão com denominador zero → `null` → a tela mostra "—".
- Antes de escrever código de página ou rota, siga o padrão de `src/app/(dashboard)/producao/painel/` (AGENTS.md: esta versão do Next.js tem mudanças; na dúvida, consulte `node_modules/next/dist/docs/`).
- Rodar testes pelo PowerShell: `Set-Location D:\Projetos\nx-control-erp; npx vitest run <caminho>` (pelo Bash todos falham).
- Arquivos do repo usam CRLF: edite com a ferramenta Edit, não com scripts.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/app/(dashboard)/producao/_shared/atalhos.ts` (+ `.test.ts`) | mover de `painel/` | Atalhos de período compartilhados |
| `src/lib/producao/periodo.ts` (+ teste) | modificar | `anoDaUrl` |
| `src/lib/producao/relatorios.ts` (+ `.test.ts`) | criar | Funções puras do mensal e de vendas, blocos de indicadores, rótulos |
| `src/server/services/relatorioProducao/consultas.ts` | criar | Itens vendidos, saldos a receber, `opDoPainel` |
| `src/server/services/relatorioProducao/painel.ts` | modificar | Passa a usar `consultas.ts` |
| `src/server/services/relatorioProducao/mensal.ts` (+ `.test.ts`) | criar | `buscarRelatorioMensal` |
| `src/server/services/relatorioProducao/vendas.ts` (+ `.test.ts`) | criar | `buscarRelatorioVendas` |
| `src/server/services/relatorioProducao/relatorios.permissao.test.ts` | criar | Recusa sem `producao:ler` |
| `src/server/export/relatorioMensal.ts` (+ `.test.ts`) | criar | Linhas CSV e seções PDF do mensal |
| `src/server/export/relatorioVendas.ts` (+ `.test.ts`) | criar | Linhas CSV e seções PDF de vendas |
| `src/app/(dashboard)/producao/relatorios/_shared/tabela.tsx` | criar | Tabela de relatório e formatação de célula |
| `src/app/(dashboard)/producao/relatorios/mensal/{page.tsx,graficos.tsx,export/route.ts}` | criar | Tela, gráficos e exportação do mensal |
| `src/app/(dashboard)/producao/relatorios/vendas/{page.tsx,graficos.tsx,export/route.ts}` | criar | Tela, gráficos e exportação de vendas |
| `src/app/(dashboard)/nav-items.ts` | modificar | Dois itens de menu |
| `content/ajuda/passo-a-passo.md`, docs 08/09, `docs/fases/fase-7-…` | modificar | Ajuda e decisões |

---

### Task 1: Atalhos compartilhados e `anoDaUrl`

**Files:**
- Move: `src/app/(dashboard)/producao/painel/atalhos.ts` → `src/app/(dashboard)/producao/_shared/atalhos.ts`
- Move: `src/app/(dashboard)/producao/painel/atalhos.test.ts` → `src/app/(dashboard)/producao/_shared/atalhos.test.ts`
- Modify: `src/app/(dashboard)/producao/painel/page.tsx:10`
- Modify: `src/lib/producao/periodo.ts`
- Test: `src/lib/producao/periodo.test.ts` (criar se não existir; se existir, acrescentar o `describe`)

**Interfaces:**
- Produces: `atalhosDePeriodo(hoje: Date)` em `producao/_shared/atalhos.ts`; `anoDaUrl(valor: string | undefined, hoje: Date): number` em `@/lib/producao/periodo`.

- [ ] **Step 1: Mover os atalhos**

```powershell
Set-Location D:\Projetos\nx-control-erp
git mv "src/app/(dashboard)/producao/painel/atalhos.ts" "src/app/(dashboard)/producao/_shared/atalhos.ts"
git mv "src/app/(dashboard)/producao/painel/atalhos.test.ts" "src/app/(dashboard)/producao/_shared/atalhos.test.ts"
```

Em `src/app/(dashboard)/producao/painel/page.tsx`, troque
`import { atalhosDePeriodo } from "./atalhos";` por
`import { atalhosDePeriodo } from "../_shared/atalhos";`.
Na doc do `atalhos.ts`, troque "Atalhos do filtro do painel" por "Atalhos de período (painel e relatórios)".

- [ ] **Step 2: Escrever o teste de `anoDaUrl` (falhando)**

Em `src/lib/producao/periodo.test.ts`, acrescente (ou crie o arquivo com os imports):

```ts
import { describe, expect, test } from "vitest";
import { anoDaUrl } from "./periodo";

describe("anoDaUrl", () => {
  const hoje = new Date("2026-11-12T00:00:00.000Z");
  test("ano válido da URL", () => {
    expect(anoDaUrl("2025", hoje)).toBe(2025);
  });
  test("vazio, texto ou fora da faixa cai no ano de hoje", () => {
    expect(anoDaUrl(undefined, hoje)).toBe(2026);
    expect(anoDaUrl("abc", hoje)).toBe(2026);
    expect(anoDaUrl("1999", hoje)).toBe(2026);
    expect(anoDaUrl("2101", hoje)).toBe(2026);
    expect(anoDaUrl("2025.5", hoje)).toBe(2026);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/lib/producao/periodo.test.ts "src/app/(dashboard)/producao/_shared/atalhos.test.ts"`
Expected: FAIL em `anoDaUrl` ("is not a function"); o teste de atalhos passa.

- [ ] **Step 4: Implementar**

No fim de `src/lib/producao/periodo.ts`:

```ts
/** `AAAA` da URL (2000–2100) → ano; qualquer outra coisa → ano de `hoje`. */
export function anoDaUrl(valor: string | undefined, hoje: Date): number {
  const ano = valor && /^\d{4}$/.test(valor) ? Number(valor) : NaN;
  return ano >= 2000 && ano <= 2100 ? ano : hoje.getUTCFullYear();
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: o mesmo comando do Step 3. Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -A "src/app/(dashboard)/producao" src/lib/producao/periodo.ts src/lib/producao/periodo.test.ts
git commit -m @'
refactor(producao): atalhos de período compartilhados e ano da URL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 2: Funções puras do relatório mensal

**Files:**
- Create: `src/lib/producao/relatorios.ts`
- Test: `src/lib/producao/relatorios.test.ts`

**Interfaces:**
- Consumes: `agregarRecepcoes`, `agregarOPs`, `agregarVendas`, `GrupoRecepcao`, `OPDoPainel`, `ItemDoPainel`, `TotaisRecepcao`, `TotaisOPs`, `TotaisVendas` de `./painel`; `arredondar`.
- Produces:
  - `MESES: readonly ["Jan", …, "Dez"]`
  - `mesUTC(data: Date): number`
  - `agruparPorMes<T>(linhas: T[], data: (l: T) => Date): T[][]`
  - `RecepcaoDatada = GrupoRecepcao & { data: Date; valorTotal: number }`
  - `OPDatada = OPDoPainel & { data: Date }`
  - `ItemDatado = ItemDoPainel & { data: Date }`
  - `ColunaMensal` (abaixo)
  - `montarColunasMensais(recepcoes, ops, itens): ColunaMensal[]` (13 itens; o índice 12 é o total, com `mes: null`)
  - `polpaPorProdutoMes(linhas: { produtoId: string; data: Date; kg: number }[]): Map<string, { meses: number[]; total: number }>`
  - `frutasComMovimento(total: ColunaMensal, frutas: { id: string; nome: string }[])`
  - `Unidade`, `IndicadorMensal`, `BlocoMensal`, `blocosMensais(frutas)`

- [ ] **Step 1: Escrever os testes (falhando)**

`src/lib/producao/relatorios.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  agruparPorMes,
  blocosMensais,
  frutasComMovimento,
  montarColunasMensais,
  mesUTC,
  polpaPorProdutoMes,
  type ItemDatado,
  type OPDatada,
  type RecepcaoDatada,
} from "./relatorios";

const d = (iso: string) => new Date(iso);

describe("mês UTC", () => {
  test("dia 31 às 23h UTC continua no mês; virada de ano", () => {
    expect(mesUTC(d("2026-01-31T23:00:00.000Z"))).toBe(0);
    expect(mesUTC(d("2026-12-31T00:00:00.000Z"))).toBe(11);
    expect(mesUTC(d("2027-01-01T00:00:00.000Z"))).toBe(0);
  });

  test("agruparPorMes devolve 12 baldes", () => {
    const baldes = agruparPorMes([d("2026-03-05T00:00:00Z"), d("2026-03-20T00:00:00Z"), d("2026-12-01T00:00:00Z")], (x) => x);
    expect(baldes).toHaveLength(12);
    expect(baldes[2]).toHaveLength(2);
    expect(baldes[11]).toHaveLength(1);
    expect(baldes[0]).toEqual([]);
  });
});

describe("colunas do relatório mensal", () => {
  const recepcoes: RecepcaoDatada[] = [
    { frutaId: "a", origem: "PROPRIA", brutoKg: 100, descarteKg: 10, valorTotal: 0, data: d("2026-10-05T00:00:00Z") },
    { frutaId: "b", origem: "TERCEIRO", brutoKg: 40, descarteKg: 4, valorTotal: 108, data: d("2026-10-05T00:00:00Z") },
    { frutaId: "a", origem: "TERCEIRO", brutoKg: 50, descarteKg: 0, valorTotal: 100, data: d("2026-11-10T00:00:00Z") },
  ];
  const ops: OPDatada[] = [
    { frutaId: "a", status: "ENCERRADA", frutoKg: 50, polpaKg: 20, custoTotal: 80, balancoVerificar: false, branqueamentoVerificar: false, data: d("2026-10-05T00:00:00Z") },
    { frutaId: "a", status: "ABERTA", frutoKg: 40, polpaKg: 15, custoTotal: 999, balancoVerificar: false, branqueamentoVerificar: false, data: d("2026-11-10T00:00:00Z") },
    { frutaId: "a", status: "CANCELADA", frutoKg: 5, polpaKg: 2, custoTotal: 1, balancoVerificar: false, branqueamentoVerificar: false, data: d("2026-11-10T00:00:00Z") },
  ];
  const itens: ItemDatado[] = [
    { pedidoId: "p1", produtoId: "fa", categoria: "FRUTO", frutaId: "a", quantidadeKg: 5, precoKg: 8, custoKg: 1, data: d("2026-10-05T00:00:00Z") },
    { pedidoId: "p2", produtoId: "agc", categoria: "POLPA", frutaId: "a", quantidadeKg: 10, precoKg: 30, custoKg: 4, data: d("2026-11-12T00:00:00Z") },
  ];
  const colunas = montarColunasMensais(recepcoes, ops, itens);

  test("12 meses e o total", () => {
    expect(colunas).toHaveLength(13);
    expect(colunas.map((c) => c.mes)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, null]);
  });

  test("cada mês pelas funções do painel", () => {
    expect(colunas[9].recepcao.recebidoKg).toBe(126);
    expect(colunas[9].recepcaoPorFruta.b.terceirosKg).toBe(36);
    expect(colunas[9].pagoTerceiros).toBe(108);
    expect(colunas[9].processamento).toMatchObject({ quantidade: 1, frutoKg: 50, polpaKg: 20, custoMedioPolpa: 4 });
    expect(colunas[10].processamento).toMatchObject({ quantidade: 1, frutoKg: 40, polpaKg: 15, custoMedioPolpa: null });
    expect(colunas[9].vendas.faturamentoInNatura).toBe(40);
    expect(colunas[10].polpaPorFruta.a).toBe(300);
    expect(colunas[0].vendas.faturamento).toBe(0);
    expect(colunas[0].processamento.rendimento).toBeNull();
  });

  test("total do ano", () => {
    expect(colunas[12]).toMatchObject({ mes: null, pagoTerceiros: 208 });
    expect(colunas[12].recepcao.recebidoKg).toBe(176);
    expect(colunas[12].processamento).toMatchObject({ quantidade: 2, frutoKg: 90, polpaKg: 35 });
    expect(colunas[12].vendas.faturamento).toBe(340);
  });

  test("frutas com movimento, na ordem recebida", () => {
    const frutas = [
      { id: "a", nome: "Açaí" },
      { id: "b", nome: "Cupuaçu" },
      { id: "c", nome: "Graviola" },
    ];
    expect(frutasComMovimento(colunas[12], frutas)).toEqual(frutas.slice(0, 2));
  });

  test("blocos: próprio = recebido − terceiros; fruta sem movimento no mês = 0 ou —", () => {
    const blocos = blocosMensais([{ id: "a", nome: "Açaí" }]);
    expect(blocos.map((b) => b.titulo)).toEqual(["Recepção", "Processamento", "Vendas", "Custos"]);
    const ind = (titulo: string, rotulo: string) =>
      blocos.find((b) => b.titulo === titulo)!.indicadores.find((i) => i.rotulo === rotulo)!;
    expect(ind("Recepção", "Próprio").valor(colunas[9])).toBe(90);
    expect(ind("Recepção", "Terceiros").valor(colunas[10])).toBe(50);
    expect(ind("Processamento", "Rendimento").valor(colunas[0])).toBeNull();
    expect(ind("Custos", "Custo da polpa").valor(colunas[9])).toBe(4);
    expect(ind("Custos", "Fruto pago a terceiros").valor(colunas[12])).toBe(208);
  });
});

describe("polpa por produto × mês", () => {
  test("soma por mês e total", () => {
    const m = polpaPorProdutoMes([
      { produtoId: "agc", data: d("2026-10-05T00:00:00Z"), kg: 20 },
      { produtoId: "agc", data: d("2026-10-20T00:00:00Z"), kg: 0.5 },
      { produtoId: "afn", data: d("2026-11-10T00:00:00Z"), kg: 15 },
    ]);
    expect(m.get("agc")!.meses[9]).toBe(20.5);
    expect(m.get("agc")!.total).toBe(20.5);
    expect(m.get("afn")!.meses[10]).toBe(15);
    expect(m.get("afn")!.meses[9]).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/lib/producao/relatorios.test.ts`
Expected: FAIL (módulo `./relatorios` não existe).

- [ ] **Step 3: Implementar**

`src/lib/producao/relatorios.ts`:

```ts
import { arredondar } from "./arredondar";
import {
  agregarOPs,
  agregarRecepcoes,
  agregarVendas,
  type GrupoRecepcao,
  type ItemDoPainel,
  type OPDoPainel,
  type TotaisOPs,
  type TotaisRecepcao,
  type TotaisVendas,
} from "./painel";

export const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;

/** Mês (0–11) da data do evento; as datas do sistema são de calendário em UTC. */
export function mesUTC(data: Date): number {
  return data.getUTCMonth();
}

export function agruparPorMes<T>(linhas: T[], data: (linha: T) => Date): T[][] {
  const meses: T[][] = Array.from({ length: 12 }, () => []);
  for (const linha of linhas) meses[mesUTC(data(linha))].push(linha);
  return meses;
}

// Relatório mensal ---------------------------------------------------------

export type RecepcaoDatada = GrupoRecepcao & { data: Date; valorTotal: number };
export type OPDatada = OPDoPainel & { data: Date };
export type ItemDatado = ItemDoPainel & { data: Date };

export type ColunaMensal = {
  /** 0–11; `null` = total do ano. */
  mes: number | null;
  recepcao: TotaisRecepcao;
  recepcaoPorFruta: Record<string, TotaisRecepcao>;
  /** Σ valor das recepções de terceiro (fruto pago). */
  pagoTerceiros: number;
  processamento: TotaisOPs;
  processamentoPorFruta: Record<string, TotaisOPs>;
  vendas: TotaisVendas;
  /** Faturamento de polpa por fruta. */
  polpaPorFruta: Record<string, number>;
};

function coluna(mes: number | null, recepcoes: RecepcaoDatada[], ops: OPDatada[], itens: ItemDatado[]): ColunaMensal {
  const rec = agregarRecepcoes(recepcoes);
  const proc = agregarOPs(ops);
  const vendas = agregarVendas(itens);
  return {
    mes,
    recepcao: rec.total,
    recepcaoPorFruta: Object.fromEntries(rec.porFruta),
    pagoTerceiros: arredondar(
      recepcoes.filter((r) => r.origem === "TERCEIRO").reduce((s, r) => s + r.valorTotal, 0),
      2,
    ),
    processamento: proc.total,
    processamentoPorFruta: Object.fromEntries(proc.porFruta),
    vendas: vendas.total,
    polpaPorFruta: Object.fromEntries(vendas.polpaPorFruta),
  };
}

/** Doze meses e o total do ano, cada um pelas mesmas funções do painel (D-29). */
export function montarColunasMensais(recepcoes: RecepcaoDatada[], ops: OPDatada[], itens: ItemDatado[]): ColunaMensal[] {
  const r = agruparPorMes(recepcoes, (x) => x.data);
  const o = agruparPorMes(ops, (x) => x.data);
  const i = agruparPorMes(itens, (x) => x.data);
  return [...MESES.map((_, m) => coluna(m, r[m], o[m], i[m])), coluna(null, recepcoes, ops, itens)];
}

/** kg de polpa produzida por produto: 12 meses e o total. */
export function polpaPorProdutoMes(linhas: { produtoId: string; data: Date; kg: number }[]) {
  const porProduto = new Map<string, { meses: number[]; total: number }>();
  for (const l of linhas) {
    const atual = porProduto.get(l.produtoId) ?? { meses: Array<number>(12).fill(0), total: 0 };
    const m = mesUTC(l.data);
    atual.meses[m] = arredondar(atual.meses[m] + l.kg, 3);
    atual.total = arredondar(atual.total + l.kg, 3);
    porProduto.set(l.produtoId, atual);
  }
  return porProduto;
}

/** Frutas com recepção, OP ou venda de polpa no ano, na ordem recebida (por nome). */
export function frutasComMovimento<F extends { id: string }>(total: ColunaMensal, frutas: F[]): F[] {
  return frutas.filter(
    (f) => f.id in total.recepcaoPorFruta || f.id in total.processamentoPorFruta || f.id in total.polpaPorFruta,
  );
}

export type Unidade = "kg" | "%" | "R$" | "R$/kg" | "nº";

export type IndicadorMensal = {
  rotulo: string;
  /** Nome da fruta; vazio = total. */
  fruta: string;
  unidade: Unidade;
  valor: (coluna: ColunaMensal) => number | null;
};

export type BlocoMensal = { titulo: string; indicadores: IndicadorMensal[] };

/** Colunas das quatro tabelas do mensal (tela, PDF e CSV usam a mesma definição). */
export function blocosMensais(frutas: { id: string; nome: string }[]): BlocoMensal[] {
  const porFruta = (rotulo: string, unidade: Unidade, valor: (c: ColunaMensal, frutaId: string) => number | null) =>
    frutas.map((f): IndicadorMensal => ({ rotulo, fruta: f.nome, unidade, valor: (c) => valor(c, f.id) }));
  const total = (rotulo: string, unidade: Unidade, valor: (c: ColunaMensal) => number | null): IndicadorMensal => ({
    rotulo,
    fruta: "",
    unidade,
    valor,
  });

  return [
    {
      titulo: "Recepção",
      indicadores: [
        ...porFruta("Próprio", "kg", (c, id) => {
          const r = c.recepcaoPorFruta[id];
          return r ? arredondar(r.recebidoKg - r.terceirosKg, 3) : 0;
        }),
        ...porFruta("Terceiros", "kg", (c, id) => c.recepcaoPorFruta[id]?.terceirosKg ?? 0),
        total("Total recebido", "kg", (c) => c.recepcao.recebidoKg),
      ],
    },
    {
      titulo: "Processamento",
      indicadores: [
        ...porFruta("Fruto processado", "kg", (c, id) => c.processamentoPorFruta[id]?.frutoKg ?? 0),
        ...porFruta("Polpa produzida", "kg", (c, id) => c.processamentoPorFruta[id]?.polpaKg ?? 0),
        ...porFruta("Rendimento", "%", (c, id) => c.processamentoPorFruta[id]?.rendimento ?? null),
        total("Nº de OPs", "nº", (c) => c.processamento.quantidade),
      ],
    },
    {
      titulo: "Vendas",
      indicadores: [
        total("Fruto in natura", "R$", (c) => c.vendas.faturamentoInNatura),
        ...porFruta("Polpa", "R$", (c, id) => c.polpaPorFruta[id] ?? 0),
        total("Faturamento total", "R$", (c) => c.vendas.faturamento),
        total("Kg vendidos", "kg", (c) => c.vendas.kgVendidos),
        total("Margem bruta", "R$", (c) => c.vendas.margem),
        total("Margem bruta (%)", "%", (c) => c.vendas.margemPercentual),
      ],
    },
    {
      titulo: "Custos",
      indicadores: [
        ...porFruta("Custo da polpa", "R$/kg", (c, id) => c.processamentoPorFruta[id]?.custoMedioPolpa ?? null),
        total("Fruto pago a terceiros", "R$", (c) => c.pagoTerceiros),
      ],
    },
  ];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/lib/producao/relatorios.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/producao/relatorios.ts src/lib/producao/relatorios.test.ts
git commit -m @'
feat(producao): cálculo do relatório mensal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 3: Funções puras do relatório de vendas

**Files:**
- Modify: `src/lib/producao/relatorios.ts` (acrescentar ao fim)
- Test: `src/lib/producao/relatorios.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `ItemDoPainel`, `razao` de `./painel`; `calcularItem` de `./venda`; `CANAL_VENDA`, `FORMA_PAGAMENTO_VENDA`, `ROTULOS_CANAL_VENDA` de `@/lib/schemas/enums`.
- Produces:
  - `ItemVenda = ItemDoPainel & { clienteId: string; cliente: string; canal: CanalVenda | null; formaPagamento: FormaPagamentoVenda }`
  - `ItemVendido = ItemVenda & { data: Date }`
  - `SaldoAReceber = { clienteId: string; cliente: string; formaPagamento: FormaPagamentoVenda; saldo: number }`
  - `IndicadoresVenda = { kg; faturamento; custo; margem; margemPercentual: number | null; precoMedio: number | null; custoMedio: number | null; percentual: number | null }`
  - `LinhaCliente = IndicadoresVenda & { clienteId; cliente; canal: CanalVenda | null; aReceber: number }`
  - `LinhaProdutoVenda = IndicadoresVenda & { produtoId: string }`
  - `LinhaCanal = IndicadoresVenda & { canal: CanalVenda | null }`
  - `LinhaForma = IndicadoresVenda & { formaPagamento: FormaPagamentoVenda; aReceber: number }`
  - `canalPrincipal(itens: ItemVenda[]): CanalVenda | null`
  - `somarSaldos(saldos: SaldoAReceber[]): number`
  - `agregarVendasDetalhadas(itens: ItemVenda[], saldos: SaldoAReceber[])` → `{ total: IndicadoresVenda & { aReceber: number }; porCliente: LinhaCliente[]; porProduto: LinhaProdutoVenda[]; porCanal: LinhaCanal[]; porForma: LinhaForma[] }`
  - `rotuloCanal(canal: CanalVenda | null): string`

- [ ] **Step 1: Escrever os testes (falhando)**

Acrescente ao fim de `src/lib/producao/relatorios.test.ts` (e junte os nomes novos ao import de `./relatorios`: `agregarVendasDetalhadas`, `canalPrincipal`, `rotuloCanal`, `somarSaldos`, `type ItemVenda`, `type SaldoAReceber`):

```ts
describe("relatório de vendas", () => {
  const item = (extra: Partial<ItemVenda>): ItemVenda => ({
    pedidoId: "p",
    produtoId: "agc",
    categoria: "POLPA",
    frutaId: "a",
    quantidadeKg: 1,
    precoKg: 10,
    custoKg: 4,
    clienteId: "c1",
    cliente: "Cliente exemplo",
    canal: "ATACADO",
    formaPagamento: "A_PRAZO",
    ...extra,
  });

  test("canal principal: maior faturamento; empate pela ordem do cadastro; sem canal por último", () => {
    expect(canalPrincipal([item({ canal: "VAREJO", quantidadeKg: 2 }), item({ canal: "ATACADO" })])).toBe("VAREJO");
    expect(canalPrincipal([item({ canal: "VAREJO" }), item({ canal: "ATACADO" })])).toBe("ATACADO");
    expect(canalPrincipal([item({ canal: null }), item({ canal: "OUTRO" })])).toBe("OUTRO");
    expect(canalPrincipal([item({ canal: null })])).toBeNull();
    expect(canalPrincipal([])).toBeNull();
  });

  test("rótulo do canal", () => {
    expect(rotuloCanal(null)).toBe("Sem canal");
    expect(rotuloCanal("ATACADO")).toBe("Atacado / distribuidor");
  });

  const itens: ItemVenda[] = [
    item({ pedidoId: "p2", quantidadeKg: 20, precoKg: 30, custoKg: 4 }),
    item({ pedidoId: "p3", produtoId: "cpc", quantidadeKg: 4, precoKg: 20, custoKg: 5, canal: "VAREJO", formaPagamento: "PIX" }),
    item({ pedidoId: "p4", produtoId: "cpc", clienteId: "c2", cliente: "Mercado B", quantidadeKg: 10, precoKg: 20, custoKg: 5, canal: "VAREJO", formaPagamento: "DINHEIRO" }),
    item({ pedidoId: "p5", clienteId: "c3", cliente: "Cliente fiscal", quantidadeKg: 5, precoKg: 32, custoKg: 4, canal: null, formaPagamento: "PIX" }),
  ];
  const saldos: SaldoAReceber[] = [
    { clienteId: "c1", cliente: "Cliente exemplo", formaPagamento: "A_PRAZO", saldo: 600 },
    { clienteId: "c4", cliente: "Cliente antigo", formaPagamento: "A_PRAZO", saldo: 300 },
  ];
  const r = agregarVendasDetalhadas(itens, saldos);

  test("total", () => {
    expect(r.total).toMatchObject({ kg: 39, faturamento: 1040, custo: 170, margem: 870, aReceber: 900, percentual: 1 });
    expect(somarSaldos(saldos)).toBe(900);
  });

  test("por cliente: faturamento, depois quem só tem saldo", () => {
    expect(r.porCliente.map((c) => [c.cliente, c.kg, c.faturamento, c.margem, c.canal, c.aReceber])).toEqual([
      ["Cliente exemplo", 24, 680, 580, "ATACADO", 600],
      ["Mercado B", 10, 200, 150, "VAREJO", 0],
      ["Cliente fiscal", 5, 160, 140, null, 0],
      ["Cliente antigo", 0, 0, 0, null, 300],
    ]);
    expect(r.porCliente[0].percentual).toBeCloseTo(680 / 1040, 10);
    expect(r.porCliente[3].precoMedio).toBeNull();
  });

  test("por produto, canal e forma", () => {
    expect(r.porProduto.map((p) => [p.produtoId, p.kg, p.faturamento, p.custoMedio])).toEqual([
      ["agc", 25, 760, 4],
      ["cpc", 14, 280, 5],
    ]);
    expect(r.porProduto[0].margemPercentual).toBeCloseTo(660 / 760, 10);
    expect(r.porCanal.map((c) => [c.canal, c.kg, c.faturamento])).toEqual([
      ["ATACADO", 20, 600],
      ["VAREJO", 14, 280],
      [null, 5, 160],
    ]);
    expect(r.porForma.map((f) => [f.formaPagamento, f.faturamento, f.aReceber])).toEqual([
      ["A_PRAZO", 600, 900],
      ["PIX", 240, 0],
      ["DINHEIRO", 200, 0],
    ]);
  });

  test("sem venda e sem saldo: listas vazias e razões nulas", () => {
    const vazio = agregarVendasDetalhadas([], []);
    expect(vazio.porCliente).toEqual([]);
    expect(vazio.total).toMatchObject({ faturamento: 0, aReceber: 0, precoMedio: null, margemPercentual: null, percentual: null });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/lib/producao/relatorios.test.ts`
Expected: FAIL (`canalPrincipal` e as outras funções não existem).

- [ ] **Step 3: Implementar**

No topo de `src/lib/producao/relatorios.ts`, acrescente os imports:

```ts
import type { CanalVenda, FormaPagamentoVenda } from "@prisma/client";
import { CANAL_VENDA, FORMA_PAGAMENTO_VENDA, ROTULOS_CANAL_VENDA } from "@/lib/schemas/enums";
import { calcularItem } from "./venda";
```

e junte `razao` ao import de `./painel`. Ao fim do arquivo:

```ts
// Relatório de vendas ------------------------------------------------------

export type ItemVenda = ItemDoPainel & {
  clienteId: string;
  cliente: string;
  canal: CanalVenda | null;
  formaPagamento: FormaPagamentoVenda;
};
export type ItemVendido = ItemVenda & { data: Date };

/** Saldo de uma parcela aberta (RN-26), com o cliente e a forma do pedido de origem. */
export type SaldoAReceber = { clienteId: string; cliente: string; formaPagamento: FormaPagamentoVenda; saldo: number };

export type IndicadoresVenda = {
  kg: number;
  faturamento: number;
  custo: number;
  margem: number;
  margemPercentual: number | null;
  precoMedio: number | null;
  /** Σ custo ÷ Σ kg. */
  custoMedio: number | null;
  /** Fração do faturamento total. */
  percentual: number | null;
};
export type LinhaCliente = IndicadoresVenda & {
  clienteId: string;
  cliente: string;
  canal: CanalVenda | null;
  aReceber: number;
};
export type LinhaProdutoVenda = IndicadoresVenda & { produtoId: string };
export type LinhaCanal = IndicadoresVenda & { canal: CanalVenda | null };
export type LinhaForma = IndicadoresVenda & { formaPagamento: FormaPagamentoVenda; aReceber: number };

type Soma = { kg: number; faturamento: number; custo: number };

function somarItens(itens: ItemVenda[]): Soma {
  let kg = 0;
  let faturamento = 0;
  let custo = 0;
  for (const item of itens) {
    const r = calcularItem(item);
    kg += item.quantidadeKg;
    faturamento += r.valor;
    custo += r.custo;
  }
  return { kg: arredondar(kg, 3), faturamento: arredondar(faturamento, 2), custo: arredondar(custo, 2) };
}

function indicadores(s: Soma, faturamentoTotal: number): IndicadoresVenda {
  const margem = arredondar(s.faturamento - s.custo, 2);
  return {
    ...s,
    margem,
    margemPercentual: razao(margem, s.faturamento),
    precoMedio: razao(s.faturamento, s.kg),
    custoMedio: razao(s.custo, s.kg),
    percentual: razao(s.faturamento, faturamentoTotal),
  };
}

function agrupar<T, K>(itens: T[], chave: (item: T) => K): Map<K, T[]> {
  const grupos = new Map<K, T[]>();
  for (const item of itens) grupos.set(chave(item), [...(grupos.get(chave(item)) ?? []), item]);
  return grupos;
}

const ordemCanal = (c: CanalVenda | null) => (c === null ? CANAL_VENDA.length : CANAL_VENDA.indexOf(c));

export function rotuloCanal(canal: CanalVenda | null): string {
  return canal === null ? "Sem canal" : ROTULOS_CANAL_VENDA[canal];
}

/** Canal que mais faturou nos itens; empate pela ordem do cadastro, "sem canal" por último. */
export function canalPrincipal(itens: ItemVenda[]): CanalVenda | null {
  let melhor: { canal: CanalVenda | null; valor: number } | null = null;
  for (const [canal, grupo] of agrupar(itens, (i) => i.canal)) {
    const valor = somarItens(grupo).faturamento;
    if (!melhor || valor > melhor.valor || (valor === melhor.valor && ordemCanal(canal) < ordemCanal(melhor.canal))) {
      melhor = { canal, valor };
    }
  }
  return melhor?.canal ?? null;
}

export function somarSaldos(saldos: SaldoAReceber[]): number {
  return arredondar(
    saldos.reduce((s, x) => s + x.saldo, 0),
    2,
  );
}

/** Tabelas do relatório de vendas: itens do período e saldos a receber de hoje (D-29). */
export function agregarVendasDetalhadas(itens: ItemVenda[], saldos: SaldoAReceber[]) {
  const soma = somarItens(itens);
  const total = { ...indicadores(soma, soma.faturamento), aReceber: somarSaldos(saldos) };
  const ind = (grupo: ItemVenda[]) => indicadores(somarItens(grupo), soma.faturamento);

  const itensPorCliente = agrupar(itens, (i) => i.clienteId);
  const saldosPorCliente = agrupar(saldos, (s) => s.clienteId);
  const nomes = new Map([...itens, ...saldos].map((x) => [x.clienteId, x.cliente]));
  const porCliente: LinhaCliente[] = [...nomes].map(([clienteId, cliente]) => {
    const grupo = itensPorCliente.get(clienteId) ?? [];
    return {
      ...ind(grupo),
      clienteId,
      cliente,
      canal: canalPrincipal(grupo),
      aReceber: somarSaldos(saldosPorCliente.get(clienteId) ?? []),
    };
  });
  porCliente.sort(
    (a, b) => b.faturamento - a.faturamento || b.aReceber - a.aReceber || a.cliente.localeCompare(b.cliente),
  );

  const porProduto: LinhaProdutoVenda[] = [...agrupar(itens, (i) => i.produtoId)]
    .map(([produtoId, grupo]) => ({ ...ind(grupo), produtoId }))
    .sort((a, b) => b.faturamento - a.faturamento || a.produtoId.localeCompare(b.produtoId));

  const porCanal: LinhaCanal[] = [...agrupar(itens, (i) => i.canal)]
    .map(([canal, grupo]) => ({ ...ind(grupo), canal }))
    .sort((a, b) => b.faturamento - a.faturamento || ordemCanal(a.canal) - ordemCanal(b.canal));

  const itensPorForma = agrupar(itens, (i) => i.formaPagamento);
  const saldosPorForma = agrupar(saldos, (s) => s.formaPagamento);
  const porForma: LinhaForma[] = FORMA_PAGAMENTO_VENDA.filter((f) => itensPorForma.has(f) || saldosPorForma.has(f))
    .map((formaPagamento) => ({
      ...ind(itensPorForma.get(formaPagamento) ?? []),
      formaPagamento,
      aReceber: somarSaldos(saldosPorForma.get(formaPagamento) ?? []),
    }))
    .sort((a, b) => b.faturamento - a.faturamento || b.aReceber - a.aReceber);

  return { total, porCliente, porProduto, porCanal, porForma };
}
```

Observação: no teste "por forma", a ordem esperada (A_PRAZO 600, PIX 240, DINHEIRO 200) sai da ordenação por faturamento.

- [ ] **Step 4: Rodar e ver passar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/lib/producao/relatorios.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/producao/relatorios.ts src/lib/producao/relatorios.test.ts
git commit -m @'
feat(producao): cálculo do relatório de vendas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 4: Consultas compartilhadas e painel refatorado

**Files:**
- Create: `src/server/services/relatorioProducao/consultas.ts`
- Modify: `src/server/services/relatorioProducao/painel.ts`
- Test: `src/server/services/relatorioProducao/painel.test.ts` (sem mudança; precisa continuar passando)

**Interfaces:**
- Consumes: `ItemVendido`, `SaldoAReceber`, `OPDatada`, `somarSaldos` (Tasks 2–3); `OPListada` de `../ordemProducao`; `saldoRemanescenteParcela` de `../fluxoDeCaixaProjetado`.
- Produces:
  - `buscarItensVendidos(filialId: string, periodo: { inicio: Date; fim: Date }): Promise<ItemVendido[]>`
  - `buscarSaldosAReceber(filialId: string): Promise<SaldoAReceber[]>`
  - `opDoPainel(op: OPListada): OPDatada`

- [ ] **Step 1: Rodar o teste do painel antes (linha de base)**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/relatorioProducao`
Expected: PASS (confirma o ponto de partida).

- [ ] **Step 2: Criar `consultas.ts`**

```ts
import type { StatusParcela } from "@prisma/client";
import { prisma } from "@/server/db/client";
import type { ItemVendido, OPDatada, SaldoAReceber } from "@/lib/producao/relatorios";
import type { OPListada } from "../ordemProducao";
import { saldoRemanescenteParcela } from "../fluxoDeCaixaProjetado";

/** Parcela ainda devida (RN-26); paga, cancelada e renegociada ficam fora. */
const PARCELA_ABERTA: StatusParcela[] = ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"];

/** Itens de pedidos confirmados com data no período (RN-31), com produto, cliente, canal e forma. */
export async function buscarItensVendidos(filialId: string, periodo: { inicio: Date; fim: Date }): Promise<ItemVendido[]> {
  const itens = await prisma.itemPedidoVenda.findMany({
    where: { pedido: { filialId, status: "CONFIRMADO", data: { gte: periodo.inicio, lte: periodo.fim } } },
    select: {
      pedidoId: true,
      quantidadeKg: true,
      precoKg: true,
      custoKg: true,
      lote: { select: { produto: { select: { id: true, categoria: true, frutaId: true } } } },
      pedido: {
        select: {
          data: true,
          canal: true,
          formaPagamento: true,
          cliente: { select: { id: true, nome: true } },
        },
      },
    },
  });
  return itens.map((i) => ({
    pedidoId: i.pedidoId,
    produtoId: i.lote.produto.id,
    categoria: i.lote.produto.categoria,
    frutaId: i.lote.produto.frutaId,
    quantidadeKg: Number(i.quantidadeKg),
    precoKg: Number(i.precoKg),
    custoKg: Number(i.custoKg),
    data: i.pedido.data,
    clienteId: i.pedido.cliente.id,
    cliente: i.pedido.cliente.nome,
    canal: i.pedido.canal,
    formaPagamento: i.pedido.formaPagamento,
  }));
}

/** Saldo de hoje das parcelas abertas dos títulos de pedidos confirmados da filial, de qualquer data. */
export async function buscarSaldosAReceber(filialId: string): Promise<SaldoAReceber[]> {
  const parcelas = await prisma.parcela.findMany({
    where: {
      status: { in: PARCELA_ABERTA },
      titulo: { pedidoVenda: { is: { filialId, status: "CONFIRMADO" } } },
    },
    select: {
      valorAtualizado: true,
      baixas: { where: { statusAprovacao: "APROVADO" }, select: { valorPago: true } },
      titulo: {
        select: {
          pedidoVenda: { select: { formaPagamento: true, cliente: { select: { id: true, nome: true } } } },
        },
      },
    },
  });
  return parcelas.flatMap((p) => {
    const pedido = p.titulo.pedidoVenda;
    if (!pedido) return [];
    return [
      {
        clienteId: pedido.cliente.id,
        cliente: pedido.cliente.nome,
        formaPagamento: pedido.formaPagamento,
        saldo: saldoRemanescenteParcela(
          Number(p.valorAtualizado),
          p.baixas.map((b) => ({ valorPago: Number(b.valorPago) })),
        ),
      },
    ];
  });
}

/** OP da listagem de Processamento no formato das agregações (mesmos números da lista). */
export function opDoPainel(op: OPListada): OPDatada {
  return {
    frutaId: op.frutaId,
    status: op.status,
    frutoKg: op.resumo.frutoKg,
    polpaKg: op.resumo.polpaKg,
    custoTotal: op.resumo.custo.custoTotal,
    balancoVerificar: op.resumo.balanco.status === "VERIFICAR",
    branqueamentoVerificar: op.resumo.branqueamento === "VERIFICAR",
    data: op.data,
  };
}
```

- [ ] **Step 3: Usar as consultas no painel**

Em `src/server/services/relatorioProducao/painel.ts`:

1. Remova o import de `StatusParcela`, o de `saldoRemanescenteParcela` e a constante `PARCELA_ABERTA`; remova `arredondar` do import se ele não for mais usado.
2. Acrescente:
   ```ts
   import { somarSaldos } from "@/lib/producao/relatorios";
   import { buscarItensVendidos, buscarSaldosAReceber, opDoPainel } from "./consultas";
   ```
3. No `Promise.all`, troque a desestruturação para `[produtos, frutas, recepcoes, ops, itens, saldos, lotes, entregas]`, a consulta `prisma.itemPedidoVenda.findMany({...})` por `buscarItensVendidos(filialId, periodo),` e a consulta `prisma.parcela.findMany({...})` por `buscarSaldosAReceber(filialId),`.
4. Troque o bloco `const proc = agregarOPs(ops.map((op) => ({ ... })));` por:
   ```ts
   const proc = agregarOPs(ops.map(opDoPainel));
   ```
5. Troque o bloco `const vendas = agregarVendas(itens.map((item) => { ... }));` por:
   ```ts
   const vendas = agregarVendas(itens);
   ```
6. Troque o bloco `const aReceber = arredondar(parcelas.reduce(...), 2);` por:
   ```ts
   const aReceber = somarSaldos(saldos);
   ```

O `produto` (Map) e o `rotulo` continuam: ainda servem para o estoque e para as tabelas por produto.

- [ ] **Step 4: Rodar o painel e a tipagem**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/relatorioProducao src/lib/producao; npx tsc --noEmit`
Expected: PASS, sem erro de tipo.

- [ ] **Step 5: Commit**

```powershell
git add src/server/services/relatorioProducao
git commit -m @'
refactor(producao): consultas de vendas e a receber compartilhadas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 5: Serviço do relatório mensal

**Files:**
- Create: `src/server/services/relatorioProducao/mensal.ts`
- Test: `src/server/services/relatorioProducao/mensal.test.ts`

**Interfaces:**
- Consumes: `montarColunasMensais`, `polpaPorProdutoMes`, `frutasComMovimento`, `ColunaMensal`, `RecepcaoDatada` (Task 2); `buscarItensVendidos`, `opDoPainel` (Task 4); `listarOPs`.
- Produces:
  ```ts
  export type RelatorioMensal = {
    ano: number;
    frutas: { id: string; nome: string }[];
    /** 13 colunas: Jan–Dez (índices 0–11) e o total (índice 12). */
    colunas: ColunaMensal[];
    polpaPorProduto: { produtoId: string; produto: string; meses: number[]; total: number }[];
  };
  export async function buscarRelatorioMensal(sessao: SessaoAtiva, ano: number): Promise<RelatorioMensal>;
  ```

- [ ] **Step 1: Escrever o teste de integração (falhando)**

`src/server/services/relatorioProducao/mensal.test.ts`. O cenário de 2026 tem duas frutas: em outubro, recepções, uma OP encerrada de cada fruta e vendas; em novembro, recepção de terceiro, uma OP aberta, uma OP cancelada, uma recepção cancelada e um pedido cancelado; e uma recepção de dezembro de 2025, que não pode entrar.

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { recepcaoSchema } from "@/lib/schemas/recepcao";
import { cabecalhoOPSchema, consumoSchema, processoOPSchema, producaoSchema } from "@/lib/schemas/ordemProducao";
import { pedidoVendaSchema } from "@/lib/schemas/pedidoVenda";
import {
  configurarVendas,
  criarCadastrosDeVenda,
  criarCatalogoDeTeste,
  criarFixtureProducao,
  type CadastrosDeVenda,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "../producaoTestFixtures";
import { cancelarRecepcao, criarRecepcao } from "../recepcaoFruto";
import { adicionarConsumo, adicionarProducao, atualizarProcessoOP, cancelarOP, criarOP, encerrarOP } from "../ordemProducao";
import { cancelarPedido, criarPedido } from "../pedidoVenda";
import { buscarPainelProducao } from "./painel";
import { buscarRelatorioMensal, type RelatorioMensal } from "./mensal";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("relatório mensal", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  let r: RelatorioMensal;
  const adm = () => fx.sessao("ADMINISTRADOR");

  const receber = (data: string, extra: Record<string, unknown>) =>
    criarRecepcao(
      adm(),
      recepcaoSchema.parse({ data, localId: cat.localRecepcaoId, unidade: "KG", descarte: "0", ...extra }),
    );
  const consumir = (opId: string, loteId: string, kg: number) =>
    adicionarConsumo(adm(), opId, consumoSchema.parse({ loteId, quantidadeKg: kg, motivoLiberacaoVencido: "" }));
  const produzir = (opId: string, produtoId: string, kg: number) =>
    adicionarProducao(adm(), opId, producaoSchema.parse({ produtoId, quantidadeKg: kg, localId: cat.localCamaraId }));
  const processo = (opId: string, dados: Record<string, string>) =>
    atualizarProcessoOP(adm(), opId, processoOPSchema.parse({ aguaLitros: "0", perdaKg: "0", carocoResiduoKg: "0", ...dados }));
  const vender = (data: string, loteId: string, kg: number, preco: number, extra: Record<string, unknown> = {}) =>
    criarPedido(
      adm(),
      pedidoVendaSchema.parse({
        data,
        clienteId: cad.clienteId,
        formaPagamento: "A_PRAZO",
        vencimento: "2026-12-31",
        retiraNaPropriedade: "true",
        itens: JSON.stringify([{ loteId, quantidadeKg: kg, precoKg: preco }]),
        ...extra,
      }),
    );

  beforeAll(async () => {
    fx = await criarFixtureProducao("mensal");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
    await configurarVendas(fx, cad);
    await prisma.configuracaoProducao.update({
      where: { filialId: fx.filialAId },
      data: { categoriaCompraFrutoId: cat.categoriaCompraId },
    });
    const proprio = { origem: "PROPRIA", talhaoId: cat.talhaoId };
    const terceiro = { origem: "TERCEIRO", fornecedorId: cat.fornecedorId };

    // Ano anterior: não entra.
    await receber("2025-12-20", { produtoId: cat.produtoFrutoId, ...proprio, pesoBruto: "30" });

    // Outubro.
    const rA = await receber("2026-10-05", { produtoId: cat.produtoFrutoId, ...proprio, pesoBruto: "100", descarte: "10" });
    const rB = await receber("2026-10-05", {
      produtoId: cat.produtoFrutoOutraId,
      ...terceiro,
      pesoBruto: "40",
      descarte: "4",
      preco: "3",
    });
    const op1 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-10-05", frutaId: cat.outraFrutaId }));
    await consumir(op1.id, rB.loteId, 30);
    const cpc = await produzir(op1.id, cat.produtoPolpaOutraId, 12);
    await processo(op1.id, { carocoResiduoKg: "15", perdaKg: "3" });
    await encerrarOP(adm(), op1.id, { confirmarVerificar: false });
    const op2 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-10-05", frutaId: cat.frutaId }));
    await consumir(op2.id, rA.loteId, 50);
    const agc = await produzir(op2.id, cat.produtoPolpaId, 20);
    await processo(op2.id, { carocoResiduoKg: "28", perdaKg: "2", branqueamentoTemperaturaC: "85", branqueamentoTempoS: "12" });
    await encerrarOP(adm(), op2.id, { confirmarVerificar: false });
    await vender("2026-10-05", rA.loteId, 5, 8, { formaPagamento: "PIX", vencimento: "" });
    await vender("2026-10-05", cpc.loteId, 6, 20);

    // Novembro.
    const rC = await receber("2026-11-10", { produtoId: cat.produtoFrutoId, ...terceiro, pesoBruto: "50", preco: "2" });
    const rD = await receber("2026-11-10", { produtoId: cat.produtoFrutoId, ...proprio, pesoBruto: "20" });
    await cancelarRecepcao(adm(), rD.recepcaoId, "Lançada em dobro");
    const op3 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    await consumir(op3.id, rC.loteId, 40);
    await produzir(op3.id, cat.produtoPolpaFinoId, 15);
    const op4 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    await consumir(op4.id, rC.loteId, 5);
    await produzir(op4.id, cat.produtoPolpaId, 2);
    await cancelarOP(adm(), op4.id, "Teste");
    await vender("2026-11-12", agc.loteId, 10, 30);
    const cancelado = await vender("2026-11-12", agc.loteId, 5, 25);
    await cancelarPedido(adm(), cancelado.pedidoId, "Desistiu");

    r = await buscarRelatorioMensal(adm(), 2026);
  }, 60_000);

  afterAll(async () => {
    await fx.limpar();
  });

  test("frutas com movimento e 13 colunas", () => {
    expect(r.ano).toBe(2026);
    expect(r.frutas.map((f) => f.nome)).toEqual(["Açaí", "Cupuaçu"]);
    expect(r.colunas).toHaveLength(13);
  });

  test("recepção por mês: líquido, terceiros e pago; cancelada e ano anterior fora", () => {
    const [out, nov, tot] = [r.colunas[9], r.colunas[10], r.colunas[12]];
    expect(out.recepcaoPorFruta[cat.frutaId]).toMatchObject({ recebidoKg: 90, terceirosKg: 0 });
    expect(out.recepcaoPorFruta[cat.outraFrutaId]).toMatchObject({ recebidoKg: 36, terceirosKg: 36 });
    expect(out.recepcao.recebidoKg).toBe(126);
    expect(out.pagoTerceiros).toBe(108);
    expect(nov.recepcao).toMatchObject({ recebidoKg: 50, terceirosKg: 50 });
    expect(nov.pagoTerceiros).toBe(100);
    expect(tot.recepcao).toMatchObject({ recebidoKg: 176, terceirosKg: 86 });
    expect(tot.pagoTerceiros).toBe(208);
    expect(r.colunas[11].recepcao.recebidoKg).toBe(0);
  });

  test("processamento por mês: aberta no volume, cancelada fora", () => {
    expect(r.colunas[9].processamentoPorFruta[cat.frutaId]).toMatchObject({ frutoKg: 50, polpaKg: 20 });
    expect(r.colunas[9].processamentoPorFruta[cat.outraFrutaId]).toMatchObject({ frutoKg: 30, polpaKg: 12 });
    expect(r.colunas[9].processamento.quantidade).toBe(2);
    expect(r.colunas[10].processamento).toMatchObject({ quantidade: 1, frutoKg: 40, polpaKg: 15, custoMedioPolpa: null });
    expect(r.colunas[12].processamento).toMatchObject({ quantidade: 3, frutoKg: 120, polpaKg: 47 });
  });

  test("vendas por mês; pedido cancelado fora", () => {
    expect(r.colunas[9].vendas).toMatchObject({ faturamento: 160, faturamentoInNatura: 40, kgVendidos: 11 });
    expect(r.colunas[9].polpaPorFruta[cat.outraFrutaId]).toBe(120);
    expect(r.colunas[10].vendas).toMatchObject({ faturamento: 300, kgVendidos: 10 });
    expect(r.colunas[10].polpaPorFruta[cat.frutaId]).toBe(300);
    expect(r.colunas[12].vendas).toMatchObject({ faturamento: 460, kgVendidos: 21 });
  });

  test("polpa por produto × mês; OP cancelada fora", () => {
    expect(r.polpaPorProduto.map((p) => [p.produto.split(" · ")[0], p.meses[9], p.meses[10], p.total])).toEqual([
      ["AFN", 0, 15, 15],
      ["AGC", 20, 0, 20],
      ["CPC", 12, 0, 12],
    ]);
  });

  test("cada mês bate com o painel do mesmo mês (D-29)", async () => {
    for (const [m, inicio, fim] of [
      [9, "2026-10-01", "2026-10-31"],
      [10, "2026-11-01", "2026-11-30"],
    ] as const) {
      const p = await buscarPainelProducao(adm(), { inicio: d(inicio), fim: d(fim) }, d("2026-11-20"));
      const c = r.colunas[m];
      expect(c.recepcao).toEqual(p.recepcao);
      expect(c.processamento).toEqual(p.processamento);
      const { aReceber: _, ...vendas } = p.vendas;
      expect(c.vendas).toEqual(vendas);
    }
  });

  test("outra filial não vê nada", async () => {
    const b = await buscarRelatorioMensal(fx.sessao("ADMINISTRADOR", { filial: "B" }), 2026);
    expect(b.frutas).toEqual([]);
    expect(b.colunas[12].vendas.faturamento).toBe(0);
    expect(b.polpaPorProduto).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/relatorioProducao/mensal.test.ts`
Expected: FAIL (módulo `./mensal` não existe).

- [ ] **Step 3: Implementar `mensal.ts`**

```ts
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import {
  frutasComMovimento,
  montarColunasMensais,
  polpaPorProdutoMes,
  type ColunaMensal,
} from "@/lib/producao/relatorios";
import { listarOPs } from "../ordemProducao";
import { buscarItensVendidos, opDoPainel } from "./consultas";

export type RelatorioMensal = {
  ano: number;
  frutas: { id: string; nome: string }[];
  /** 13 colunas: Jan–Dez (índices 0–11) e o total (índice 12). */
  colunas: ColunaMensal[];
  polpaPorProduto: { produtoId: string; produto: string; meses: number[]; total: number }[];
};

/**
 * Relatório mensal (doc 07, REL_MENSAL): uma consulta por fonte para o ano
 * inteiro, separada por mês e agregada pelas mesmas funções do painel (D-29).
 */
export async function buscarRelatorioMensal(sessao: SessaoAtiva, ano: number): Promise<RelatorioMensal> {
  requirePermission(sessao.perfil, "producao:ler");
  const { filialId, empresaId } = sessao;
  const periodo = { inicio: new Date(Date.UTC(ano, 0, 1)), fim: new Date(Date.UTC(ano, 11, 31)) };
  const noAno = { gte: periodo.inicio, lte: periodo.fim };

  const [produtos, frutas, recepcoes, ops, itens, producoes] = await Promise.all([
    prisma.produto.findMany({ where: { empresaId }, select: { id: true, codigo: true, descricao: true, frutaId: true } }),
    prisma.fruta.findMany({ where: { empresaId }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.recepcaoFruto.groupBy({
      by: ["produtoId", "origem", "data"],
      where: { filialId, status: "ATIVA", data: noAno },
      _sum: { pesoBrutoKg: true, descarteKg: true, valorTotal: true },
    }),
    listarOPs(filialId, periodo),
    buscarItensVendidos(filialId, periodo),
    prisma.producaoOP.findMany({
      where: { removidoEm: null, ordemProducao: { filialId, status: { not: "CANCELADA" }, data: noAno } },
      select: { produtoId: true, quantidadeKg: true, ordemProducao: { select: { data: true } } },
    }),
  ]);

  const produto = new Map(produtos.map((p) => [p.id, p]));
  const colunas = montarColunasMensais(
    recepcoes.map((g) => ({
      frutaId: produto.get(g.produtoId)?.frutaId ?? "",
      origem: g.origem,
      brutoKg: Number(g._sum.pesoBrutoKg ?? 0),
      descarteKg: Number(g._sum.descarteKg ?? 0),
      valorTotal: Number(g._sum.valorTotal ?? 0),
      data: g.data,
    })),
    ops.map(opDoPainel),
    itens,
  );

  const polpa = polpaPorProdutoMes(
    producoes.map((p) => ({ produtoId: p.produtoId, data: p.ordemProducao.data, kg: Number(p.quantidadeKg) })),
  );
  const rotulo = (id: string) => {
    const p = produto.get(id);
    return p ? `${p.codigo} · ${p.descricao}` : id;
  };

  return {
    ano,
    frutas: frutasComMovimento(colunas[12], frutas),
    colunas,
    polpaPorProduto: [...polpa]
      .map(([produtoId, v]) => ({ produtoId, produto: rotulo(produtoId), ...v }))
      .sort((a, b) => a.produto.localeCompare(b.produto)),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/relatorioProducao/mensal.test.ts`
Expected: PASS. Se o cenário falhar ao montar (validação de lote, balanço), corrija o cenário, não a regra. Se um número diferir, confira à mão antes de mudar a expectativa.

- [ ] **Step 5: Commit**

```powershell
git add src/server/services/relatorioProducao/mensal.ts src/server/services/relatorioProducao/mensal.test.ts
git commit -m @'
feat(producao): serviço do relatório mensal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 6: Serviço do relatório de vendas e teste de permissão

**Files:**
- Create: `src/server/services/relatorioProducao/vendas.ts`
- Test: `src/server/services/relatorioProducao/vendas.test.ts`
- Test: `src/server/services/relatorioProducao/relatorios.permissao.test.ts`

**Interfaces:**
- Consumes: `agregarVendasDetalhadas`, `LinhaCliente`, `LinhaProdutoVenda`, `LinhaCanal`, `LinhaForma`, `IndicadoresVenda` (Task 3); `buscarItensVendidos`, `buscarSaldosAReceber` (Task 4).
- Produces:
  ```ts
  export type RelatorioVendas = {
    periodo: { inicio: Date; fim: Date };
    hoje: Date;
    total: IndicadoresVenda & { aReceber: number };
    porCliente: LinhaCliente[];
    porProduto: (LinhaProdutoVenda & { produto: string })[];
    porCanal: LinhaCanal[];
    porForma: LinhaForma[];
  };
  export async function buscarRelatorioVendas(sessao: SessaoAtiva, periodo: { inicio: Date; fim: Date }, hoje: Date): Promise<RelatorioVendas>;
  ```

- [ ] **Step 1: Escrever o teste de integração (falhando)**

`src/server/services/relatorioProducao/vendas.test.ts`. O cenário está no período 2026-11-01..30, com hoje = 2026-11-20:

| Pedido | Data | Cliente | Lote | kg × preço | Forma | Canal |
|---|---|---|---|---|---|---|
| p1 | 2026-10-15 | Cliente antigo | AGC (custo 4) | 10 × 30 | A prazo | — (fora do período, saldo 300) |
| p2 | 2026-11-05 | Cliente exemplo | AGC | 20 × 30 | A prazo | do cliente (ATACADO) |
| p3 | 2026-11-06 | Cliente exemplo | CPC (custo 5) | 4 × 20 | Pix | VAREJO |
| p4 | 2026-11-07 | Mercado B | CPC | 10 × 20 | Dinheiro | do cliente (VAREJO) |
| p5 | 2026-11-08 | Cliente fiscal | AGC | 5 × 32 | Pix | sem canal |
| p6 | 2026-11-09 | Mercado B | AGC | 2 × 30 | Pix | cancelado |
| p7 | 2026-12-01 | Mercado B | AGC | 1 × 30 | Pix | fora do período |

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { pedidoVendaSchema } from "@/lib/schemas/pedidoVenda";
import {
  configurarVendas,
  criarCadastrosDeVenda,
  criarCatalogoDeTeste,
  criarFixtureProducao,
  criarLoteDeTeste,
  type CadastrosDeVenda,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "../producaoTestFixtures";
import { cancelarPedido, criarPedido } from "../pedidoVenda";
import { buscarPainelProducao } from "./painel";
import { buscarRelatorioVendas, type RelatorioVendas } from "./vendas";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("relatório de vendas", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  let r: RelatorioVendas;
  const adm = () => fx.sessao("ADMINISTRADOR");
  const periodo = { inicio: d("2026-11-01"), fim: d("2026-11-30") };
  const hoje = d("2026-11-20");

  const vender = (
    data: string,
    clienteId: string,
    loteId: string,
    kg: number,
    preco: number,
    extra: Record<string, unknown> = {},
  ) =>
    criarPedido(
      adm(),
      pedidoVendaSchema.parse({
        data,
        clienteId,
        formaPagamento: "A_PRAZO",
        vencimento: "2026-12-31",
        retiraNaPropriedade: "true",
        itens: JSON.stringify([{ loteId, quantidadeKg: kg, precoKg: preco }]),
        ...extra,
      }),
    );
  const avista = (forma: string) => ({ formaPagamento: forma, vencimento: "" });

  beforeAll(async () => {
    fx = await criarFixtureProducao("vendas");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
    await configurarVendas(fx, cad);
    const mercado = await prisma.cliente.create({
      data: { empresaId: fx.empresaId, nome: "Mercado B", canalVenda: "VAREJO" },
    });
    const antigo = await prisma.cliente.create({ data: { empresaId: fx.empresaId, nome: "Cliente antigo" } });
    const lote = (produtoId: string, custoKg: number) =>
      criarLoteDeTeste(fx, {
        produtoId,
        localId: cat.localCamaraId,
        kg: 100,
        custoKg,
        data: d("2026-10-01"),
        validade: d("2027-10-01"),
      });
    const agc = await lote(cat.produtoPolpaId, 4);
    const cpc = await lote(cat.produtoPolpaOutraId, 5);

    await vender("2026-10-15", antigo.id, agc.id, 10, 30);
    await vender("2026-11-05", cad.clienteId, agc.id, 20, 30);
    await vender("2026-11-06", cad.clienteId, cpc.id, 4, 20, { ...avista("PIX"), canal: "VAREJO" });
    await vender("2026-11-07", mercado.id, cpc.id, 10, 20, avista("DINHEIRO"));
    await vender("2026-11-08", cad.clienteFiscalId, agc.id, 5, 32, avista("PIX"));
    const p6 = await vender("2026-11-09", mercado.id, agc.id, 2, 30, avista("PIX"));
    await cancelarPedido(adm(), p6.pedidoId, "Desistiu");
    await vender("2026-12-01", mercado.id, agc.id, 1, 30, avista("PIX"));

    r = await buscarRelatorioVendas(adm(), periodo, hoje);
  }, 60_000);

  afterAll(async () => {
    await fx.limpar();
  });

  test("total do período e a receber de hoje", () => {
    expect(r.total).toMatchObject({ kg: 39, faturamento: 1040, custo: 170, margem: 870, aReceber: 900 });
  });

  test("por cliente: canal principal, a receber e quem só tem saldo", () => {
    expect(r.porCliente.map((c) => [c.cliente, c.kg, c.faturamento, c.margem, c.canal, c.aReceber])).toEqual([
      ["Cliente exemplo", 24, 680, 580, "ATACADO", 600],
      ["Mercado B", 10, 200, 150, "VAREJO", 0],
      ["Cliente fiscal", 5, 160, 140, null, 0],
      ["Cliente antigo", 0, 0, 0, null, 300],
    ]);
  });

  test("por produto, canal e forma", () => {
    expect(r.porProduto.map((p) => [p.produto.split(" · ")[0], p.kg, p.faturamento, p.custoMedio])).toEqual([
      ["AGC", 25, 760, 4],
      ["CPC", 14, 280, 5],
    ]);
    expect(r.porCanal.map((c) => [c.canal, c.kg, c.faturamento])).toEqual([
      ["ATACADO", 20, 600],
      ["VAREJO", 14, 280],
      [null, 5, 160],
    ]);
    expect(r.porForma.map((f) => [f.formaPagamento, f.faturamento, f.aReceber])).toEqual([
      ["A_PRAZO", 600, 900],
      ["PIX", 240, 0],
      ["DINHEIRO", 200, 0],
    ]);
  });

  test("a receber bate com o painel (D-29)", async () => {
    const p = await buscarPainelProducao(adm(), periodo, hoje);
    expect(r.total.aReceber).toBe(p.vendas.aReceber);
    expect(r.total.faturamento).toBe(p.vendas.faturamento);
  });

  test("outra filial não vê nada", async () => {
    const b = await buscarRelatorioVendas(fx.sessao("ADMINISTRADOR", { filial: "B" }), periodo, hoje);
    expect(b.porCliente).toEqual([]);
    expect(b.total.aReceber).toBe(0);
  });
});
```

`src/server/services/relatorioProducao/relatorios.permissao.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { PermissionError } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { buscarRelatorioMensal } from "./mensal";
import { buscarRelatorioVendas } from "./vendas";

vi.mock("@/server/auth/permissions", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/auth/permissions")>();
  return {
    ...real,
    requirePermission: (perfil: Parameters<typeof real.requirePermission>[0], acao: Parameters<typeof real.requirePermission>[1]) => {
      if (acao === "producao:ler") throw new real.PermissionError(perfil, acao);
    },
  };
});

describe("relatórios de produção: permissão", () => {
  const sessao: SessaoAtiva = {
    usuarioId: "u",
    nome: "Teste",
    empresaId: "e",
    perfil: "CONSULTA",
    filialId: "f",
    podeAlterarFilial: false,
  };
  const dia = new Date("2026-11-20T00:00:00.000Z");

  test("sem producao:ler o mensal é recusado antes de consultar o banco", async () => {
    await expect(buscarRelatorioMensal(sessao, 2026)).rejects.toThrow(PermissionError);
  });

  test("sem producao:ler o de vendas é recusado antes de consultar o banco", async () => {
    await expect(buscarRelatorioVendas(sessao, { inicio: dia, fim: dia }, dia)).rejects.toThrow(PermissionError);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/relatorioProducao/vendas.test.ts src/server/services/relatorioProducao/relatorios.permissao.test.ts`
Expected: FAIL (módulo `./vendas` não existe).

- [ ] **Step 3: Implementar `vendas.ts`**

```ts
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import {
  agregarVendasDetalhadas,
  type IndicadoresVenda,
  type LinhaCanal,
  type LinhaCliente,
  type LinhaForma,
  type LinhaProdutoVenda,
} from "@/lib/producao/relatorios";
import { buscarItensVendidos, buscarSaldosAReceber } from "./consultas";

export type RelatorioVendas = {
  periodo: { inicio: Date; fim: Date };
  hoje: Date;
  total: IndicadoresVenda & { aReceber: number };
  porCliente: LinhaCliente[];
  porProduto: (LinhaProdutoVenda & { produto: string })[];
  porCanal: LinhaCanal[];
  porForma: LinhaForma[];
};

/**
 * Relatório de vendas (doc 07, REL_VENDAS): itens de pedidos confirmados do
 * período (RN-31) e saldo a receber de hoje, de qualquer data (D-29).
 */
export async function buscarRelatorioVendas(
  sessao: SessaoAtiva,
  periodo: { inicio: Date; fim: Date },
  hoje: Date,
): Promise<RelatorioVendas> {
  requirePermission(sessao.perfil, "producao:ler");
  const { filialId, empresaId } = sessao;

  const [produtos, itens, saldos] = await Promise.all([
    prisma.produto.findMany({ where: { empresaId }, select: { id: true, codigo: true, descricao: true } }),
    buscarItensVendidos(filialId, periodo),
    buscarSaldosAReceber(filialId),
  ]);

  const produto = new Map(produtos.map((p) => [p.id, `${p.codigo} · ${p.descricao}`]));
  const r = agregarVendasDetalhadas(itens, saldos);
  return {
    periodo,
    hoje,
    ...r,
    porProduto: r.porProduto.map((p) => ({ ...p, produto: produto.get(p.produtoId) ?? p.produtoId })),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo comando do Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/server/services/relatorioProducao/vendas.ts src/server/services/relatorioProducao/vendas.test.ts src/server/services/relatorioProducao/relatorios.permissao.test.ts
git commit -m @'
feat(producao): serviço do relatório de vendas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 7: Montagem da exportação (CSV/Excel e PDF)

**Files:**
- Create: `src/server/export/relatorioMensal.ts`, `src/server/export/relatorioVendas.ts`
- Test: `src/server/export/relatorioMensal.test.ts`, `src/server/export/relatorioVendas.test.ts`

**Interfaces:**
- Consumes: `RelatorioMensal` (Task 5), `RelatorioVendas` (Task 6), `blocosMensais`, `MESES`, `rotuloCanal`, `Unidade` (Tasks 2–3); `secaoPdf`, `SecaoPdf`, `ColunaExport`.
- Produces:
  - `LinhaMensal = { bloco: string; indicador: string; fruta: string; mes: string; valor: number | null; unidade: Unidade }`
  - `linhasDoMensal(r: RelatorioMensal): LinhaMensal[]`, `COLUNAS_MENSAL: ColunaExport<LinhaMensal>[]`, `secoesDoMensal(r): SecaoPdf<unknown>[]`
  - `LinhaVendas` (abaixo), `linhasDeVendas(r: RelatorioVendas): LinhaVendas[]`, `COLUNAS_VENDAS: ColunaExport<LinhaVendas>[]`, `secoesDeVendas(r): SecaoPdf<unknown>[]`

- [ ] **Step 1: Escrever os testes (falhando)**

`src/server/export/relatorioMensal.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { montarColunasMensais } from "@/lib/producao/relatorios";
import type { RelatorioMensal } from "@/server/services/relatorioProducao/mensal";
import { COLUNAS_MENSAL, linhasDoMensal, secoesDoMensal } from "./relatorioMensal";

const colunas = montarColunasMensais(
  [{ frutaId: "a", origem: "TERCEIRO", brutoKg: 50, descarteKg: 0, valorTotal: 100, data: new Date("2026-11-10T00:00:00Z") }],
  [],
  [],
);
const r: RelatorioMensal = {
  ano: 2026,
  frutas: [{ id: "a", nome: "Açaí" }],
  colunas,
  polpaPorProduto: [{ produtoId: "agc", produto: "AGC · Polpa", meses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0, 0], total: 20 }],
};

describe("exportação do mensal", () => {
  const linhas = linhasDoMensal(r);

  test("uma linha por indicador × mês (12 + total), mais a polpa por produto", () => {
    const terceiros = linhas.filter((l) => l.indicador === "Terceiros" && l.fruta === "Açaí");
    expect(terceiros).toHaveLength(13);
    expect(terceiros[10]).toEqual({ bloco: "Recepção", indicador: "Terceiros", fruta: "Açaí", mes: "11", valor: 50, unidade: "kg" });
    expect(terceiros[12].mes).toBe("Total");
    const polpa = linhas.filter((l) => l.bloco === "Polpa por produto");
    expect(polpa).toHaveLength(13);
    expect(polpa[9]).toMatchObject({ indicador: "AGC · Polpa", mes: "10", valor: 20, unidade: "kg" });
  });

  test("percentual sai multiplicado por 100 e nulo sai vazio", () => {
    const valor = COLUNAS_MENSAL.find((c) => c.rotulo === "Valor")!;
    expect(valor.valor({ bloco: "", indicador: "", fruta: "", mes: "1", valor: 0.25, unidade: "%" })).toBe(25);
    expect(valor.valor({ bloco: "", indicador: "", fruta: "", mes: "1", valor: null, unidade: "%" })).toBe("");
  });

  test("PDF: uma seção por bloco e a polpa por produto", () => {
    expect(secoesDoMensal(r).map((s) => s.titulo)).toEqual([
      "Recepção",
      "Processamento",
      "Vendas",
      "Custos",
      "Polpa produzida por produto (kg)",
    ]);
  });
});
```

`src/server/export/relatorioVendas.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { agregarVendasDetalhadas, type ItemVenda } from "@/lib/producao/relatorios";
import type { RelatorioVendas } from "@/server/services/relatorioProducao/vendas";
import { COLUNAS_VENDAS, linhasDeVendas, secoesDeVendas } from "./relatorioVendas";

const item: ItemVenda = {
  pedidoId: "p",
  produtoId: "agc",
  categoria: "POLPA",
  frutaId: "a",
  quantidadeKg: 10,
  precoKg: 30,
  custoKg: 4,
  clienteId: "c1",
  cliente: "Cliente exemplo",
  canal: null,
  formaPagamento: "A_PRAZO",
};
const agregado = agregarVendasDetalhadas([item], [{ clienteId: "c1", cliente: "Cliente exemplo", formaPagamento: "A_PRAZO", saldo: 300 }]);
const r: RelatorioVendas = {
  periodo: { inicio: new Date("2026-11-01T00:00:00Z"), fim: new Date("2026-11-30T00:00:00Z") },
  hoje: new Date("2026-11-20T00:00:00Z"),
  ...agregado,
  porProduto: agregado.porProduto.map((p) => ({ ...p, produto: "AGC · Polpa" })),
};

describe("exportação de vendas", () => {
  const linhas = linhasDeVendas(r);

  test("uma linha por item de cada seção, sem totais", () => {
    expect(linhas.map((l) => [l.secao, l.item])).toEqual([
      ["Cliente", "Cliente exemplo"],
      ["Produto", "AGC · Polpa"],
      ["Canal", "Sem canal"],
      ["Forma de pagamento", "A prazo"],
    ]);
    expect(linhas[0]).toMatchObject({ kg: 10, faturamento: 300, margem: 260, canal: "Sem canal", aReceber: 300 });
    expect(linhas[1]).toMatchObject({ canal: null, aReceber: null, custoMedio: 4 });
  });

  test("percentuais × 100; vazio quando não se aplica", () => {
    const col = (rotulo: string) => COLUNAS_VENDAS.find((c) => c.rotulo === rotulo)!;
    expect(col("% do total").valor(linhas[0])).toBe(100);
    expect(col("A receber").valor(linhas[1])).toBe("");
  });

  test("PDF: quatro seções", () => {
    expect(secoesDeVendas(r).map((s) => s.titulo)).toEqual([
      "Vendas por cliente",
      "Por produto",
      "Por canal",
      "Por forma de pagamento",
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/export/relatorioMensal.test.ts src/server/export/relatorioVendas.test.ts`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar `relatorioMensal.ts`**

```ts
import type { ColunaExport } from "@/lib/export/csv";
import { secaoPdf, type SecaoPdf } from "@/lib/export/pdf";
import { blocosMensais, MESES, type ColunaMensal, type Unidade } from "@/lib/producao/relatorios";
import type { RelatorioMensal } from "@/server/services/relatorioProducao/mensal";

export type LinhaMensal = {
  bloco: string;
  indicador: string;
  fruta: string;
  /** "1"–"12" ou "Total". */
  mes: string;
  valor: number | null;
  unidade: Unidade;
};

const POLPA = "Polpa por produto";
const mesDaColuna = (c: ColunaMensal) => (c.mes === null ? "Total" : String(c.mes + 1));
const nomeDaColuna = (c: ColunaMensal) => (c.mes === null ? "Total" : MESES[c.mes]);
/** Percentual em fração vira 0–100; nulo vira vazio. */
const paraExport = (valor: number | null, unidade: Unidade) =>
  valor === null ? "" : unidade === "%" ? valor * 100 : valor;
const tipoPdf = (unidade: Unidade) => (unidade === "%" ? "percentual" : unidade === "nº" ? "inteiro" : undefined);

/** Formato longo: um indicador × mês por linha (tabela dinâmica no Excel). */
export function linhasDoMensal(r: RelatorioMensal): LinhaMensal[] {
  const linhas: LinhaMensal[] = [];
  for (const bloco of blocosMensais(r.frutas)) {
    for (const ind of bloco.indicadores) {
      for (const c of r.colunas) {
        linhas.push({ bloco: bloco.titulo, indicador: ind.rotulo, fruta: ind.fruta, mes: mesDaColuna(c), valor: ind.valor(c), unidade: ind.unidade });
      }
    }
  }
  for (const p of r.polpaPorProduto) {
    [...p.meses, p.total].forEach((valor, i) =>
      linhas.push({ bloco: POLPA, indicador: p.produto, fruta: "", mes: i === 12 ? "Total" : String(i + 1), valor, unidade: "kg" }),
    );
  }
  return linhas;
}

export const COLUNAS_MENSAL: ColunaExport<LinhaMensal>[] = [
  { rotulo: "Bloco", valor: (l) => l.bloco },
  { rotulo: "Indicador", valor: (l) => l.indicador },
  { rotulo: "Fruta", valor: (l) => l.fruta },
  { rotulo: "Mês", valor: (l) => l.mes },
  { rotulo: "Valor", valor: (l) => paraExport(l.valor, l.unidade) },
  { rotulo: "Unidade", valor: (l) => l.unidade },
];

/** No PDF, cada bloco como na tela: meses nas linhas, indicadores nas colunas. */
export function secoesDoMensal(r: RelatorioMensal): SecaoPdf<unknown>[] {
  return [
    ...blocosMensais(r.frutas).map((bloco) =>
      secaoPdf<ColunaMensal>({
        titulo: bloco.titulo,
        linhas: r.colunas,
        colunas: [
          { rotulo: "Mês", valor: nomeDaColuna },
          ...bloco.indicadores.map(
            (ind): ColunaExport<ColunaMensal> => ({
              rotulo: `${ind.rotulo}${ind.fruta ? ` ${ind.fruta}` : ""} (${ind.unidade})`,
              valor: (c) => paraExport(ind.valor(c), ind.unidade),
              tipo: tipoPdf(ind.unidade),
            }),
          ),
        ],
      }),
    ),
    secaoPdf({
      titulo: "Polpa produzida por produto (kg)",
      linhas: r.polpaPorProduto,
      colunas: [
        { rotulo: "Produto", valor: (p) => p.produto },
        ...MESES.map((m, i): ColunaExport<RelatorioMensal["polpaPorProduto"][number]> => ({ rotulo: m, valor: (p) => p.meses[i] })),
        { rotulo: "Total", valor: (p) => p.total },
      ],
    }),
  ];
}
```

- [ ] **Step 4: Implementar `relatorioVendas.ts`**

```ts
import type { ColunaExport } from "@/lib/export/csv";
import { secaoPdf, type SecaoPdf } from "@/lib/export/pdf";
import { rotuloCanal, type IndicadoresVenda } from "@/lib/producao/relatorios";
import { ROTULOS_FORMA_PAGAMENTO_VENDA } from "@/lib/schemas/enums";
import type { RelatorioVendas } from "@/server/services/relatorioProducao/vendas";

export type LinhaVendas = IndicadoresVenda & {
  secao: "Cliente" | "Produto" | "Canal" | "Forma de pagamento";
  item: string;
  /** Só na seção Cliente. */
  canal: string | null;
  /** Só nas seções Cliente e Forma de pagamento. */
  aReceber: number | null;
};

/** Uma linha por item de cada seção, sem totais (para filtrar por Seção no Excel). */
export function linhasDeVendas(r: RelatorioVendas): LinhaVendas[] {
  return [
    ...r.porCliente.map((c): LinhaVendas => ({ ...c, secao: "Cliente", item: c.cliente, canal: rotuloCanal(c.canal), aReceber: c.aReceber })),
    ...r.porProduto.map((p): LinhaVendas => ({ ...p, secao: "Produto", item: p.produto, canal: null, aReceber: null })),
    ...r.porCanal.map((c): LinhaVendas => ({ ...c, secao: "Canal", item: rotuloCanal(c.canal), canal: null, aReceber: null })),
    ...r.porForma.map(
      (f): LinhaVendas => ({
        ...f,
        secao: "Forma de pagamento",
        item: ROTULOS_FORMA_PAGAMENTO_VENDA[f.formaPagamento],
        canal: null,
        aReceber: f.aReceber,
      }),
    ),
  ];
}

const num = (v: number | null) => (v === null ? "" : v);
const pct = (v: number | null) => (v === null ? "" : v * 100);

export const COLUNAS_VENDAS: ColunaExport<LinhaVendas>[] = [
  { rotulo: "Seção", valor: (l) => l.secao },
  { rotulo: "Item", valor: (l) => l.item },
  { rotulo: "Kg", valor: (l) => l.kg },
  { rotulo: "Faturamento", valor: (l) => l.faturamento },
  { rotulo: "% do total", valor: (l) => pct(l.percentual), tipo: "percentual" },
  { rotulo: "Preço médio", valor: (l) => num(l.precoMedio) },
  { rotulo: "Custo médio", valor: (l) => num(l.custoMedio) },
  { rotulo: "Margem", valor: (l) => l.margem },
  { rotulo: "Margem %", valor: (l) => pct(l.margemPercentual), tipo: "percentual" },
  { rotulo: "Canal principal", valor: (l) => l.canal ?? "" },
  { rotulo: "A receber", valor: (l) => num(l.aReceber) },
];

type Linha<T> = T & { rotulo: string };

/** No PDF, uma seção por tabela da tela, cada uma com a linha de total. */
export function secoesDeVendas(r: RelatorioVendas): SecaoPdf<unknown>[] {
  const total = { ...r.total, rotulo: "Total" };
  const base = <T extends IndicadoresVenda>(): ColunaExport<Linha<T>>[] => [
    { rotulo: "Kg", valor: (l) => l.kg },
    { rotulo: "Faturamento (R$)", valor: (l) => l.faturamento },
    { rotulo: "% do total", valor: (l) => pct(l.percentual), tipo: "percentual" },
  ];
  return [
    secaoPdf<Linha<IndicadoresVenda & { canal?: string; aReceber: number; ordem?: number }>>({
      titulo: "Vendas por cliente",
      linhas: [
        ...r.porCliente.map((c, i) => ({ ...c, rotulo: c.cliente, canal: rotuloCanal(c.canal), ordem: i + 1 })),
        total,
      ],
      colunas: [
        { rotulo: "#", valor: (l) => l.ordem ?? "", tipo: "inteiro" },
        { rotulo: "Cliente", valor: (l) => l.rotulo },
        ...base(),
        { rotulo: "Preço médio (R$/kg)", valor: (l) => num(l.precoMedio) },
        { rotulo: "Margem (R$)", valor: (l) => l.margem },
        { rotulo: "Margem %", valor: (l) => pct(l.margemPercentual), tipo: "percentual" },
        { rotulo: "Canal principal", valor: (l) => l.canal ?? "" },
        { rotulo: "A receber (R$)", valor: (l) => l.aReceber },
      ],
    }),
    secaoPdf<Linha<IndicadoresVenda>>({
      titulo: "Por produto",
      linhas: [...r.porProduto.map((p) => ({ ...p, rotulo: p.produto })), total],
      colunas: [
        { rotulo: "Produto", valor: (l) => l.rotulo },
        ...base(),
        { rotulo: "Preço médio (R$/kg)", valor: (l) => num(l.precoMedio) },
        { rotulo: "Custo médio (R$/kg)", valor: (l) => num(l.custoMedio) },
        { rotulo: "Margem %", valor: (l) => pct(l.margemPercentual), tipo: "percentual" },
      ],
    }),
    secaoPdf<Linha<IndicadoresVenda>>({
      titulo: "Por canal",
      linhas: [...r.porCanal.map((c) => ({ ...c, rotulo: rotuloCanal(c.canal) })), total],
      colunas: [{ rotulo: "Canal", valor: (l) => l.rotulo }, ...base()],
    }),
    secaoPdf<Linha<IndicadoresVenda & { aReceber: number }>>({
      titulo: "Por forma de pagamento",
      linhas: [
        ...r.porForma.map((f) => ({ ...f, rotulo: ROTULOS_FORMA_PAGAMENTO_VENDA[f.formaPagamento] })),
        total,
      ],
      colunas: [
        { rotulo: "Forma", valor: (l) => l.rotulo },
        { rotulo: "Faturamento (R$)", valor: (l) => l.faturamento },
        { rotulo: "A receber hoje (R$)", valor: (l) => l.aReceber },
      ],
    }),
  ];
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/export/relatorioMensal.test.ts src/server/export/relatorioVendas.test.ts; npx tsc --noEmit`
Expected: PASS, sem erro de tipo. Se a tipagem genérica de `base<T>()` incomodar o `tsc`, escreva as três colunas por extenso em cada seção, sem mudar o comportamento.

- [ ] **Step 6: Commit**

```powershell
git add src/server/export/relatorioMensal.ts src/server/export/relatorioMensal.test.ts src/server/export/relatorioVendas.ts src/server/export/relatorioVendas.test.ts
git commit -m @'
feat(producao): exportação dos relatórios mensal e de vendas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 8: Tela, gráficos e rota de exportação do relatório mensal

**Files:**
- Create: `src/app/(dashboard)/producao/relatorios/_shared/tabela.tsx`
- Create: `src/app/(dashboard)/producao/relatorios/mensal/graficos.tsx`
- Create: `src/app/(dashboard)/producao/relatorios/mensal/page.tsx`
- Create: `src/app/(dashboard)/producao/relatorios/mensal/export/route.ts`
- Modify: `src/app/(dashboard)/nav-items.ts:38`

**Interfaces:**
- Consumes: `buscarRelatorioMensal` (Task 5); `blocosMensais`, `MESES`, `Unidade` (Task 2); `anoDaUrl` (Task 1); `linhasDoMensal`, `COLUNAS_MENSAL`, `secoesDoMensal` (Task 7).
- Produces: `TabelaRelatorio`, `formatarCelula(valor: number | null, unidade: Unidade): string` em `relatorios/_shared/tabela.tsx` (usados na Task 9).

- [ ] **Step 1: Tabela compartilhada**

`src/app/(dashboard)/producao/relatorios/_shared/tabela.tsx`:

```tsx
import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarMoeda } from "@/lib/formatacao";
import type { Unidade } from "@/lib/producao/relatorios";

const KG = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const PCT = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const INTEIRO = new Intl.NumberFormat("pt-BR");

/** Célula numérica; a unidade vai no cabeçalho da coluna. */
export function formatarCelula(valor: number | null, unidade: Unidade): string {
  if (valor === null) return "—";
  if (unidade === "kg") return KG.format(valor);
  if (unidade === "%") return PCT.format(valor);
  if (unidade === "nº") return INTEIRO.format(valor);
  return formatarMoeda(valor);
}

export type ColunaTabela = { rotulo: string; detalhe?: string; numero?: boolean };

const classe = (numero?: boolean) => (numero ? "text-right tabular-nums" : undefined);

/** Tabela de relatório: título, cabeçalho (com detalhe em 2ª linha), linhas e total em negrito. */
export function TabelaRelatorio({
  titulo,
  colunas,
  linhas,
  total,
  vazio = "Nada no período.",
}: {
  titulo: string;
  colunas: ColunaTabela[];
  linhas: { chave: string; celulas: ReactNode[] }[];
  total?: ReactNode[];
  vazio?: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {colunas.map((c, i) => (
                <TableHead key={i} className={c.numero ? "text-right" : undefined}>
                  {c.rotulo}
                  {c.detalhe ? <span className="block text-xs font-normal text-muted-foreground">{c.detalhe}</span> : null}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colunas.length} className="py-6 text-center text-sm text-muted-foreground">
                  {vazio}
                </TableCell>
              </TableRow>
            ) : null}
            {linhas.map((l) => (
              <TableRow key={l.chave}>
                {l.celulas.map((celula, i) => (
                  <TableCell key={i} className={classe(colunas[i]?.numero)}>
                    {celula}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {total && linhas.length > 0 ? (
              <TableRow className="font-semibold">
                {total.map((celula, i) => (
                  <TableCell key={i} className={classe(colunas[i]?.numero)}>
                    {celula}
                  </TableCell>
                ))}
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Gráficos do mensal**

`src/app/(dashboard)/producao/relatorios/mensal/graficos.tsx`:

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { formatarMoeda } from "@/lib/formatacao";

export type PontoMensal = {
  mes: string;
  recebido: number;
  processado: number;
  vendido: number;
  faturamento: number;
  /** 0–100; `null` sem faturamento. */
  margemPercentual: number | null;
};

const KG = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function VolumesChart({ dados }: { dados: PontoMensal[] }) {
  return (
    <ChartContainer className="h-72 w-full">
      <BarChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="mes" />
        <YAxis tickFormatter={(v: number) => KG.format(v)} />
        <Tooltip formatter={(v) => `${KG.format(Number(v))} kg`} />
        <Legend />
        <Bar dataKey="recebido" fill="var(--chart-1)" name="Recebido" />
        <Bar dataKey="processado" fill="var(--chart-2)" name="Processado" />
        <Bar dataKey="vendido" fill="var(--chart-4)" name="Vendido" />
      </BarChart>
    </ChartContainer>
  );
}

export function FaturamentoMargemChart({ dados }: { dados: PontoMensal[] }) {
  return (
    <ChartContainer className="h-72 w-full">
      <ComposedChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="mes" />
        <YAxis yAxisId="valor" tickFormatter={(v: number) => KG.format(v)} />
        <YAxis yAxisId="pct" orientation="right" unit="%" />
        <Tooltip
          formatter={(v, nome) =>
            nome === "Margem %" ? `${KG.format(Number(v))}%` : formatarMoeda(Number(v))
          }
        />
        <Legend />
        <Bar yAxisId="valor" dataKey="faturamento" fill="var(--chart-2)" name="Faturamento" />
        <Line yAxisId="pct" dataKey="margemPercentual" stroke="var(--chart-5)" name="Margem %" connectNulls={false} />
      </ComposedChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 3: Página do mensal**

`src/app/(dashboard)/producao/relatorios/mensal/page.tsx`:

```tsx
import Link from "next/link";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { buscarRelatorioMensal } from "@/server/services/relatorioProducao/mensal";
import { blocosMensais, MESES } from "@/lib/producao/relatorios";
import { anoDaUrl, hojeDeCalendario } from "@/lib/producao/periodo";
import { ExportarLinks } from "../../../_shared/exportar-links";
import { formatarCelula, TabelaRelatorio } from "../_shared/tabela";
import { FaturamentoMargemChart, VolumesChart, type PontoMensal } from "./graficos";

type Parametros = { ano?: string };

const link = "text-primary underline-offset-4 hover:underline";

export default async function RelatorioMensalPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");

  const ano = anoDaUrl((await searchParams).ano, hojeDeCalendario());
  const r = await buscarRelatorioMensal(sessao, ano);
  const total = r.colunas[12];
  const vazio =
    total.recepcao.brutoKg === 0 &&
    total.processamento.quantidade === 0 &&
    total.vendas.pedidos === 0 &&
    r.polpaPorProduto.length === 0;
  const pontos: PontoMensal[] = r.colunas.slice(0, 12).map((c, m) => ({
    mes: MESES[m],
    recebido: c.recepcao.recebidoKg,
    processado: c.processamento.frutoKg,
    vendido: c.vendas.kgVendidos,
    faturamento: c.vendas.faturamento,
    margemPercentual: c.vendas.margemPercentual === null ? null : c.vendas.margemPercentual * 100,
  }));
  const nomeMes = (mes: number | null) => (mes === null ? "Total" : MESES[mes]);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Relatório mensal</h1>
        <p className="text-sm text-muted-foreground">
          Ano {ano}. Cancelados ficam fora; custo da polpa só de OPs encerradas.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href={`/producao/relatorios/mensal?ano=${ano - 1}`} className={link}>
          ◀ {ano - 1}
        </Link>
        <span className="font-medium">{ano}</span>
        <Link href={`/producao/relatorios/mensal?ano=${ano + 1}`} className={link}>
          {ano + 1} ▶
        </Link>
        <ExportarLinks baseHref="/producao/relatorios/mensal/export" queryString={`ano=${ano}`} />
      </div>

      {vazio ? (
        <p className="text-sm text-muted-foreground">Nada no ano.</p>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Recebido × processado × vendido (kg)</h2>
              <VolumesChart dados={pontos} />
            </section>
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Faturamento e margem</h2>
              <FaturamentoMargemChart dados={pontos} />
            </section>
          </div>

          {blocosMensais(r.frutas).map((bloco) => (
            <TabelaRelatorio
              key={bloco.titulo}
              titulo={bloco.titulo}
              colunas={[
                { rotulo: "Mês" },
                ...bloco.indicadores.map((i) => ({
                  rotulo: `${i.rotulo} (${i.unidade})`,
                  detalhe: i.fruta || undefined,
                  numero: true,
                })),
              ]}
              linhas={r.colunas.slice(0, 12).map((c) => ({
                chave: String(c.mes),
                celulas: [nomeMes(c.mes), ...bloco.indicadores.map((i) => formatarCelula(i.valor(c), i.unidade))],
              }))}
              total={["Total", ...bloco.indicadores.map((i) => formatarCelula(i.valor(total), i.unidade))]}
            />
          ))}

          <TabelaRelatorio
            titulo="Polpa produzida por produto (kg)"
            colunas={[{ rotulo: "Produto" }, ...MESES.map((m) => ({ rotulo: m, numero: true })), { rotulo: "Total", numero: true }]}
            linhas={r.polpaPorProduto.map((p) => ({
              chave: p.produtoId,
              celulas: [p.produto, ...p.meses.map((kg) => formatarCelula(kg, "kg")), formatarCelula(p.total, "kg")],
            }))}
            vazio="Nenhuma polpa produzida no ano."
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rota de exportação do mensal**

`src/app/(dashboard)/producao/relatorios/mensal/export/route.ts`:

```ts
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { buscarRelatorioMensal } from "@/server/services/relatorioProducao/mensal";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import { COLUNAS_MENSAL, linhasDoMensal, secoesDoMensal } from "@/server/export/relatorioMensal";
import { gerarPdfSecoes } from "@/lib/export/pdf";
import { responderArquivoPdf, responderExport } from "@/lib/export/responder";
import { anoDaUrl, hojeDeCalendario } from "@/lib/producao/periodo";

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const ano = anoDaUrl(url.searchParams.get("ano") ?? undefined, hojeDeCalendario());
  const relatorio = await buscarRelatorioMensal(sessao, ano);
  const nome = `relatorio-mensal-${ano}`;
  const cabecalho = () =>
    cabecalhoDoRelatorio(sessao, {
      titulo: "Relatório mensal de produção",
      filtros: [`Ano: ${ano}`],
      avisos: ["Cancelados ficam fora; OP aberta conta no volume; custo da polpa só de OPs encerradas."],
    });
  const formato = url.searchParams.get("formato");

  if (formato === "pdf") {
    return responderArquivoPdf(await gerarPdfSecoes(secoesDoMensal(relatorio), await cabecalho()), nome);
  }
  return responderExport(linhasDoMensal(relatorio), COLUNAS_MENSAL, {
    nomeArquivo: nome,
    nomeAba: "Mensal",
    formato,
    cabecalhoPdf: cabecalho,
  });
}
```

- [ ] **Step 5: Menu**

Em `src/app/(dashboard)/nav-items.ts`, logo depois da linha do Painel:

```ts
      { href: "/producao/relatorios/mensal", label: "Relatório mensal", acao: "producao:ler" },
      { href: "/producao/relatorios/vendas", label: "Relatório de vendas", acao: "producao:ler" },
```

(O link de vendas fica 404 até a Task 9; as duas vão no mesmo PR.)

- [ ] **Step 6: Tipagem e lint**

Run: `Set-Location D:\Projetos\nx-control-erp; npx tsc --noEmit; npx eslint "src/app/(dashboard)/producao/relatorios" "src/app/(dashboard)/nav-items.ts"`
Expected: sem erros. Se o `Tooltip formatter` do recharts reclamar do tipo, siga o padrão de tipagem de `src/app/(dashboard)/dashboard-executivo/*-chart.tsx`.

- [ ] **Step 7: Commit**

```powershell
git add "src/app/(dashboard)/producao/relatorios" "src/app/(dashboard)/nav-items.ts"
git commit -m @'
feat(producao): tela do relatório mensal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 9: Tela, gráficos e rota de exportação do relatório de vendas

**Files:**
- Create: `src/app/(dashboard)/producao/relatorios/vendas/graficos.tsx`
- Create: `src/app/(dashboard)/producao/relatorios/vendas/page.tsx`
- Create: `src/app/(dashboard)/producao/relatorios/vendas/export/route.ts`

**Interfaces:**
- Consumes: `buscarRelatorioVendas` (Task 6); `rotuloCanal` (Task 3); `TabelaRelatorio`, `formatarCelula` (Task 8); `atalhosDePeriodo` (Task 1); `linhasDeVendas`, `COLUNAS_VENDAS`, `secoesDeVendas` (Task 7); `BarraDeFiltros`, `periodoDaUrl`, `paraDataIso`.

- [ ] **Step 1: Gráficos de vendas**

`src/app/(dashboard)/producao/relatorios/vendas/graficos.tsx`:

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { formatarMoeda } from "@/lib/formatacao";

export type PontoBarra = { nome: string; faturamento: number };

const COMPACTO = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** Barras horizontais de faturamento (canal ou top 10 clientes). */
export function FaturamentoBarras({ dados, cor }: { dados: PontoBarra[]; cor: string }) {
  return (
    <ChartContainer className="h-72 w-full">
      <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tickFormatter={(v: number) => COMPACTO.format(v)} />
        <YAxis type="category" dataKey="nome" width={140} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(v) => formatarMoeda(Number(v))} />
        <Bar dataKey="faturamento" fill={cor} name="Faturamento" />
      </BarChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 2: Página de vendas**

`src/app/(dashboard)/producao/relatorios/vendas/page.tsx`:

```tsx
import Link from "next/link";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { buscarRelatorioVendas } from "@/server/services/relatorioProducao/vendas";
import { rotuloCanal } from "@/lib/producao/relatorios";
import { ROTULOS_FORMA_PAGAMENTO_VENDA } from "@/lib/schemas/enums";
import { formatarData } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso, periodoDaUrl } from "@/lib/producao/periodo";
import { ExportarLinks } from "../../../_shared/exportar-links";
import { BarraDeFiltros } from "../../_shared/barra-de-filtros";
import { atalhosDePeriodo } from "../../_shared/atalhos";
import { formatarCelula as f, TabelaRelatorio } from "../_shared/tabela";
import { FaturamentoBarras } from "./graficos";

type Parametros = { inicio?: string; fim?: string };

export default async function RelatorioVendasPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");

  const periodo = periodoDaUrl(await searchParams);
  const hoje = hojeDeCalendario();
  const r = await buscarRelatorioVendas(sessao, periodo, hoje);

  const inicio = paraDataIso(periodo.inicio);
  const fim = paraDataIso(periodo.fim);
  const query = new URLSearchParams({ inicio, fim }).toString();
  const t = r.total;
  const comVenda = t.faturamento > 0;
  const n = (rotulo: string, detalhe?: string) => ({ rotulo, detalhe, numero: true });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Relatório de vendas</h1>
        <p className="text-sm text-muted-foreground">
          {formatarData(periodo.inicio)} a {formatarData(periodo.fim)}. Pedidos cancelados ficam fora; a receber na data
          de hoje.
        </p>
      </div>

      <div className="space-y-3">
        <BarraDeFiltros
          valores={{ inicio, fim }}
          campos={[
            { tipo: "data", campo: "inicio", rotulo: "De" },
            { tipo: "data", campo: "fim", rotulo: "Até" },
          ]}
        />
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {atalhosDePeriodo(hoje).map((a) => (
            <Link
              key={a.rotulo}
              href={`/producao/relatorios/vendas?inicio=${a.inicio}&fim=${a.fim}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {a.rotulo}
            </Link>
          ))}
        </div>
        <ExportarLinks baseHref="/producao/relatorios/vendas/export" queryString={query} />
      </div>

      {comVenda ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Faturamento por canal</h2>
            <FaturamentoBarras
              cor="var(--chart-2)"
              dados={r.porCanal.map((c) => ({ nome: rotuloCanal(c.canal), faturamento: c.faturamento }))}
            />
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Top 10 clientes</h2>
            <FaturamentoBarras
              cor="var(--chart-1)"
              dados={r.porCliente
                .filter((c) => c.faturamento > 0)
                .slice(0, 10)
                .map((c) => ({ nome: c.cliente, faturamento: c.faturamento }))}
            />
          </section>
        </div>
      ) : null}

      <TabelaRelatorio
        titulo="Vendas por cliente"
        colunas={[
          { rotulo: "#" },
          { rotulo: "Cliente" },
          n("Kg"),
          n("Faturamento"),
          n("% do total"),
          n("Preço médio", "R$/kg"),
          n("Margem"),
          n("Margem %"),
          { rotulo: "Canal principal" },
          n("A receber", "hoje"),
        ]}
        linhas={r.porCliente.map((c, i) => ({
          chave: c.clienteId,
          celulas: [
            i + 1,
            c.cliente,
            f(c.kg, "kg"),
            f(c.faturamento, "R$"),
            f(c.percentual, "%"),
            f(c.precoMedio, "R$/kg"),
            f(c.margem, "R$"),
            f(c.margemPercentual, "%"),
            c.faturamento > 0 ? rotuloCanal(c.canal) : "—",
            f(c.aReceber, "R$"),
          ],
        }))}
        total={[
          "",
          "Total",
          f(t.kg, "kg"),
          f(t.faturamento, "R$"),
          f(t.percentual, "%"),
          f(t.precoMedio, "R$/kg"),
          f(t.margem, "R$"),
          f(t.margemPercentual, "%"),
          "",
          f(t.aReceber, "R$"),
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <TabelaRelatorio
          titulo="Por produto"
          colunas={[{ rotulo: "Produto" }, n("Kg"), n("Faturamento"), n("Preço médio", "R$/kg"), n("Custo médio", "R$/kg"), n("Margem %")]}
          linhas={r.porProduto.map((p) => ({
            chave: p.produtoId,
            celulas: [p.produto, f(p.kg, "kg"), f(p.faturamento, "R$"), f(p.precoMedio, "R$/kg"), f(p.custoMedio, "R$/kg"), f(p.margemPercentual, "%")],
          }))}
          total={["Total", f(t.kg, "kg"), f(t.faturamento, "R$"), f(t.precoMedio, "R$/kg"), f(t.custoMedio, "R$/kg"), f(t.margemPercentual, "%")]}
        />
        <TabelaRelatorio
          titulo="Por canal"
          colunas={[{ rotulo: "Canal" }, n("Kg"), n("Faturamento"), n("% do total")]}
          linhas={r.porCanal.map((c) => ({
            chave: c.canal ?? "sem-canal",
            celulas: [rotuloCanal(c.canal), f(c.kg, "kg"), f(c.faturamento, "R$"), f(c.percentual, "%")],
          }))}
          total={["Total", f(t.kg, "kg"), f(t.faturamento, "R$"), f(t.percentual, "%")]}
        />
        <TabelaRelatorio
          titulo="Por forma de pagamento"
          colunas={[{ rotulo: "Forma" }, n("Faturamento"), n("A receber", "hoje")]}
          linhas={r.porForma.map((p) => ({
            chave: p.formaPagamento,
            celulas: [ROTULOS_FORMA_PAGAMENTO_VENDA[p.formaPagamento], f(p.faturamento, "R$"), f(p.aReceber, "R$")],
          }))}
          total={["Total", f(t.faturamento, "R$"), f(t.aReceber, "R$")]}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rota de exportação de vendas**

`src/app/(dashboard)/producao/relatorios/vendas/export/route.ts`:

```ts
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { buscarRelatorioVendas } from "@/server/services/relatorioProducao/vendas";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import { COLUNAS_VENDAS, linhasDeVendas, secoesDeVendas } from "@/server/export/relatorioVendas";
import { gerarPdfSecoes } from "@/lib/export/pdf";
import { responderArquivoPdf, responderExport } from "@/lib/export/responder";
import { formatarData } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso, periodoDaUrl } from "@/lib/producao/periodo";

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const periodo = periodoDaUrl(Object.fromEntries(url.searchParams));
  const relatorio = await buscarRelatorioVendas(sessao, periodo, hojeDeCalendario());
  const nome = `relatorio-vendas-${paraDataIso(periodo.inicio)}`;
  const cabecalho = () =>
    cabecalhoDoRelatorio(sessao, {
      titulo: "Relatório de vendas",
      filtros: [`Período: ${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`],
      avisos: ["Pedidos cancelados ficam fora; a receber na data de hoje, de qualquer data de venda."],
    });
  const formato = url.searchParams.get("formato");

  if (formato === "pdf") {
    return responderArquivoPdf(await gerarPdfSecoes(secoesDeVendas(relatorio), await cabecalho()), nome);
  }
  return responderExport(linhasDeVendas(relatorio), COLUNAS_VENDAS, {
    nomeArquivo: nome,
    nomeAba: "Vendas",
    formato,
    cabecalhoPdf: cabecalho,
  });
}
```

- [ ] **Step 4: Tipagem e lint**

Run: `Set-Location D:\Projetos\nx-control-erp; npx tsc --noEmit; npx eslint "src/app/(dashboard)/producao/relatorios"`
Expected: sem erros.

- [ ] **Step 5: Commit**

```powershell
git add "src/app/(dashboard)/producao/relatorios/vendas"
git commit -m @'
feat(producao): tela do relatório de vendas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 10: Ajuda e documentos

**Files:**
- Modify: `content/ajuda/passo-a-passo.md` (nova seção 5.8 depois da 5.7)
- Modify: `docs/modulos/producao-estoque-vendas/08-duvidas-decisoes.md` (D-27, D-28, D-29 depois da D-26)
- Modify: `docs/modulos/producao-estoque-vendas/09-plano-de-entrega.md` (diagrama e linha da 7g2)
- Modify: `docs/fases/fase-7-producao-estoque-vendas.md` (conclusão da 7g2a)
- Modify: `docs/superpowers/specs/2026-11-12-fase-7g2a-relatorios-design.md` (status)

- [ ] **Step 1: Ajuda — seção 5.8**

Depois do último parágrafo da seção "5.7. Painel de produção" e antes de `## 6. Vendas`, insira:

```markdown
### 5.8. Relatórios de produção

Os relatórios seguem as mesmas regras do painel: cancelados ficam fora, OP aberta entra no volume, o custo da polpa usa só OPs encerradas e o a receber é a posição de hoje. Todos exportam PDF, CSV e Excel.

**Relatório mensal** (Produção → Relatório mensal): escolha o ano pelas setas. No topo, dois gráficos: recebido × processado × vendido (kg) e faturamento com a margem por mês. Abaixo, quatro tabelas com os doze meses e o total:

- **Recepção:** kg próprio e de terceiros de cada fruta (peso líquido) e o total recebido.
- **Processamento:** fruto processado, polpa produzida e rendimento de cada fruta, e o nº de OPs.
- **Vendas:** faturamento de fruto in natura, de polpa de cada fruta e o total, kg vendidos e margem bruta.
- **Custos:** custo da polpa por kg de cada fruta e quanto foi pago a terceiros pelo fruto.

Por último, a polpa produzida de cada produto mês a mês. A planilha (CSV/Excel) traz um indicador por linha, com as colunas Bloco, Indicador, Fruta, Mês e Valor, pronta para tabela dinâmica.

**Relatório de vendas** (Produção → Relatório de vendas): escolha o período (padrão: o mês atual). Os gráficos mostram o faturamento por canal e os dez clientes que mais compraram. As tabelas:

- **Vendas por cliente:** todos os clientes em ordem de faturamento, com kg, % do total, preço médio, margem, **canal principal** (o canal que mais faturou com o cliente no período) e o **a receber de hoje**. Clientes sem compra no período mas com saldo em aberto aparecem no fim, para a cobrança.
- **Por produto:** kg, faturamento, preço médio, custo médio e margem.
- **Por canal:** kg, faturamento e participação; pedidos sem canal aparecem como "Sem canal".
- **Por forma de pagamento:** faturamento do período e o que falta receber hoje.
```

- [ ] **Step 2: Doc 08 — decisões**

Depois da linha da D-26 na tabela de decisões (mesmo formato de colunas):

```markdown
| D-27 | Tamanho da 7g2 | Quatro relatórios e gráficos numa entrega só? | Dividir: 7g2a mensal + vendas; 7g2b origem + processamento. | 7g2 | **Duas entregas** (2026-11-12). |
| D-28 | Onde ficam os relatórios | Menu de Produção, de Vendas ou uma tela com abas? | `/producao/relatorios/<nome>`, uma tela por relatório, no grupo Produção, com `producao:ler`. | 7g2 | **Grupo Produção** (2026-11-12). |
| D-29 | Contagem dos relatórios | Os relatórios contam como o painel? | Mesmas regras da D-26; um mês do mensal bate com o painel daquele mês e o a receber do relatório de vendas bate com o do painel. Canal principal do cliente = canal com mais faturamento no período. | 7g2 | **Regras do painel** (2026-11-12). |
```

Antes de colar, confira o cabeçalho da tabela do doc 08 e ajuste o número de colunas se for diferente.

- [ ] **Step 3: Doc 09 — plano de entrega**

No diagrama, troque `7g2 Relatórios` por `7g2a Mensal e vendas ─► 7g2b Origem e processamento`. Na tabela, troque a linha da 7g2 por:

```markdown
| **7g2a Mensal e vendas** | Relatório mensal (recepção, processamento, vendas e custos por mês, polpa por produto × mês) e relatório de vendas (por cliente, produto, canal e forma), com gráficos e exports. | 7g1 | D-27, D-28, D-29 | M |
| **7g2b Origem e processamento** | Relatório de origem da matéria-prima e de processamento, com exports. | 7g2a | — | M |
```

- [ ] **Step 4: Fase 7 e spec**

Em `docs/fases/fase-7-producao-estoque-vendas.md`, troque "Próximo: 7g2 (relatórios…" pelo resumo da conclusão, no mesmo estilo do parágrafo da 7g1:

```markdown
7g2 dividida em duas entregas (D-27). 7g2a (relatório mensal e de vendas) concluída em <data da conclusão>: telas em `/producao/relatorios/mensal` e `/producao/relatorios/vendas` (D-28), com gráficos e exportação em PDF, CSV e Excel; mesmas regras de contagem do painel (D-29), com um mês do mensal batendo com o painel daquele mês. Próximo: 7g2b (origem e processamento).
```

Ajuste também a menção "7g2 Relatórios" da linha 60 para "7g2a Mensal e vendas · 7g2b Origem e processamento". Na spec, troque `Status: desenho aprovado` por `Status: implementada (<data>)` e acrescente uma linha "Ajustes na implementação:" se algo mudou.

- [ ] **Step 5: Commit**

```powershell
git add content/ajuda/passo-a-passo.md docs/modulos/producao-estoque-vendas docs/fases/fase-7-producao-estoque-vendas.md docs/superpowers/specs/2026-11-12-fase-7g2a-relatorios-design.md
git commit -m @'
docs(producao): ajuda e decisões dos relatórios (7g2a)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 11: Verificação final e conferência no navegador

**Files:** nenhum arquivo novo (só ajustes que a conferência revelar)

- [ ] **Step 1: Suíte, tipagem e lint**

Run:
```powershell
Set-Location D:\Projetos\nx-control-erp
npx vitest run src/lib/producao src/server/services/relatorioProducao src/server/export "src/app/(dashboard)/producao"
npx tsc --noEmit
npm run lint
```
Expected: tudo PASS, sem erros. Depois rode `npx vitest run` completo e registre o resultado (falha de outra fase que já existia em `staging` deve ser relatada, não escondida).

- [ ] **Step 2: Montar o cenário no banco de dev**

Escreva um script avulso em `scripts/` (não commitar) que use `criarFixtureProducao`, `criarCatalogoDeTeste` e `criarCadastrosDeVenda` e repita o cenário dos testes de mensal e vendas numa empresa de teste. Dê acesso ao admin com `usuarioEmpresa` (perfil ADMINISTRADOR) e imprima os ids para a limpeza. Rode com:
`node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/<nome>.ts`

- [ ] **Step 3: Conferir no navegador**

Com `npm run dev` (se a porta 3000 estiver presa, mate o PID antigo), faça login (admin@nx-control-erp.local / TrocarSenha123!) e escolha a empresa de teste. Pelo Playwright, no desktop e em 390px:
- Menu: "Relatório mensal" e "Relatório de vendas" abaixo de "Painel".
- **Mensal 2026:** os gráficos aparecem; as quatro tabelas batem com os números do teste (out: recebido 126, pago 108; nov: OPs 1); ◀/▶ trocam o ano; 2025 mostra "Nada no ano."; outubro bate com o painel filtrado em outubro.
- **Vendas nov/2026:** a ordem dos clientes, "Cliente antigo" no fim com 300 a receber, "Sem canal", o total a receber igual ao do painel; os atalhos de período funcionam.
- **Exportação:** os três formatos de cada relatório baixam, e o PDF tem as seções esperadas.
- **Console** sem erros (lembrete: a captura de tela injeta `caret-color` e gera um falso erro de hidratação; confira o console antes de fotografar).
- No celular, as tabelas rolam dentro do próprio contêiner, sem rolagem horizontal da página.

- [ ] **Step 4: Limpar**

Apague a empresa de teste (o `limpar()` da fixture), o script avulso e a pasta `.playwright-mcp/`. Confira `git status` limpo, salvo os ajustes intencionais.

- [ ] **Step 5: Commit dos ajustes (se houver) e relatório final**

Se a conferência pediu ajustes, faça o commit com mensagem descritiva. Relatório final ao usuário: o que foi entregue, decisões D-27 a D-29, ajustes em relação à spec, pendências (7g2b; D-06 e D-10 seguem no backlog) e o lembrete de que push, PR e merge ficam com o usuário.
