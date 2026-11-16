# Venda a prazo em parcelas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o pedido de venda `A_PRAZO` passa a gerar o título a receber com N parcelas a partir de prazos em dias (`28/56`), com ajuste de datas e valores antes de salvar.

**Architecture:** regras puras em `src/lib/producao/venda.ts` (interpretar prazos, gerar parcelas, validar, montar a condição), usadas pelo formulário e pelo serviço. O pedido deixa de ter `vencimento` e guarda só `condicaoPagamento` (texto derivado das datas); datas e valores vivem só nas parcelas do título.

**Tech Stack:** Next.js (App Router, server actions), Prisma/Postgres, Zod, Vitest, pdf-lib.

**Spec:** `docs/superpowers/specs/2026-11-16-venda-prazo-parcelas-design.md`

## Global Constraints

- Até **60** parcelas (`MAX_PARCELAS_VENDA = 60`); mínimo 1.
- Divisão igual, **centavos na última parcela**.
- Soma das parcelas **igual** ao total do pedido recalculado no servidor (comparar em centavos).
- Vencimentos: nenhum antes da data do pedido; estritamente crescentes.
- `condicaoPagamento` = dias de cada vencimento desde a data do pedido, separados por `/` (ex.: `"28/60"`), derivado das datas finais.
- À vista: sem mudança (1 parcela, baixa automática); `condicaoPagamento` nulo.
- Ambiente (memória do projeto): rodar Vitest pelo **PowerShell** (`Set-Location D:\Projetos\nx-control-erp; npx vitest run <arquivo>`); depois de migration rodar `npx prisma generate`; **nunca rodar Prettier**; editar com a ferramenta Edit (arquivos CRLF); linhas até ~120.
- Execução inline, sem subagentes (preferência do usuário); commits frequentes na branch `feat/venda-prazo-parcelas`.

---

## Mapa de arquivos

| Arquivo | Mudança |
|---|---|
| `src/lib/producao/venda.ts` (+ `.test.ts`) | `MAX_PARCELAS_VENDA`, `interpretarPrazos`, `gerarParcelasPorPrazos`, `condicaoDasParcelas`, `validarParcelasVenda` |
| `prisma/schema.prisma` + migration nova | `vencimento` sai, `condicaoPagamento` entra (com backfill) |
| `src/lib/schemas/pedidoVenda.ts` | `vencimento` → `parcelas` |
| `src/server/services/pedidoVenda.ts` (+ `.test.ts`) | cria N parcelas, valida, grava condição, auditoria |
| `src/server/services/producaoTestFixtures.ts` | helper `parcelaUnicaAPrazo` |
| `entrega.test.ts`, `ordemProducao.test.ts`, `rastreabilidade.test.ts` | `vencimento` → `parcelas` |
| `src/lib/schemas/enums.ts` | `ROTULOS_STATUS_PARCELA` |
| `src/app/(dashboard)/vendas/pedidos/novo/pedido-form.tsx` | campo Prazos + tabela de parcelas |
| `src/app/(dashboard)/vendas/pedidos/[numero]/page.tsx` | "Condição"; parcelas com nº e status |
| `src/lib/export/recibo.ts` (+ `.test.ts`), `.../[numero]/recibo/route.ts` | condição e parcelas no PDF |
| docs | ajuda 6.1, doc 04/06/08 do módulo, fase 7, backlog, status da spec |

---

### Task 1: Regras puras das parcelas

**Files:**
- Modify: `src/lib/producao/venda.ts`
- Test: `src/lib/producao/venda.test.ts`

**Interfaces:**
- Produces:
  - `MAX_PARCELAS_VENDA: 60`
  - `interpretarPrazos(texto: string): { ok: true; prazos: number[] } | { ok: false; erro: string }`
  - `type ParcelaVenda = { dataVencimento: Date; valor: number }`
  - `gerarParcelasPorPrazos(data: Date, total: number, prazos: number[]): ParcelaVenda[]`
  - `condicaoDasParcelas(data: Date, vencimentos: Date[]): string`
  - `validarParcelasVenda(data: Date, total: number, parcelas: ParcelaVenda[]): string | null` (mensagem de erro ou `null`)

- [ ] **Step 1: Testes que falham** — acrescentar ao import de `venda.test.ts` os nomes novos e, no fim do arquivo:

```ts
describe("interpretarPrazos", () => {
  test("dias separados por barra, com espaços", () => {
    expect(interpretarPrazos(" 28 / 56 ")).toEqual({ ok: true, prazos: [28, 56] });
  });
  test("zero é vencimento no dia do pedido", () => {
    expect(interpretarPrazos("0/30")).toEqual({ ok: true, prazos: [0, 30] });
  });
  test("vazio", () => {
    expect(interpretarPrazos("  ")).toEqual({ ok: false, erro: "Informe os prazos" });
  });
  test("não numérico, negativo ou decimal", () => {
    expect(interpretarPrazos("28/abc")).toEqual({ ok: false, erro: "Prazo inválido: abc" });
    expect(interpretarPrazos("-5")).toEqual({ ok: false, erro: "Prazo inválido: -5" });
    expect(interpretarPrazos("10.5")).toEqual({ ok: false, erro: "Prazo inválido: 10.5" });
    expect(interpretarPrazos("28//56")).toEqual({ ok: false, erro: "Prazo inválido: (vazio)" });
  });
  test("fora de ordem ou repetido", () => {
    expect(interpretarPrazos("56/28")).toEqual({ ok: false, erro: "Os prazos devem ser crescentes" });
    expect(interpretarPrazos("28/28")).toEqual({ ok: false, erro: "Os prazos devem ser crescentes" });
  });
  test("até 60 parcelas", () => {
    const sessenta = Array.from({ length: 60 }, (_, i) => (i + 1) * 30).join("/");
    expect(interpretarPrazos(sessenta)).toMatchObject({ ok: true });
    expect(interpretarPrazos(`${sessenta}/9999`)).toEqual({ ok: false, erro: "No máximo 60 parcelas" });
  });
});

describe("gerarParcelasPorPrazos", () => {
  test("divide igual e a última leva os centavos", () => {
    const parcelas = gerarParcelasPorPrazos(d("2026-11-10"), 100, [30, 60, 90]);
    expect(parcelas.map((p) => p.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(parcelas.map((p) => p.dataVencimento.toISOString().slice(0, 10))).toEqual([
      "2026-12-10",
      "2027-01-09",
      "2027-02-08",
    ]);
  });
  test("uma parcela leva o total; prazo 0 vence na data", () => {
    expect(gerarParcelasPorPrazos(d("2026-11-10"), 50, [0])).toEqual([{ dataVencimento: d("2026-11-10"), valor: 50 }]);
  });
});

describe("condicaoDasParcelas", () => {
  test("dias desde a data do pedido", () => {
    expect(condicaoDasParcelas(d("2026-11-10"), [d("2026-12-08"), d("2027-01-09")])).toBe("28/60");
  });
});

describe("validarParcelasVenda", () => {
  const p = (iso: string, valor: number) => ({ dataVencimento: d(iso), valor });
  test("válidas", () => {
    expect(validarParcelasVenda(d("2026-11-10"), 100, [p("2026-12-10", 33.33), p("2027-01-09", 66.67)])).toBeNull();
  });
  test("sem parcelas ou acima do limite", () => {
    expect(validarParcelasVenda(d("2026-11-10"), 100, [])).toBe("Informe os prazos");
    const muitas = Array.from({ length: 61 }, (_, i) => ({
      dataVencimento: new Date(d("2026-11-10").getTime() + i * 86_400_000),
      valor: 1,
    }));
    expect(validarParcelasVenda(d("2026-11-10"), 61, muitas)).toBe("No máximo 60 parcelas");
  });
  test("vencimento antes da data do pedido", () => {
    expect(validarParcelasVenda(d("2026-11-10"), 50, [p("2026-11-09", 50)])).toBe(
      "O vencimento não pode ser antes da data do pedido",
    );
  });
  test("datas fora de ordem ou repetidas", () => {
    expect(validarParcelasVenda(d("2026-11-10"), 100, [p("2026-12-10", 50), p("2026-12-10", 50)])).toBe(
      "Os vencimentos devem ser crescentes",
    );
  });
  test("valor zero ou negativo", () => {
    expect(validarParcelasVenda(d("2026-11-10"), 50, [p("2026-12-10", 50), p("2027-01-10", 0)])).toBe(
      "O valor de cada parcela deve ser maior que zero",
    );
  });
  test("vencimento ou valor em branco", () => {
    expect(validarParcelasVenda(d("2026-11-10"), 50, [p("2026-12-10", NaN)])).toBe(
      "Preencha vencimento e valor de cada parcela",
    );
    expect(validarParcelasVenda(d("2026-11-10"), 50, [{ dataVencimento: new Date(NaN), valor: 50 }])).toBe(
      "Preencha vencimento e valor de cada parcela",
    );
  });
  test("soma diferente do total", () => {
    // formatarMoeda usa espaço não separável depois do "R$": montar a mensagem com ele.
    expect(validarParcelasVenda(d("2026-11-10"), 100, [p("2026-12-10", 50), p("2027-01-10", 49.99)])).toBe(
      `A soma das parcelas (${formatarMoeda(99.99)}) difere do total do pedido (${formatarMoeda(100)})`,
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/lib/producao/venda.test.ts` → FAIL (funções não exportadas).

- [ ] **Step 3: Implementar** — em `venda.ts` (e no teste), importar `formatarMoeda` de `@/lib/formatacao` e acrescentar no fim:

```ts
/** Limite de parcelas da venda a prazo: só protege contra erro de digitação. */
export const MAX_PARCELAS_VENDA = 60;

export type ParcelaVenda = { dataVencimento: Date; valor: number };

const centavos = (valor: number) => Math.round(valor * 100);

/** `28/56` → [28, 56]: dias inteiros ≥ 0, estritamente crescentes, de 1 a 60. */
export function interpretarPrazos(texto: string): { ok: true; prazos: number[] } | { ok: false; erro: string } {
  if (texto.trim() === "") return { ok: false, erro: "Informe os prazos" };
  const partes = texto.split("/").map((parte) => parte.trim());
  const prazos: number[] = [];
  for (const parte of partes) {
    if (!/^\d+$/.test(parte)) return { ok: false, erro: `Prazo inválido: ${parte || "(vazio)"}` };
    prazos.push(Number(parte));
  }
  if (prazos.length > MAX_PARCELAS_VENDA) return { ok: false, erro: `No máximo ${MAX_PARCELAS_VENDA} parcelas` };
  if (prazos.some((prazo, i) => i > 0 && prazo <= prazos[i - 1])) {
    return { ok: false, erro: "Os prazos devem ser crescentes" };
  }
  return { ok: true, prazos };
}

/** Vencimento = data + dias; valor dividido igual e a última parcela leva a diferença de centavos. */
export function gerarParcelasPorPrazos(data: Date, total: number, prazos: number[]): ParcelaVenda[] {
  const totalCentavos = centavos(total);
  const parte = Math.floor(totalCentavos / prazos.length);
  return prazos.map((dias, i) => ({
    dataVencimento: new Date(data.getTime() + dias * UM_DIA_MS),
    valor: (i === prazos.length - 1 ? totalCentavos - parte * (prazos.length - 1) : parte) / 100,
  }));
}

/** Condição gravada no pedido: dias de cada vencimento desde a data do pedido (`28/56`). */
export function condicaoDasParcelas(data: Date, vencimentos: Date[]): string {
  return vencimentos.map((vencimento) => Math.round((vencimento.getTime() - data.getTime()) / UM_DIA_MS)).join("/");
}

/** Regras das parcelas da venda a prazo; devolve a mensagem do primeiro erro ou `null`. */
export function validarParcelasVenda(data: Date, total: number, parcelas: ParcelaVenda[]): string | null {
  if (parcelas.length === 0) return "Informe os prazos";
  if (parcelas.length > MAX_PARCELAS_VENDA) return `No máximo ${MAX_PARCELAS_VENDA} parcelas`;
  if (parcelas.some((p) => !Number.isFinite(p.valor) || Number.isNaN(p.dataVencimento.getTime()))) {
    return "Preencha vencimento e valor de cada parcela";
  }
  if (parcelas.some((p) => p.dataVencimento.getTime() < data.getTime())) {
    return "O vencimento não pode ser antes da data do pedido";
  }
  if (parcelas.some((p, i) => i > 0 && p.dataVencimento.getTime() <= parcelas[i - 1].dataVencimento.getTime())) {
    return "Os vencimentos devem ser crescentes";
  }
  if (parcelas.some((p) => centavos(p.valor) <= 0)) return "O valor de cada parcela deve ser maior que zero";
  const soma = parcelas.reduce((acc, p) => acc + centavos(p.valor), 0);
  if (soma !== centavos(total)) {
    return `A soma das parcelas (${formatarMoeda(soma / 100)}) difere do total do pedido (${formatarMoeda(total)})`;
  }
  return null;
}
```

Observação: `Math.floor` com total positivo; total 0 não chega aqui (o pedido exige itens com quantidade e preço positivos).

- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/producao/venda.ts src/lib/producao/venda.test.ts
git commit -m "feat(vendas): regras puras das parcelas da venda a prazo"
```

---

### Task 2: Migration — `vencimento` sai, `condicaoPagamento` entra

**Files:**
- Modify: `prisma/schema.prisma` (model `PedidoVenda`, linhas ~1186-1187)
- Create: `prisma/migrations/20261116220000_venda_prazo_parcelas/migration.sql`

- [ ] **Step 1: Schema** — trocar

```prisma
  /// Só A_PRAZO.
  vencimento            DateTime?
```

por

```prisma
  /// Só A_PRAZO: dias de cada vencimento desde a data do pedido ("28/56"), no momento da venda.
  condicaoPagamento     String?
```

- [ ] **Step 2: Migration escrita à mão** (o `migrate dev` pediria confirmação de perda de dados em modo não interativo; o backfill precisa vir antes do DROP):

```sql
-- Condição da venda a prazo; os vencimentos ficam só nas parcelas do título.
ALTER TABLE "pedidos_venda" ADD COLUMN "condicaoPagamento" TEXT;

-- Pedidos a prazo já gravados: a condição é o prazo único que eles tinham.
UPDATE "pedidos_venda"
SET "condicaoPagamento" = ("vencimento"::date - "data"::date)::text
WHERE "formaPagamento" = 'A_PRAZO' AND "vencimento" IS NOT NULL;

ALTER TABLE "pedidos_venda" DROP COLUMN "vencimento";
```

- [ ] **Step 3: Aplicar e gerar o client** — `npx prisma migrate dev` (aplica a pendente e confere que não há drift; não deve criar outra migration) e depois `npx prisma generate`. Esperado: "Already in sync" / nenhuma migration nova criada além da nossa.

- [ ] **Step 4: Conferir o backfill no banco de dev** —

```bash
echo 'select numero, "formaPagamento", "condicaoPagamento" from pedidos_venda order by "criadoEm" desc limit 5;' | docker exec -i nx-control-erp-db psql -U postgres -d nx_control_erp
```

Esperado: a prazo com número de dias, à vista com nulo (pode não haver pedidos no dev; tudo bem).

- [ ] **Step 5: Atualizar docs do modelo** — `docs/modulos/producao-estoque-vendas/04-modelo-de-dados.md`, no `model PedidoVenda`, depois de `formaPagamento`, acrescentar a linha:

```
  condicaoPagamento  String?             // só A_PRAZO: "28/56" (dias); vencimentos nas parcelas do título
```

e em `06-integracao-financeiro.md` linha 38 trocar a célula por: `à vista: 1 parcela, vencimento = data do pedido. A prazo: uma parcela por prazo informado (ex.: 28/56 dias), até 60, valor dividido igual com os centavos na última; datas e valores podem ser ajustados no pedido, e a soma tem que bater com o total (D-12).`

- [ ] **Step 6: Commit** (o código ainda não compila; o commit seguinte conserta — tudo bem na branch; se preferir, juntar com a Task 3)

```bash
git add prisma/schema.prisma prisma/migrations/20261116220000_venda_prazo_parcelas docs/modulos/producao-estoque-vendas/04-modelo-de-dados.md docs/modulos/producao-estoque-vendas/06-integracao-financeiro.md
git commit -m "feat(vendas): condição de pagamento no pedido no lugar do vencimento"
```

---

### Task 3: Schema do formulário e serviço criam N parcelas

**Files:**
- Modify: `src/lib/schemas/pedidoVenda.ts`
- Modify: `src/server/services/pedidoVenda.ts:51-199` e auditoria
- Modify: `src/server/services/producaoTestFixtures.ts` (helper)
- Modify tests: `pedidoVenda.test.ts`, `entrega.test.ts`, `ordemProducao.test.ts`, `rastreabilidade.test.ts`

**Interfaces:**
- Consumes: `validarParcelasVenda`, `condicaoDasParcelas`, `MAX_PARCELAS_VENDA` (Task 1); coluna `condicaoPagamento` (Task 2).
- Produces: `PedidoVendaFormValues.parcelas: { dataVencimento: Date; valor: number }[]` (campo de formulário `parcelas` = JSON); `parcelaUnicaAPrazo(itens, vencimento?)` nas fixtures.

- [ ] **Step 1: Helper de teste** — no fim de `producaoTestFixtures.ts`:

```ts
/** Campo `parcelas` do formulário para um pedido a prazo de uma parcela com o total dos itens. */
export function parcelaUnicaAPrazo(itens: { quantidadeKg: number; precoKg: number }[], vencimento = "2026-12-10") {
  const { valor } = calcularPedido(itens.map((item) => ({ ...item, custoKg: 0 })));
  return JSON.stringify([{ dataVencimento: vencimento, valor }]);
}
```

(importar `calcularPedido` de `@/lib/producao/venda` se ainda não estiver importado.)

- [ ] **Step 2: Ajustar os testes existentes** —
  - `pedidoVenda.test.ts`: no helper `pedido` (linha ~50), trocar `vencimento: "2026-12-10",` por `parcelas: parcelaUnicaAPrazo(itens as { quantidadeKg: number; precoKg: number }[]),` (antes do `...extra`, para um teste poder sobrescrever). Linha ~115: remover `vencimento: ""`. Linha ~136: `expect(gravado.vencimento).toBeNull()` → `expect(gravado.condicaoPagamento).toBeNull()`. No primeiro teste (linha ~106), acrescentar `expect(gravado.condicaoPagamento).toBe("30");`.
  - `entrega.test.ts:36`: `vencimento: "2026-12-10",` → `parcelas: parcelaUnicaAPrazo([{ quantidadeKg: 1, precoKg: 5 }]),`
  - `ordemProducao.test.ts:515`: → `parcelas: parcelaUnicaAPrazo([{ quantidadeKg: 5, precoKg: 10 }], "2026-12-13"),`
  - `ordemProducao.test.ts:704`: → `parcelas: parcelaUnicaAPrazo([{ quantidadeKg: kg, precoKg: 10 }], "2026-12-14"),`
  - `rastreabilidade.test.ts:69`: → `parcelas: parcelaUnicaAPrazo([{ quantidadeKg: kg, precoKg: 10 }]),`
  - Importar `parcelaUnicaAPrazo` de `./producaoTestFixtures` em cada um.

- [ ] **Step 3: Testes novos que falham** — em `pedidoVenda.test.ts`, depois do teste "Pix: …", um `describe("parcelas a prazo", …)`:

```ts
  describe("parcelas a prazo", () => {
    const itens = (loteId: string) => [{ loteId, quantidadeKg: 10, precoKg: 10 }]; // total 100
    const comParcelas = (loteId: string, parcelas: { dataVencimento: string; valor: number }[]) =>
      pedido(itens(loteId), { parcelas: JSON.stringify(parcelas) });

    test("cria uma parcela por prazo e grava a condição pelas datas", async () => {
      const lote = await novoLote();
      const r = await criarPedido(
        fx.sessao("VENDAS"),
        comParcelas(lote.id, [
          { dataVencimento: "2026-12-08", valor: 33.33 },
          { dataVencimento: "2027-01-09", valor: 33.33 },
          { dataVencimento: "2027-02-08", valor: 33.34 },
        ]),
      );
      const titulo = await tituloDo(r.pedidoId);
      const parcelas = [...titulo.parcelas].sort((a, b) => a.numero - b.numero);
      expect(parcelas.map((p) => [p.numero, p.dataVencimento.toISOString().slice(0, 10), Number(p.valorOriginal)])).toEqual([
        [1, "2026-12-08", 33.33],
        [2, "2027-01-09", 33.33],
        [3, "2027-02-08", 33.34],
      ]);
      const gravado = await prisma.pedidoVenda.findUniqueOrThrow({ where: { id: r.pedidoId } });
      expect(gravado.condicaoPagamento).toBe("28/60/90");
      const auditoria = await prisma.auditLog.findFirstOrThrow({
        where: { entidade: "PedidoVenda", entidadeId: r.pedidoId, acao: "CRIAR" },
      });
      expect(auditoria.novo).toMatchObject({ condicaoPagamento: "28/60/90" });
    });

    test("recusa soma diferente do total, data antes do pedido e datas fora de ordem", async () => {
      const lote = await novoLote();
      await expect(
        criarPedido(fx.sessao("VENDAS"), comParcelas(lote.id, [{ dataVencimento: "2026-12-10", valor: 99.99 }])),
      ).rejects.toThrow("A soma das parcelas");
      await expect(
        criarPedido(fx.sessao("VENDAS"), comParcelas(lote.id, [{ dataVencimento: "2026-11-09", valor: 100 }])),
      ).rejects.toThrow("O vencimento não pode ser antes da data do pedido");
      await expect(
        criarPedido(
          fx.sessao("VENDAS"),
          comParcelas(lote.id, [
            { dataVencimento: "2027-01-10", valor: 50 },
            { dataVencimento: "2026-12-10", valor: 50 },
          ]),
        ),
      ).rejects.toThrow("Os vencimentos devem ser crescentes");
      expect(await saldo(lote.id)).toBe(100);
    });

    test("a prazo sem parcelas é recusado pelo schema", () => {
      expect(() => pedido([{ loteId: "x", quantidadeKg: 1, precoKg: 1 }], { parcelas: "[]" })).toThrow(
        "Informe os prazos",
      );
    });

    test("cancelar cancela todas as parcelas", async () => {
      const lote = await novoLote();
      const r = await criarPedido(
        fx.sessao("VENDAS"),
        comParcelas(lote.id, [
          { dataVencimento: "2026-12-10", valor: 50 },
          { dataVencimento: "2027-01-10", valor: 50 },
        ]),
      );
      await cancelarPedido(fx.sessao("FINANCEIRO"), r.pedidoId, "Cliente desistiu");
      expect((await tituloDo(r.pedidoId)).parcelas.map((p) => p.status)).toEqual(["CANCELADO", "CANCELADO"]);
    });
  });
```

(Conferir o nome do modelo de auditoria no schema — `auditLog` — e o campo `novo`; ajustar se diferente.)

- [ ] **Step 4: Rodar e ver falhar** — `npx vitest run src/server/services/pedidoVenda.test.ts` → FAIL (schema não conhece `parcelas`; tipo `vencimento` sumiu do client).

- [ ] **Step 5: Schema** — em `src/lib/schemas/pedidoVenda.ts`:

```ts
import { MAX_PARCELAS_VENDA } from "@/lib/producao/venda";

/** Parcelas da venda a prazo, em JSON num campo escondido (como os itens). */
const parcelasDoFormulario = z.preprocess(
  (v) => {
    if (v === undefined || v === null || v === "") return [];
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return [];
    }
  },
  z.array(
    z.object({
      dataVencimento: z.coerce.date({ message: "Informe o vencimento de cada parcela" }),
      valor: z.coerce.number({ message: "Informe o valor de cada parcela" }),
    }),
  ),
);
```

No objeto: trocar `vencimento: dataOpcional,` por `parcelas: parcelasDoFormulario,` e o `superRefine` por:

```ts
  .superRefine((dados, ctx) => {
    if (dados.formaPagamento !== "A_PRAZO") return;
    if (dados.parcelas.length === 0) {
      ctx.addIssue({ code: "custom", path: ["parcelas"], message: "Informe os prazos" });
    } else if (dados.parcelas.length > MAX_PARCELAS_VENDA) {
      ctx.addIssue({ code: "custom", path: ["parcelas"], message: `No máximo ${MAX_PARCELAS_VENDA} parcelas` });
    }
  });
```

(`src/lib/producao/venda.ts` importa só tipos do Prisma e `arredondar`/`formatacao` — pode ser importado pelo schema sem puxar código de servidor.)

- [ ] **Step 6: Serviço** — em `criarPedido`:
  - Importar `condicaoDasParcelas` e `validarParcelasVenda` de `@/lib/producao/venda`.
  - Depois de `const totais = calcularPedido(itens);`:

```ts
  // A prazo: as parcelas vêm prontas do formulário (o vendedor pode ter ajustado).
  const parcelasAPrazo = aVista ? [] : dados.parcelas;
  if (!aVista) {
    const erroParcelas = validarParcelasVenda(dados.data, totais.valor, parcelasAPrazo);
    if (erroParcelas) throw new Error(erroParcelas);
  }
  const condicaoPagamento = aVista
    ? null
    : condicaoDasParcelas(dados.data, parcelasAPrazo.map((p) => p.dataVencimento));
```

  - No `tx.pedidoVenda.create`: trocar `vencimento: aVista ? null : (dados.vencimento ?? null),` por `condicaoPagamento,`.
  - No `criarTituloInterno`, `parcelas:` passa a ser:

```ts
            parcelas: aVista
              ? [{ numero: 1, dataVencimento: dados.data, valorOriginal: totais.valor }]
              : parcelasAPrazo.map((parcela, i) => ({
                  numero: i + 1,
                  dataVencimento: parcela.dataVencimento,
                  valorOriginal: parcela.valor,
                })),
```

  - Na auditoria `novo`, depois de `formaPagamento`, acrescentar:

```ts
              condicaoPagamento,
              parcelas: aVista
                ? undefined
                : parcelasAPrazo.map((p) => ({ dataVencimento: p.dataVencimento, valor: p.valor })),
```

- [ ] **Step 7: Rodar e ver passar** — `npx vitest run src/server/services/pedidoVenda.test.ts src/server/services/entrega.test.ts src/server/services/ordemProducao.test.ts src/server/services/rastreabilidade.test.ts` → PASS. Depois `npx tsc --noEmit` e `npx eslint src/lib src/server` — sem erros (os erros de tipo da tela ficam para as Tasks 4-5; se `tsc` acusar `pedido.vencimento` em `page.tsx`/`pedido-form.tsx`, seguir para as próximas tasks antes de commitar ou commitar mesmo assim e anotar).

- [ ] **Step 8: Commit**

```bash
git add src/lib/schemas/pedidoVenda.ts src/server/services/pedidoVenda.ts src/server/services/*.test.ts src/server/services/producaoTestFixtures.ts
git commit -m "feat(vendas): pedido a prazo cria uma parcela por prazo"
```

---

### Task 4: Formulário do novo pedido — prazos e tabela de parcelas

**Files:**
- Modify: `src/app/(dashboard)/vendas/pedidos/novo/pedido-form.tsx`

**Interfaces:**
- Consumes: `interpretarPrazos`, `gerarParcelasPorPrazos`, `validarParcelasVenda` (Task 1); campo `parcelas` (Task 3).

- [ ] **Step 1: Imports e estado** — trocar o import de `@/lib/producao/venda` por `calcularItem, calcularPedido, gerarParcelasPorPrazos, interpretarPrazos, validarParcelasVenda`; importar `paraDataIso` de `@/lib/producao/periodo`. Trocar `const [vencimento, setVencimento] = useState("");` por:

```tsx
  const [prazos, setPrazos] = useState("");
  // Ajuste manual das parcelas; vale só enquanto prazos, data e total forem os mesmos de quando foi feito.
  const [ajuste, setAjuste] = useState<{ chave: string; linhas: ParcelaForm[] } | null>(null);
```

e, junto dos tipos do arquivo:

```tsx
type ParcelaForm = { dataVencimento: string; valor: string };
const dataDeCalendario = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
```

- [ ] **Step 2: Parcelas derivadas** — depois do cálculo de `totais`:

```tsx
  const leituraPrazos = interpretarPrazos(prazos);
  const chaveParcelas = `${prazos}|${data}|${totais.valor}`;
  const geradas: ParcelaForm[] =
    !aVista && leituraPrazos.ok && totais.valor > 0 && data
      ? gerarParcelasPorPrazos(dataDeCalendario(data), totais.valor, leituraPrazos.prazos).map((p) => ({
          dataVencimento: paraDataIso(p.dataVencimento),
          valor: p.valor.toFixed(2),
        }))
      : [];
  const parcelas = ajuste?.chave === chaveParcelas ? ajuste.linhas : geradas;
  const somaParcelas = parcelas.reduce((acc, p) => acc + Math.round(numero(p.valor) * 100), 0) / 100;
  const erroParcelas =
    aVista || parcelas.length === 0
      ? null
      : validarParcelasVenda(
          dataDeCalendario(data),
          totais.valor,
          parcelas.map((p) => ({ dataVencimento: dataDeCalendario(p.dataVencimento), valor: numero(p.valor) })),
        );

  function mudarParcela(indice: number, mudanca: Partial<ParcelaForm>) {
    setAjuste({ chave: chaveParcelas, linhas: parcelas.map((p, i) => (i === indice ? { ...p, ...mudanca } : p)) });
  }
```

(Linha com vencimento ou valor em branco vira `Invalid Date`/`NaN`, e `validarParcelasVenda` devolve "Preencha vencimento e valor de cada parcela".)

- [ ] **Step 3: Campo hidden** — junto dos outros hidden:

```tsx
      {!aVista ? (
        <input
          type="hidden"
          name="parcelas"
          value={JSON.stringify(parcelas.map((p) => ({ dataVencimento: p.dataVencimento, valor: numero(p.valor) })))}
        />
      ) : null}
```

- [ ] **Step 4: Campo Prazos** — trocar o `Campo id="vencimento"` por:

```tsx
          <Campo id="prazos" rotulo="Prazos (dias)">
            <Input
              id="prazos"
              value={prazos}
              placeholder="28/56"
              inputMode="numeric"
              onChange={(e) => setPrazos(e.target.value)}
              aria-describedby="prazos-ajuda"
              required
            />
            <p id="prazos-ajuda" className="text-xs text-muted-foreground">
              {prazos.trim() !== "" && !leituraPrazos.ok
                ? <span className="text-destructive">{leituraPrazos.erro}</span>
                : "Dias desde a data do pedido, separados por barra. 0 = no dia."}
            </p>
          </Campo>
```

- [ ] **Step 5: Tabela de parcelas** — nova `<section>` logo antes da seção de totais (`rounded-lg border bg-muted/40`), só quando `!aVista && parcelas.length > 0`:

```tsx
      {!aVista && parcelas.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Parcelas</h2>
          <div className="space-y-2">
            {parcelas.map((parcela, indice) => (
              <div key={indice} className="grid grid-cols-[2rem_1fr_1fr] items-center gap-2">
                <span className="text-sm text-muted-foreground tabular-nums">{indice + 1}</span>
                <Input
                  type="date"
                  aria-label={`Vencimento da parcela ${indice + 1}`}
                  value={parcela.dataVencimento}
                  min={data}
                  onChange={(e) => mudarParcela(indice, { dataVencimento: e.target.value })}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  aria-label={`Valor da parcela ${indice + 1}`}
                  value={parcela.valor}
                  onChange={(e) => mudarParcela(indice, { valor: e.target.value })}
                />
              </div>
            ))}
          </div>
          <p className={`text-sm tabular-nums ${erroParcelas ? "text-destructive" : "text-muted-foreground"}`}>
            Soma {formatarMoeda(somaParcelas)} de {formatarMoeda(totais.valor)}
            {erroParcelas ? ` · ${erroParcelas}` : ""}
          </p>
        </section>
      ) : null}
```

- [ ] **Step 6: Bloquear o Salvar** — `disabled={pendente || (!aVista && (parcelas.length === 0 || erroParcelas !== null))}`.

- [ ] **Step 7: Verificar** — `npx tsc --noEmit` e `npx eslint "src/app/(dashboard)/vendas"` sem erros. (Conferência visual na Task 7.)

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/vendas/pedidos/novo/pedido-form.tsx"
git commit -m "feat(vendas): prazos em dias e parcelas ajustáveis no novo pedido"
```

---

### Task 5: Detalhe do pedido e recibo

**Files:**
- Modify: `src/lib/schemas/enums.ts`
- Modify: `src/app/(dashboard)/vendas/pedidos/[numero]/page.tsx:94-98, 171-175`
- Modify: `src/lib/export/recibo.ts`, `src/lib/export/recibo.test.ts`
- Modify: `src/app/(dashboard)/vendas/pedidos/[numero]/recibo/route.ts`

**Interfaces:**
- Produces: `ROTULOS_STATUS_PARCELA: Record<StatusParcela, string>`; `DadosRecibo.condicao: string | null` e `DadosRecibo.parcelas: { numero: number; dataVencimento: Date; valor: number }[]`.

- [ ] **Step 1: Teste do recibo que falha** — em `recibo.test.ts`, acrescentar `condicao: null, parcelas: []` ao `base` e:

```ts
  test("a prazo com 60 parcelas mostra condição e quebra página sem erro", async () => {
    const parcelas = Array.from({ length: 60 }, (_, i) => ({
      numero: i + 1,
      dataVencimento: new Date(Date.UTC(2026, 11 + i, 10)),
      valor: 10,
    }));
    const bytes = await gerarReciboPdf({ ...base, formaPagamento: "A prazo", condicao: "30/60", parcelas, total: 600 });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/export/recibo.test.ts` → FAIL (tipo/1 página).

- [ ] **Step 3: Recibo** — em `DadosRecibo` acrescentar:

```ts
  /** Só a prazo: "28/56" (dias). */
  condicao: string | null;
  /** Só a prazo; vazio à vista. */
  parcelas: { numero: number; dataVencimento: Date; valor: number }[];
```

Depois de `escrever(\`Forma de pagamento: ...\`)` e antes da situação:

```ts
  if (dados.condicao) {
    y -= 14;
    escrever(`Condição: ${dados.condicao} dias`, { tamanho: 10 });
  }
  for (const parcela of dados.parcelas) {
    if (y < MARGEM + 30) {
      pagina = pdf.addPage([LARGURA, ALTURA]);
      y = ALTURA - MARGEM;
      escrever(`Pedido nº ${dados.numero} (continuação)`, { cor: CINZA, tamanho: 9 });
      y -= 10;
    }
    y -= 13;
    escrever(`Parcela ${parcela.numero} · vence ${formatarData(parcela.dataVencimento)}`, { tamanho: 9, x: MARGEM + 12 });
    escrever(formatarMoeda(parcela.valor), { tamanho: 9, direita: true });
  }
```

- [ ] **Step 4: Rota do recibo** — no `gerarReciboPdf({...})` acrescentar:

```ts
    condicao: pedido.condicaoPagamento,
    parcelas:
      pedido.formaPagamento === "A_PRAZO"
        ? (pedido.titulo?.parcelas ?? []).map((p) => ({
            numero: p.numero,
            dataVencimento: p.dataVencimento,
            valor: Number(p.valorAtualizado),
          }))
        : [],
```

- [ ] **Step 5: Rodar e ver passar** — `npx vitest run src/lib/export/recibo.test.ts` → PASS.

- [ ] **Step 6: Rótulos de status** — em `enums.ts`, depois de `STATUS_PARCELA`:

```ts
export const ROTULOS_STATUS_PARCELA: Record<(typeof STATUS_PARCELA)[number], string> = {
  EM_ABERTO: "Em aberto",
  A_VENCER: "A vencer",
  VENCIDO: "Vencido",
  PARCIALMENTE_PAGO: "Parcialmente paga",
  PAGO: "Paga",
  CANCELADO: "Cancelada",
  RENEGOCIADO: "Renegociada",
};
```

- [ ] **Step 7: Detalhe do pedido** — trocar o `Dado rotulo="Vencimento"` por:

```tsx
              <Dado rotulo="Condição">{pedido.condicaoPagamento ? `${pedido.condicaoPagamento} dias` : "—"}</Dado>
```

e a lista de parcelas do cartão Pagamento por:

```tsx
            {pedido.titulo?.parcelas.map((parcela) => (
              <p key={parcela.id} className="text-sm tabular-nums">
                {pedido.titulo!.parcelas.length > 1 ? `${parcela.numero}ª · ` : ""}
                Vence {formatarData(parcela.dataVencimento)} · {formatarMoeda(parcela.valorAtualizado)}
                <span className="text-muted-foreground"> · {ROTULOS_STATUS_PARCELA[parcela.status]}</span>
              </p>
            ))}
```

(importar `ROTULOS_STATUS_PARCELA` do bloco de `@/lib/schemas/enums`.)

- [ ] **Step 8: Verificar** — `npx tsc --noEmit`, `npx eslint "src/app/(dashboard)/vendas" src/lib` e `npm test` inteiro → tudo verde. Grep de sobras: `Grep "\.vencimento\b|vencimento:" em src/` não deve achar nada do pedido de venda.

- [ ] **Step 9: Commit**

```bash
git add src/lib/schemas/enums.ts "src/app/(dashboard)/vendas/pedidos/[numero]" src/lib/export/recibo.ts src/lib/export/recibo.test.ts
git commit -m "feat(vendas): condição e parcelas no detalhe e no recibo do pedido"
```

---

### Task 6: Documentação

**Files:**
- Modify: `content/ajuda/passo-a-passo.md` (seção 6.1, linhas ~304 e ~313)
- Modify: `docs/modulos/producao-estoque-vendas/08-duvidas-decisoes.md` (linha D-12)
- Modify: `docs/fases/fase-7-producao-estoque-vendas.md` (parágrafo de status, perto da linha 45)
- Modify: `docs/backlog.md` (remover "Venda a prazo em parcelas")
- Modify: `docs/superpowers/specs/2026-11-16-venda-prazo-parcelas-design.md` (Status)

- [ ] **Step 1: Ajuda** — na linha da forma de pagamento, trocar "a prazo, informe o vencimento;" por "a prazo, informe os **prazos em dias** desde a data do pedido, separados por barra (ex.: `28/56` = duas parcelas, 0 = no dia; até 60);". Logo depois da lista de campos, acrescentar o parágrafo:

```
**Parcelas a prazo:** ao digitar os prazos, o pedido mostra as parcelas com o valor dividido igualmente (os centavos que sobram vão para a última). Vencimento e valor de cada parcela podem ser ajustados antes de salvar, mas a soma tem que ser igual ao total do pedido: se não bater, a diferença aparece em vermelho e o pedido não salva. Mudar os prazos, a data ou os itens gera as parcelas de novo e desfaz os ajustes. O pedido guarda a condição pelos dias de cada vencimento (se você mudou 56 para 60, fica "28/60") e mostra as parcelas no detalhe e no recibo.
```

Na lista "Ao salvar", trocar "com uma parcela;" por "com uma parcela à vista ou uma parcela por prazo a prazo;".

- [ ] **Step 2: Doc 08 (D-12)** — na última célula da linha D-12, acrescentar depois do texto atual: ` **Parcelamento por prazos em dias** (2026-11-16): até 60 parcelas, valor dividido igual com os centavos na última, datas e valores ajustáveis no pedido com soma igual ao total; o pedido guarda a condição derivada das datas e os vencimentos ficam só no título.`

- [ ] **Step 3: Fase 7** — depois da frase do rateio (D-06) no parágrafo de status, acrescentar: `Venda a prazo em parcelas concluída em 2026-11-16 (D-12 revista): prazos em dias, até 60 parcelas ajustáveis.`

- [ ] **Step 4: Backlog** — remover o item "**Venda a prazo em parcelas**" (seção "Produção e vendas").

- [ ] **Step 5: Spec** — `Status: aprovada` → `Status: implementada (2026-11-16)`.

- [ ] **Step 6: Commit**

```bash
git add content/ajuda/passo-a-passo.md docs/
git commit -m "docs(vendas): parcelamento da venda a prazo na ajuda, decisões e backlog"
```

---

### Task 7: Conferência no navegador

- [ ] **Step 1: Cenário** — script temporário `scripts/cenario-venda-prazo.ts` com as fixtures de `src/server/services/producaoTestFixtures.ts` (`criarFixtureProducao`, `criarCatalogoDeTeste`, `criarCadastrosDeVenda`, `configurarVendas`, `criarLoteDeTeste`), dando acesso ao admin via `usuarioEmpresa` com `filiais`, e modo `limpar` (padrão das sessões anteriores). Rodar: `node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/cenario-venda-prazo.ts`.
- [ ] **Step 2: Subir** `npm run dev` (porta 3000 livre), entrar como admin e escolher a empresa do cenário.
- [ ] **Step 3: Conferir** em Vendas → Novo pedido:
  - A prazo, `28/56`: duas linhas com vencimentos certos e centavos na última; editar o valor de uma → soma em vermelho e Salvar desabilitado; acertar → salva.
  - Mudar 56 para 60 na data da 2ª linha → detalhe mostra "Condição: 28/60 dias" e as duas parcelas com status.
  - `56/28` → mensagem "Os prazos devem ser crescentes".
  - Recibo (PDF) do pedido mostra condição e parcelas.
  - Contas a receber mostra o título com as duas parcelas; Pix continua com baixa automática.
  - Console sem erros.
- [ ] **Step 4: Limpar** — rodar o script em modo `limpar`, apagar o script e a pasta `.playwright-mcp/`, parar o dev (matar o PID da porta 3000).
- [ ] **Step 5: Relatório final** para o usuário: decisões tomadas, o que foi conferido, pendências. O usuário faz push/PR/merge.
