# Fase 7e — Processamento (OP): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ordem de produção com consumo de fruto, lotes de polpa, insumos e processo; rendimento, balanço, branqueamento e custo ao vivo; encerramento com custo gravado, reabertura e cancelamento; polpa bloqueada até encerrar; etiqueta configurável.

**Architecture:** Cálculos puros em `src/lib/producao/op.ts` (servidor e tela). Serviço `src/server/services/ordemProducao.ts` no padrão da 7b/7c: cada operação de linha é uma `$transaction` curta que **trava a OP** (`updateMany` condicionado ao status), movimenta o estoque só por `registrarMovimento` e recalcula o custo provisório das polpas. O bloqueio da polpa é um filtro único em `estoque.ts`, usado por venda, ajuste e estoque. Telas em `/producao/processamento`, abas por `?aba=` (sem componente de abas novo).

**Tech Stack:** Next.js 16, React 19, Prisma 7 + Postgres, Zod 4, Vitest, pdf-lib.

**Spec:** [`docs/superpowers/specs/2026-11-10-fase-7e-processamento-design.md`](../specs/2026-11-10-fase-7e-processamento-design.md)

## Global Constraints

- kg `Decimal(18,3)`; R$/kg e custo unitário `Decimal(18,4)`; R$ `Decimal(18,2)`; °C `Decimal(5,1)`.
- Datas de calendário em UTC (`"2026-11-10"` → `2026-11-10T00:00:00.000Z`); "hoje" é `hojeDeCalendario()` de `src/lib/producao/periodo.ts`.
- `Lote.saldoKg` só muda por `registrarMovimento`; movimentos nunca são editados nem apagados; linhas da OP nunca são apagadas (`removidoEm`); número da OP e código do lote nunca mudam nem são reaproveitados.
- Toda escrita: `requirePermission(…, "producao:escrever")` → `requireAlteracaoFilial` → transação → `registrarAuditoria(…, tx)`.
- Escopo: OP, lote, local por `filialId` da sessão; fruta, produto, insumo por `empresaId`.
- Movimentos da OP usam a **data da OP**.
- Fruto vencido = `loteVencidoNaData(validade, dataDaOP)` (de `venda.ts`: `validade < data`).
- Permissão nova `producao:liberarVencido`: ADMINISTRADOR (todas) e GESTOR. Nenhuma outra muda.
- Mensagens exatas (usadas em testes):
  - "A OP <numero> está encerrada" / "A OP <numero> está cancelada" / "A OP <numero> está aberta" (status diferente do esperado)
  - "O lote <codigo> está numa OP aberta" · "O lote <codigo> é de uma OP cancelada" · "O lote <codigo> foi removido da OP"
  - "O lote <codigo> já teve venda ou ajuste"
  - "O lote <codigo> venceu em dd/mm/aaaa"
  - "Encerre a OP antes de imprimir a etiqueta"
- Sem dados reais da Hortitex em testes, seed ou docs.
- Antes de escrever página/rota/action, ler o guia em `node_modules/next/dist/docs/` (AGENTS.md): `params`/`searchParams` como Promise, `notFound`, `redirect` fora do `try`.
- Depois de mudar o schema: `npx prisma migrate dev` **e** `npx prisma generate`; reiniciar o `npm run dev` se estiver rodando.
- Arquivos com CRLF: editar com a ferramenta Edit.
- Commits convencionais terminando em `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Trava da OP:** `encerrarOP` e `adicionarConsumo` em paralelo na mesma OP → ou a linha entra antes e está no custo gravado, ou é recusada com "A OP X está encerrada". Nunca linha ativa fora do custo. → Task 5.
2. **Bloqueio da polpa:** polpa de OP aberta não aparece em `lotesParaVenda`; `criarPedido` e `criarAjuste` recusam; depois de encerrar, vende. Linha removida e OP cancelada continuam bloqueadas mesmo com OP encerrada/reaberta. → Task 6.
3. **Falha não grava nada:** consumo acima do saldo → nenhuma linha, movimento ou mudança de custo. → Task 3.
4. **Custo provisório:** depois de cada linha (consumo, produção, insumo, remoção) todos os lotes de polpa ativos da OP têm o mesmo `custoKg` = `custoOP(...).custoKgPolpa`. → Tasks 3–4.
5. **Reabrir/cancelar depois de saída:** uma venda (mesmo cancelada depois) num lote de polpa impede reabrir e cancelar. → Task 5.

---

### Task 1: Schema, migration, permissão e fixtures

**Files:**
- Modify: `prisma/schema.prisma`; Create: `prisma/migrations/<ts>_fase_7e_processamento/`
- Modify: `src/server/auth/permissions.ts`, `src/server/auth/permissions.test.ts`
- Modify: `src/server/services/estoque.ts` (`NovoMovimento`)
- Modify: `src/server/services/producaoTestFixtures.ts`
- Modify: `src/lib/schemas/enums.ts`

**Interfaces:**
- Produces (Prisma): enum `StatusOrdemProducao { ABERTA ENCERRADA CANCELADA }`; `TipoMovimentoEstoque` += `CONSUMO_OP`, `ESTORNO_CONSUMO_OP`, `PRODUCAO_OP`, `ESTORNO_PRODUCAO_OP`; models `OrdemProducao`, `ConsumoOP`, `ProducaoOP`, `InsumoOP`; `MovimentoEstoque.{consumoOpId, producaoOpId}`; `Produto.textoEtiqueta String?`; `ConfiguracaoProducao.enderecoEtiqueta String?`.
- Produces: `Acao` += `"producao:liberarVencido"` (GESTOR; ADMINISTRADOR tem todas).
- Produces: `NovoMovimento` += `consumoOpId?: string; producaoOpId?: string`.
- Produces (enums.ts): `STATUS_ORDEM_PRODUCAO = ["ABERTA", "ENCERRADA", "CANCELADA"] as const`; `ROTULOS_STATUS_ORDEM_PRODUCAO = { ABERTA: "Aberta", ENCERRADA: "Encerrada", CANCELADA: "Cancelada" } as const`.
- Produces (fixture):
  - `limpar()` apaga `ordemProducao` (linhas em cascata) **depois** de `movimentoEstoque` e **antes** de `pedidoVenda`/`lote`.
  - `CatalogoDeTeste` ganha: `produtoPolpaFinoId` ("AFN", "Polpa de açaí fino", POLPA, CONGELADO, 365 dias, mesma fruta); `outraFrutaId` (fruta "Cupuaçu", `exigeBranqueamento: false`); `produtoFrutoOutraId` ("FC", "Fruto de cupuaçu", FRUTO, IN_NATURA, 1 dia); `produtoPolpaOutraId` ("CPC", "Polpa de cupuaçu", POLPA, CONGELADO, 365 dias); `insumoId` ("Embalagem 1 kg", unidade "un", `custoUnitario: 0.5`); `insumoInativoId` ("Insumo inativo", "un", 1, `ativo: false`).
  - `criarLoteDeTeste` passa a aceitar `filialId?: string` (padrão filial A).

- [ ] **Step 1: Teste que falha** em `permissions.test.ts`: acrescentar `"producao:liberarVencido"` em `ACOES_FASE_7` e em `ESPERADO_FASE_7.GESTOR`.
- [ ] **Step 2:** `npx vitest run src/server/auth/permissions.test.ts` → FAIL (tipo não existe / GESTOR sem a ação).
- [ ] **Step 3:** `permissions.ts`: acrescentar a ação ao tipo `Acao` e ao `Set` do GESTOR. PASS.
- [ ] **Step 4: Schema Prisma** (spec §1):

```prisma
enum StatusOrdemProducao {
  ABERTA
  ENCERRADA
  CANCELADA
}

// TipoMovimentoEstoque: acrescentar CONSUMO_OP, ESTORNO_CONSUMO_OP, PRODUCAO_OP, ESTORNO_PRODUCAO_OP

model OrdemProducao {
  id                        String              @id @default(uuid())
  filialId                  String
  numero                    String
  data                      DateTime
  frutaId                   String
  responsavel               String?
  branqueamentoTemperaturaC Decimal?            @db.Decimal(5, 1)
  branqueamentoTempoS       Int?
  aguaLitros                Decimal             @default(0) @db.Decimal(18, 3)
  carocoResiduoKg           Decimal             @default(0) @db.Decimal(18, 3)
  perdaKg                   Decimal             @default(0) @db.Decimal(18, 3)
  observacao                String?
  status                    StatusOrdemProducao @default(ABERTA)
  custoFrutoTotal           Decimal?            @db.Decimal(18, 2)
  custoInsumosTotal         Decimal?            @db.Decimal(18, 2)
  custoKgPolpa              Decimal?            @db.Decimal(18, 4)
  encerradaEm               DateTime?
  motivoReabertura          String?
  motivoCancelamento        String?
  canceladaEm               DateTime?
  usuarioId                 String
  criadoEm                  DateTime            @default(now())
  atualizadoEm              DateTime            @updatedAt

  filial    Filial       @relation(fields: [filialId], references: [id], onDelete: Cascade)
  fruta     Fruta        @relation(fields: [frutaId], references: [id], onDelete: Restrict)
  usuario   Usuario      @relation(fields: [usuarioId], references: [id])
  consumos  ConsumoOP[]
  producoes ProducaoOP[]
  insumos   InsumoOP[]

  @@unique([filialId, numero])
  @@index([filialId, data])
  @@map("ordens_producao")
}

model ConsumoOP {
  id                     String    @id @default(uuid())
  ordemProducaoId        String
  loteId                 String
  quantidadeKg           Decimal   @db.Decimal(18, 3)
  custoKg                Decimal   @db.Decimal(18, 4)
  motivoLiberacaoVencido String?
  removidoEm             DateTime?
  criadoEm               DateTime  @default(now())

  ordemProducao OrdemProducao      @relation(fields: [ordemProducaoId], references: [id], onDelete: Cascade)
  lote          Lote               @relation(fields: [loteId], references: [id], onDelete: Restrict)
  movimentos    MovimentoEstoque[]

  @@index([ordemProducaoId])
  @@index([loteId])
  @@map("consumos_op")
}

model ProducaoOP {
  id              String    @id @default(uuid())
  ordemProducaoId String
  loteId          String    @unique
  produtoId       String
  quantidadeKg    Decimal   @db.Decimal(18, 3)
  embalagens      Int?
  localId         String
  removidoEm      DateTime?
  criadoEm        DateTime  @default(now())

  ordemProducao OrdemProducao      @relation(fields: [ordemProducaoId], references: [id], onDelete: Cascade)
  lote          Lote               @relation(fields: [loteId], references: [id], onDelete: Restrict)
  produto       Produto            @relation(fields: [produtoId], references: [id], onDelete: Restrict)
  local         LocalArmazenamento @relation(fields: [localId], references: [id], onDelete: Restrict)
  movimentos    MovimentoEstoque[]

  @@index([ordemProducaoId])
  @@map("producoes_op")
}

model InsumoOP {
  id              String    @id @default(uuid())
  ordemProducaoId String
  insumoId        String
  quantidade      Decimal   @db.Decimal(18, 3)
  custoUnitario   Decimal   @db.Decimal(18, 4)
  removidoEm      DateTime?
  criadoEm        DateTime  @default(now())

  ordemProducao OrdemProducao @relation(fields: [ordemProducaoId], references: [id], onDelete: Cascade)
  insumo        Insumo        @relation(fields: [insumoId], references: [id], onDelete: Restrict)

  @@index([ordemProducaoId])
  @@map("insumos_op")
}
```

  - `MovimentoEstoque`: `consumoOpId String?`, `producaoOpId String?`, relações `consumoOp ConsumoOP? @relation(fields: [consumoOpId], references: [id])` e `producaoOp ProducaoOP? @relation(...)`, `@@index([consumoOpId])`, `@@index([producaoOpId])`.
  - `Produto.textoEtiqueta String?`; `ConfiguracaoProducao.enderecoEtiqueta String?`.
  - Campos de volta: `Filial.ordensProducao`, `Fruta.ordensProducao`, `Usuario.ordensProducao`, `Lote.consumosOP ConsumoOP[]`, `Lote.producaoOP ProducaoOP?`, `Produto.producoesOP`, `LocalArmazenamento.producoesOP`, `Insumo.insumosOP`.
  - `npx prisma migrate dev --name fase_7e_processamento` e `npx prisma generate`. Conferir no SQL: só `ADD VALUE`, `CREATE TYPE`, `CREATE TABLE`, `ADD COLUMN`, índices e FKs novas.
- [ ] **Step 5:** `NovoMovimento` com os dois campos opcionais; enums e rótulos em `enums.ts`; fixture (catálogo ampliado, `limpar()`, `filialId` em `criarLoteDeTeste` — o `filialId` vale para o lote **e** para o movimento).
- [ ] **Step 6:** `npx vitest run src/server/services` PASS (fixture alterada não quebra 7b/7c); `npx tsc --noEmit` limpo.
- [ ] **Step 7:** commit `feat(producao): modelo da ordem de produção e permissão de liberar fruto vencido`.

---

### Task 2: Cálculos puros da OP

**Files:**
- Create: `src/lib/producao/op.ts`, `src/lib/producao/op.test.ts`

**Interfaces:**
- Produces:
  - `rendimento(frutoKg: number, polpaKg: number): number | null`.
  - `type StatusVerificacao = "OK" | "VERIFICAR"`; `balancoMassa(e: { frutoKg; aguaLitros; polpaKg; carocoResiduoKg; perdaKg }, tolerancia: number): { diferencaKg: number; percentual: number | null; status: StatusVerificacao }`.
  - `type StatusBranqueamento = "OK" | "VERIFICAR" | "NAO_SE_APLICA"`; `statusBranqueamento(e: { exige: boolean; temperaturaC: number | null; tempoS: number | null }, minimos: { temperaturaMinC: number; tempoMinS: number }): StatusBranqueamento`.
  - `custoOP(e: { consumos: { quantidadeKg; custoKg }[]; insumos: { quantidade; custoUnitario }[]; polpaKg: number }): { custoFrutoTotal; custoInsumosTotal; custoTotal; custoKgPolpa }`.
  - `type LinhasOP = { consumos: { quantidadeKg: number; custoKg: number }[]; producoes: { quantidadeKg: number }[]; insumos: { quantidade: number; custoUnitario: number }[] }`.
  - `resumirOP(op: { exigeBranqueamento: boolean; branqueamentoTemperaturaC: number | null; branqueamentoTempoS: number | null; aguaLitros: number; carocoResiduoKg: number; perdaKg: number } & LinhasOP, config: { toleranciaBalancoMassa: number; branqueamentoTemperaturaMinC: number; branqueamentoTempoMinS: number }): ResumoOP` — `ResumoOP = { frutoKg; polpaKg; rendimento; balanco; branqueamento; custo; aVerificar: string[] }`; `aVerificar` lista `"Balanço de massa"` e/ou `"Branqueamento"` quando `VERIFICAR`.
  - `prefixoDaOP(data: Date): string` → `OP-AAMMDD`.
  - `ROTULOS_STATUS_BRANQUEAMENTO` (`OK` "OK", `VERIFICAR` "Verificar", `NAO_SE_APLICA` "Não se aplica"); `ROTULOS_STATUS_VERIFICACAO` (`OK` "OK", `VERIFICAR` "Verificar").

- [ ] **Step 1: Testes que falham:**

```ts
import { describe, expect, test } from "vitest";
import { balancoMassa, custoOP, prefixoDaOP, rendimento, resumirOP, statusBranqueamento } from "./op";
import { proximoCodigoDeLote } from "./lote";

const MIN = { temperaturaMinC: 80, tempoMinS: 10 };

describe("rendimento (RN-10)", () => {
  test("polpa ÷ fruto", () => expect(rendimento(200, 120)).toBe(0.6));
  test("sem fruto é null", () => expect(rendimento(0, 10)).toBeNull());
});

describe("balancoMassa (RN-11)", () => {
  test("exemplo do doc 3: 5 kg, 2,1%, OK", () => {
    const r = balancoMassa({ frutoKg: 200, aguaLitros: 40, polpaKg: 120, carocoResiduoKg: 105, perdaKg: 10 }, 0.03);
    expect(r.diferencaKg).toBe(5);
    expect(r.percentual).toBeCloseTo(0.0208, 4);
    expect(r.status).toBe("OK");
  });
  test("acima da tolerância: VERIFICAR (inclusive diferença negativa)", () => {
    expect(balancoMassa({ frutoKg: 200, aguaLitros: 0, polpaKg: 120, carocoResiduoKg: 50, perdaKg: 0 }, 0.03).status).toBe("VERIFICAR");
    expect(balancoMassa({ frutoKg: 100, aguaLitros: 0, polpaKg: 110, carocoResiduoKg: 0, perdaKg: 0 }, 0.03).status).toBe("VERIFICAR");
  });
  test("no limite da tolerância é OK", () => {
    expect(balancoMassa({ frutoKg: 100, aguaLitros: 0, polpaKg: 97, carocoResiduoKg: 0, perdaKg: 0 }, 0.03).status).toBe("OK");
  });
  test("sem entrada: percentual null e VERIFICAR", () => {
    expect(balancoMassa({ frutoKg: 0, aguaLitros: 0, polpaKg: 0, carocoResiduoKg: 0, perdaKg: 0 }, 0.03)).toEqual({
      diferencaKg: 0, percentual: null, status: "VERIFICAR",
    });
  });
});

describe("statusBranqueamento (RN-12)", () => {
  test("fruta que não exige", () =>
    expect(statusBranqueamento({ exige: false, temperaturaC: null, tempoS: null }, MIN)).toBe("NAO_SE_APLICA"));
  test("OK no mínimo exato", () =>
    expect(statusBranqueamento({ exige: true, temperaturaC: 80, tempoS: 10 }, MIN)).toBe("OK"));
  test("abaixo da temperatura, abaixo do tempo, valor faltando", () => {
    expect(statusBranqueamento({ exige: true, temperaturaC: 79.9, tempoS: 10 }, MIN)).toBe("VERIFICAR");
    expect(statusBranqueamento({ exige: true, temperaturaC: 85, tempoS: 9 }, MIN)).toBe("VERIFICAR");
    expect(statusBranqueamento({ exige: true, temperaturaC: null, tempoS: 10 }, MIN)).toBe("VERIFICAR");
  });
});

describe("custoOP (RN-13)", () => {
  test("fruto + insumos, custo/kg com 4 casas", () => {
    expect(
      custoOP({
        consumos: [{ quantidadeKg: 150, custoKg: 1.5 }, { quantidadeKg: 50, custoKg: 4.2 }],
        insumos: [{ quantidade: 120, custoUnitario: 0.5 }],
        polpaKg: 120,
      }),
    ).toEqual({ custoFrutoTotal: 435, custoInsumosTotal: 60, custoTotal: 495, custoKgPolpa: 4.125 });
  });
  test("custo/kg usa o total sem arredondar", () => {
    expect(custoOP({ consumos: [{ quantidadeKg: 3, custoKg: 1 }], insumos: [], polpaKg: 7 }).custoKgPolpa).toBe(0.4286);
  });
  test("sem polpa: custo/kg 0", () => {
    expect(custoOP({ consumos: [{ quantidadeKg: 10, custoKg: 1 }], insumos: [], polpaKg: 0 }).custoKgPolpa).toBe(0);
  });
});

describe("resumirOP", () => {
  test("lista o que está a verificar", () => {
    const r = resumirOP(
      {
        exigeBranqueamento: true, branqueamentoTemperaturaC: null, branqueamentoTempoS: null,
        aguaLitros: 0, carocoResiduoKg: 0, perdaKg: 0,
        consumos: [{ quantidadeKg: 100, custoKg: 1 }], producoes: [{ quantidadeKg: 60 }, { quantidadeKg: 10 }], insumos: [],
      },
      { toleranciaBalancoMassa: 0.03, branqueamentoTemperaturaMinC: 80, branqueamentoTempoMinS: 10 },
    );
    expect(r.frutoKg).toBe(100);
    expect(r.polpaKg).toBe(70);
    expect(r.rendimento).toBe(0.7);
    expect(r.aVerificar).toEqual(["Balanço de massa", "Branqueamento"]);
  });
});

test("número da OP: OP-AAMMDD-NN pela sequência do dia", () => {
  const prefixo = prefixoDaOP(new Date("2026-11-10"));
  expect(prefixo).toBe("OP-261110");
  expect(proximoCodigoDeLote(prefixo, ["OP-261110-01", "OP-261109-07"])).toBe("OP-261110-02");
});
```

- [ ] **Step 2:** `npx vitest run src/lib/producao/op.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar:**

```ts
import { arredondar } from "./arredondar";

export type StatusVerificacao = "OK" | "VERIFICAR";
export type StatusBranqueamento = "OK" | "VERIFICAR" | "NAO_SE_APLICA";

export const ROTULOS_STATUS_VERIFICACAO: Record<StatusVerificacao, string> = { OK: "OK", VERIFICAR: "Verificar" };
export const ROTULOS_STATUS_BRANQUEAMENTO: Record<StatusBranqueamento, string> = {
  OK: "OK",
  VERIFICAR: "Verificar",
  NAO_SE_APLICA: "Não se aplica",
};

/** RN-10: polpa ÷ fruto; sem fruto não há rendimento. */
export function rendimento(frutoKg: number, polpaKg: number): number | null {
  return frutoKg > 0 ? arredondar(polpaKg / frutoKg, 4) : null;
}

/** RN-11: fruto + água − polpa − caroço − perda; 1 L de água = 1 kg (D-20). */
export function balancoMassa(
  e: { frutoKg: number; aguaLitros: number; polpaKg: number; carocoResiduoKg: number; perdaKg: number },
  tolerancia: number,
): { diferencaKg: number; percentual: number | null; status: StatusVerificacao } {
  const entrada = e.frutoKg + e.aguaLitros;
  const diferencaKg = arredondar(entrada - e.polpaKg - e.carocoResiduoKg - e.perdaKg, 3);
  if (entrada <= 0) return { diferencaKg, percentual: null, status: "VERIFICAR" };
  const percentual = diferencaKg / entrada;
  return { diferencaKg, percentual, status: Math.abs(percentual) <= tolerancia + 1e-9 ? "OK" : "VERIFICAR" };
}

/** RN-12: só para fruta que exige (D-08); valor faltando é "Verificar". */
export function statusBranqueamento(
  e: { exige: boolean; temperaturaC: number | null; tempoS: number | null },
  minimos: { temperaturaMinC: number; tempoMinS: number },
): StatusBranqueamento {
  if (!e.exige) return "NAO_SE_APLICA";
  if (e.temperaturaC === null || e.tempoS === null) return "VERIFICAR";
  return e.temperaturaC >= minimos.temperaturaMinC && e.tempoS >= minimos.tempoMinS ? "OK" : "VERIFICAR";
}

/** RN-13: o mesmo custo/kg para todas as polpas da OP (D-06). */
export function custoOP(e: {
  consumos: { quantidadeKg: number; custoKg: number }[];
  insumos: { quantidade: number; custoUnitario: number }[];
  polpaKg: number;
}) {
  const fruto = e.consumos.reduce((s, c) => s + c.quantidadeKg * c.custoKg, 0);
  const insumos = e.insumos.reduce((s, i) => s + i.quantidade * i.custoUnitario, 0);
  const total = fruto + insumos;
  return {
    custoFrutoTotal: arredondar(fruto, 2),
    custoInsumosTotal: arredondar(insumos, 2),
    custoTotal: arredondar(total, 2),
    custoKgPolpa: e.polpaKg > 0 ? arredondar(total / e.polpaKg, 4) : 0,
  };
}

export type LinhasOP = {
  consumos: { quantidadeKg: number; custoKg: number }[];
  producoes: { quantidadeKg: number }[];
  insumos: { quantidade: number; custoUnitario: number }[];
};

export type ConfiguracaoResumo = {
  toleranciaBalancoMassa: number;
  branqueamentoTemperaturaMinC: number;
  branqueamentoTempoMinS: number;
};

export function resumirOP(
  op: {
    exigeBranqueamento: boolean;
    branqueamentoTemperaturaC: number | null;
    branqueamentoTempoS: number | null;
    aguaLitros: number;
    carocoResiduoKg: number;
    perdaKg: number;
  } & LinhasOP,
  config: ConfiguracaoResumo,
) {
  const frutoKg = arredondar(op.consumos.reduce((s, c) => s + c.quantidadeKg, 0), 3);
  const polpaKg = arredondar(op.producoes.reduce((s, p) => s + p.quantidadeKg, 0), 3);
  const balanco = balancoMassa(
    { frutoKg, aguaLitros: op.aguaLitros, polpaKg, carocoResiduoKg: op.carocoResiduoKg, perdaKg: op.perdaKg },
    config.toleranciaBalancoMassa,
  );
  const branqueamento = statusBranqueamento(
    { exige: op.exigeBranqueamento, temperaturaC: op.branqueamentoTemperaturaC, tempoS: op.branqueamentoTempoS },
    { temperaturaMinC: config.branqueamentoTemperaturaMinC, tempoMinS: config.branqueamentoTempoMinS },
  );
  const aVerificar = [
    ...(balanco.status === "VERIFICAR" ? ["Balanço de massa"] : []),
    ...(branqueamento === "VERIFICAR" ? ["Branqueamento"] : []),
  ];
  return {
    frutoKg,
    polpaKg,
    rendimento: rendimento(frutoKg, polpaKg),
    balanco,
    branqueamento,
    custo: custoOP({ consumos: op.consumos, insumos: op.insumos, polpaKg }),
    aVerificar,
  };
}

export type ResumoOP = ReturnType<typeof resumirOP>;

/** `OP-261110` (RN-02); a sequência do dia vem de `proximoCodigoDeLote`. */
export function prefixoDaOP(data: Date): string {
  return `OP-${data.toISOString().slice(2, 10).replaceAll("-", "")}`;
}
```

- [ ] **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(producao): cálculos de rendimento, balanço, branqueamento e custo da OP`.

---

### Task 3: Serviço da OP — criar, atualizar, consumo

**Files:**
- Create: `src/lib/schemas/ordemProducao.ts`, `src/server/services/ordemProducao.ts`, `src/server/services/ordemProducao.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `registrarMovimento`, `obterConfiguracaoProducao`, `podeExecutar`, `loteVencidoNaData`, `proximoCodigoDeLote`, `formatarData`.
- Produces (schemas):
  - `novaOPSchema` → `NovaOPValues = { data: Date; frutaId: string ("Selecione a fruta"); responsavel?: string | null }`.
  - `dadosOPSchema` → `DadosOPValues = { data?: Date; frutaId?: string; responsavel?: string | null; branqueamentoTemperaturaC?: number (0–150); branqueamentoTempoS?: number (int ≥ 0); aguaLitros: number (≥ 0, padrão 0); carocoResiduoKg: number (≥ 0, padrão 0); perdaKg: number (≥ 0, padrão 0); observacao?: string | null }` — numéricos opcionais com `numeroOpcional`; `data`/`frutaId` vazios → `undefined`.
  - `consumoSchema` → `{ loteId: string ("Selecione o lote"); quantidadeKg: number (> 0, "Informe a quantidade"); motivoLiberacaoVencido?: string | null }`.
  - `producaoSchema` → `{ produtoId ("Selecione o produto"); quantidadeKg (> 0); embalagens?: number (int 1–10000); localId ("Selecione o local") }`.
  - `insumoOPSchema` → `{ insumoId ("Selecione o insumo"); quantidade: number (> 0, "Informe a quantidade") }`.
- Produces (serviço):
  - `criarOP(sessao, dados: NovaOPValues): Promise<{ id: string; numero: string }>`.
  - `atualizarOP(sessao, id: string, dados: DadosOPValues): Promise<void>`.
  - `adicionarConsumo(sessao, opId: string, dados: ConsumoValues): Promise<{ id: string }>`; `removerConsumo(sessao, consumoId: string): Promise<void>`.
  - `lotesParaConsumo(filialId: string, frutaId: string, data: Date): Promise<LoteParaConsumo[]>`, `LoteParaConsumo = { id; codigo; saldoKg: number; custoKg: number; validade: Date; vencido: boolean; produto: { codigo; descricao } }`, FEFO.
  - internos (exportados para as Tasks 4–5): `travarOP(tx, filialId, opId, esperado: StatusOrdemProducao[])`, `recalcularCustoProvisorio(tx, opId)`.

Esqueleto:

```ts
const TENTATIVAS_NUMERACAO = 3;
const ROTULO_STATUS = { ABERTA: "aberta", ENCERRADA: "encerrada", CANCELADA: "cancelada" } as const;

function autorizar(sessao: SessaoAtiva) {
  requirePermission(sessao.perfil, "producao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
}

/**
 * Trava a linha da OP até o fim da transação (UPDATE condicionado ao status):
 * encerrar e lançar ao mesmo tempo ficam em fila, e o segundo vê o status novo.
 */
export async function travarOP(
  tx: Prisma.TransactionClient,
  filialId: string,
  opId: string,
  esperado: StatusOrdemProducao[] = ["ABERTA"],
) {
  const { count } = await tx.ordemProducao.updateMany({
    where: { id: opId, filialId, status: { in: esperado } },
    data: { atualizadoEm: new Date() },
  });
  const op = await tx.ordemProducao.findFirst({
    where: { id: opId, filialId },
    include: { fruta: { select: { id: true, exigeBranqueamento: true } } },
  });
  if (!op) throw new Error("OP não encontrada");
  if (count === 0) throw new Error(`A OP ${op.numero} está ${ROTULO_STATUS[op.status]}`);
  return op;
}

/** Custo provisório: o mesmo custo/kg em todos os lotes de polpa ativos da OP (D-06). */
export async function recalcularCustoProvisorio(tx: Prisma.TransactionClient, opId: string) {
  const linhas = await linhasAtivas(tx, opId);
  const custo = custoOP({ consumos: linhas.consumos, insumos: linhas.insumos, polpaKg: soma(linhas.producoes) });
  await tx.lote.updateMany({
    where: { producaoOP: { is: { ordemProducaoId: opId, removidoEm: null } } },
    data: { custoKg: custo.custoKgPolpa },
  });
  return custo;
}
```

  `linhasAtivas(db, opId): Promise<LinhasOP>` lê as três tabelas com `removidoEm: null` e converte Decimal → number.

Regras e mensagens:

| Operação | Caso | Mensagem |
|---|---|---|
| `criarOP` | fruta de outra empresa/inativa | "Fruta não encontrada ou inativa" |
| `criarOP` | número | `proximoCodigoDeLote(prefixoDaOP(data), existentes)` com `numero: { startsWith: prefixo + "-" }` na filial; retry em P2002 até 3 |
| `atualizarOP` | OP não aberta | "A OP X está encerrada/cancelada" (`travarOP`) |
| `atualizarOP` | `data` ou `frutaId` diferentes do atual com linha ativa | "Remova as linhas antes de mudar a data ou a fruta" |
| `atualizarOP` | fruta nova inválida | "Fruta não encontrada ou inativa" |
| `adicionarConsumo` | lote não está na filial | "Lote não encontrado" |
| | produto não é FRUTO | "O lote X não é de fruto" |
| | fruta diferente da OP (RN-14) | "O lote X é de outra fruta" |
| | recepção cancelada | "O lote X é de uma recepção excluída" |
| | lote já tem linha ativa na OP | "O lote X já está nesta OP" |
| | vencido sem (`producao:liberarVencido` e motivo) | "O lote X venceu em dd/mm/aaaa" |
| | kg acima do saldo | "Saldo insuficiente no lote X" (de `movimentarSaldo`) |
| `removerConsumo` | linha não encontrada na filial | "Linha não encontrada" |
| | já removida | "Linha já removida" |

`adicionarConsumo` (dentro da transação, após `travarOP`): cria `ConsumoOP` (`custoKg: lote.custoKg`; motivo só se vencido, senão `null`); `registrarMovimento` `CONSUMO_OP` com `−kg`, `data: op.data`, `consumoOpId`; `recalcularCustoProvisorio`; auditoria `OrdemProducao` / `ADICIONAR_CONSUMO` (`{ lote, quantidadeKg, custoKg, motivoLiberacaoVencido }`). `removerConsumo`: `travarOP` da OP da linha; `removidoEm: new Date()`; `ESTORNO_CONSUMO_OP` `+kg` com `consumoOpId`; recalcula; auditoria `REMOVER_CONSUMO`. `criarOP`: auditoria `CRIAR`; `atualizarOP`: `ATUALIZAR` com anterior e novo.

- [ ] **Step 1: Testes que falham** em `ordemProducao.test.ts`. Setup: `criarFixtureProducao("op")`, `criarCatalogoDeTeste`; helper `fruto(kg = 100, extra = {})` → `criarLoteDeTeste(fx, { produtoId: cat.produtoFrutoId, localId: cat.localRecepcaoId, kg, custoKg: 1.5, data: d("2026-11-10"), validade: d("2026-11-11"), ...extra })`; `const adm = () => fx.sessao("ADMINISTRADOR")`; `nova = () => criarOP(adm(), novaOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }))`.
  - `numera OP-261110-01 e depois -02` (primeiro teste do arquivo).
  - `consumo baixa o fruto com o custo do lote` — saldo 100 → 70; movimento `CONSUMO_OP` −30 com `consumoOpId` e `data` da OP; linha com `custoKg` 1,5.
  - `falha não grava nada` (Review Focus 3) — kg 101 → "Saldo insuficiente no lote"; nenhuma `consumoOP`, nenhum movimento novo; saldo 100.
  - `recusas` — lote de polpa (`cat.produtoPolpaId`) → "não é de fruto"; lote `cat.produtoFrutoOutraId` → "é de outra fruta"; mesmo lote duas vezes → "já está nesta OP"; lote de recepção excluída (`criarRecepcao` + `cancelarRecepcao`, como no teste da 7c) → "recepção excluída"; lote da filial B (`criarLoteDeTeste(fx, { …, filialId: fx.filialBId, localId: <local da filial B criado no teste> })`) → "Lote não encontrado".
  - `fruto vencido` — validade `2026-11-09`, OP de `2026-11-10`: PRODUCAO (lança, mas não libera) com motivo → "O lote X venceu em 09/11/2026"; ADMINISTRADOR sem motivo → mesma mensagem; ADMINISTRADOR com motivo → aceito e motivo gravado na linha; validade `2026-11-10` → aceito sem motivo, e um motivo enviado vira `null`. (GESTOR libera vencido mas não tem `producao:escrever`: na prática, a liberação na OP é do ADMINISTRADOR ou de um GESTOR junto com quem lança. O teste de matriz da Task 1 cobre o GESTOR.)
  - `remover consumo` — estorno `ESTORNO_CONSUMO_OP` +30; saldo volta; `removidoEm` preenchido; remover de novo → "Linha já removida"; o mesmo lote pode ser lançado de novo depois de removido.
  - `atualizarOP` — grava processo e observação; mudar fruta com consumo ativo → "Remova as linhas…"; sem linhas → muda.
  - `permissões` — VENDAS e CONSULTA → `PermissionError` em `criarOP`; filial somente leitura → `FilialSomenteLeituraError`.
  - `lotesParaConsumo` — só FRUTO da fruta, com saldo, recepção não cancelada, FEFO, `vencido` relativo à data.
- [ ] **Step 2:** `npx vitest run src/server/services/ordemProducao.test.ts` → FAIL.
- [ ] **Step 3:** implementar schemas e serviço.
- [ ] **Step 4:** PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 5:** commit `feat(producao): ordem de produção com consumo de fruto`.

---

### Task 4: Produção de polpa e insumos, com custo provisório

**Files:**
- Modify: `src/server/services/ordemProducao.ts`, `src/server/services/ordemProducao.test.ts`

**Interfaces:**
- Produces:
  - `adicionarProducao(sessao, opId, dados: ProducaoValues): Promise<{ id: string; loteId: string; codigoLote: string }>`; `removerProducao(sessao, producaoId): Promise<void>`.
  - `adicionarInsumo(sessao, opId, dados: InsumoOPValues): Promise<{ id: string }>`; `removerInsumo(sessao, insumoOpId): Promise<void>`.

| Operação | Caso | Mensagem |
|---|---|---|
| `adicionarProducao` | produto não é POLPA ativa da empresa | "Produto de polpa não encontrado ou inativo" |
| | fruta diferente da OP | "O produto é de outra fruta" |
| | local inativo / de outra filial | "Local de armazenamento não encontrado ou inativo" |
| `adicionarInsumo` | insumo inativo / outra empresa | "Insumo não encontrado ou inativo" |
| `remover*` | não encontrada / já removida | "Linha não encontrada" / "Linha já removida" |

`adicionarProducao` (transação com retry em P2002, como `criarRecepcao`): `travarOP`; código `proximoCodigoDeLote(prefixoDoLote(produto.codigo, op.data), existentes)`; cria `Lote` (`origem: "PRODUCAO"`, `data: op.data`, `validade: calcularValidade(op.data, produto.validadeDias)`, `localId`, `quantidadeInicialKg: kg`, `saldoKg: 0`, `custoKg: 0`); cria `ProducaoOP`; `registrarMovimento` `PRODUCAO_OP` `+kg` com `producaoOpId`; `recalcularCustoProvisorio`; auditoria `ADICIONAR_PRODUCAO` (`{ lote, produto, quantidadeKg, embalagens, local }`). `removerProducao`: `travarOP`; `removidoEm`; `ESTORNO_PRODUCAO_OP` com `−lote.saldoKg`; recalcula; auditoria. `adicionarInsumo`: `custoUnitario` = do cadastro; recalcula; auditoria `ADICIONAR_INSUMO`. `removerInsumo`: `removidoEm`; recalcula.

- [ ] **Step 1: Testes que falham:**
  - `produção cria o lote de polpa` — código `AGC-261110-01`, origem PRODUCAO, validade `2027-11-10`, local câmara, saldo 60, movimento `PRODUCAO_OP` +60.
  - `custo provisório igual em todas as polpas` (Review Focus 4) — consumo 100 kg a 1,5 + produção AGC 40 + AFN 20 → os dois lotes com `custoKg` 2,5; + insumo 60 un a 0,5 → os dois com 3,0; remover o insumo → 2,5; remover a AFN → AGC 3,75 e AFN zerado (saldo 0, `ESTORNO_PRODUCAO_OP` −20, `removidoEm`).
  - `insumo com custo congelado` — muda `custoUnitario` do insumo no cadastro para 9 depois de lançar; a linha continua 0,5 e o custo provisório não muda.
  - `recusas` — produto FRUTO; `cat.produtoPolpaOutraId` → "outra fruta"; local da filial B; insumo inativo.
  - `OP encerrada recusa linhas` — (marcar `status: "ENCERRADA"` direto pelo Prisma neste teste) `adicionarConsumo`, `adicionarProducao`, `adicionarInsumo`, `removerConsumo` → "A OP X está encerrada".
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS; tsc limpo.
- [ ] **Step 5:** commit `feat(producao): produção de lotes de polpa e insumos com custo provisório`.

---

### Task 5: Encerrar, reabrir, cancelar, listar e detalhar

**Files:**
- Modify: `src/server/services/ordemProducao.ts`, `src/server/services/ordemProducao.test.ts`

**Interfaces:**
- Produces:
  - `type SituacaoDesfazer = { pode: true } | { pode: false; motivo: string }`; `situacaoParaDesfazer(op: { id: string; status: StatusOrdemProducao }, db: ClientePrisma = prisma): Promise<SituacaoDesfazer>`.
  - `encerrarOP(sessao, id, opcoes: { confirmarVerificar: boolean }): Promise<void>`.
  - `reabrirOP(sessao, id, motivo: string): Promise<void>`; `cancelarOP(sessao, id, motivo: string): Promise<void>`.
  - `type FiltroOPs = { inicio: Date; fim: Date; frutaId?: string; status?: StatusOrdemProducao }`; `listarOPs(filialId, filtros): Promise<OPListada[]>` — OP + `fruta { nome }` + `resumo: ResumoOP` (custo: o gravado se ENCERRADA, senão o calculado) ; ordem `data desc, numero desc`.
  - `obterOP(filialId, numero: string): Promise<OPDetalhada | null>` — OP + `fruta` + `usuario { nome }` + linhas **ativas**: `consumos` (com `lote { id, codigo, validade, produto { descricao } }`), `producoes` (com `lote { id, codigo, validade }`, `produto { codigo, descricao }`, `local { nome }`), `insumos` (com `insumo { nome, unidade }`) + `resumo` + `situacaoDesfazer`.

```ts
export async function situacaoParaDesfazer(op, db: ClientePrisma = prisma): Promise<SituacaoDesfazer> {
  if (op.status === "CANCELADA") return { pode: false, motivo: "A OP já está cancelada" };
  const saida = await db.movimentoEstoque.findFirst({
    where: {
      lote: { producaoOP: { is: { ordemProducaoId: op.id } } },
      tipo: { notIn: ["PRODUCAO_OP", "ESTORNO_PRODUCAO_OP"] },
    },
    select: { lote: { select: { codigo: true } } },
  });
  return saida ? { pode: false, motivo: `O lote ${saida.lote.codigo} já teve venda ou ajuste` } : { pode: true };
}
```

Regras:
- `encerrarOP`: `travarOP(["ABERTA"])`; sem consumo ativo → "Lance ao menos um consumo de fruto"; sem produção ativa → "Lance ao menos uma produção de polpa"; `resumirOP` com a configuração da filial; `aVerificar` não vazio e `!confirmarVerificar` → `` `Confirme para encerrar com itens a verificar: ${aVerificar.join(", ")}` ``; grava `custoFrutoTotal`, `custoInsumosTotal`, `custoKgPolpa`, `encerradaEm: new Date()`, `status: "ENCERRADA"`; `lote.updateMany` com `custoKg` final nos lotes ativos; auditoria `ENCERRAR` com `{ custo, balanco, branqueamento, confirmouVerificar: aVerificar.length > 0 }`.
- `reabrirOP`: motivo `trim` ≥ 3 → senão "Informe o motivo da reabertura"; `travarOP(["ENCERRADA"])`; `situacaoParaDesfazer(op, tx)`; limpa os três custos e `encerradaEm`, grava `motivoReabertura`, `status: "ABERTA"`; auditoria `REABRIR`.
- `cancelarOP`: motivo ≥ 3 → senão "Informe o motivo do cancelamento"; `travarOP(["ABERTA", "ENCERRADA"])`; `situacaoParaDesfazer`; `ESTORNO_CONSUMO_OP` (+kg) por consumo ativo; `ESTORNO_PRODUCAO_OP` (−saldo) por produção ativa; `status: "CANCELADA"`, `motivoCancelamento`, `canceladaEm`; auditoria `CANCELAR`.

- [ ] **Step 1: Testes que falham** (helper `opCompleta()` = OP + consumo 100 kg a 1,5 + AGC 40 + AFN 20 + insumo 60 un + processo que dá OK: água 0, caroço 38, perda 2, branqueamento 85 °C / 12 s):
  - `encerra e grava o custo` — `custoFrutoTotal` 150, `custoInsumosTotal` 30, `custoKgPolpa` 3; lotes com `custoKg` 3; `status` ENCERRADA; `encerradaEm` preenchido.
  - `encerrar exige consumo e produção` — OP vazia → "Lance ao menos um consumo de fruto"; só consumo → "…produção de polpa".
  - `com Verificar exige confirmação` — sem branqueamento: `confirmarVerificar: false` → "Confirme para encerrar com itens a verificar: Branqueamento"; `true` → encerra; auditoria `ENCERRAR` tem `confirmouVerificar: true`.
  - `concorrência` (Review Focus 1) — `Promise.allSettled([encerrarOP(...), adicionarConsumo(... 10 kg de outro lote)])`: se o consumo foi aceito, `custoFrutoTotal` inclui os 10 kg; se recusado, a mensagem é "A OP X está encerrada"; em qualquer caso, `custoFrutoTotal` = Σ consumos ativos × custo.
  - `reabrir` — sem saída: volta ABERTA, custos `null`, `motivoReabertura`; nova linha aceita; encerrar de novo grava o custo novo.
  - `reabrir e cancelar depois de venda` (Review Focus 5) — `criarCadastrosDeVenda` + `configurarVendas`; encerra; `criarPedido` de 5 kg do AGC; `cancelarPedido`; `reabrirOP` → "O lote AGC-… já teve venda ou ajuste"; `cancelarOP` → mesma mensagem.
  - `cancelar OP aberta` — fruto volta a 100 (`ESTORNO_CONSUMO_OP`), polpas zeradas (`ESTORNO_PRODUCAO_OP`), status CANCELADA; operações de linha → "A OP X está cancelada"; cancelar de novo → "A OP X está cancelada".
  - `motivo obrigatório` em reabrir e cancelar.
  - `listarOPs` — filtro por período, fruta e status; `resumo.rendimento` 0,6 e `resumo.custo.custoKgPolpa` 3.
  - `obterOP` — por número; outra filial → `null`; linhas removidas não aparecem.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS; tsc limpo.
- [ ] **Step 5:** commit `feat(producao): encerramento, reabertura e cancelamento da OP`.

---

### Task 6: Bloqueio da polpa em venda, ajuste e estoque

**Files:**
- Modify: `src/server/services/estoque.ts`, `src/server/services/pedidoVenda.ts`, `src/server/services/ajusteEstoque.ts`
- Modify: `src/app/(dashboard)/producao/estoque/page.tsx`, `src/app/(dashboard)/producao/ajustes/page.tsx`
- Test: `src/server/services/ordemProducao.test.ts` (bloco novo), `src/server/services/recepcaoFruto.test.ts`

**Interfaces:**
- Produces (estoque.ts):

```ts
/** Lote que pode sair por venda ou ajuste: recepção não excluída, ou polpa de OP encerrada (D-07). */
export const LOTE_LIBERADO: Prisma.LoteWhereInput = {
  OR: [
    { origem: "RECEPCAO", OR: [{ recepcao: { is: null } }, { recepcao: { is: { status: "ATIVA" } } }] },
    { origem: "PRODUCAO", producaoOP: { is: { removidoEm: null, ordemProducao: { status: "ENCERRADA" } } } },
  ],
};

export const SELECT_BLOQUEIO_PRODUCAO = {
  producaoOP: { select: { removidoEm: true, ordemProducao: { select: { status: true } } } },
} satisfies Prisma.LoteSelect;

/** Mensagem do bloqueio de um lote de polpa, ou null se pode sair. */
export function bloqueioDaProducao(lote: {
  codigo: string;
  producaoOP: { removidoEm: Date | null; ordemProducao: { status: StatusOrdemProducao } } | null;
}): string | null {
  const p = lote.producaoOP;
  if (!p) return null;
  if (p.removidoEm) return `O lote ${lote.codigo} foi removido da OP`;
  if (p.ordemProducao.status === "CANCELADA") return `O lote ${lote.codigo} é de uma OP cancelada`;
  if (p.ordemProducao.status === "ABERTA") return `O lote ${lote.codigo} está numa OP aberta`;
  return null;
}
```

- `listarLotes` passa a incluir `SELECT_BLOQUEIO_PRODUCAO` e devolve `emProducao: boolean` (= `producaoOP` ativo com OP ABERTA) e `bloqueio: string | null` (`bloqueioDaProducao`).
- `lotesParaVenda`: `where: { filialId, saldoKg: { gt: 0 }, ...LOTE_LIBERADO }` (substitui o `OR` de recepção).
- `criarPedido`: o `findMany` de lotes inclui `SELECT_BLOQUEIO_PRODUCAO`; no laço, depois da checagem de recepção: `const bloqueio = bloqueioDaProducao(lote); if (bloqueio) throw new Error(bloqueio);`.
- `criarAjuste`: o `select` do lote inclui `SELECT_BLOQUEIO_PRODUCAO`; depois da checagem de recepção, o mesmo `throw`.
- Estoque (página): badge `outline` "Em produção" ao lado do status quando `lote.emProducao`; botão **Etiqueta** escondido quando `lote.bloqueio`.
- Ajustes (página): o filtro dos lotes do diálogo passa a ser `l.recepcao?.status !== "CANCELADA" && !l.bloqueio`.

- [ ] **Step 1: Testes que falham** (Review Focus 2):
  - `polpa de OP aberta fica fora de lotesParaVenda e é recusada no pedido e no ajuste` — mensagens "O lote X está numa OP aberta"; `moverLote` aceito.
  - `depois de encerrar, aparece e vende`.
  - `linha removida e OP cancelada continuam bloqueadas` — removida + OP encerrada → "foi removido da OP"; OP cancelada → "é de uma OP cancelada" (no ajuste de entrada também).
  - `listarLotes` devolve `emProducao: true` para a polpa de OP aberta.
  - Em `recepcaoFruto.test.ts`: `não cancela recepção cujo lote foi consumido em OP` → "O lote já teve movimentação; não é possível excluir a recepção" (regra existente; o teste fixa o comportamento).
- [ ] **Step 2:** FAIL. **Step 3:** implementar serviço e páginas. **Step 4:** `npx vitest run src/server/services` PASS (7b e 7c intactos); tsc limpo.
- [ ] **Step 5:** commit `feat(producao): polpa bloqueada para venda e ajuste até encerrar a OP`.

---

### Task 7: Etiqueta configurável e uma por embalagem

**Files:**
- Modify: `src/lib/export/etiqueta.ts`, `src/lib/export/etiqueta.test.ts`
- Modify: `src/app/(dashboard)/producao/lotes/[id]/etiqueta/route.ts`
- Modify: `src/lib/schemas/produto.ts`, `src/server/services/produto.ts` (+ teste), `src/app/(dashboard)/cadastros/produtos/{page.tsx,produto-dialog-form.tsx}`
- Modify: `src/lib/schemas/configuracaoProducao.ts`, `src/server/services/configuracaoProducao.ts` (+ teste), `src/app/(dashboard)/configuracao-producao/{page.tsx,configuracao-form.tsx}`

**Interfaces:**
- Produces: `DadosEtiqueta` += `cnpj: string | null; endereco: string | null; texto: string | null; copias?: number` (padrão 1). `pesoLiquidoKg` passa a ser o peso **de cada** etiqueta.
- Produces: `produtoSchema` += `textoEtiqueta: textoOpcional`; `ConfiguracaoProducaoValores` += `enderecoEtiqueta: string | null` (padrão `null`); `configuracaoProducaoSchema` += `enderecoEtiqueta: textoOpcional` (→ `?? null` no transform).

Layout da etiqueta (100 × 70 mm, nada sai da página): linha da empresa ganha ` · CNPJ <cnpj>` quando houver; endereço logo abaixo em 6,5 pt cinza, 1 linha (`quebrar(..., 1)`); `texto` em 6,5 pt, até 3 linhas, logo acima do rodapé do registro ADEPARA. Uma página por cópia (`for (let i = 0; i < copias; i++)` desenhando a mesma etiqueta; extrair o desenho para `desenharEtiqueta(pagina, fontes, dados)`).

Rota: o lote inclui `producaoOP { embalagens, quantidadeKg, removidoEm, ordemProducao { status } }`, `produto.textoEtiqueta`, `filial.cnpjCpf`. Se `producaoOP` e `bloqueioDaProducao(lote)` não for null → `409` com o texto "Encerre a OP antes de imprimir a etiqueta" quando a OP está ABERTA, ou a própria mensagem de bloqueio nos outros casos. Com `embalagens` → `copias = embalagens`, `pesoLiquidoKg = arredondar(quantidadeKg / embalagens, 3)`; senão `copias = 1`, peso do lote. `endereco` da configuração.

- [ ] **Step 1: Testes que falham:**
  - `etiqueta.test.ts`: `copias: 3` → 3 páginas de 100 × 70 mm; com `cnpj`, `endereco` e um `texto` de 600 caracteres com "−18 °C" → não lança e continua 1 página por cópia.
  - `produto.test.ts`: salva e devolve `textoEtiqueta`; vazio vira `null`.
  - `configuracaoProducao.test.ts`: salva e devolve `enderecoEtiqueta`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar lib, rota, cadastro (Textarea "Texto da etiqueta" com ajuda "Ingredientes, instruções de conservação e outros dizeres obrigatórios.") e configuração (campo "Endereço na etiqueta" no card da ADEPARA). **Step 4:** PASS; tsc limpo.
- [ ] **Step 5:** commit `feat(producao): etiqueta com CNPJ, endereço e texto do produto, uma por embalagem`.

---

### Task 8: Menu e lista de OPs

**Files:**
- Modify: `src/app/(dashboard)/nav-items.ts`, `src/app/(dashboard)/nav-items.test.ts`
- Create: `src/app/(dashboard)/producao/processamento/{page.tsx,filtros.ts,nova-op-dialog.tsx,actions.ts,export/route.ts}`

**Interfaces:**
- Produces: item `{ href: "/producao/processamento", label: "Processamento", acao: "producao:ler" }` na seção "Produção", entre "Recepção de fruto" e "Estoque".
- Produces: `filtrosDasOPs(sp: { inicio?; fim?; fruta?; status? }): FiltroOPs` (período por `periodoDaUrl`, `status` validado contra `STATUS_ORDEM_PRODUCAO`).
- Produces (actions.ts, `"use server"`): `FormState = { erro?: string; sucesso?: boolean }`; `criarOPAction(prev, formData)` → `novaOPSchema`; sucesso → `revalidatePath("/producao", "layout")` e `redirect(`/producao/processamento/${numero}`)` fora do `try`.

- [ ] **Step 1: Teste que falha** em `nav-items.test.ts`: PRODUCAO e CONSULTA veem "Processamento" na seção "Produção"; VENDAS também (tem `producao:ler`).
- [ ] **Step 2:** FAIL. **Step 3:** item de menu; PASS.
- [ ] **Step 4: Página** `/producao/processamento` (`producao:ler`):
  - `BarraDeFiltros` com De, Até, Fruta (frutas da empresa), Status; `ExportarLinks baseHref="/producao/processamento/export"`.
  - Colunas: Nº (link para o detalhe), Data, Fruta, Responsável, Fruto (kg), Polpa (kg), Rendimento (%), Balanço (badge OK `secondary` / Verificar `destructive`), Branqueamento (OK / Verificar / Não se aplica), Custo/kg (com "(prov.)" em `text-muted-foreground` quando aberta), Status (Aberta `secondary`, Encerrada `default`, Cancelada `outline`).
  - **Nova OP** (`producao:escrever` + `podeAlterarFilial`): `NovaOPDialog` com Data (hoje), Fruta (Select controlado, frutas ativas), Responsável; usa `useActionState` (o diálogo não fecha sozinho: o `redirect` leva ao detalhe).
  - Tabela em `div.overflow-x-auto`.
- [ ] **Step 5: Export:** Nº · Data · Fruta · Responsável · Fruto (kg) · Polpa (kg) · Rendimento `percentual` · Balanço (kg) · Balanço (%) `percentual` · Balanço · Branqueamento · Custo total · Custo/kg · Status. `producao:ler` (403). PDF com `cabecalhoDoRelatorio` e filtros. Seguir `src/app/(dashboard)/vendas/pedidos/export/route.ts`.
- [ ] **Step 6:** `npx tsc --noEmit` limpo.
- [ ] **Step 7:** commit `feat(producao): lista de ordens de produção`.

---

### Task 9: Detalhe da OP

**Files:**
- Create: `src/app/(dashboard)/producao/processamento/[numero]/{page.tsx,linhas-op.tsx,processo-form.tsx,op-acoes.tsx}`
- Modify: `src/app/(dashboard)/producao/processamento/actions.ts`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces (actions; todas leem `opId` ou o id da linha do `formData`, devolvem `FormState`, e no sucesso `revalidatePath("/producao", "layout")` + `revalidatePath("/vendas", "layout")`):
  `atualizarOPAction`, `adicionarConsumoAction`, `removerConsumoAction`, `adicionarProducaoAction`, `removerProducaoAction`, `adicionarInsumoAction`, `removerInsumoAction`, `encerrarOPAction` (`confirmarVerificar` = checkbox), `reabrirOPAction`, `cancelarOPAction`.

- [ ] **Step 1: Página** (`producao:ler`; `obterOP` null → `notFound()`). `const aba = sp.aba ∈ ["consumo","producao","insumos","processo"] ? sp.aba : "consumo"`. `podeEscrever = producao:escrever && podeAlterarFilial && op.status === "ABERTA"`.
  - **Cabeçalho:** nº, data, fruta, responsável, status (badge), usuário; motivo de reabertura/cancelamento quando houver. Sem linhas e aberta: botão "Editar" (diálogo com data, fruta, responsável → `atualizarOPAction`).
  - **Resumo** (`Card`, grid 2 colunas no celular, 4 em `sm:`): Fruto, Polpa, Rendimento, Balanço (kg, %, badge), Branqueamento (badge), Custo total, Custo/kg ("provisório" em `text-muted-foreground` quando não encerrada).
  - **Abas:** links `?aba=…` estilizados como botões (`variant` `default` na ativa, `outline` nas outras), com o contador de linhas.
  - **Ações** (`OPAcoes`, client): Encerrar (aberta; diálogo; se `resumo.aVerificar` não vazio, lista os itens e exige o checkbox "Confirmo o encerramento com itens a verificar"), Reabrir (encerrada), Cancelar (aberta ou encerrada) — ambos com motivo obrigatório, desabilitados com `title` = `situacaoDesfazer.motivo` quando não pode. Só com `producao:escrever` + `podeAlterarFilial`.
- [ ] **Step 2: Abas** (`linhas-op.tsx`, client, uma tabela + um formulário "adicionar" por aba; formulário só com `podeEscrever`; remover com `confirm()` e form com o id):
  - **Consumo:** colunas Lote, Produto, Validade, kg, Custo/kg, Custo, Motivo (vencido). Form: Lote (Select controlado com `lotesParaConsumo(filialId, op.frutaId, op.data)`, rótulo `"FA-261110-01 · 100 kg · vence 11/11/2026"` + " · VENCIDO"; lotes já na OP fora da lista), kg, Motivo da liberação (só se vencido e `podeExecutar(perfil, "producao:liberarVencido")`; se vencido e não pode, texto em vermelho "Lote vencido: só gestor ou administrador libera"). Aviso vermelho quando kg > saldo.
  - **Produção:** colunas Lote, Produto, kg, Embalagens, Local, Validade, Etiqueta (link `target="_blank"` para `/producao/lotes/<loteId>/etiqueta`, só com OP encerrada). Form: Produto (POLPA ativos da fruta da OP), kg, Embalagens, Local (ativos da filial).
  - **Insumos:** colunas Insumo, Quantidade (com unidade), Custo unitário, Custo. Form: Insumo (ativos; rótulo `"Embalagem 1 kg · un · R$ 0,50"`), Quantidade.
  - **Processo** (`processo-form.tsx`): Temperatura (°C) e Tempo (s) só se `fruta.exigeBranqueamento` (texto "Mínimos: 80 °C e 10 s" da configuração), Água (L), Caroço/resíduo (kg), Perda (kg), Observação; Salvar → `atualizarOPAction`. Só leitura quando não `podeEscrever`.
  - Selects controlados (`value={x || null}`, `onValueChange={(v) => set(v ?? "")}`, com `name`). Inputs numéricos com `inputMode="decimal"` e `step="0.001"`. Formulários limpam os campos após sucesso (chave do form muda com um contador).
- [ ] **Step 3:** `npx tsc --noEmit` limpo.
- [ ] **Step 4:** commit `feat(producao): detalhe da OP com consumo, produção, insumos e processo`.

---

### Task 10: Ajuda, verificação e docs

- [ ] **Step 1:** `content/ajuda/passo-a-passo.md`, seção nova **5.2. Processamento (OP)** (renumerar Estoque, Ajustes e Etiqueta para 5.3–5.5): abrir a OP; lançar consumo (lotes FEFO, fruto vencido só com liberação do gestor); lançar produção (cada linha vira um lote de polpa, bloqueado até encerrar); insumos com o custo do cadastro no dia; processo e branqueamento; resumo ao vivo; encerrar (confirmação quando há "Verificar"); reabrir e cancelar só enquanto a polpa não saiu; etiqueta uma por embalagem. Na 5.5 (Etiqueta): CNPJ, endereço (Configuração de produção) e texto do produto (cadastro).
- [ ] **Step 2:** `npm test`, `npm run lint`, `npm run build` limpos.
- [ ] **Step 3: Navegador** (reiniciar o dev após o generate; login admin → Empresa Demonstração → Matriz; criar fruta/produtos/insumo de teste se faltarem):
  - OP completa no desktop: recepção de fruto → nova OP → consumo, duas polpas, insumo, processo → resumo ao vivo → encerrar com "Verificar" (sem branqueamento) → custo gravado.
  - Polpa "Em produção" no estoque e fora do novo pedido enquanto aberta; depois de encerrar, aparece no pedido.
  - Reabrir, remover/lançar linha, encerrar de novo; cancelar outra OP.
  - Etiqueta por embalagem (N páginas, peso por embalagem) e com texto/endereço configurados; 409 com OP aberta.
  - Fruto vencido: bloqueado para o perfil PRODUCAO, liberado pelo admin com motivo.
  - Exportações CSV, Excel e PDF da lista.
  - Tela a 390 px (lista e detalhe, todas as abas).
  - Apagar do banco de dev os dados criados para o teste.
- [ ] **Step 4:** `docs/fases/fase-7-producao-estoque-vendas.md` (7e concluída), spec com `Status: implementada (data)`, `docs/backlog.md` com o rateio de custo por qualidade (D-06). Commit `docs(producao): Fase 7e concluída`.
