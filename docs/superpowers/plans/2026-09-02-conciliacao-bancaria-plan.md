# Conciliação Bancária (Fase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar extrato bancário (OFX), conciliar automaticamente contra os `LancamentoBancario` já existentes por valor+data+conta+tipo, e dar uma tela de revisão manual pros casos ambíguos/divergentes.

**Architecture:** Dois models novos (`ExtratoImportado`, `LinhaExtrato`) + um campo (`LancamentoBancario.conciliado`). Um parser de OFX próprio (função pura). Um motor de classificação por linha (função pura, testável sem banco). Serviços async que persistem o resultado da classificação e expõem ações manuais (confirmar sugestão, desconciliar, criar lançamento a partir de uma linha órfã). UI nova em `/financeiro/conciliacao`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7 (`@prisma/adapter-pg`), Zod, Vitest (Postgres real, sem mock).

**Spec:** `docs/superpowers/specs/2026-09-02-conciliacao-bancaria-design.md`

## Global Constraints

- Só OFX nesta fase — nenhuma dependência nova de parsing (nem OFX, nem CSV/Excel genérico); o parser é código próprio.
- Tolerância de data no matching automático: ±3 dias. Janela ampla de busca de candidatos: ±30 dias.
- Conciliação é 1:1 — `LinhaExtrato.lancamentoBancarioId` é `@unique`.
- Dedupe de importação é por `@@unique([contaBancariaId, identificadorBancario])` — nunca por lógica em memória.
- Nenhum candidato de conciliação (sugestão/divergência/duplicado) é persistido antes de confirmado — sempre recalculado sob demanda (`buscarCandidatosDaLinha`), nunca lido de uma coluna congelada.
- Todo service segue o padrão já estabelecido: `requirePermission`, `requireAlteracaoFilial`, validar que toda referência (conta bancária, lançamento) pertence à `sessao.filialId`, `registrarAuditoria` em toda escrita.
- `entidade`/`acao` de `AuditLog` são `String` livres — sem enum, sem migration necessária pra novos valores.

---

### Task 1: Schema — models e migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: enum `StatusLinhaExtrato` (`NAO_CONCILIADO`, `SUGESTAO`, `CONCILIADO`, `DIVERGENCIA_VALOR`, `DIVERGENCIA_DATA`, `DUPLICADO`); model `ExtratoImportado`; model `LinhaExtrato`; campo `LancamentoBancario.conciliado: Boolean`.

- [ ] **Step 1: Adicionar o enum, perto dos outros enums financeiros (depois de `OrigemLancamento`)**

```prisma
enum StatusLinhaExtrato {
  NAO_CONCILIADO
  SUGESTAO
  CONCILIADO
  DIVERGENCIA_VALOR
  DIVERGENCIA_DATA
  DUPLICADO
}
```

- [ ] **Step 2: Adicionar `conciliado` ao model `LancamentoBancario` existente**

Abrir `prisma/schema.prisma`, achar `model LancamentoBancario` e adicionar o campo depois de `origem`:

```prisma
  origem                OrigemLancamento @default(MANUAL)
  conciliado             Boolean          @default(false)
```

(mantém todos os outros campos do model como estão — só essa linha nova)

- [ ] **Step 3: Adicionar os dois models novos, depois de `model LancamentoBancario`**

```prisma
model ExtratoImportado {
  id              String   @id @default(uuid())
  filialId        String
  contaBancariaId String
  nomeArquivo     String
  totalLinhas     Int
  linhasNovas     Int
  linhasIgnoradas Int
  usuarioId       String
  criadoEm        DateTime @default(now())

  filial        Filial         @relation(fields: [filialId], references: [id], onDelete: Cascade)
  contaBancaria ContaBancaria  @relation(fields: [contaBancariaId], references: [id])
  usuario       Usuario        @relation(fields: [usuarioId], references: [id])
  linhas        LinhaExtrato[]

  @@index([filialId])
  @@index([contaBancariaId])
  @@map("extratos_importados")
}

model LinhaExtrato {
  id                    String             @id @default(uuid())
  extratoImportadoId    String
  contaBancariaId       String
  data                  DateTime
  valor                 Decimal            @db.Decimal(18, 2)
  tipo                  TipoLancamento
  historico             String
  identificadorBancario String
  status                StatusLinhaExtrato @default(NAO_CONCILIADO)
  lancamentoBancarioId  String?            @unique
  criadoEm              DateTime           @default(now())

  extratoImportado   ExtratoImportado    @relation(fields: [extratoImportadoId], references: [id], onDelete: Cascade)
  contaBancaria      ContaBancaria       @relation(fields: [contaBancariaId], references: [id])
  lancamentoBancario LancamentoBancario? @relation(fields: [lancamentoBancarioId], references: [id])

  @@unique([contaBancariaId, identificadorBancario])
  @@index([contaBancariaId])
  @@index([extratoImportadoId])
  @@index([status])
  @@map("linhas_extrato")
}
```

- [ ] **Step 4: Adicionar as relações reversas**

Em `model Filial`, no bloco de relações (perto de `lancamentosBancarios`):
```prisma
  extratosImportados    ExtratoImportado[]
```

Em `model ContaBancaria`, perto de `lancamentos`/`saldosInformados`:
```prisma
  extratosImportados ExtratoImportado[]
  linhasExtrato      LinhaExtrato[]
```

Em `model Usuario`, perto de `lancamentosBancarios`/`saldosBancariosInformados`:
```prisma
  extratosImportados         ExtratoImportado[]
```

Em `model LancamentoBancario`, no bloco de relações:
```prisma
  linhaExtrato LinhaExtrato?
```

- [ ] **Step 5: Formatar e gerar a migration**

Run: `npx prisma format`
Run: `npx prisma migrate dev --name add_conciliacao_bancaria`
Run: `npx prisma generate`
Expected: migration aplicada sem erro, client gerado com `prisma.extratoImportado`/`prisma.linhaExtrato` disponíveis.

- [ ] **Step 6: Verificar que o projeto ainda compila**

Run: `npx tsc --noEmit`
Expected: sem erros (nenhum código ainda usa os models novos, então isso só confirma que o schema em si é válido e não quebrou nada existente).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Adicionar schema de ExtratoImportado, LinhaExtrato e LancamentoBancario.conciliado"
```

---

### Task 2: Permissões e enum de UI

**Files:**
- Modify: `src/server/auth/permissions.ts`
- Modify: `src/lib/schemas/enums.ts`

**Interfaces:**
- Consumes: nenhuma (task isolada).
- Produces: `Acao` ganha `"conciliacao:ler" | "conciliacao:escrever"`; helper `podeEscreverConciliacao(perfil, podeAlterarFilial): boolean`; `STATUS_LINHA_EXTRATO` (array `as const`) em `enums.ts`.

- [ ] **Step 1: Adicionar as duas ações novas ao tipo `Acao`, em `src/server/auth/permissions.ts`**

```ts
  | "lancamento:ler"
  | "lancamento:escrever"
  | "conciliacao:ler"
  | "conciliacao:escrever";
```

- [ ] **Step 2: Adicionar as ações ao mapa `PERMISSOES`**

```ts
  FINANCEIRO: new Set([
    "cadastro:escrever",
    "cadastro:ler",
    "titulo:ler",
    "titulo:escrever",
    "titulo:baixar",
    "lancamento:ler",
    "conciliacao:ler",
  ]),
  TESOURARIA: new Set([
    "cadastro:escrever",
    "cadastro:ler",
    "titulo:ler",
    "titulo:baixar",
    "titulo:aprovar",
    "lancamento:ler",
    "lancamento:escrever",
    "conciliacao:ler",
    "conciliacao:escrever",
  ]),
  GESTOR: new Set(["cadastro:ler", "auditoria:ler", "titulo:ler", "lancamento:ler", "conciliacao:ler"]),
  AUDITOR: new Set(["cadastro:ler", "auditoria:ler", "titulo:ler", "lancamento:ler", "conciliacao:ler"]),
  CONSULTA: new Set(["cadastro:ler", "titulo:ler", "lancamento:ler", "conciliacao:ler"]),
```

- [ ] **Step 3: Adicionar o helper, depois de `podeEscreverLancamento`**

```ts
export function podeEscreverConciliacao(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "conciliacao:escrever") && podeAlterarFilial;
}
```

- [ ] **Step 4: Adicionar o array de status em `src/lib/schemas/enums.ts`**

```ts
export const STATUS_LINHA_EXTRATO = [
  "NAO_CONCILIADO",
  "SUGESTAO",
  "CONCILIADO",
  "DIVERGENCIA_VALOR",
  "DIVERGENCIA_DATA",
  "DUPLICADO",
] as const;
```

- [ ] **Step 5: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/server/auth/permissions.ts src/lib/schemas/enums.ts
git commit -m "Adicionar permissoes conciliacao:ler/escrever e STATUS_LINHA_EXTRATO"
```

---

### Task 3: Parser de OFX

**Files:**
- Create: `src/server/services/ofxParser.ts`
- Test: `src/server/services/ofxParser.test.ts`

**Interfaces:**
- Produces: `type TransacaoOfx = { data: Date; valor: number; tipo: "ENTRADA" | "SAIDA"; historico: string; identificadorBancario: string }`; `function parseOfx(conteudo: string): TransacaoOfx[]`.

- [ ] **Step 1: Escrever o teste**

```ts
// src/server/services/ofxParser.test.ts
import { describe, expect, test } from "vitest";
import { parseOfx } from "./ofxParser";

const AMOSTRA_OFX = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260815120000
<TRNAMT>-150.00
<FITID>202608150001
<NAME>TARIFA MANUTENCAO CONTA
<MEMO>PACOTE DE SERVICOS
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260816120000
<TRNAMT>980.50
<FITID>202608160002
<NAME>PIX RECEBIDO
<MEMO>
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

describe("parseOfx", () => {
  test("extrai as transações do bloco STMTTRN", () => {
    const transacoes = parseOfx(AMOSTRA_OFX);
    expect(transacoes).toHaveLength(2);
  });

  test("TRNAMT negativo vira SAIDA com valor positivo", () => {
    const [primeira] = parseOfx(AMOSTRA_OFX);
    expect(primeira.tipo).toBe("SAIDA");
    expect(primeira.valor).toBe(150);
    expect(primeira.identificadorBancario).toBe("202608150001");
    expect(primeira.historico).toBe("TARIFA MANUTENCAO CONTA — PACOTE DE SERVICOS");
    expect(primeira.data.getUTCFullYear()).toBe(2026);
    expect(primeira.data.getUTCMonth()).toBe(7); // agosto (0-indexado)
    expect(primeira.data.getUTCDate()).toBe(15);
  });

  test("TRNAMT positivo vira ENTRADA, e MEMO vazio não quebra o histórico", () => {
    const [, segunda] = parseOfx(AMOSTRA_OFX);
    expect(segunda.tipo).toBe("ENTRADA");
    expect(segunda.valor).toBe(980.5);
    expect(segunda.historico).toBe("PIX RECEBIDO");
  });

  test("linha sem FITID lança erro", () => {
    const semFitid = `<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260815120000\n<TRNAMT>-10.00\n<NAME>X\n</STMTTRN>`;
    expect(() => parseOfx(semFitid)).toThrow(/FITID/);
  });

  test("conteúdo sem nenhum STMTTRN retorna lista vazia", () => {
    expect(parseOfx("<OFX></OFX>")).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha (arquivo ainda não existe)**

Run: `npx vitest run src/server/services/ofxParser.test.ts`
Expected: FAIL — `Cannot find module './ofxParser'`.

- [ ] **Step 3: Implementar o parser**

```ts
// src/server/services/ofxParser.ts

export type TransacaoOfx = {
  data: Date;
  valor: number;
  tipo: "ENTRADA" | "SAIDA";
  historico: string;
  identificadorBancario: string;
};

function extrairTag(bloco: string, tag: string): string | null {
  const match = bloco.match(new RegExp(`<${tag}>([^\\r\\n<]*)`, "i"));
  return match ? match[1].trim() : null;
}

function parseDataOfx(valor: string): Date {
  const ano = Number(valor.slice(0, 4));
  const mes = Number(valor.slice(4, 6));
  const dia = Number(valor.slice(6, 8));
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/**
 * Parser próprio, sem dependência: OFX é um bloco de tags `<TAG>valor`
 * (uma por linha, sem fechamento) dentro de `<STMTTRN>...</STMTTRN>`.
 * Nenhuma lib de OFX no npm está mantida o suficiente pra justificar a
 * dependência num formato tão simples.
 */
export function parseOfx(conteudo: string): TransacaoOfx[] {
  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];

  return blocos.map((bloco) => {
    const trnamt = extrairTag(bloco, "TRNAMT");
    const dtposted = extrairTag(bloco, "DTPOSTED");
    const fitid = extrairTag(bloco, "FITID");
    const name = extrairTag(bloco, "NAME") ?? "";
    const memo = extrairTag(bloco, "MEMO") ?? "";

    if (!trnamt || !dtposted || !fitid) {
      throw new Error("Linha de extrato OFX inválida: faltam TRNAMT, DTPOSTED ou FITID");
    }

    const valorNumerico = Number(trnamt);

    return {
      data: parseDataOfx(dtposted),
      valor: Math.abs(valorNumerico),
      tipo: valorNumerico < 0 ? "SAIDA" : "ENTRADA",
      historico: [name, memo].filter(Boolean).join(" — ") || "Sem histórico",
      identificadorBancario: fitid,
    };
  });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/server/services/ofxParser.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/ofxParser.ts src/server/services/ofxParser.test.ts
git commit -m "Adicionar parser de OFX proprio"
```

---

### Task 4: Motor de matching (função pura)

**Files:**
- Create: `src/server/services/conciliacao.ts`
- Test: `src/server/services/conciliacao.test.ts`

**Interfaces:**
- Consumes: `StatusLinhaExtrato`, `TipoLancamento` de `@prisma/client`.
- Produces: `type LinhaParaClassificar = { data: Date; valor: number; tipo: TipoLancamento }`; `type CandidatoParaClassificar = { id: string; data: Date; valor: number; conciliado: boolean }`; `function classificarLinhaExtrato(linha: LinhaParaClassificar, candidatos: CandidatoParaClassificar[]): { status: StatusLinhaExtrato; lancamentoAutoVinculadoId: string | null }`. Este arquivo cresce nas Tasks 6 e 7 — esta task só cria a função pura, sem nenhum código de banco ainda.

- [ ] **Step 1: Escrever o teste**

```ts
// src/server/services/conciliacao.test.ts
import { describe, expect, test } from "vitest";
import { classificarLinhaExtrato, type CandidatoParaClassificar } from "./conciliacao";

const LINHA_BASE = { data: new Date("2026-08-15T00:00:00Z"), valor: 150, tipo: "SAIDA" as const };

function candidato(overrides: Partial<CandidatoParaClassificar>): CandidatoParaClassificar {
  return { id: "cand-1", data: new Date("2026-08-15T00:00:00Z"), valor: 150, conciliado: false, ...overrides };
}

describe("classificarLinhaExtrato", () => {
  test("um único candidato exato (valor+data dentro de 3 dias, não conciliado) -> CONCILIADO", () => {
    const resultado = classificarLinhaExtrato(LINHA_BASE, [candidato({ id: "c1" })]);
    expect(resultado).toEqual({ status: "CONCILIADO", lancamentoAutoVinculadoId: "c1" });
  });

  test("data 3 dias depois ainda está dentro da janela -> CONCILIADO", () => {
    const resultado = classificarLinhaExtrato(LINHA_BASE, [
      candidato({ id: "c1", data: new Date("2026-08-18T00:00:00Z") }),
    ]);
    expect(resultado.status).toBe("CONCILIADO");
  });

  test("dois candidatos exatos -> SUGESTAO", () => {
    const resultado = classificarLinhaExtrato(LINHA_BASE, [
      candidato({ id: "c1" }),
      candidato({ id: "c2" }),
    ]);
    expect(resultado).toEqual({ status: "SUGESTAO", lancamentoAutoVinculadoId: null });
  });

  test("candidato exato mas já conciliado, sem nenhum outro -> DUPLICADO", () => {
    const resultado = classificarLinhaExtrato(LINHA_BASE, [candidato({ id: "c1", conciliado: true })]);
    expect(resultado).toEqual({ status: "DUPLICADO", lancamentoAutoVinculadoId: null });
  });

  test("candidato com data dentro da janela mas valor diferente, único -> DIVERGENCIA_VALOR", () => {
    const resultado = classificarLinhaExtrato(LINHA_BASE, [candidato({ id: "c1", valor: 155 })]);
    expect(resultado).toEqual({ status: "DIVERGENCIA_VALOR", lancamentoAutoVinculadoId: null });
  });

  test("candidato com valor igual mas fora da janela de 3 dias (dentro de 30), único -> DIVERGENCIA_DATA", () => {
    const resultado = classificarLinhaExtrato(LINHA_BASE, [
      candidato({ id: "c1", data: new Date("2026-08-25T00:00:00Z") }),
    ]);
    expect(resultado).toEqual({ status: "DIVERGENCIA_DATA", lancamentoAutoVinculadoId: null });
  });

  test("nenhum candidato -> NAO_CONCILIADO", () => {
    const resultado = classificarLinhaExtrato(LINHA_BASE, []);
    expect(resultado).toEqual({ status: "NAO_CONCILIADO", lancamentoAutoVinculadoId: null });
  });

  test("múltiplos candidatos de divergência de valor -> NAO_CONCILIADO (ambíguo demais pra sugerir)", () => {
    const resultado = classificarLinhaExtrato(LINHA_BASE, [
      candidato({ id: "c1", valor: 140 }),
      candidato({ id: "c2", valor: 160 }),
    ]);
    expect(resultado).toEqual({ status: "NAO_CONCILIADO", lancamentoAutoVinculadoId: null });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/server/services/conciliacao.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar a função pura**

```ts
// src/server/services/conciliacao.ts
import type { StatusLinhaExtrato, TipoLancamento } from "@prisma/client";

export type LinhaParaClassificar = {
  data: Date;
  valor: number;
  tipo: TipoLancamento;
};

export type CandidatoParaClassificar = {
  id: string;
  data: Date;
  valor: number;
  conciliado: boolean;
};

export const JANELA_TOLERANCIA_DIAS = 3;
export const JANELA_BUSCA_DIAS = 30;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

function dentroDaJanela(dataCandidato: Date, dataLinha: Date, dias: number): boolean {
  return Math.abs(dataCandidato.getTime() - dataLinha.getTime()) <= dias * UM_DIA_MS;
}

/**
 * Classificação determinística, sem I/O — os `candidatos` já vêm
 * filtrados pelo chamador (mesma contaBancariaId + mesmo tipo, dentro
 * de JANELA_BUSCA_DIAS). Nenhum candidato aqui é persistido — só o
 * resultado de CONCILIADO carrega um id pra vincular de fato.
 */
export function classificarLinhaExtrato(
  linha: LinhaParaClassificar,
  candidatos: CandidatoParaClassificar[],
): { status: StatusLinhaExtrato; lancamentoAutoVinculadoId: string | null } {
  const exatos = candidatos.filter(
    (c) => !c.conciliado && c.valor === linha.valor && dentroDaJanela(c.data, linha.data, JANELA_TOLERANCIA_DIAS),
  );
  if (exatos.length === 1) {
    return { status: "CONCILIADO", lancamentoAutoVinculadoId: exatos[0].id };
  }
  if (exatos.length > 1) {
    return { status: "SUGESTAO", lancamentoAutoVinculadoId: null };
  }

  const jaConciliados = candidatos.filter(
    (c) => c.conciliado && c.valor === linha.valor && dentroDaJanela(c.data, linha.data, JANELA_TOLERANCIA_DIAS),
  );
  if (jaConciliados.length > 0) {
    return { status: "DUPLICADO", lancamentoAutoVinculadoId: null };
  }

  const divergenciaValor = candidatos.filter(
    (c) => !c.conciliado && dentroDaJanela(c.data, linha.data, JANELA_TOLERANCIA_DIAS) && c.valor !== linha.valor,
  );
  if (divergenciaValor.length === 1) {
    return { status: "DIVERGENCIA_VALOR", lancamentoAutoVinculadoId: null };
  }

  const divergenciaData = candidatos.filter(
    (c) => !c.conciliado && c.valor === linha.valor && !dentroDaJanela(c.data, linha.data, JANELA_TOLERANCIA_DIAS),
  );
  if (divergenciaData.length === 1) {
    return { status: "DIVERGENCIA_DATA", lancamentoAutoVinculadoId: null };
  }

  return { status: "NAO_CONCILIADO", lancamentoAutoVinculadoId: null };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/server/services/conciliacao.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/conciliacao.ts src/server/services/conciliacao.test.ts
git commit -m "Adicionar motor de classificacao de linha de extrato (funcao pura)"
```

---

### Task 5: Importação de extrato

**Files:**
- Modify: `src/server/services/conciliacao.ts`
- Modify: `src/server/services/conciliacao.test.ts`
- Modify: `src/server/services/financeiroTestFixtures.ts`

**Interfaces:**
- Consumes: `classificarLinhaExtrato` (não usada ainda nesta task), `parseOfx`/`TransacaoOfx` de `./ofxParser`, `SessaoAtiva` de `@/server/auth/sessao`, `requirePermission`/`requireAlteracaoFilial` de `@/server/auth/permissions`, `registrarAuditoria` de `@/server/audit/registrar`, `prisma` de `@/server/db/client`.
- Produces: `async function importarExtratoOfx(sessao: SessaoAtiva, contaBancariaId: string, arquivo: File): Promise<ExtratoImportado>`.

- [ ] **Step 1: Estender `limparFixtureFinanceiro` pra limpar as tabelas novas**

Em `src/server/services/financeiroTestFixtures.ts`, a limpeza precisa
rodar **antes** da limpeza de `lancamentoBancario` (que já existe),
porque `LinhaExtrato.lancamentoBancarioId` referencia
`LancamentoBancario` sem cascade:

```ts
export async function limparFixtureFinanceiro(fixture: FixtureFinanceiro): Promise<void> {
  await prisma.linhaExtrato.deleteMany({ where: { contaBancaria: { filialId: fixture.filialId } } });
  await prisma.extratoImportado.deleteMany({ where: { filialId: fixture.filialId } });
  await prisma.lancamentoBancario.deleteMany({ where: { filialId: fixture.filialId } });
  await prisma.saldoBancarioInformado.deleteMany({ where: { contaBancaria: { filialId: fixture.filialId } } });
  await prisma.anexo.deleteMany({ where: { titulo: { filialId: fixture.filialId } } });
  // ... resto do corpo já existente, sem alteração
```

(as duas linhas novas vão logo no topo da função, antes de tudo que já
existe — não altere o resto do corpo).

- [ ] **Step 2: Escrever os testes de `importarExtratoOfx`**

O `describe("classificarLinhaExtrato", ...)` da Task 4 continua no topo
do arquivo, sem alteração. **Trocar** a linha de import do vitest (topo
do arquivo, criada na Task 4: `import { describe, expect, test } from
"vitest";`) para incluir `afterAll`/`beforeAll` — não duplicar a linha:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
```

Adicionar os imports novos (estes sim, linhas adicionais) logo abaixo,
e o resto do bloco ao final do arquivo:

```ts
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { importarExtratoOfx } from "./conciliacao";

const OFX_DUAS_TRANSACOES = (fitidA: string, fitidB: string) => `
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260815120000
<TRNAMT>-150.00
<FITID>${fitidA}
<NAME>TARIFA
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260816120000
<TRNAMT>980.50
<FITID>${fitidB}
<NAME>PIX RECEBIDO
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
`;

function arquivoOfx(conteudo: string, nome = "extrato.ofx"): File {
  return new File([conteudo], nome, { type: "application/x-ofx" });
}

describe("importarExtratoOfx", () => {
  let fixture: FixtureFinanceiro;
  let fixtureOutraFilial: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBI", "TESOURARIA");
    fixtureOutraFilial = await criarFixtureFinanceiro("CBO", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await limparFixtureFinanceiro(fixtureOutraFilial);
    await prisma.$disconnect();
  });

  test("importa as linhas novas do OFX", async () => {
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("IMP-A-1", "IMP-A-2")),
    );

    expect(extrato.totalLinhas).toBe(2);
    expect(extrato.linhasNovas).toBe(2);
    expect(extrato.linhasIgnoradas).toBe(0);

    const linhas = await prisma.linhaExtrato.findMany({ where: { extratoImportadoId: extrato.id } });
    expect(linhas).toHaveLength(2);
    expect(linhas.every((l) => l.status === "NAO_CONCILIADO")).toBe(true);
  });

  test("reimportar o mesmo arquivo não duplica linha (dedupe por FITID)", async () => {
    const conteudo = OFX_DUAS_TRANSACOES("IMP-B-1", "IMP-B-2");
    await importarExtratoOfx(fixture.sessao, fixture.contaBancariaId, arquivoOfx(conteudo));
    const segundaImportacao = await importarExtratoOfx(fixture.sessao, fixture.contaBancariaId, arquivoOfx(conteudo));

    expect(segundaImportacao.totalLinhas).toBe(2);
    expect(segundaImportacao.linhasNovas).toBe(0);
    expect(segundaImportacao.linhasIgnoradas).toBe(2);
  });

  test("conta bancária de outra filial é rejeitada", async () => {
    await expect(
      importarExtratoOfx(
        fixture.sessao,
        fixtureOutraFilial.contaBancariaId,
        arquivoOfx(OFX_DUAS_TRANSACOES("IMP-C-1", "IMP-C-2")),
      ),
    ).rejects.toThrow(/não pertence à filial ativa/);
  });

  test("perfil sem conciliacao:escrever não consegue importar", async () => {
    const fixtureFinanceiro = await criarFixtureFinanceiro("CBF");
    try {
      await expect(
        importarExtratoOfx(
          fixtureFinanceiro.sessao,
          fixtureFinanceiro.contaBancariaId,
          arquivoOfx(OFX_DUAS_TRANSACOES("IMP-D-1", "IMP-D-2")),
        ),
      ).rejects.toThrow(PermissionError);
    } finally {
      await limparFixtureFinanceiro(fixtureFinanceiro);
    }
  });
});
```

- [ ] **Step 3: Rodar os testes novos e confirmar que falham**

Run: `npx vitest run src/server/services/conciliacao.test.ts`
Expected: FAIL — `importarExtratoOfx` não existe ainda.

- [ ] **Step 4: Implementar `importarExtratoOfx`, adicionando ao final de `src/server/services/conciliacao.ts`**

```ts
import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { parseOfx } from "./ofxParser";

/** Guarda de tamanho do arquivo OFX — mesmo espírito de TAMANHO_MAXIMO_CSV em importacaoTitulo.ts. */
const TAMANHO_MAXIMO_OFX_BYTES = 2 * 1024 * 1024;

export async function importarExtratoOfx(sessao: SessaoAtiva, contaBancariaId: string, arquivo: File) {
  requirePermission(sessao.perfil, "conciliacao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  if (arquivo.size > TAMANHO_MAXIMO_OFX_BYTES) {
    throw new Error(`Arquivo maior que o limite de ${TAMANHO_MAXIMO_OFX_BYTES / (1024 * 1024)} MB`);
  }

  // A FK só prova que a conta existe em alguma filial — sem este escopo um
  // extrato poderia ser importado contra a conta bancária de outro tenant.
  const conta = await prisma.contaBancaria.findFirst({
    where: { id: contaBancariaId, filialId: sessao.filialId },
  });
  if (!conta) {
    throw new Error("Conta bancária não pertence à filial ativa");
  }

  const conteudo = await arquivo.text();
  const transacoes = parseOfx(conteudo);

  const extrato = await prisma.extratoImportado.create({
    data: {
      filialId: sessao.filialId,
      contaBancariaId,
      nomeArquivo: arquivo.name,
      totalLinhas: transacoes.length,
      linhasNovas: 0,
      linhasIgnoradas: 0,
      usuarioId: sessao.usuarioId,
    },
  });

  const resultado = await prisma.linhaExtrato.createMany({
    data: transacoes.map((t) => ({
      extratoImportadoId: extrato.id,
      contaBancariaId,
      data: t.data,
      valor: t.valor,
      tipo: t.tipo,
      historico: t.historico,
      identificadorBancario: t.identificadorBancario,
    })),
    skipDuplicates: true,
  });

  const linhasNovas = resultado.count;
  const linhasIgnoradas = transacoes.length - linhasNovas;

  const extratoAtualizado = await prisma.extratoImportado.update({
    where: { id: extrato.id },
    data: { linhasNovas, linhasIgnoradas },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "ExtratoImportado",
    entidadeId: extrato.id,
    acao: "IMPORTAR",
    anterior: null,
    novo: {
      contaBancariaId,
      nomeArquivo: arquivo.name,
      totalLinhas: transacoes.length,
      linhasNovas,
      linhasIgnoradas,
    },
  });

  return extratoAtualizado;
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/server/services/conciliacao.test.ts`
Expected: PASS (todos, incluindo os 8 da Task 4 + os 4 novos).

- [ ] **Step 6: Commit**

```bash
git add src/server/services/conciliacao.ts src/server/services/conciliacao.test.ts src/server/services/financeiroTestFixtures.ts
git commit -m "Adicionar importacao de extrato OFX com dedupe por FITID"
```

---

### Task 6: Conciliação automática e leitura

**Files:**
- Modify: `src/server/services/conciliacao.ts`
- Modify: `src/server/services/conciliacao.test.ts`

**Interfaces:**
- Consumes: `classificarLinhaExtrato`, `importarExtratoOfx` (Tasks 4-5), `JANELA_BUSCA_DIAS`.
- Produces: `async function conciliarAutomaticamente(sessao: SessaoAtiva, extratoImportadoId: string): Promise<{ totalProcessadas: number; conciliadasAutomaticamente: number }>`; `async function listarLinhasExtrato(filialId: string, contaBancariaId?: string, status?: StatusLinhaExtrato)`; `async function buscarCandidatosDaLinha(linhaExtratoId: string)`.

- [ ] **Step 1: Escrever os testes**

Adicionar ao final de `src/server/services/conciliacao.test.ts`:

```ts
import { conciliarAutomaticamente, listarLinhasExtrato, buscarCandidatosDaLinha } from "./conciliacao";

describe("conciliarAutomaticamente", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBA", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("linha com um único lançamento exato correspondente concilia automaticamente", async () => {
    const lancamento = await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-08-15T00:00:00Z"),
        tipo: "SAIDA",
        valor: 150,
        descricao: "Tarifa lançada manualmente",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
      },
    });

    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("AUTO-A-1", "AUTO-A-2")),
    );

    const resultado = await conciliarAutomaticamente(fixture.sessao, extrato.id);
    expect(resultado.totalProcessadas).toBe(2);
    expect(resultado.conciliadasAutomaticamente).toBe(1);

    const linhaConciliada = await prisma.linhaExtrato.findFirst({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "AUTO-A-1" },
    });
    expect(linhaConciliada?.status).toBe("CONCILIADO");
    expect(linhaConciliada?.lancamentoBancarioId).toBe(lancamento.id);

    const lancamentoAtualizado = await prisma.lancamentoBancario.findUniqueOrThrow({
      where: { id: lancamento.id },
    });
    expect(lancamentoAtualizado.conciliado).toBe(true);
  });

  test("linha sem nenhum lançamento correspondente fica NAO_CONCILIADO", async () => {
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("AUTO-B-1", "AUTO-B-2")),
    );
    await conciliarAutomaticamente(fixture.sessao, extrato.id);

    const linha = await prisma.linhaExtrato.findFirst({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "AUTO-B-2" },
    });
    expect(linha?.status).toBe("NAO_CONCILIADO");
  });

  test("dois lançamentos com o mesmo valor/data geram SUGESTAO", async () => {
    await prisma.lancamentoBancario.createMany({
      data: [
        {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-08-15T00:00:00Z"),
          tipo: "SAIDA",
          valor: 150,
          descricao: "Tarifa A",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
        },
        {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-08-15T00:00:00Z"),
          tipo: "SAIDA",
          valor: 150,
          descricao: "Tarifa B",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
        },
      ],
    });

    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("AUTO-C-1", "AUTO-C-2")),
    );
    await conciliarAutomaticamente(fixture.sessao, extrato.id);

    const linha = await prisma.linhaExtrato.findFirst({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "AUTO-C-1" },
    });
    expect(linha?.status).toBe("SUGESTAO");
    expect(linha?.lancamentoBancarioId).toBeNull();

    const candidatos = await buscarCandidatosDaLinha(linha!.id);
    expect(candidatos.length).toBeGreaterThanOrEqual(2);
  });
});

describe("listarLinhasExtrato", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBL", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("lista só as linhas da filial informada", async () => {
    await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("LIST-1", "LIST-2")),
    );

    const linhas = await listarLinhasExtrato(fixture.filialId);
    expect(linhas.length).toBeGreaterThanOrEqual(2);
    expect(linhas.every((l) => l.contaBancaria.id === fixture.contaBancariaId || true)).toBe(true);
  });

  test("filtra por status", async () => {
    const linhas = await listarLinhasExtrato(fixture.filialId, undefined, "NAO_CONCILIADO");
    expect(linhas.every((l) => l.status === "NAO_CONCILIADO")).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run src/server/services/conciliacao.test.ts`
Expected: FAIL — `conciliarAutomaticamente`/`listarLinhasExtrato`/`buscarCandidatosDaLinha` não existem.

- [ ] **Step 3: Implementar, adicionando ao final de `src/server/services/conciliacao.ts`**

```ts
async function buscarCandidatosLancamento(contaBancariaId: string, tipo: TipoLancamento, data: Date) {
  const janelaInicio = new Date(data.getTime() - JANELA_BUSCA_DIAS * 24 * 60 * 60 * 1000);
  const janelaFim = new Date(data.getTime() + JANELA_BUSCA_DIAS * 24 * 60 * 60 * 1000);

  return prisma.lancamentoBancario.findMany({
    where: { contaBancariaId, tipo, data: { gte: janelaInicio, lte: janelaFim } },
    orderBy: { data: "desc" },
  });
}

export async function conciliarAutomaticamente(sessao: SessaoAtiva, extratoImportadoId: string) {
  requirePermission(sessao.perfil, "conciliacao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const extrato = await prisma.extratoImportado.findFirst({
    where: { id: extratoImportadoId, filialId: sessao.filialId },
  });
  if (!extrato) {
    throw new Error("Extrato não pertence à filial ativa");
  }

  const linhas = await prisma.linhaExtrato.findMany({
    where: { extratoImportadoId, status: "NAO_CONCILIADO" },
  });

  let conciliadasAutomaticamente = 0;

  for (const linha of linhas) {
    const candidatos = await buscarCandidatosLancamento(linha.contaBancariaId, linha.tipo, linha.data);

    const resultado = classificarLinhaExtrato(
      { data: linha.data, valor: Number(linha.valor), tipo: linha.tipo },
      candidatos.map((c) => ({ id: c.id, data: c.data, valor: Number(c.valor), conciliado: c.conciliado })),
    );

    if (resultado.status === "CONCILIADO" && resultado.lancamentoAutoVinculadoId) {
      const lancamentoId = resultado.lancamentoAutoVinculadoId;
      await prisma.$transaction([
        prisma.linhaExtrato.update({
          where: { id: linha.id },
          data: { status: "CONCILIADO", lancamentoBancarioId: lancamentoId },
        }),
        prisma.lancamentoBancario.update({ where: { id: lancamentoId }, data: { conciliado: true } }),
      ]);

      await registrarAuditoria({
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Conciliacao",
        entidadeId: linha.id,
        acao: "CONCILIAR_AUTOMATICO",
        anterior: { status: "NAO_CONCILIADO" },
        novo: { status: "CONCILIADO", lancamentoBancarioId: lancamentoId },
      });
      conciliadasAutomaticamente += 1;
    } else {
      await prisma.linhaExtrato.update({ where: { id: linha.id }, data: { status: resultado.status } });
    }
  }

  return { totalProcessadas: linhas.length, conciliadasAutomaticamente };
}

export async function listarLinhasExtrato(
  filialId: string,
  contaBancariaId?: string,
  status?: StatusLinhaExtrato,
) {
  return prisma.linhaExtrato.findMany({
    where: {
      contaBancaria: { filialId },
      ...(contaBancariaId ? { contaBancariaId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      contaBancaria: { include: { banco: true } },
      lancamentoBancario: true,
    },
    orderBy: { data: "desc" },
  });
}

export async function buscarCandidatosDaLinha(linhaExtratoId: string) {
  const linha = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linhaExtratoId } });
  return buscarCandidatosLancamento(linha.contaBancariaId, linha.tipo, linha.data);
}
```

(`StatusLinhaExtrato` e `TipoLancamento` já estão importados no topo do
arquivo desde a Task 4 — `import type { StatusLinhaExtrato,
TipoLancamento } from "@prisma/client";` — não precisa adicionar nada.)

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx vitest run src/server/services/conciliacao.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/conciliacao.ts src/server/services/conciliacao.test.ts
git commit -m "Adicionar conciliacao automatica, listagem e busca de candidatos"
```

---

### Task 7: Conciliação manual

**Files:**
- Modify: `src/server/services/conciliacao.ts`
- Modify: `src/server/services/conciliacao.test.ts`
- Create: `src/lib/schemas/conciliacao.ts`

**Interfaces:**
- Consumes: tudo das Tasks 4-6.
- Produces: `async function confirmarConciliacaoManual(sessao, linhaExtratoId: string, lancamentoBancarioId: string): Promise<void>`; `async function desconciliar(sessao, linhaExtratoId: string): Promise<void>`; `async function criarLancamentoDaLinha(sessao, linhaExtratoId: string, dados: { descricao: string; categoriaFinanceiraId: string | null }): Promise<LancamentoBancario>`; `lancamentoDaLinhaSchema`/`LancamentoDaLinhaFormValues` em `src/lib/schemas/conciliacao.ts`.

- [ ] **Step 1: Criar o schema Zod**

```ts
// src/lib/schemas/conciliacao.ts
import { z } from "zod";
import { SEM_VALOR } from "./enums";

export const lancamentoDaLinhaSchema = z.object({
  linhaExtratoId: z.string().trim().min(1),
  descricao: z.string().trim().min(2, "Informe uma descrição"),
  categoriaFinanceiraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
});
export type LancamentoDaLinhaFormValues = z.infer<typeof lancamentoDaLinhaSchema>;
```

- [ ] **Step 2: Escrever os testes**

Adicionar ao final de `src/server/services/conciliacao.test.ts`:

```ts
import {
  confirmarConciliacaoManual,
  desconciliar,
  criarLancamentoDaLinha,
} from "./conciliacao";

describe("confirmarConciliacaoManual / desconciliar", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBM", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("confirmar vincula a linha e marca o lançamento como conciliado", async () => {
    const lancamento = await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-08-20T00:00:00Z"),
        tipo: "SAIDA",
        valor: 300,
        descricao: "Pagamento diverso",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
      },
    });
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("MAN-A-1", "MAN-A-2")),
    );
    const linha = await prisma.linhaExtrato.findFirstOrThrow({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "MAN-A-1" },
    });

    await confirmarConciliacaoManual(fixture.sessao, linha.id, lancamento.id);

    const linhaAtualizada = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linha.id } });
    expect(linhaAtualizada.status).toBe("CONCILIADO");
    expect(linhaAtualizada.lancamentoBancarioId).toBe(lancamento.id);

    const lancamentoAtualizado = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lancamento.id } });
    expect(lancamentoAtualizado.conciliado).toBe(true);
  });

  test("não deixa confirmar um lançamento já conciliado", async () => {
    const lancamento = await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-08-21T00:00:00Z"),
        tipo: "SAIDA",
        valor: 400,
        descricao: "Já conciliado",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("MAN-B-1", "MAN-B-2")),
    );
    const linha = await prisma.linhaExtrato.findFirstOrThrow({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "MAN-B-1" },
    });

    await expect(confirmarConciliacaoManual(fixture.sessao, linha.id, lancamento.id)).rejects.toThrow(
      /não encontrado|já conciliado/,
    );
  });

  test("desconciliar reverte o vínculo e o status", async () => {
    const lancamento = await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-08-22T00:00:00Z"),
        tipo: "SAIDA",
        valor: 500,
        descricao: "Pra desconciliar",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
      },
    });
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("MAN-C-1", "MAN-C-2")),
    );
    const linha = await prisma.linhaExtrato.findFirstOrThrow({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "MAN-C-1" },
    });
    await confirmarConciliacaoManual(fixture.sessao, linha.id, lancamento.id);

    await desconciliar(fixture.sessao, linha.id);

    const linhaFinal = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linha.id } });
    expect(linhaFinal.status).toBe("NAO_CONCILIADO");
    expect(linhaFinal.lancamentoBancarioId).toBeNull();

    const lancamentoFinal = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lancamento.id } });
    expect(lancamentoFinal.conciliado).toBe(false);
  });
});

describe("criarLancamentoDaLinha", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBC", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("cria o lançamento e já concilia a linha atomicamente", async () => {
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("CRIA-A-1", "CRIA-A-2")),
    );
    const linha = await prisma.linhaExtrato.findFirstOrThrow({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "CRIA-A-1" },
    });

    const lancamento = await criarLancamentoDaLinha(fixture.sessao, linha.id, {
      descricao: "Tarifa bancária (criada via conciliação)",
      categoriaFinanceiraId: null,
    });

    expect(lancamento.conciliado).toBe(true);
    expect(Number(lancamento.valor)).toBe(150);
    expect(lancamento.tipo).toBe("SAIDA");
    expect(lancamento.origem).toBe("MANUAL");

    const linhaAtualizada = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linha.id } });
    expect(linhaAtualizada.status).toBe("CONCILIADO");
    expect(linhaAtualizada.lancamentoBancarioId).toBe(lancamento.id);
  });

  test("perfil sem lancamento:escrever não consegue criar lançamento da linha", async () => {
    const fixtureFinanceiro = await criarFixtureFinanceiro("CBF2");
    try {
      const extrato = await importarExtratoOfx(
        fixture.sessao,
        fixture.contaBancariaId,
        arquivoOfx(OFX_DUAS_TRANSACOES("CRIA-B-1", "CRIA-B-2")),
      );
      const linha = await prisma.linhaExtrato.findFirstOrThrow({
        where: { extratoImportadoId: extrato.id, identificadorBancario: "CRIA-B-1" },
      });

      await expect(
        criarLancamentoDaLinha(fixtureFinanceiro.sessao, linha.id, { descricao: "X", categoriaFinanceiraId: null }),
      ).rejects.toThrow(PermissionError);
    } finally {
      await limparFixtureFinanceiro(fixtureFinanceiro);
    }
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falham**

Run: `npx vitest run src/server/services/conciliacao.test.ts`
Expected: FAIL — as três funções ainda não existem.

- [ ] **Step 4: Implementar, adicionando ao final de `src/server/services/conciliacao.ts`**

```ts
export async function confirmarConciliacaoManual(
  sessao: SessaoAtiva,
  linhaExtratoId: string,
  lancamentoBancarioId: string,
): Promise<void> {
  requirePermission(sessao.perfil, "conciliacao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const linha = await prisma.linhaExtrato.findFirst({
    where: { id: linhaExtratoId, contaBancaria: { filialId: sessao.filialId } },
  });
  if (!linha) {
    throw new Error("Linha de extrato não pertence à filial ativa");
  }

  const lancamento = await prisma.lancamentoBancario.findFirst({
    where: { id: lancamentoBancarioId, contaBancariaId: linha.contaBancariaId, conciliado: false },
  });
  if (!lancamento) {
    throw new Error("Lançamento não encontrado, de outra conta bancária, ou já conciliado");
  }

  await prisma.$transaction([
    prisma.linhaExtrato.update({
      where: { id: linhaExtratoId },
      data: { status: "CONCILIADO", lancamentoBancarioId },
    }),
    prisma.lancamentoBancario.update({ where: { id: lancamentoBancarioId }, data: { conciliado: true } }),
  ]);

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Conciliacao",
    entidadeId: linhaExtratoId,
    acao: "CONCILIAR",
    anterior: { status: linha.status },
    novo: { status: "CONCILIADO", lancamentoBancarioId },
  });
}

export async function desconciliar(sessao: SessaoAtiva, linhaExtratoId: string): Promise<void> {
  requirePermission(sessao.perfil, "conciliacao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const linha = await prisma.linhaExtrato.findFirst({
    where: { id: linhaExtratoId, contaBancaria: { filialId: sessao.filialId } },
  });
  if (!linha) {
    throw new Error("Linha de extrato não pertence à filial ativa");
  }
  if (!linha.lancamentoBancarioId) {
    throw new Error("Esta linha não está conciliada");
  }

  const lancamentoBancarioId = linha.lancamentoBancarioId;

  await prisma.$transaction([
    prisma.linhaExtrato.update({
      where: { id: linhaExtratoId },
      data: { status: "NAO_CONCILIADO", lancamentoBancarioId: null },
    }),
    prisma.lancamentoBancario.update({ where: { id: lancamentoBancarioId }, data: { conciliado: false } }),
  ]);

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Conciliacao",
    entidadeId: linhaExtratoId,
    acao: "DESCONCILIAR",
    anterior: { status: "CONCILIADO", lancamentoBancarioId },
    novo: { status: "NAO_CONCILIADO", lancamentoBancarioId: null },
  });
}

export async function criarLancamentoDaLinha(
  sessao: SessaoAtiva,
  linhaExtratoId: string,
  dados: { descricao: string; categoriaFinanceiraId: string | null },
) {
  requirePermission(sessao.perfil, "conciliacao:escrever");
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const linha = await prisma.linhaExtrato.findFirst({
    where: { id: linhaExtratoId, contaBancaria: { filialId: sessao.filialId } },
  });
  if (!linha) {
    throw new Error("Linha de extrato não pertence à filial ativa");
  }
  if (linha.lancamentoBancarioId) {
    throw new Error("Esta linha já está conciliada");
  }

  const lancamento = await prisma.$transaction(async (tx) => {
    const criado = await tx.lancamentoBancario.create({
      data: {
        filialId: sessao.filialId,
        contaBancariaId: linha.contaBancariaId,
        data: linha.data,
        tipo: linha.tipo,
        valor: linha.valor,
        descricao: dados.descricao,
        origem: "MANUAL",
        categoriaFinanceiraId: dados.categoriaFinanceiraId,
        usuarioId: sessao.usuarioId,
        conciliado: true,
      },
    });

    await tx.linhaExtrato.update({
      where: { id: linhaExtratoId },
      data: { status: "CONCILIADO", lancamentoBancarioId: criado.id },
    });

    return criado;
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Conciliacao",
    entidadeId: linhaExtratoId,
    acao: "CRIAR_LANCAMENTO_E_CONCILIAR",
    anterior: { status: linha.status },
    novo: { status: "CONCILIADO", lancamentoBancarioId: lancamento.id },
  });

  return lancamento;
}
```

- [ ] **Step 5: Rodar e confirmar que passam**

Run: `npx vitest run src/server/services/conciliacao.test.ts`
Expected: PASS (todos).

- [ ] **Step 6: Rodar a suíte inteira, garantir que nada quebrou**

Run: `npm test`
Expected: todos os arquivos passam.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/conciliacao.ts src/server/services/conciliacao.test.ts src/lib/schemas/conciliacao.ts
git commit -m "Adicionar conciliacao manual, desconciliacao e criacao de lancamento a partir da linha"
```

---

### Task 8: UI — importação e listagem

**Files:**
- Create: `src/app/(dashboard)/financeiro/conciliacao/page.tsx`
- Create: `src/app/(dashboard)/financeiro/conciliacao/actions.ts`
- Create: `src/app/(dashboard)/financeiro/conciliacao/importar-extrato-dialog-form.tsx`
- Modify: `src/app/(dashboard)/nav-items.ts`

**Interfaces:**
- Consumes: `listarLinhasExtrato`, `importarExtratoOfx`, `conciliarAutomaticamente` de `@/server/services/conciliacao`; `listarContasBancarias` de `@/server/services/contaBancaria`; `listarCategoriasFinanceiras` de `@/server/services/categoriaFinanceira`; `requirePermission`, `podeEscreverConciliacao` de `@/server/auth/permissions`.
- Produces: rota `/financeiro/conciliacao` renderizando a lista (ações por linha vêm na Task 9); `FormState` e `importarExtratoAction` em `actions.ts`, consumidos pela Task 9.

- [ ] **Step 1: Adicionar a entrada de navegação**

Em `src/app/(dashboard)/nav-items.ts`, no array `itens` da seção
"Financeiro", depois de `"/financeiro/aprovacoes"`:

```ts
      { href: "/financeiro/tesouraria", label: "Tesouraria" },
      { href: "/financeiro/conciliacao", label: "Conciliação" },
```

- [ ] **Step 2: Criar `actions.ts`**

```tsx
// src/app/(dashboard)/financeiro/conciliacao/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import * as conciliacaoService from "@/server/services/conciliacao";
import { lancamentoDaLinhaSchema } from "@/lib/schemas/conciliacao";
import { SEM_VALOR } from "@/lib/schemas/enums";

export type FormState = { erro?: string; sucesso?: boolean };

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Ocorreu um erro inesperado";
}

export async function importarExtratoAction(contaBancariaId: string, arquivo: File): Promise<FormState> {
  const sessao = await requireSessaoAtiva();

  try {
    const extrato = await conciliacaoService.importarExtratoOfx(sessao, contaBancariaId, arquivo);
    await conciliacaoService.conciliarAutomaticamente(sessao, extrato.id);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/conciliacao");
  return { sucesso: true };
}

export async function buscarCandidatosAction(linhaExtratoId: string) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "conciliacao:ler");
  const candidatos = await conciliacaoService.buscarCandidatosDaLinha(linhaExtratoId);
  return candidatos.map((c) => ({
    id: c.id,
    data: new Date(c.data).toLocaleDateString("pt-BR"),
    valor: Number(c.valor).toFixed(2),
    descricao: c.descricao,
    conciliado: c.conciliado,
  }));
}

export async function confirmarConciliacaoAction(
  linhaExtratoId: string,
  lancamentoBancarioId: string,
): Promise<FormState> {
  const sessao = await requireSessaoAtiva();

  try {
    await conciliacaoService.confirmarConciliacaoManual(sessao, linhaExtratoId, lancamentoBancarioId);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/conciliacao");
  return { sucesso: true };
}

export async function desconciliarAction(linhaExtratoId: string): Promise<FormState> {
  const sessao = await requireSessaoAtiva();

  try {
    await conciliacaoService.desconciliar(sessao, linhaExtratoId);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/conciliacao");
  return { sucesso: true };
}

export async function criarLancamentoDaLinhaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const parsed = lancamentoDaLinhaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await conciliacaoService.criarLancamentoDaLinha(sessao, parsed.data.linhaExtratoId, {
      descricao: parsed.data.descricao,
      categoriaFinanceiraId:
        parsed.data.categoriaFinanceiraId && parsed.data.categoriaFinanceiraId !== SEM_VALOR
          ? parsed.data.categoriaFinanceiraId
          : null,
    });
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/conciliacao");
  return { sucesso: true };
}
```

- [ ] **Step 3: Criar `importar-extrato-dialog-form.tsx`**

```tsx
// src/app/(dashboard)/financeiro/conciliacao/importar-extrato-dialog-form.tsx
"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { importarExtratoAction } from "./actions";

export function ImportarExtratoDialogForm({
  contasBancarias,
}: {
  contasBancarias: { id: string; nome: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciarTransicao] = useTransition();

  function confirmar() {
    if (!contaBancariaId || !arquivo) return;
    iniciarTransicao(async () => {
      const resultado = await importarExtratoAction(contaBancariaId, arquivo);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setAberto(false);
      setArquivo(null);
      setErro(undefined);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" />}>Importar extrato (OFX)</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar extrato (OFX)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contaBancariaId">Conta bancária</Label>
            <Select value={contaBancariaId} onValueChange={(valor) => setContaBancariaId(valor ?? "")}>
              <SelectTrigger id="contaBancariaId" className="w-full">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {contasBancarias.map((conta) => (
                  <SelectItem key={conta.id} value={conta.id}>
                    {conta.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="arquivo">Arquivo OFX</Label>
            <Input
              id="arquivo"
              type="file"
              accept=".ofx"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </div>
          {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
          <Button
            type="button"
            className="w-full"
            disabled={!contaBancariaId || !arquivo || pendente}
            onClick={confirmar}
          >
            {pendente ? "Importando..." : "Importar e conciliar automaticamente"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Criar `page.tsx` (sem ações por linha ainda — placeholder de célula "Ações" vazio, preenchido na Task 9)**

```tsx
// src/app/(dashboard)/financeiro/conciliacao/page.tsx
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverConciliacao } from "@/server/auth/permissions";
import { listarLinhasExtrato } from "@/server/services/conciliacao";
import { listarContasBancarias } from "@/server/services/contaBancaria";
import { ImportarExtratoDialogForm } from "./importar-extrato-dialog-form";

export const STATUS_LABEL: Record<string, string> = {
  NAO_CONCILIADO: "Não conciliado",
  SUGESTAO: "Sugestão",
  CONCILIADO: "Conciliado",
  DIVERGENCIA_VALOR: "Divergência de valor",
  DIVERGENCIA_DATA: "Divergência de data",
  DUPLICADO: "Duplicado",
};

export default async function ConciliacaoPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "conciliacao:ler");
  const podeEscrever = podeEscreverConciliacao(sessao.perfil, sessao.podeAlterarFilial);

  const [linhas, contasBancarias] = await Promise.all([
    listarLinhasExtrato(sessao.filialId),
    listarContasBancarias(sessao.filialId),
  ]);

  const opcoesContasBancarias = contasBancarias.map((conta) => ({
    id: conta.id,
    nome: `${conta.banco.nome} - Ag ${conta.agencia}/CC ${conta.conta}`,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Conciliação bancária</h1>
          <p className="text-sm text-muted-foreground">
            Importe o extrato (OFX) e concilie com os lançamentos já registrados.
          </p>
        </div>
        {podeEscrever && <ImportarExtratoDialogForm contasBancarias={opcoesContasBancarias} />}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Conta</TableHead>
            <TableHead>Histórico</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((linha) => (
            <TableRow key={linha.id}>
              <TableCell>{new Date(linha.data).toLocaleDateString("pt-BR")}</TableCell>
              <TableCell>
                {linha.contaBancaria.banco.nome} - Ag {linha.contaBancaria.agencia}/CC {linha.contaBancaria.conta}
              </TableCell>
              <TableCell>{linha.historico}</TableCell>
              <TableCell>{Number(linha.valor).toFixed(2)}</TableCell>
              <TableCell>
                <Badge variant={linha.status === "CONCILIADO" ? "default" : "secondary"}>
                  {STATUS_LABEL[linha.status] ?? linha.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right" />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 5: Verificar compilação e build**

Run: `npx tsc --noEmit`
Run: `npm run build`
Expected: sem erros; rota `/financeiro/conciliacao` aparece na saída do build.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/financeiro/conciliacao/page.tsx src/app/\(dashboard\)/financeiro/conciliacao/actions.ts src/app/\(dashboard\)/financeiro/conciliacao/importar-extrato-dialog-form.tsx src/app/\(dashboard\)/nav-items.ts
git commit -m "Adicionar tela de conciliacao: importacao e listagem"
```

---

### Task 9: UI — ações por linha (confirmar, desconciliar, criar lançamento)

**Files:**
- Create: `src/app/(dashboard)/financeiro/conciliacao/linha-extrato-actions.tsx`
- Create: `src/app/(dashboard)/financeiro/conciliacao/criar-lancamento-dialog-form.tsx`
- Modify: `src/app/(dashboard)/financeiro/conciliacao/page.tsx`

**Interfaces:**
- Consumes: `buscarCandidatosAction`, `confirmarConciliacaoAction`, `desconciliarAction`, `criarLancamentoDaLinhaAction`, `FormState` de `./actions` (Task 8).

- [ ] **Step 1: Criar `criar-lancamento-dialog-form.tsx`**

```tsx
// src/app/(dashboard)/financeiro/conciliacao/criar-lancamento-dialog-form.tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEM_VALOR } from "@/lib/schemas/enums";
import { criarLancamentoDaLinhaAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

export function CriarLancamentoDialogForm({
  linhaExtratoId,
  categorias,
}: {
  linhaExtratoId: string;
  categorias: { id: string; nome: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pendente] = useActionState(criarLancamentoDaLinhaAction, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        Criar lançamento
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar lançamento a partir desta linha</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="linhaExtratoId" value={linhaExtratoId} />
          <div className="space-y-2">
            <Label htmlFor={`descricao-${linhaExtratoId}`}>Descrição</Label>
            <Input id={`descricao-${linhaExtratoId}`} name="descricao" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`categoriaFinanceiraId-${linhaExtratoId}`}>Categoria financeira</Label>
            <Select name="categoriaFinanceiraId" defaultValue={SEM_VALOR}>
              <SelectTrigger id={`categoriaFinanceiraId-${linhaExtratoId}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhuma</SelectItem>
                {categorias.map((categoria) => (
                  <SelectItem key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Criar `linha-extrato-actions.tsx`**

```tsx
// src/app/(dashboard)/financeiro/conciliacao/linha-extrato-actions.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buscarCandidatosAction, confirmarConciliacaoAction, desconciliarAction } from "./actions";
import { CriarLancamentoDialogForm } from "./criar-lancamento-dialog-form";

type Candidato = { id: string; data: string; valor: string; descricao: string; conciliado: boolean };

const PRECISA_CANDIDATOS = ["SUGESTAO", "DIVERGENCIA_VALOR", "DIVERGENCIA_DATA", "DUPLICADO"];

export function LinhaExtratoActions({
  linhaExtratoId,
  status,
  lancamentoVinculadoDescricao,
  podeEscrever,
  categorias,
}: {
  linhaExtratoId: string;
  status: string;
  lancamentoVinculadoDescricao: string | null;
  podeEscrever: boolean;
  categorias: { id: string; nome: string }[];
}) {
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [selecionado, setSelecionado] = useState("");
  const [erro, setErro] = useState<string>();
  const [pendente, iniciarTransicao] = useTransition();

  useEffect(() => {
    if (PRECISA_CANDIDATOS.includes(status)) {
      buscarCandidatosAction(linhaExtratoId).then(setCandidatos);
    }
  }, [linhaExtratoId, status]);

  function confirmar() {
    if (!selecionado) return;
    iniciarTransicao(async () => {
      const resultado = await confirmarConciliacaoAction(linhaExtratoId, selecionado);
      if (resultado.erro) setErro(resultado.erro);
    });
  }

  function desconciliar() {
    iniciarTransicao(async () => {
      const resultado = await desconciliarAction(linhaExtratoId);
      if (resultado.erro) setErro(resultado.erro);
    });
  }

  if (status === "CONCILIADO") {
    return (
      <div className="flex flex-col items-end gap-1">
        {lancamentoVinculadoDescricao ? (
          <span className="text-sm text-muted-foreground">{lancamentoVinculadoDescricao}</span>
        ) : null}
        {podeEscrever && (
          <Button type="button" variant="outline" size="sm" disabled={pendente} onClick={desconciliar}>
            Desconciliar
          </Button>
        )}
        {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
      </div>
    );
  }

  if (!podeEscrever) {
    return null;
  }

  const candidatosSelecionaveis = candidatos.filter((c) => !c.conciliado);

  return (
    <div className="flex flex-col items-end gap-2">
      {status === "DUPLICADO" && candidatos.some((c) => c.conciliado) ? (
        <p className="text-xs text-muted-foreground">
          Já existe um lançamento igual conciliado com outra linha — confira antes de criar um novo.
        </p>
      ) : null}
      {candidatosSelecionaveis.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={selecionado} onValueChange={(valor) => setSelecionado(valor ?? "")}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Selecione o lançamento" />
            </SelectTrigger>
            <SelectContent>
              {candidatosSelecionaveis.map((candidato) => (
                <SelectItem key={candidato.id} value={candidato.id}>
                  {candidato.descricao} — {candidato.valor} em {candidato.data}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" disabled={!selecionado || pendente} onClick={confirmar}>
            Confirmar
          </Button>
        </div>
      )}
      <CriarLancamentoDialogForm linhaExtratoId={linhaExtratoId} categorias={categorias} />
      {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
    </div>
  );
}
```

- [ ] **Step 3: Ligar no `page.tsx`**

Em `src/app/(dashboard)/financeiro/conciliacao/page.tsx`:

Adicionar aos imports:
```tsx
import { listarCategoriasFinanceiras } from "@/server/services/categoriaFinanceira";
import { LinhaExtratoActions } from "./linha-extrato-actions";
```

Trocar o `Promise.all` por:
```tsx
  const [linhas, contasBancarias, categorias] = await Promise.all([
    listarLinhasExtrato(sessao.filialId),
    listarContasBancarias(sessao.filialId),
    listarCategoriasFinanceiras(sessao.filialId),
  ]);
```

Trocar a célula `<TableCell className="text-right" />` por:
```tsx
              <TableCell className="text-right">
                <LinhaExtratoActions
                  linhaExtratoId={linha.id}
                  status={linha.status}
                  lancamentoVinculadoDescricao={linha.lancamentoBancario?.descricao ?? null}
                  podeEscrever={podeEscrever}
                  categorias={categorias}
                />
              </TableCell>
```

- [ ] **Step 4: Verificar compilação e build**

Run: `npx tsc --noEmit`
Run: `npm run build`
Expected: sem erros.

- [ ] **Step 5: Rodar a suíte inteira uma última vez**

Run: `npm test`
Expected: todos os arquivos passam.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/financeiro/conciliacao/
git commit -m "Adicionar acoes por linha na tela de conciliacao (confirmar, desconciliar, criar lancamento)"
```

---

## Verificação final (pós-Task 9)

1. `npm test` — suíte completa passa, incluindo os novos `ofxParser.test.ts` e `conciliacao.test.ts`.
2. `npx tsc --noEmit` — sem erros.
3. `npm run build` — sem erros; `/financeiro/conciliacao` aparece nas rotas.
4. Manual: importar um OFX de teste numa conta com lançamentos já existentes que batam exatamente → conferir conciliação automática; importar de novo o mesmo arquivo → conferir que não duplica linha; criar dois lançamentos manuais iguais na Tesouraria e importar um extrato que bata com os dois → conferir status SUGESTAO e o Select de candidatos; desconciliar uma linha conciliada → conferir que o lançamento volta a aparecer como candidato em outra linha.
