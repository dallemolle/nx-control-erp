# Recebimento por cartão — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** venda na maquininha gera repasses previstos (título a receber em nome da operadora) e a taxa como despesa (título a pagar), confirmados numa tela própria e conciliados em grupo com o depósito líquido.

**Architecture:** cadastro `OperadoraCartao` + `CondicaoOperadoraCartao` por filial; função pura `calcularRepasses` em `src/lib/producao/cartao.ts` usada pelo formulário e pelo servidor; `criarPedido` cria os dois títulos sem baixa; serviço `repasseCartao.ts` confirma (baixa bruto + taxa, efetivadas direto, D-39) e desfaz; `RepasseCartaoConfirmado` liga a parcela às duas baixas.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 + Postgres, zod 4.6, Vitest com banco real.

**Spec:** `docs/superpowers/specs/2026-11-19-recebimento-cartao-design.md`

## Global Constraints

- Comandos pelo **PowerShell** a partir de `D:\Projetos\nx-control-erp` (Vitest pelo Bash falha).
- Depois de `npx prisma migrate dev`, rodar `npx prisma generate` (o migrate não gera o client).
- Nunca rodar Prettier. Formatar à mão, linhas até ~120.
- Preferir a ferramenta Edit; nunca `Get-Content | Set-Content` (corrompe acentos).
- Zod 4.6: `z.preprocess(fn, X.optional())` dentro de objeto **não roda** `fn` com a chave ausente; não usar `.optional()` no schema interno quando `fn` transforma ausente em outro valor.
- Mensagens ao usuário em português, iguais às da spec.
- Valores em dinheiro calculados em **centavos inteiros**.
- Status de parcela "em aberto" = `EM_ABERTO`, `A_VENCER`, `VENCIDO`.
- Cada commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Modelo e migration

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/server/services/producaoTestFixtures.ts` (limpeza)
- Create: `prisma/migrations/<timestamp>_recebimento_cartao/migration.sql` (gerada)

**Interfaces:**
- Produces: modelos `OperadoraCartao`, `CondicaoOperadoraCartao`, `RepasseCartaoConfirmado`; enum `ModalidadeCartao`; campos `PedidoVenda.operadoraCartaoId|modalidadeCartao|parcelasCartao|taxaCartaoPercentual|tituloTaxaId`; relações `PedidoVenda.operadoraCartao`, `PedidoVenda.tituloTaxa`, `Titulo.pedidoVendaTaxa`, `Parcela.repasseCartao`, `Baixa.repasseRecebimento`, `Baixa.repasseTaxa`.

- [ ] **Step 1: Enum e modelos novos** — em `prisma/schema.prisma`, logo depois de `enum StatusEntrega { ... }`, acrescentar:

```prisma
enum ModalidadeCartao {
  DEBITO
  CREDITO_VISTA
  CREDITO_PARCELADO
  PIX_MAQUININHA
}

/// Operadora da maquininha (D-37/D-38): onde deposita, em nome de quem saem os títulos e a categoria da taxa.
model OperadoraCartao {
  id              String   @id @default(uuid())
  filialId        String
  nome            String
  contaBancariaId String
  fornecedorId    String
  clienteId       String
  categoriaTaxaId String
  ativo           Boolean  @default(true)
  criadoEm        DateTime @default(now())
  atualizadoEm    DateTime @updatedAt

  filial        Filial                    @relation(fields: [filialId], references: [id], onDelete: Cascade)
  contaBancaria ContaBancaria             @relation(fields: [contaBancariaId], references: [id], onDelete: Restrict)
  fornecedor    Fornecedor                @relation(fields: [fornecedorId], references: [id], onDelete: Restrict)
  cliente       Cliente                   @relation(fields: [clienteId], references: [id], onDelete: Restrict)
  categoriaTaxa CategoriaFinanceira       @relation(fields: [categoriaTaxaId], references: [id], onDelete: Restrict)
  condicoes     CondicaoOperadoraCartao[]
  pedidosVenda  PedidoVenda[]

  @@unique([filialId, nome])
  @@index([filialId])
  @@map("operadoras_cartao")
}

/// Taxa e prazo por modalidade; no parcelado, por faixa de parcelas (2 a 12, sem sobreposição).
model CondicaoOperadoraCartao {
  id             String           @id @default(uuid())
  operadoraId    String
  modalidade     ModalidadeCartao
  parcelasDe     Int
  parcelasAte    Int
  taxaPercentual Decimal          @db.Decimal(7, 4)
  /// Dias corridos da venda até o 1º repasse.
  prazoDias      Int
  /// Só parcelado: um repasse único no prazo.
  antecipado     Boolean          @default(false)

  operadora OperadoraCartao @relation(fields: [operadoraId], references: [id], onDelete: Cascade)

  @@index([operadoraId])
  @@map("condicoes_operadora_cartao")
}

/// Repasse confirmado: a parcela a receber e as baixas que a confirmação criou (para desfazer).
model RepasseCartaoConfirmado {
  id                 String   @id @default(uuid())
  parcelaId          String   @unique
  baixaRecebimentoId String   @unique
  baixaTaxaId        String?  @unique
  data               DateTime
  usuarioId          String
  criadoEm           DateTime @default(now())

  parcela          Parcela @relation(fields: [parcelaId], references: [id], onDelete: Cascade)
  baixaRecebimento Baixa   @relation("RepasseRecebimento", fields: [baixaRecebimentoId], references: [id], onDelete: Cascade)
  baixaTaxa        Baixa?  @relation("RepasseTaxa", fields: [baixaTaxaId], references: [id], onDelete: Cascade)

  @@map("repasses_cartao_confirmados")
}
```

- [ ] **Step 2: Campos e relações nos modelos existentes**

`PedidoVenda` — depois de `baixaAutomaticaId`:

```prisma
  /// Só CARTAO (maquininha): operadora, modalidade, parcelas e taxa congeladas na venda.
  operadoraCartaoId     String?
  modalidadeCartao      ModalidadeCartao?
  parcelasCartao        Int?
  taxaCartaoPercentual  Decimal?            @db.Decimal(7, 4)
  /// Título a PAGAR da taxa da operadora.
  tituloTaxaId          String?             @unique
```

e nas relações de `PedidoVenda` trocar a linha `titulo ...` e acrescentar:

```prisma
  titulo          Titulo?           @relation("TituloDoPedido", fields: [tituloId], references: [id], onDelete: SetNull)
  tituloTaxa      Titulo?           @relation("TituloTaxaDoPedido", fields: [tituloTaxaId], references: [id], onDelete: SetNull)
  operadoraCartao OperadoraCartao?  @relation(fields: [operadoraCartaoId], references: [id], onDelete: Restrict)
```

`Titulo` — trocar `pedidoVenda   PedidoVenda?` por:

```prisma
  pedidoVenda     PedidoVenda? @relation("TituloDoPedido")
  pedidoVendaTaxa PedidoVenda? @relation("TituloTaxaDoPedido")
```

`Parcela` — acrescentar `repasseCartao RepasseCartaoConfirmado?`.
`Baixa` — acrescentar:

```prisma
  repasseRecebimento RepasseCartaoConfirmado? @relation("RepasseRecebimento")
  repasseTaxa        RepasseCartaoConfirmado? @relation("RepasseTaxa")
```

`Filial`, `ContaBancaria`, `Fornecedor`, `Cliente`: `operadorasCartao OperadoraCartao[]`.
`CategoriaFinanceira`: `operadorasCartaoTaxa OperadoraCartao[]`.

- [ ] **Step 3: Migration e client**

Run: `npx prisma migrate dev --name recebimento_cartao` e depois `npx prisma generate`.
Expected: migration criada sem drift; o SQL só cria tabelas/enum/colunas (os nomes de relação não mudam o SQL das FKs existentes — conferir que não há `DROP CONSTRAINT` de `pedidos_venda_tituloId_fkey`; se houver um par DROP/ADD idêntico, aceitar).

- [ ] **Step 4: Limpeza das fixtures** — em `producaoTestFixtures.ts`, dentro de `limpar`, logo depois de `await prisma.pedidoVenda.deleteMany({ where: filiais });`:

```ts
      // Operadora antes de conta, cliente, fornecedor e categoria (relações Restrict).
      await prisma.operadoraCartao.deleteMany({ where: filiais });
```

- [ ] **Step 5: Verificar** — Run: `npx tsc --noEmit` e `npx vitest run src/server/services/pedidoVenda.test.ts`. Expected: tipos ok, testes passam (sem mudança de comportamento).

- [ ] **Step 6: Commit**

```powershell
git add prisma src/server/services/producaoTestFixtures.ts
git commit -m "feat(cartao): modelo de operadora, condições e repasse confirmado"
```

---

### Task 2: Cálculo dos repasses e rótulos

**Files:**
- Create: `src/lib/producao/cartao.ts`, `src/lib/producao/cartao.test.ts`
- Modify: `src/lib/schemas/enums.ts`, `src/lib/producao/venda.ts`, `src/lib/producao/venda.test.ts`

**Interfaces:**
- Produces:
  - `MODALIDADE_CARTAO`, `ROTULOS_MODALIDADE_CARTAO` (enums.ts); rótulo `CARTAO: "Maquininha (cartão ou Pix)"`.
  - `type CondicaoCartao = { modalidade: ModalidadeCartaoValor; parcelasDe: number; parcelasAte: number; taxaPercentual: number; prazoDias: number; antecipado: boolean }`
  - `type RepasseCalculado = { numero: number; data: Date; bruto: number; taxa: number; liquido: number }`
  - `MAX_PARCELAS_CARTAO = 12`
  - `condicaoParaVenda(condicoes: CondicaoCartao[], modalidade, parcelas: number): CondicaoCartao | null`
  - `calcularRepasses(data: Date, valor: number, condicao: CondicaoCartao, parcelas: number): RepasseCalculado[]`
  - `validarCondicoesCartao(condicoes: CondicaoCartao[]): string | null`
  - `descricaoPagamentoCartao(modalidade, parcelas: number | null, operadora?: string): string`
  - `rotuloSituacaoPagamento(situacao: SituacaoPagamento, naMaquininha: boolean): string` (venda.ts)

- [ ] **Step 1: Rótulos** — em `enums.ts`, trocar `CARTAO: "Cartão",` por `CARTAO: "Maquininha (cartão ou Pix)",` e acrescentar depois de `ROTULOS_FORMA_PAGAMENTO_VENDA`:

```ts
export const MODALIDADE_CARTAO = ["DEBITO", "CREDITO_VISTA", "CREDITO_PARCELADO", "PIX_MAQUININHA"] as const;
export const ROTULOS_MODALIDADE_CARTAO = {
  DEBITO: "Débito",
  CREDITO_VISTA: "Crédito à vista",
  CREDITO_PARCELADO: "Crédito parcelado",
  PIX_MAQUININHA: "Pix na maquininha",
} as const;
```

- [ ] **Step 2: Testes que falham** — `src/lib/producao/cartao.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  calcularRepasses,
  condicaoParaVenda,
  descricaoPagamentoCartao,
  validarCondicoesCartao,
  type CondicaoCartao,
} from "./cartao";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const cond = (c: Partial<CondicaoCartao>): CondicaoCartao => ({
  modalidade: "DEBITO",
  parcelasDe: 1,
  parcelasAte: 1,
  taxaPercentual: 1.5,
  prazoDias: 1,
  antecipado: false,
  ...c,
});

describe("calcularRepasses", () => {
  test("débito: um repasse em D+1 com a taxa descontada", () => {
    expect(calcularRepasses(d("2026-11-10"), 100, cond({}), 1)).toEqual([
      { numero: 1, data: d("2026-11-11"), bruto: 100, taxa: 1.5, liquido: 98.5 },
    ]);
  });

  test("parcelado sem antecipação: um repasse por parcela, de 30 em 30 dias, centavos na última", () => {
    const c = cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 2, parcelasAte: 6, taxaPercentual: 3, prazoDias: 30 });
    expect(calcularRepasses(d("2026-11-10"), 100, c, 3)).toEqual([
      { numero: 1, data: d("2026-12-10"), bruto: 33.33, taxa: 0.99, liquido: 32.34 },
      { numero: 2, data: d("2027-01-09"), bruto: 33.33, taxa: 0.99, liquido: 32.34 },
      { numero: 3, data: d("2027-02-08"), bruto: 33.34, taxa: 1.02, liquido: 32.32 },
    ]);
  });

  test("parcelado antecipado: um repasse único no prazo", () => {
    const c = cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 2, parcelasAte: 12, taxaPercentual: 5, prazoDias: 2, antecipado: true });
    expect(calcularRepasses(d("2026-11-10"), 250, c, 10)).toEqual([
      { numero: 1, data: d("2026-11-12"), bruto: 250, taxa: 12.5, liquido: 237.5 },
    ]);
  });

  test("taxa zero: repasse sem taxa", () => {
    expect(calcularRepasses(d("2026-11-10"), 10, cond({ taxaPercentual: 0, prazoDias: 0 }), 1)).toEqual([
      { numero: 1, data: d("2026-11-10"), bruto: 10, taxa: 0, liquido: 10 },
    ]);
  });

  test("soma dos repasses fecha com o total e com a taxa arredondada", () => {
    const c = cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 2, parcelasAte: 12, taxaPercentual: 2.99, prazoDias: 30 });
    const repasses = calcularRepasses(d("2026-11-10"), 1234.57, c, 7);
    const soma = (f: (r: (typeof repasses)[number]) => number) => repasses.reduce((t, r) => t + Math.round(f(r) * 100), 0);
    expect(soma((r) => r.bruto)).toBe(123457);
    expect(soma((r) => r.taxa)).toBe(Math.round(123457 * 0.0299));
  });
});

describe("condicaoParaVenda", () => {
  const condicoes = [
    cond({ modalidade: "DEBITO" }),
    cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 2, parcelasAte: 6, taxaPercentual: 3 }),
    cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 7, parcelasAte: 12, taxaPercentual: 4 }),
  ];
  test("acha a faixa das parcelas", () => {
    expect(condicaoParaVenda(condicoes, "CREDITO_PARCELADO", 8)?.taxaPercentual).toBe(4);
    expect(condicaoParaVenda(condicoes, "DEBITO", 1)?.modalidade).toBe("DEBITO");
  });
  test("sem condição devolve null", () => {
    expect(condicaoParaVenda(condicoes, "CREDITO_VISTA", 1)).toBeNull();
    expect(condicaoParaVenda(condicoes, "CREDITO_PARCELADO", 13)).toBeNull();
  });
});

describe("validarCondicoesCartao", () => {
  test("aceita condições válidas", () => {
    expect(
      validarCondicoesCartao([
        cond({}),
        cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 2, parcelasAte: 6 }),
        cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 7, parcelasAte: 12, antecipado: true }),
      ]),
    ).toBeNull();
  });
  test("recusas", () => {
    expect(validarCondicoesCartao([])).toBe("Inclua ao menos uma condição");
    expect(validarCondicoesCartao([cond({}), cond({})])).toBe("Débito aparece mais de uma vez");
    expect(validarCondicoesCartao([cond({ parcelasAte: 2 })])).toBe("Só o crédito parcelado tem faixa de parcelas");
    expect(validarCondicoesCartao([cond({ antecipado: true })])).toBe("Só o crédito parcelado pode ser antecipado");
    expect(
      validarCondicoesCartao([cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 1, parcelasAte: 6 })]),
    ).toBe("A faixa do parcelado vai de 2 a 12 parcelas");
    expect(
      validarCondicoesCartao([
        cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 2, parcelasAte: 6 }),
        cond({ modalidade: "CREDITO_PARCELADO", parcelasDe: 6, parcelasAte: 12 }),
      ]),
    ).toBe("As faixas do parcelado se sobrepõem");
    expect(validarCondicoesCartao([cond({ taxaPercentual: 100 })])).toBe("A taxa deve ficar entre 0 e 100%");
    expect(validarCondicoesCartao([cond({ prazoDias: 400 })])).toBe("O prazo deve ficar entre 0 e 365 dias");
  });
});

describe("descricaoPagamentoCartao", () => {
  test("com e sem operadora", () => {
    expect(descricaoPagamentoCartao("CREDITO_PARCELADO", 3, "Stone")).toBe("Crédito 3x — Stone");
    expect(descricaoPagamentoCartao("DEBITO", 1)).toBe("Débito");
    expect(descricaoPagamentoCartao("PIX_MAQUININHA", null, "Cielo")).toBe("Pix na maquininha — Cielo");
  });
});
```

- [ ] **Step 3: Rodar** — `npx vitest run src/lib/producao/cartao.test.ts` → FAIL (módulo não existe).

- [ ] **Step 4: Implementar** `src/lib/producao/cartao.ts`:

```ts
import { MODALIDADE_CARTAO, ROTULOS_MODALIDADE_CARTAO } from "@/lib/schemas/enums";

export type ModalidadeCartaoValor = (typeof MODALIDADE_CARTAO)[number];

export type CondicaoCartao = {
  modalidade: ModalidadeCartaoValor;
  parcelasDe: number;
  parcelasAte: number;
  taxaPercentual: number;
  prazoDias: number;
  antecipado: boolean;
};

export type RepasseCalculado = { numero: number; data: Date; bruto: number; taxa: number; liquido: number };

export const MAX_PARCELAS_CARTAO = 12;
const UM_DIA_MS = 86_400_000;
const centavos = (valor: number) => Math.round(valor * 100);

/** Condição da modalidade cuja faixa contém as parcelas (fora do parcelado, sempre 1). */
export function condicaoParaVenda(
  condicoes: CondicaoCartao[],
  modalidade: ModalidadeCartaoValor,
  parcelas: number,
): CondicaoCartao | null {
  return (
    condicoes.find((c) => c.modalidade === modalidade && parcelas >= c.parcelasDe && parcelas <= c.parcelasAte) ?? null
  );
}

/**
 * RN-35: um repasse (débito, crédito à vista, Pix, parcelado antecipado) ou um
 * por parcela (parcelado sem antecipação), o 1º em data + prazo e os seguintes
 * de 30 em 30 dias. Bruto dividido igual e taxa total arredondada dividida na
 * mesma proporção; as sobras de centavos vão na última.
 */
export function calcularRepasses(
  data: Date,
  valor: number,
  condicao: CondicaoCartao,
  parcelas: number,
): RepasseCalculado[] {
  const quantos = condicao.modalidade === "CREDITO_PARCELADO" && !condicao.antecipado ? parcelas : 1;
  const brutoTotal = centavos(valor);
  const taxaTotal = Math.round((brutoTotal * condicao.taxaPercentual) / 100);
  const parteBruto = Math.floor(brutoTotal / quantos);
  const parteTaxa = Math.floor((taxaTotal * parteBruto) / brutoTotal);
  return Array.from({ length: quantos }, (_, i) => {
    const ultima = i === quantos - 1;
    const bruto = ultima ? brutoTotal - parteBruto * (quantos - 1) : parteBruto;
    const taxa = ultima ? taxaTotal - parteTaxa * (quantos - 1) : parteTaxa;
    return {
      numero: i + 1,
      data: new Date(data.getTime() + (condicao.prazoDias + 30 * i) * UM_DIA_MS),
      bruto: bruto / 100,
      taxa: taxa / 100,
      liquido: (bruto - taxa) / 100,
    };
  });
}

/** Regras do cadastro de condições; devolve a mensagem do primeiro erro ou `null`. */
export function validarCondicoesCartao(condicoes: CondicaoCartao[]): string | null {
  if (condicoes.length === 0) return "Inclua ao menos uma condição";
  for (const c of condicoes) {
    if (!(c.taxaPercentual >= 0 && c.taxaPercentual < 100)) return "A taxa deve ficar entre 0 e 100%";
    if (!Number.isInteger(c.prazoDias) || c.prazoDias < 0 || c.prazoDias > 365) {
      return "O prazo deve ficar entre 0 e 365 dias";
    }
    if (c.modalidade === "CREDITO_PARCELADO") {
      if (c.parcelasDe < 2 || c.parcelasAte > MAX_PARCELAS_CARTAO || c.parcelasDe > c.parcelasAte) {
        return "A faixa do parcelado vai de 2 a 12 parcelas";
      }
    } else {
      if (c.parcelasDe !== 1 || c.parcelasAte !== 1) return "Só o crédito parcelado tem faixa de parcelas";
      if (c.antecipado) return "Só o crédito parcelado pode ser antecipado";
      if (condicoes.filter((o) => o.modalidade === c.modalidade).length > 1) {
        return `${ROTULOS_MODALIDADE_CARTAO[c.modalidade]} aparece mais de uma vez`;
      }
    }
  }
  const faixas = condicoes
    .filter((c) => c.modalidade === "CREDITO_PARCELADO")
    .sort((a, b) => a.parcelasDe - b.parcelasDe);
  if (faixas.some((f, i) => i > 0 && f.parcelasDe <= faixas[i - 1].parcelasAte)) {
    return "As faixas do parcelado se sobrepõem";
  }
  return null;
}

/** "Crédito 3x — Stone", "Débito", "Pix na maquininha — Cielo". */
export function descricaoPagamentoCartao(
  modalidade: ModalidadeCartaoValor,
  parcelas: number | null,
  operadora?: string,
): string {
  const base = modalidade === "CREDITO_PARCELADO" ? `Crédito ${parcelas}x` : ROTULOS_MODALIDADE_CARTAO[modalidade];
  return operadora ? `${base} — ${operadora}` : base;
}
```

Conferir o caso de 3x do teste: bruto 10000, parte 3333, taxa total 300, parteTaxa = floor(300·3333/10000) = 99 → 0,99, 0,99 e 1,02. ✔

- [ ] **Step 5: Rótulo da situação** — em `src/lib/producao/venda.ts`, depois de `ROTULOS_SITUACAO_PAGAMENTO`:

```ts
/** Venda na maquininha: quem deve é a operadora, então "em aberto" é aguardar o repasse. */
export function rotuloSituacaoPagamento(situacao: SituacaoPagamento, naMaquininha: boolean): string {
  if (naMaquininha && situacao === "EM_ABERTO") return "Aguardando repasse";
  if (naMaquininha && situacao === "VENCIDO") return "Repasse atrasado";
  return ROTULOS_SITUACAO_PAGAMENTO[situacao];
}
```

e em `venda.test.ts` um teste:

```ts
test("rotuloSituacaoPagamento troca o texto só na maquininha", () => {
  expect(rotuloSituacaoPagamento("EM_ABERTO", true)).toBe("Aguardando repasse");
  expect(rotuloSituacaoPagamento("VENCIDO", true)).toBe("Repasse atrasado");
  expect(rotuloSituacaoPagamento("PAGO", true)).toBe("Pago");
  expect(rotuloSituacaoPagamento("EM_ABERTO", false)).toBe("Em aberto");
});
```

(importar `rotuloSituacaoPagamento` no topo do arquivo de teste).

- [ ] **Step 6: Rodar** — `npx vitest run src/lib/producao` → PASS.

- [ ] **Step 7: Commit** — `git add src/lib; git commit -m "feat(cartao): cálculo dos repasses e rótulos da maquininha"`.

---

### Task 3: Serviço de operadoras

**Files:**
- Create: `src/lib/schemas/operadoraCartao.ts`, `src/server/services/operadoraCartao.ts`, `src/server/services/operadoraCartao.test.ts`

**Interfaces:**
- Consumes: `CondicaoCartao`, `validarCondicoesCartao` (Task 2).
- Produces:
  - `operadoraCartaoSchema`, `type OperadoraCartaoFormValues` (`nome`, `cnpjCpf`, `contaBancariaId`, `categoriaTaxaId`, `condicoes: CondicaoCartao[]` vindo de JSON no campo `condicoes`).
  - `listarOperadoras(filialId)` → operadoras com `condicoes`, `contaBancaria` (com `banco.nome`), `categoriaTaxa.nome`, `fornecedor.cnpjCpf`.
  - `criarOperadora(sessao, dados)`, `atualizarOperadora(sessao, id, dados)`, `definirAtivoOperadora(sessao, id, ativo)`.
  - `condicoesDaOperadora(o: { condicoes: {...Decimal} [] }): CondicaoCartao[]` (Decimal → number).

- [ ] **Step 1: Schema** `src/lib/schemas/operadoraCartao.ts`:

```ts
import { z } from "zod";
import { MODALIDADE_CARTAO } from "./enums";
import { cnpjCpfSchema } from "@/lib/cnpjCpf";
import { validarCondicoesCartao } from "@/lib/producao/cartao";

const condicaoSchema = z.object({
  modalidade: z.enum(MODALIDADE_CARTAO, { message: "Selecione a modalidade" }),
  parcelasDe: z.coerce.number().int(),
  parcelasAte: z.coerce.number().int(),
  taxaPercentual: z.coerce.number({ message: "Informe a taxa" }),
  prazoDias: z.coerce.number({ message: "Informe o prazo" }).int("O prazo é em dias inteiros"),
  antecipado: z.boolean(),
});

/** As condições chegam do formulário como JSON num campo escondido (como os itens do pedido). */
const condicoesDoFormulario = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return [];
  }
}, z.array(condicaoSchema));

export const operadoraCartaoSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome"),
    cnpjCpf: cnpjCpfSchema,
    contaBancariaId: z.string().trim().min(1, "Selecione a conta de depósito"),
    categoriaTaxaId: z.string().trim().min(1, "Selecione a categoria da taxa"),
    condicoes: condicoesDoFormulario,
  })
  .superRefine((dados, ctx) => {
    const erro = validarCondicoesCartao(dados.condicoes);
    if (erro) ctx.addIssue({ code: "custom", path: ["condicoes"], message: erro });
  });

export type OperadoraCartaoFormValues = z.infer<typeof operadoraCartaoSchema>;
```

- [ ] **Step 2: Testes que falham** `src/server/services/operadoraCartao.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { operadoraCartaoSchema } from "@/lib/schemas/operadoraCartao";
import {
  criarCadastrosDeVenda,
  criarCatalogoDeTeste,
  criarFixtureProducao,
  type CadastrosDeVenda,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "./producaoTestFixtures";
import { atualizarOperadora, criarOperadora, definirAtivoOperadora, listarOperadoras } from "./operadoraCartao";

describe("operadora de cartão", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  let cnpjSeq = 0;
  const cnpj = () => `12.345.${String(Date.now()).slice(-3)}/0001-${String(10 + ++cnpjSeq).padStart(2, "0")}`;

  const dados = (extra: Record<string, unknown> = {}) =>
    operadoraCartaoSchema.parse({
      nome: `Stone ${++cnpjSeq}`,
      cnpjCpf: cnpj(),
      contaBancariaId: cad.contaCorrenteId,
      categoriaTaxaId: cat.categoriaCompraId,
      condicoes: JSON.stringify([
        { modalidade: "DEBITO", parcelasDe: 1, parcelasAte: 1, taxaPercentual: 1.5, prazoDias: 1, antecipado: false },
      ]),
      ...extra,
    });

  beforeAll(async () => {
    fx = await criarFixtureProducao("operadora");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("cria cliente e fornecedor pelo CNPJ e grava as condições", async () => {
    const entrada = dados();
    const op = await criarOperadora(fx.sessao("FINANCEIRO"), entrada);
    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: op.fornecedorId } });
    const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: op.clienteId } });
    expect(fornecedor).toMatchObject({ nome: entrada.nome, cnpjCpf: entrada.cnpjCpf });
    expect(cliente).toMatchObject({ nome: entrada.nome, cnpjCpf: entrada.cnpjCpf });
    const [lida] = (await listarOperadoras(fx.filialAId)).filter((o) => o.id === op.id);
    expect(lida.condicoes).toHaveLength(1);
    expect(Number(lida.condicoes[0].taxaPercentual)).toBe(1.5);
  });

  test("reaproveita cliente e fornecedor existentes", async () => {
    const entrada = dados();
    const fornecedor = await prisma.fornecedor.create({
      data: { empresaId: fx.empresaId, nome: "Já existia", cnpjCpf: entrada.cnpjCpf },
    });
    const op = await criarOperadora(fx.sessao("FINANCEIRO"), entrada);
    expect(op.fornecedorId).toBe(fornecedor.id);
  });

  test("recusa fornecedor inativo com o CNPJ", async () => {
    const entrada = dados();
    await prisma.fornecedor.create({
      data: { empresaId: fx.empresaId, nome: "Inativo", cnpjCpf: entrada.cnpjCpf, ativo: false },
    });
    await expect(criarOperadora(fx.sessao("FINANCEIRO"), entrada)).rejects.toThrow(
      "O fornecedor com este CNPJ está inativo; reative o cadastro",
    );
  });

  test("recusa conta Caixa, categoria de receita, nome repetido e perfil sem permissão", async () => {
    await expect(criarOperadora(fx.sessao("FINANCEIRO"), dados({ contaBancariaId: cad.contaCaixaId }))).rejects.toThrow(
      "A conta de depósito não pode ser uma conta Caixa",
    );
    await expect(
      criarOperadora(fx.sessao("FINANCEIRO"), dados({ categoriaTaxaId: cad.categoriaVendaId })),
    ).rejects.toThrow("A categoria da taxa deve ser de despesa");
    const primeira = dados();
    await criarOperadora(fx.sessao("FINANCEIRO"), primeira);
    await expect(
      criarOperadora(fx.sessao("FINANCEIRO"), { ...dados(), nome: primeira.nome }),
    ).rejects.toThrow("Já existe uma operadora com este nome");
    await expect(criarOperadora(fx.sessao("PRODUCAO"), dados())).rejects.toThrow(PermissionError);
  });

  test("schema recusa faixas sobrepostas", () => {
    const r = operadoraCartaoSchema.safeParse({
      ...dados(),
      condicoes: JSON.stringify([
        { modalidade: "CREDITO_PARCELADO", parcelasDe: 2, parcelasAte: 6, taxaPercentual: 3, prazoDias: 30, antecipado: false },
        { modalidade: "CREDITO_PARCELADO", parcelasDe: 5, parcelasAte: 12, taxaPercentual: 4, prazoDias: 30, antecipado: false },
      ]),
    });
    expect(r.success).toBe(false);
  });

  test("atualizar troca as condições e inativar esconde da venda", async () => {
    const op = await criarOperadora(fx.sessao("FINANCEIRO"), dados());
    const novos = dados({
      condicoes: JSON.stringify([
        { modalidade: "CREDITO_VISTA", parcelasDe: 1, parcelasAte: 1, taxaPercentual: 2.5, prazoDias: 30, antecipado: false },
      ]),
    });
    await atualizarOperadora(fx.sessao("FINANCEIRO"), op.id, novos);
    const condicoes = await prisma.condicaoOperadoraCartao.findMany({ where: { operadoraId: op.id } });
    expect(condicoes.map((c) => c.modalidade)).toEqual(["CREDITO_VISTA"]);
    await definirAtivoOperadora(fx.sessao("FINANCEIRO"), op.id, false);
    expect((await prisma.operadoraCartao.findUniqueOrThrow({ where: { id: op.id } })).ativo).toBe(false);
  });
});
```

Se `FINANCEIRO` não tiver `cadastro:escrever` (conferir em `src/server/auth/permissions.ts`), usar `ADMINISTRADOR` nos testes.

- [ ] **Step 3: Rodar** — `npx vitest run src/server/services/operadoraCartao.test.ts` → FAIL (módulo não existe).

- [ ] **Step 4: Implementar** `src/server/services/operadoraCartao.ts`:

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireAlteracaoFilial, requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { OperadoraCartaoFormValues } from "@/lib/schemas/operadoraCartao";
import type { CondicaoCartao } from "@/lib/producao/cartao";

type Tx = Prisma.TransactionClient;

export async function listarOperadoras(filialId: string) {
  return prisma.operadoraCartao.findMany({
    where: { filialId },
    include: {
      condicoes: { orderBy: [{ modalidade: "asc" }, { parcelasDe: "asc" }] },
      contaBancaria: { include: { banco: { select: { nome: true } } } },
      categoriaTaxa: { select: { nome: true } },
      fornecedor: { select: { cnpjCpf: true } },
    },
    orderBy: { nome: "asc" },
  });
}

export type OperadoraListada = Awaited<ReturnType<typeof listarOperadoras>>[number];

/** Decimal do banco → número da função de cálculo. */
export function condicoesDaOperadora(operadora: {
  condicoes: (Omit<CondicaoCartao, "taxaPercentual"> & { taxaPercentual: Prisma.Decimal | number })[];
}): CondicaoCartao[] {
  return operadora.condicoes.map((c) => ({
    modalidade: c.modalidade,
    parcelasDe: c.parcelasDe,
    parcelasAte: c.parcelasAte,
    taxaPercentual: Number(c.taxaPercentual),
    prazoDias: c.prazoDias,
    antecipado: c.antecipado,
  }));
}

async function validarReferencias(tx: Tx, sessao: SessaoAtiva, dados: OperadoraCartaoFormValues) {
  const conta = await tx.contaBancaria.findFirst({
    where: { id: dados.contaBancariaId, filialId: sessao.filialId, ativo: true },
    select: { tipo: true },
  });
  if (!conta) throw new Error("Conta não encontrada ou inativa");
  if (conta.tipo === "CAIXA") throw new Error("A conta de depósito não pode ser uma conta Caixa");
  const categoria = await tx.categoriaFinanceira.findFirst({
    where: { id: dados.categoriaTaxaId, filialId: sessao.filialId, ativo: true },
    select: { tipo: true },
  });
  if (!categoria) throw new Error("Categoria não encontrada ou inativa");
  if (categoria.tipo !== "DESPESA") throw new Error("A categoria da taxa deve ser de despesa");
}

/** Fornecedor (taxa) e cliente (repasses) da empresa com o CNPJ; cria os que faltam (D-38). */
async function contrapartesPorCnpj(tx: Tx, sessao: SessaoAtiva, nome: string, cnpjCpf: string) {
  const empresaId = sessao.empresaId;
  let fornecedor = await tx.fornecedor.findUnique({ where: { empresaId_cnpjCpf: { empresaId, cnpjCpf } } });
  if (fornecedor && !fornecedor.ativo) throw new Error("O fornecedor com este CNPJ está inativo; reative o cadastro");
  fornecedor ??= await tx.fornecedor.create({ data: { empresaId, nome, cnpjCpf } });
  let cliente = await tx.cliente.findUnique({ where: { empresaId_cnpjCpf: { empresaId, cnpjCpf } } });
  if (cliente && !cliente.ativo) throw new Error("O cliente com este CNPJ está inativo; reative o cadastro");
  cliente ??= await tx.cliente.create({ data: { empresaId, nome, cnpjCpf } });
  return { fornecedorId: fornecedor.id, clienteId: cliente.id };
}

function nomeRepetido(erro: unknown): never {
  if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
    throw new Error("Já existe uma operadora com este nome");
  }
  throw erro;
}

export async function criarOperadora(sessao: SessaoAtiva, dados: OperadoraCartaoFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  return prisma
    .$transaction(async (tx) => {
      await validarReferencias(tx, sessao, dados);
      const contrapartes = await contrapartesPorCnpj(tx, sessao, dados.nome, dados.cnpjCpf);
      const operadora = await tx.operadoraCartao.create({
        data: {
          filialId: sessao.filialId,
          nome: dados.nome,
          contaBancariaId: dados.contaBancariaId,
          categoriaTaxaId: dados.categoriaTaxaId,
          ...contrapartes,
          condicoes: { create: dados.condicoes },
        },
      });
      await registrarAuditoria(
        {
          empresaId: sessao.empresaId,
          filialId: sessao.filialId,
          usuarioId: sessao.usuarioId,
          entidade: "OperadoraCartao",
          entidadeId: operadora.id,
          acao: "CRIAR",
          anterior: null,
          novo: { ...dados, ...contrapartes },
        },
        tx,
      );
      return operadora;
    })
    .catch(nomeRepetido);
}

export async function atualizarOperadora(sessao: SessaoAtiva, id: string, dados: OperadoraCartaoFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  return prisma
    .$transaction(async (tx) => {
      const anterior = await tx.operadoraCartao.findFirstOrThrow({
        where: { id, filialId: sessao.filialId },
        include: { condicoes: true },
      });
      await validarReferencias(tx, sessao, dados);
      const contrapartes = await contrapartesPorCnpj(tx, sessao, dados.nome, dados.cnpjCpf);
      await tx.condicaoOperadoraCartao.deleteMany({ where: { operadoraId: id } });
      const operadora = await tx.operadoraCartao.update({
        where: { id },
        data: {
          nome: dados.nome,
          contaBancariaId: dados.contaBancariaId,
          categoriaTaxaId: dados.categoriaTaxaId,
          ...contrapartes,
          condicoes: { create: dados.condicoes },
        },
      });
      await registrarAuditoria(
        {
          empresaId: sessao.empresaId,
          filialId: sessao.filialId,
          usuarioId: sessao.usuarioId,
          entidade: "OperadoraCartao",
          entidadeId: id,
          acao: "ATUALIZAR",
          anterior: {
            nome: anterior.nome,
            contaBancariaId: anterior.contaBancariaId,
            categoriaTaxaId: anterior.categoriaTaxaId,
            fornecedorId: anterior.fornecedorId,
            clienteId: anterior.clienteId,
            condicoes: condicoesDaOperadora(anterior),
          },
          novo: { ...dados, ...contrapartes },
        },
        tx,
      );
      return operadora;
    })
    .catch(nomeRepetido);
}

export async function definirAtivoOperadora(sessao: SessaoAtiva, id: string, ativo: boolean) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  await prisma.operadoraCartao.findFirstOrThrow({ where: { id, filialId: sessao.filialId } });
  const operadora = await prisma.operadoraCartao.update({ where: { id }, data: { ativo } });
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "OperadoraCartao",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });
  return operadora;
}
```

Se `registrarAuditoria` não aceitar `tx` como 2º argumento, conferir a assinatura em `src/server/audit/registrar.ts` (o `pedidoVenda.ts` passa `tx`).

- [ ] **Step 5: Rodar** — `npx vitest run src/server/services/operadoraCartao.test.ts` → PASS. `npx tsc --noEmit` → 0.

- [ ] **Step 6: Commit** — `git add src; git commit -m "feat(cartao): cadastro de operadoras com cliente e fornecedor pelo CNPJ"`.

---

### Task 4: Tela de operadoras

**Files:**
- Create: `src/app/(dashboard)/cadastros/operadoras-cartao/page.tsx`, `.../actions.ts`, `.../operadora-dialog-form.tsx`
- Modify: `src/app/(dashboard)/nav-items.ts`, `src/app/(dashboard)/nav-items.test.ts`

**Interfaces:**
- Consumes: `listarOperadoras`, `criarOperadora`, `atualizarOperadora`, `definirAtivoOperadora`, `operadoraCartaoSchema` (Task 3); `MODALIDADE_CARTAO`, `ROTULOS_MODALIDADE_CARTAO` (Task 2).

- [ ] **Step 1: Actions** `actions.ts` — mesmo formato de `cadastros/fornecedores/actions.ts`, trocando schema e serviço:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { operadoraCartaoSchema } from "@/lib/schemas/operadoraCartao";
import * as operadoraService from "@/server/services/operadoraCartao";

export type FormState = { erro?: string; sucesso?: boolean };

const mensagemErro = (erro: unknown) => (erro instanceof Error ? erro.message : "Ocorreu um erro inesperado");
const CAMINHO = "/cadastros/operadoras-cartao";

export async function salvarOperadoraAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = String(formData.get("id") ?? "");
  const parsed = operadoraCartaoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  try {
    if (id) await operadoraService.atualizarOperadora(sessao, id, parsed.data);
    else await operadoraService.criarOperadora(sessao, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
  revalidatePath(CAMINHO);
  return { sucesso: true };
}

export async function alternarAtivoOperadoraAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  await operadoraService.definirAtivoOperadora(sessao, String(formData.get("id") ?? ""), formData.get("ativo") === "true");
  revalidatePath(CAMINHO);
}
```

- [ ] **Step 2: Formulário** `operadora-dialog-form.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MODALIDADE_CARTAO, ROTULOS_MODALIDADE_CARTAO } from "@/lib/schemas/enums";
import type { CondicaoCartao } from "@/lib/producao/cartao";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";
import { salvarOperadoraAction, type FormState } from "./actions";

type Opcao = { id: string; rotulo: string };
export type OperadoraForm = {
  id: string;
  nome: string;
  cnpjCpf: string;
  contaBancariaId: string;
  categoriaTaxaId: string;
  condicoes: CondicaoCartao[];
};
type Linha = { chave: number; modalidade: CondicaoCartao["modalidade"]; parcelasDe: string; parcelasAte: string; taxa: string; prazo: string; antecipado: boolean };

const ESTADO_INICIAL: FormState = {};
const linhaDe = (c: CondicaoCartao, chave: number): Linha => ({
  chave,
  modalidade: c.modalidade,
  parcelasDe: String(c.parcelasDe),
  parcelasAte: String(c.parcelasAte),
  taxa: String(c.taxaPercentual),
  prazo: String(c.prazoDias),
  antecipado: c.antecipado,
});
const linhaVazia = (chave: number): Linha => ({
  chave, modalidade: "DEBITO", parcelasDe: "1", parcelasAte: "1", taxa: "", prazo: "1", antecipado: false,
});

export function OperadoraDialogForm({
  operadora,
  contas,
  categorias,
}: {
  operadora?: OperadoraForm;
  contas: Opcao[];
  categorias: Opcao[];
}) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(salvarOperadoraAction, ESTADO_INICIAL);
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    operadora ? operadora.condicoes.map(linhaDe) : [linhaVazia(0)],
  );
  const proxima = useRef(linhas.length);
  const mudar = (chave: number, m: Partial<Linha>) =>
    setLinhas((atuais) => atuais.map((l) => (l.chave === chave ? { ...l, ...m } : l)));

  const condicoesJson = JSON.stringify(
    linhas.map((l) => {
      const parcelado = l.modalidade === "CREDITO_PARCELADO";
      return {
        modalidade: l.modalidade,
        parcelasDe: parcelado ? Number(l.parcelasDe) : 1,
        parcelasAte: parcelado ? Number(l.parcelasAte) : 1,
        taxaPercentual: l.taxa.trim() === "" ? null : Number(l.taxa),
        prazoDias: l.prazo.trim() === "" ? null : Number(l.prazo),
        antecipado: parcelado && l.antecipado,
      };
    }),
  );

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant={operadora ? "outline" : "default"} size={operadora ? "sm" : "default"} />}>
        {operadora ? "Editar" : "Nova operadora"}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{operadora ? "Editar operadora" : "Nova operadora"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {operadora ? <input type="hidden" name="id" value={operadora.id} /> : null}
          <input type="hidden" name="condicoes" value={condicoesJson} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" name="nome" defaultValue={operadora?.nome} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpjCpf">CNPJ</Label>
              <Input id="cnpjCpf" name="cnpjCpf" defaultValue={operadora?.cnpjCpf} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contaBancariaId">Conta de depósito</Label>
              <Select name="contaBancariaId" defaultValue={operadora?.contaBancariaId}>
                <SelectTrigger id="contaBancariaId" className="w-full"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>
                  {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoriaTaxaId">Categoria da taxa</Label>
              <Select name="categoriaTaxaId" defaultValue={operadora?.categoriaTaxaId}>
                <SelectTrigger id="categoriaTaxaId" className="w-full"><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            O sistema usa (ou cria) o fornecedor e o cliente com este CNPJ: a taxa sai em nome do fornecedor e os
            repasses em nome do cliente.
          </p>

          <div className="space-y-2">
            <p className="text-sm font-medium">Condições</p>
            {linhas.map((l) => {
              const parcelado = l.modalidade === "CREDITO_PARCELADO";
              return (
                <div key={l.chave} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-6">
                  <div className="sm:col-span-2">
                    <Select value={l.modalidade} onValueChange={(v) => v && mudar(l.chave, { modalidade: v as Linha["modalidade"] })}>
                      <SelectTrigger aria-label="Modalidade" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MODALIDADE_CARTAO.map((m) => <SelectItem key={m} value={m}>{ROTULOS_MODALIDADE_CARTAO[m]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {parcelado ? (
                    <>
                      <Input aria-label="Parcelas de" type="number" min="2" max="12" value={l.parcelasDe} onChange={(e) => mudar(l.chave, { parcelasDe: e.target.value })} />
                      <Input aria-label="Parcelas até" type="number" min="2" max="12" value={l.parcelasAte} onChange={(e) => mudar(l.chave, { parcelasAte: e.target.value })} />
                    </>
                  ) : (
                    <span className="self-center text-xs text-muted-foreground sm:col-span-2">1 parcela</span>
                  )}
                  <Input aria-label="Taxa (%)" placeholder="Taxa %" type="number" min="0" step="0.0001" value={l.taxa} onChange={(e) => mudar(l.chave, { taxa: e.target.value })} />
                  <Input aria-label="Prazo (dias)" placeholder="Dias" type="number" min="0" step="1" value={l.prazo} onChange={(e) => mudar(l.chave, { prazo: e.target.value })} />
                  <div className="flex items-center justify-between gap-2 sm:col-span-6">
                    {parcelado ? (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="size-4" checked={l.antecipado} onChange={(e) => mudar(l.chave, { antecipado: e.target.checked })} />
                        Antecipado (um repasse só, no prazo)
                      </label>
                    ) : <span />}
                    {linhas.length > 1 ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setLinhas((a) => a.filter((x) => x.chave !== l.chave))}>
                        Remover
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => setLinhas((a) => [...a, linhaVazia(proxima.current++)])}>
              Adicionar condição
            </Button>
            <p className="text-xs text-muted-foreground">
              Prazo em dias corridos até o 1º repasse. No parcelado sem antecipação, os repasses seguintes vêm de 30 em 30 dias.
            </p>
          </div>

          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" disabled={pendente}>{pendente ? "Salvando..." : "Salvar"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

(Quebrar à mão as linhas que passarem de ~120 colunas ao colar.)

- [ ] **Step 3: Página** `page.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/server/db/client";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeAlterarFilialAtiva, requirePermission } from "@/server/auth/permissions";
import { condicoesDaOperadora, listarOperadoras } from "@/server/services/operadoraCartao";
import { nomeDaContaBancaria } from "@/lib/contaBancaria";
import { ROTULOS_MODALIDADE_CARTAO } from "@/lib/schemas/enums";
import { OperadoraDialogForm } from "./operadora-dialog-form";
import { alternarAtivoOperadoraAction } from "./actions";

const TAXA = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

export default async function OperadorasCartaoPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");
  const podeEscrever = podeAlterarFilialAtiva(sessao.perfil, sessao.podeAlterarFilial);

  const [operadoras, contas, categorias] = await Promise.all([
    listarOperadoras(sessao.filialId),
    prisma.contaBancaria.findMany({
      where: { filialId: sessao.filialId, ativo: true, tipo: { not: "CAIXA" } },
      include: { banco: { select: { nome: true } } },
      orderBy: { conta: "asc" },
    }),
    prisma.categoriaFinanceira.findMany({
      where: { filialId: sessao.filialId, ativo: true, tipo: "DESPESA" },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);
  const opcoesContas = contas.map((c) => ({ id: c.id, rotulo: nomeDaContaBancaria(c) }));
  const opcoesCategorias = categorias.map((c) => ({ id: c.id, rotulo: c.nome }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Operadoras de cartão</h1>
          <p className="text-sm text-muted-foreground">
            Maquininhas da filial: onde depositam, taxa e prazo de cada modalidade.
          </p>
        </div>
        {podeEscrever ? <OperadoraDialogForm contas={opcoesContas} categorias={opcoesCategorias} /> : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Conta de depósito</TableHead>
            <TableHead>Condições</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {operadoras.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-medium">{o.nome}</TableCell>
              <TableCell>{nomeDaContaBancaria(o.contaBancaria)}</TableCell>
              <TableCell className="text-sm">
                {condicoesDaOperadora(o).map((c, i) => (
                  <p key={i}>
                    {ROTULOS_MODALIDADE_CARTAO[c.modalidade]}
                    {c.modalidade === "CREDITO_PARCELADO" ? ` ${c.parcelasDe}–${c.parcelasAte}x` : ""} ·{" "}
                    {TAXA.format(c.taxaPercentual)}% · {c.antecipado ? `antecipado em ${c.prazoDias} dias` : `${c.prazoDias} dias`}
                  </p>
                ))}
              </TableCell>
              <TableCell>
                <Badge variant={o.ativo ? "default" : "secondary"}>{o.ativo ? "Ativa" : "Inativa"}</Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                {podeEscrever ? (
                  <>
                    <OperadoraDialogForm
                      contas={opcoesContas}
                      categorias={opcoesCategorias}
                      operadora={{
                        id: o.id,
                        nome: o.nome,
                        cnpjCpf: o.fornecedor.cnpjCpf,
                        contaBancariaId: o.contaBancariaId,
                        categoriaTaxaId: o.categoriaTaxaId,
                        condicoes: condicoesDaOperadora(o),
                      }}
                    />
                    <form action={alternarAtivoOperadoraAction}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="ativo" value={(!o.ativo).toString()} />
                      <Button type="submit" variant="outline" size="sm">{o.ativo ? "Inativar" : "Reativar"}</Button>
                    </form>
                  </>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

Conferir a assinatura de `nomeDaContaBancaria` em `src/lib/contaBancaria.ts` (recebe `{ conta, agencia, tipo, banco: { nome } }`).

- [ ] **Step 4: Menu** — em `nav-items.ts`, na seção Cadastros, depois de "Contas bancárias":

```ts
      { href: "/cadastros/operadoras-cartao", label: "Operadoras de cartão", acao: "cadastro:ler" },
```

Ajustar `nav-items.test.ts` se algum teste listar os itens de Cadastros (rodar e corrigir a lista esperada).

- [ ] **Step 5: Verificar** — `npx tsc --noEmit`, `npx eslint src/app`, `npx vitest run "src/app/(dashboard)/nav-items.test.ts"` → ok.

- [ ] **Step 6: Commit** — `git add src; git commit -m "feat(cartao): tela de operadoras de cartão"`.

---

### Task 5: Venda na maquininha no serviço

**Files:**
- Modify: `src/lib/schemas/pedidoVenda.ts`, `src/server/services/pedidoVenda.ts`, `src/server/services/pedidoVenda.test.ts`
- Create: `src/server/services/cartaoTestFixtures.ts`, `src/server/services/pedidoVendaCartao.test.ts`

**Interfaces:**
- Consumes: `calcularRepasses`, `condicaoParaVenda`, `descricaoPagamentoCartao`, `ROTULOS_MODALIDADE_CARTAO` (Task 2); `condicoesDaOperadora` (Task 3).
- Produces:
  - Schema do pedido com `operadoraCartaoId?: string`, `modalidadeCartao?: ModalidadeCartaoValor`, `parcelasCartao?: number`.
  - `criarOperadoraDeTeste(fx, cat, cad, condicoes?)` em `cartaoTestFixtures.ts` → `{ id, clienteId, fornecedorId, contaId, categoriaTaxaId }`.

- [ ] **Step 1: Fixture** `cartaoTestFixtures.ts`:

```ts
import { prisma } from "@/server/db/client";
import type { CondicaoCartao } from "@/lib/producao/cartao";
import type { CadastrosDeVenda, CatalogoDeTeste, FixtureProducao } from "./producaoTestFixtures";

export const CONDICOES_PADRAO: CondicaoCartao[] = [
  { modalidade: "DEBITO", parcelasDe: 1, parcelasAte: 1, taxaPercentual: 1.5, prazoDias: 1, antecipado: false },
  { modalidade: "CREDITO_VISTA", parcelasDe: 1, parcelasAte: 1, taxaPercentual: 2.5, prazoDias: 30, antecipado: false },
  { modalidade: "CREDITO_PARCELADO", parcelasDe: 2, parcelasAte: 6, taxaPercentual: 3, prazoDias: 30, antecipado: false },
  { modalidade: "PIX_MAQUININHA", parcelasDe: 1, parcelasAte: 1, taxaPercentual: 0, prazoDias: 0, antecipado: false },
];

/** Operadora "Stone teste" na filial A, depositando na conta corrente, taxa na categoria de compra (DESPESA). */
export async function criarOperadoraDeTeste(
  fx: FixtureProducao,
  cat: CatalogoDeTeste,
  cad: CadastrosDeVenda,
  condicoes: CondicaoCartao[] = CONDICOES_PADRAO,
) {
  const sufixo = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-6);
  const cnpj = `98.765.${sufixo.slice(0, 3)}/0001-${sufixo.slice(3, 5)}`;
  const fornecedor = await prisma.fornecedor.create({ data: { empresaId: fx.empresaId, nome: "Stone teste", cnpjCpf: cnpj } });
  const cliente = await prisma.cliente.create({ data: { empresaId: fx.empresaId, nome: "Stone teste", cnpjCpf: cnpj } });
  const operadora = await prisma.operadoraCartao.create({
    data: {
      filialId: fx.filialAId,
      nome: `Stone ${sufixo}`,
      contaBancariaId: cad.contaCorrenteId,
      fornecedorId: fornecedor.id,
      clienteId: cliente.id,
      categoriaTaxaId: cat.categoriaCompraId,
      condicoes: { create: condicoes },
    },
  });
  return {
    id: operadora.id,
    clienteId: cliente.id,
    fornecedorId: fornecedor.id,
    contaId: cad.contaCorrenteId,
    categoriaTaxaId: cat.categoriaCompraId,
  };
}
```

- [ ] **Step 2: Testes que falham** `pedidoVendaCartao.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
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
} from "./producaoTestFixtures";
import { criarOperadoraDeTeste } from "./cartaoTestFixtures";
import { criarPedido } from "./pedidoVenda";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("venda na maquininha", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  let op: Awaited<ReturnType<typeof criarOperadoraDeTeste>>;

  const lote = () =>
    criarLoteDeTeste(fx, { produtoId: cat.produtoPolpaId, localId: cat.localCamaraId, kg: 100, custoKg: 2, data: d("2026-11-01"), validade: d("2027-11-01") });

  /** 10 kg a R$ 10 = R$ 100. */
  const venda = async (extra: Record<string, unknown>) =>
    pedidoVendaSchema.parse({
      data: "2026-11-10",
      clienteId: cad.clienteId,
      formaPagamento: "CARTAO",
      operadoraCartaoId: op.id,
      retiraNaPropriedade: "true",
      itens: JSON.stringify([{ loteId: (await lote()).id, quantidadeKg: 10, precoKg: 10 }]),
      ...extra,
    });

  beforeAll(async () => {
    fx = await criarFixtureProducao("cartao");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
    op = await criarOperadoraDeTeste(fx, cat, cad);
  });
  afterAll(async () => {
    await fx.limpar();
  });
  beforeEach(async () => {
    await configurarVendas(fx, cad);
  });

  test("crédito 3x: título da operadora com os repasses, título da taxa, nenhuma baixa", async () => {
    const r = await criarPedido(fx.sessao("VENDAS"), await venda({ modalidadeCartao: "CREDITO_PARCELADO", parcelasCartao: "3" }));
    const pedido = await prisma.pedidoVenda.findUniqueOrThrow({
      where: { id: r.pedidoId },
      include: {
        titulo: { include: { parcelas: { orderBy: { numero: "asc" } } } },
        tituloTaxa: { include: { parcelas: { orderBy: { numero: "asc" } } } },
      },
    });
    expect(pedido).toMatchObject({ operadoraCartaoId: op.id, modalidadeCartao: "CREDITO_PARCELADO", parcelasCartao: 3, baixaAutomaticaId: null, contaBancariaId: op.contaId });
    expect(Number(pedido.taxaCartaoPercentual)).toBe(3);
    expect(pedido.titulo).toMatchObject({ clienteId: op.clienteId, formaPagamento: expect.stringMatching(/^Crédito 3x — Stone/) });
    expect(pedido.titulo!.parcelas.map((p) => [p.dataVencimento.toISOString().slice(0, 10), Number(p.valorOriginal)])).toEqual([
      ["2026-12-10", 33.33],
      ["2027-01-09", 33.33],
      ["2027-02-08", 33.34],
    ]);
    expect(pedido.tituloTaxa).toMatchObject({
      tipo: "PAGAR",
      fornecedorId: op.fornecedorId,
      categoriaFinanceiraId: op.categoriaTaxaId,
      classificacaoFiscal: "GERENCIAL",
      documento: `Taxa PV-${r.numero}`,
    });
    expect(pedido.tituloTaxa!.parcelas.map((p) => [p.numero, Number(p.valorOriginal)])).toEqual([[1, 0.99], [2, 0.99], [3, 1.02]]);
    expect(await prisma.baixa.count({ where: { parcela: { tituloId: { in: [pedido.tituloId!, pedido.tituloTaxaId!] } } } })).toBe(0);
  });

  test("Pix na maquininha com taxa 0 não cria título de taxa", async () => {
    const r = await criarPedido(fx.sessao("VENDAS"), await venda({ modalidadeCartao: "PIX_MAQUININHA" }));
    const pedido = await prisma.pedidoVenda.findUniqueOrThrow({ where: { id: r.pedidoId } });
    expect(pedido.tituloTaxaId).toBeNull();
  });

  test("a taxa fica congelada no pedido", async () => {
    const r = await criarPedido(fx.sessao("VENDAS"), await venda({ modalidadeCartao: "DEBITO" }));
    await prisma.condicaoOperadoraCartao.updateMany({ where: { operadoraId: op.id, modalidade: "DEBITO" }, data: { taxaPercentual: 9 } });
    const pedido = await prisma.pedidoVenda.findUniqueOrThrow({ where: { id: r.pedidoId } });
    expect(Number(pedido.taxaCartaoPercentual)).toBe(1.5);
    await prisma.condicaoOperadoraCartao.updateMany({ where: { operadoraId: op.id, modalidade: "DEBITO" }, data: { taxaPercentual: 1.5 } });
  });

  test("recusas", async () => {
    await expect(
      criarPedido(fx.sessao("VENDAS"), await venda({ modalidadeCartao: "CREDITO_PARCELADO", parcelasCartao: "8" })),
    ).rejects.toThrow(/não tem condição para Crédito parcelado em 8x/);
    expect(pedidoVendaSchema.safeParse({ ...(await venda({ modalidadeCartao: "DEBITO" })), operadoraCartaoId: "" }).success).toBe(false);
    const outra = await criarOperadoraDeTeste(fx, cat, cad);
    await prisma.operadoraCartao.update({ where: { id: outra.id }, data: { ativo: false } });
    await expect(
      criarPedido(fx.sessao("VENDAS"), await venda({ operadoraCartaoId: outra.id, modalidadeCartao: "DEBITO" })),
    ).rejects.toThrow("Operadora não encontrada ou inativa");
  });
});
```

Observação: `safeParse` do segundo `expect` reaproveita o objeto já parseado; se o schema recusar por outro campo (ex.: `itens` já virou array — o preprocess aceita array), trocar por um objeto cru com `formaPagamento: "CARTAO"` sem operadora e conferir a mensagem "Selecione a operadora".

- [ ] **Step 3: Rodar** — `npx vitest run src/server/services/pedidoVendaCartao.test.ts` → FAIL.

- [ ] **Step 4: Schema do pedido** — em `pedidoVenda.ts` (schema): importar `MODALIDADE_CARTAO` de `./enums` e `MAX_PARCELAS_CARTAO` de `@/lib/producao/cartao`; acrescentar no objeto, depois de `contaBancariaId`:

```ts
    operadoraCartaoId: idOpcional,
    modalidadeCartao: enumOpcional(MODALIDADE_CARTAO),
    parcelasCartao: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : v),
      z.coerce.number().int().optional(),
    ),
```

e trocar o início do `superRefine`:

```ts
  .superRefine((dados, ctx) => {
    if (dados.formaPagamento === "CARTAO") {
      if (!dados.operadoraCartaoId) {
        ctx.addIssue({ code: "custom", path: ["operadoraCartaoId"], message: "Selecione a operadora" });
      }
      if (!dados.modalidadeCartao) {
        ctx.addIssue({ code: "custom", path: ["modalidadeCartao"], message: "Selecione a modalidade" });
      } else if (
        dados.modalidadeCartao === "CREDITO_PARCELADO" &&
        !(dados.parcelasCartao && dados.parcelasCartao >= 2 && dados.parcelasCartao <= MAX_PARCELAS_CARTAO)
      ) {
        ctx.addIssue({ code: "custom", path: ["parcelasCartao"], message: "Informe as parcelas (2 a 12)" });
      }
      return;
    }
    if (dados.formaPagamento !== "A_PRAZO") return;
```

(o resto do `superRefine` não muda). `parcelasCartao` com preprocess que mapeia ausente → `undefined` é seguro com `.optional()` (a regra do zod 4.6 só importa quando `fn` troca ausente por outro valor).

- [ ] **Step 5: Serviço** — em `src/server/services/pedidoVenda.ts`:

Imports novos:

```ts
import { ROTULOS_FORMA_PAGAMENTO_VENDA, ROTULOS_MODALIDADE_CARTAO } from "@/lib/schemas/enums";
import { calcularRepasses, condicaoParaVenda, descricaoPagamentoCartao } from "@/lib/producao/cartao";
import { condicoesDaOperadora } from "./operadoraCartao";
```

Trocar o bloco de `aVista`/`contaId` (linhas 54–68) por:

```ts
  const naMaquininha = dados.formaPagamento === "CARTAO";
  const aVista = dados.formaPagamento !== "A_PRAZO" && !naMaquininha;
  const emDinheiro = dados.formaPagamento === "DINHEIRO";
  let contaId: string | null = null;
  if (aVista) {
    contaId =
      dados.contaBancariaId ?? (emDinheiro ? configuracao.contaCaixaPadraoId : configuracao.contaRecebimentoPadraoId);
    if (!contaId) throw new Error(emDinheiro ? MSG_SEM_CONTA_CAIXA : MSG_SEM_CONTA_RECEBIMENTO);
    const conta = await prisma.contaBancaria.findFirst({
      where: { id: contaId, filialId: sessao.filialId, ativo: true },
      select: { tipo: true },
    });
    if (!conta) throw new Error("Conta não encontrada ou inativa");
    if (emDinheiro && conta.tipo !== "CAIXA") throw new Error("Venda em dinheiro entra numa conta Caixa");
    if (!emDinheiro && conta.tipo === "CAIXA") throw new Error("Pix e transferência não entram na conta Caixa");
  }

  // D-37: venda na maquininha — operadora, condição e taxa congeladas no pedido.
  let maquininha: {
    operadora: { id: string; nome: string; clienteId: string; fornecedorId: string; categoriaTaxaId: string; contaBancariaId: string };
    modalidade: NonNullable<PedidoVendaFormValues["modalidadeCartao"]>;
    parcelas: number;
    condicao: NonNullable<ReturnType<typeof condicaoParaVenda>>;
  } | null = null;
  if (naMaquininha) {
    const operadora = await prisma.operadoraCartao.findFirst({
      where: { id: dados.operadoraCartaoId, filialId: sessao.filialId, ativo: true },
      include: { condicoes: true, contaBancaria: { select: { ativo: true } } },
    });
    if (!operadora) throw new Error("Operadora não encontrada ou inativa");
    if (!operadora.contaBancaria.ativo) throw new Error("A conta de depósito da operadora está inativa");
    const modalidade = dados.modalidadeCartao!;
    const parcelas = modalidade === "CREDITO_PARCELADO" ? dados.parcelasCartao! : 1;
    const condicao = condicaoParaVenda(condicoesDaOperadora(operadora), modalidade, parcelas);
    if (!condicao) {
      const emParcelas = modalidade === "CREDITO_PARCELADO" ? ` em ${parcelas}x` : "";
      throw new Error(`A ${operadora.nome} não tem condição para ${ROTULOS_MODALIDADE_CARTAO[modalidade]}${emParcelas}`);
    }
    contaId = operadora.contaBancariaId;
    maquininha = { operadora, modalidade, parcelas, condicao };
  }
```

Depois de `const totais = calcularPedido(itens);`:

```ts
  const repasses = maquininha ? calcularRepasses(dados.data, totais.valor, maquininha.condicao, maquininha.parcelas) : [];
```

Trocar as linhas `const parcelasAPrazo = aVista ? [] : dados.parcelas;` e `if (!aVista) {` e `const condicaoPagamento = aVista` por `aPrazo`:

```ts
  const aPrazo = dados.formaPagamento === "A_PRAZO";
  const parcelasAPrazo = aPrazo ? dados.parcelas : [];
  if (aPrazo) {
    const erroParcelas = validarParcelasVenda(dados.data, totais.valor, parcelasAPrazo);
    if (erroParcelas) throw new Error(erroParcelas);
  }
  const condicaoPagamento = aPrazo
    ? condicaoDasParcelas(dados.data, parcelasAPrazo.map((p) => p.dataVencimento))
    : null;
```

No `tx.pedidoVenda.create`, acrescentar ao `data`:

```ts
            operadoraCartaoId: maquininha?.operadora.id ?? null,
            modalidadeCartao: maquininha?.modalidade ?? null,
            parcelasCartao: maquininha?.parcelas ?? null,
            taxaCartaoPercentual: maquininha?.condicao.taxaPercentual ?? null,
```

No `criarTituloInterno` do RECEBER, trocar `contraparteId`, `formaPagamento` e `parcelas`:

```ts
            contraparteId: maquininha ? maquininha.operadora.clienteId : cliente.id,
            ...
            formaPagamento: maquininha
              ? descricaoPagamentoCartao(maquininha.modalidade, maquininha.parcelas, maquininha.operadora.nome)
              : ROTULOS_FORMA_PAGAMENTO_VENDA[dados.formaPagamento],
            ...
            parcelas: maquininha
              ? repasses.map((r) => ({ numero: r.numero, dataVencimento: r.data, valorOriginal: r.bruto }))
              : aVista
                ? [{ numero: 1, dataVencimento: dados.data, valorOriginal: totais.valor }]
                : parcelasAPrazo.map((parcela, i) => ({
                    numero: i + 1,
                    dataVencimento: parcela.dataVencimento,
                    valorOriginal: parcela.valor,
                  })),
```

Logo depois do título a receber:

```ts
        let tituloTaxaId: string | null = null;
        const parcelasTaxa = repasses.filter((r) => r.taxa > 0);
        if (maquininha && parcelasTaxa.length > 0) {
          const tituloTaxa = await criarTituloInterno(
            sessao,
            "PAGAR",
            {
              contraparteId: maquininha.operadora.fornecedorId,
              documento: `Taxa PV-${numero}`,
              dataEmissao: dados.data,
              dataCompetencia: dados.data,
              categoriaFinanceiraId: maquininha.operadora.categoriaTaxaId,
              contaBancariaId: maquininha.operadora.contaBancariaId,
              formaPagamento: "Taxa da operadora",
              classificacaoFiscal: "GERENCIAL",
              tipoComprovante: "SEM_COMPROVANTE",
              numeroDocumentoFiscal: "",
              motivoSemDocumento: "Taxa da operadora descontada no repasse",
              parcelas: parcelasTaxa.map((r) => ({ numero: r.numero, dataVencimento: r.data, valorOriginal: r.taxa })),
            },
            tx,
          );
          tituloTaxaId = tituloTaxa.id;
        }
```

Trocar o `tx.pedidoVenda.update` final por
`data: { tituloId: titulo.id, tituloTaxaId, baixaAutomaticaId }` e, na auditoria `CRIAR`, acrescentar ao `novo`:

```ts
              cartao: maquininha
                ? {
                    operadora: maquininha.operadora.nome,
                    modalidade: maquininha.modalidade,
                    parcelas: maquininha.parcelas,
                    taxaPercentual: maquininha.condicao.taxaPercentual,
                    repasses,
                  }
                : undefined,
              tituloTaxaId,
```

e trocar `parcelas: aVista ? undefined :` por `parcelas: aPrazo ? parcelasAPrazo.map(...) : undefined`.

Se `criarTituloInterno` recusar o título da taxa (ex.: `garantirNotaNaoDuplicada`, ou exigência de `motivoSemDocumento`), ler a mensagem e ajustar os campos — não mudar `criarTituloInterno`.

- [ ] **Step 6: Teste antigo do cartão** — em `pedidoVenda.test.ts`, no teste "VENDAS cria venda à vista com baixa aprovada sem permissões de título", trocar `{ formaPagamento: "CARTAO" }` por `{ formaPagamento: "TRANSFERENCIA" }` (o teste é sobre a baixa automática à vista, que o cartão não tem mais).

- [ ] **Step 7: Rodar** — `npx vitest run src/server/services/pedidoVendaCartao.test.ts src/server/services/pedidoVenda.test.ts` → PASS. `npx tsc --noEmit` → 0.

- [ ] **Step 8: Commit** — `git add src; git commit -m "feat(cartao): venda na maquininha gera repasses e taxa sem baixa"`.

---

### Task 6: Repasses — confirmar, desfazer e bloqueio da baixa manual

**Files:**
- Create: `src/server/services/repasseCartao.ts`, `src/server/services/repasseCartao.test.ts`
- Modify: `src/server/services/baixa.ts`

**Interfaces:**
- Consumes: `efetivarBaixa` (baixa.ts), `recalcularEPersistirStatusParcela` (parcela.ts), fixtures das Tasks 5.
- Produces:
  - `type SituacaoRepasse = "A_RECEBER" | "ATRASADO" | "RECEBIDO"`
  - `type FiltroRepasses = { operadoraId?: string; inicio?: Date; fim?: Date; situacao?: SituacaoRepasse | "PENDENTES" }`
  - `listarRepasses(filialId, filtro, hoje): Promise<RepasseListado[]>` com `RepasseListado = { parcelaId; operadora: string; pedidoNumero: number; numero: number; totalRepasses: number; dataPrevista: Date; bruto: number; taxa: number; liquido: number; situacao: SituacaoRepasse; recebidoEm: Date | null }`
  - `confirmarRepasses(sessao, parcelaIds: string[], data: Date): Promise<void>`
  - `desfazerRepasse(sessao, parcelaId: string): Promise<void>`
  - `MSG_BAIXA_MAQUININHA` (baixa.ts)

- [ ] **Step 1: Testes que falham** `repasseCartao.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
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
} from "./producaoTestFixtures";
import { criarOperadoraDeTeste } from "./cartaoTestFixtures";
import { criarPedido } from "./pedidoVenda";
import { confirmarRepasses, desfazerRepasse, listarRepasses } from "./repasseCartao";
import { MSG_BAIXA_MAQUININHA, registrarBaixa } from "./baixa";
import { conciliarEmGrupo } from "./conciliacao";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("repasses de cartão", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  let op: Awaited<ReturnType<typeof criarOperadoraDeTeste>>;

  /** Crédito 3x de R$ 100 em 2026-11-10: repasses de 33,33/33,33/33,34 com taxa 0,99/0,99/1,02. */
  async function vendaParcelada() {
    const lote = await criarLoteDeTeste(fx, { produtoId: cat.produtoPolpaId, localId: cat.localCamaraId, kg: 100, custoKg: 2, data: d("2026-11-01"), validade: d("2027-11-01") });
    const r = await criarPedido(
      fx.sessao("VENDAS"),
      pedidoVendaSchema.parse({
        data: "2026-11-10",
        clienteId: cad.clienteId,
        formaPagamento: "CARTAO",
        operadoraCartaoId: op.id,
        modalidadeCartao: "CREDITO_PARCELADO",
        parcelasCartao: "3",
        retiraNaPropriedade: "true",
        itens: JSON.stringify([{ loteId: lote.id, quantidadeKg: 10, precoKg: 10 }]),
      }),
    );
    const pedido = await prisma.pedidoVenda.findUniqueOrThrow({
      where: { id: r.pedidoId },
      include: { titulo: { include: { parcelas: { orderBy: { numero: "asc" } } } }, tituloTaxa: { include: { parcelas: { orderBy: { numero: "asc" } } } } },
    });
    return { ...r, parcelas: pedido.titulo!.parcelas, parcelasTaxa: pedido.tituloTaxa!.parcelas };
  }

  const lancamentosDa = (baixaId: string) => prisma.lancamentoBancario.findMany({ where: { baixaId } });

  beforeAll(async () => {
    fx = await criarFixtureProducao("repasse");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
    op = await criarOperadoraDeTeste(fx, cat, cad);
  });
  afterAll(async () => {
    await fx.limpar();
  });
  beforeEach(async () => {
    await configurarVendas(fx, cad);
  });

  test("confirmar baixa o bruto e a taxa na conta da operadora", async () => {
    const v = await vendaParcelada();
    await confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelas[0].id], d("2026-11-11"));

    const repasse = await prisma.repasseCartaoConfirmado.findUniqueOrThrow({ where: { parcelaId: v.parcelas[0].id } });
    const [entrada] = await lancamentosDa(repasse.baixaRecebimentoId);
    const [saida] = await lancamentosDa(repasse.baixaTaxaId!);
    expect(entrada).toMatchObject({ tipo: "ENTRADA", contaBancariaId: op.contaId });
    expect(Number(entrada.valor)).toBe(33.33);
    expect(saida).toMatchObject({ tipo: "SAIDA", contaBancariaId: op.contaId });
    expect(Number(saida.valor)).toBe(0.99);
    const parcelas = await prisma.parcela.findMany({ where: { id: { in: [v.parcelas[0].id, v.parcelasTaxa[0].id] } } });
    expect(parcelas.every((p) => p.status === "PAGO")).toBe(true);
  });

  test("confirmar duas vezes recusa a transação inteira", async () => {
    const v = await vendaParcelada();
    await confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelas[0].id], d("2026-11-11"));
    await expect(
      confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelas[1].id, v.parcelas[0].id], d("2026-11-11")),
    ).rejects.toThrow(`O repasse 1 do PV-${v.numero} já foi confirmado`);
    expect(await prisma.repasseCartaoConfirmado.count({ where: { parcelaId: v.parcelas[1].id } })).toBe(0);
  });

  test("recusa data futura, parcela de título comum e baixa manual", async () => {
    const v = await vendaParcelada();
    await expect(confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelas[0].id], d("2999-01-01"))).rejects.toThrow(
      "A data do recebimento não pode ser futura",
    );
    await expect(confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelasTaxa[0].id], d("2026-11-11"))).rejects.toThrow(
      "Esta parcela não é repasse de venda na maquininha",
    );
    const baixa = { data: d("2026-11-11"), valorPago: 33.33, valorJuros: 0, valorMulta: 0, valorDesconto: 0, contaBancariaId: op.contaId };
    await expect(registrarBaixa(fx.sessao("FINANCEIRO"), v.parcelas[1].id, baixa)).rejects.toThrow(MSG_BAIXA_MAQUININHA);
    await expect(registrarBaixa(fx.sessao("FINANCEIRO"), v.parcelasTaxa[1].id, baixa)).rejects.toThrow(MSG_BAIXA_MAQUININHA);
  });

  test("desfazer volta a parcela para aberto; conciliado recusa", async () => {
    const v = await vendaParcelada();
    await confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelas[0].id, v.parcelas[1].id], d("2026-11-11"));
    await desfazerRepasse(fx.sessao("FINANCEIRO"), v.parcelas[0].id);
    expect(await prisma.repasseCartaoConfirmado.count({ where: { parcelaId: v.parcelas[0].id } })).toBe(0);
    const [p, t] = await Promise.all([
      prisma.parcela.findUniqueOrThrow({ where: { id: v.parcelas[0].id } }),
      prisma.parcela.findUniqueOrThrow({ where: { id: v.parcelasTaxa[0].id } }),
    ]);
    expect(p.status).not.toBe("PAGO");
    expect(t.status).not.toBe("PAGO");

    // Conciliação em grupo do 2º repasse: depósito líquido de 32,34 = 33,33 − 0,99.
    const repasse = await prisma.repasseCartaoConfirmado.findUniqueOrThrow({ where: { parcelaId: v.parcelas[1].id } });
    const lancamentos = await prisma.lancamentoBancario.findMany({
      where: { baixaId: { in: [repasse.baixaRecebimentoId, repasse.baixaTaxaId!] } },
    });
    const extrato = await prisma.extratoImportado.create({
      data: { filialId: fx.filialAId, contaBancariaId: op.contaId, nomeArquivo: "teste.ofx", totalLinhas: 1, linhasNovas: 1, linhasIgnoradas: 0, usuarioId: fx.usuarioId },
    });
    const linha = await prisma.linhaExtrato.create({
      data: { extratoImportadoId: extrato.id, contaBancariaId: op.contaId, data: d("2026-11-11"), valor: 32.34, tipo: "ENTRADA", historico: "STONE", identificadorBancario: `REP-${Date.now()}` },
    });
    await conciliarEmGrupo(fx.sessao("ADMINISTRADOR"), { linhaIds: [linha.id], lancamentoIds: lancamentos.map((l) => l.id) });
    await expect(desfazerRepasse(fx.sessao("FINANCEIRO"), v.parcelas[1].id)).rejects.toThrow(
      "O repasse já foi conciliado. Desconcilie na Conciliação antes",
    );
  });

  test("lista com situação, taxa e líquido", async () => {
    const v = await vendaParcelada();
    await confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelas[0].id], d("2026-11-11"));
    // Hoje = 20/01/2027: o 2º (09/01) está atrasado e o 3º (08/02) ainda a receber.
    const lista = await listarRepasses(fx.filialAId, { operadoraId: op.id }, d("2027-01-20"));
    const doPedido = lista.filter((r) => r.pedidoNumero === v.numero);
    expect(doPedido.map((r) => [r.numero, r.situacao, r.taxa, r.liquido])).toEqual([
      [1, "RECEBIDO", 0.99, 32.34],
      [2, "ATRASADO", 0.99, 32.34],
      [3, "A_RECEBER", 1.02, 32.32],
    ]);
    expect(doPedido[0].recebidoEm?.toISOString().slice(0, 10)).toBe("2026-11-11");
    const pendentes = await listarRepasses(fx.filialAId, { operadoraId: op.id, situacao: "PENDENTES" }, d("2027-01-20"));
    expect(pendentes.some((r) => r.parcelaId === v.parcelas[0].id)).toBe(false);
  });
});
```

Conferir em `permissions.ts` que `FINANCEIRO` tem `titulo:baixar` e `ADMINISTRADOR` tem `conciliacao:escrever`; se não, trocar o perfil no teste.

- [ ] **Step 2: Rodar** — `npx vitest run src/server/services/repasseCartao.test.ts` → FAIL.

- [ ] **Step 3: Bloqueio da baixa manual** — em `baixa.ts`:

```ts
export const MSG_BAIXA_MAQUININHA =
  "Este título é de venda na maquininha: confirme o recebimento em Repasses de cartão";

/** Títulos da maquininha (repasses e taxa) só são baixados pela confirmação do repasse (D-37). */
async function garantirForaDaMaquininha(parcelaId: string) {
  const daMaquininha = await prisma.parcela.count({
    where: {
      id: parcelaId,
      titulo: {
        OR: [
          { pedidoVenda: { is: { operadoraCartaoId: { not: null } } } },
          { pedidoVendaTaxa: { isNot: null } },
        ],
      },
    },
  });
  if (daMaquininha > 0) throw new Error(MSG_BAIXA_MAQUININHA);
}
```

e em `registrarBaixa`, logo depois de `await buscarParcelaDaFilial(sessao.filialId, parcelaId);`:
`await garantirForaDaMaquininha(parcelaId);`

- [ ] **Step 4: Serviço** `repasseCartao.ts`:

```ts
import { Prisma, type StatusParcela } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireAlteracaoFilial, requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { hojeDeCalendario } from "@/lib/producao/periodo";
import { efetivarBaixa } from "./baixa";
import { recalcularEPersistirStatusParcela } from "./parcela";

export type SituacaoRepasse = "A_RECEBER" | "ATRASADO" | "RECEBIDO";
export type FiltroRepasses = {
  operadoraId?: string;
  inicio?: Date;
  fim?: Date;
  situacao?: SituacaoRepasse | "PENDENTES";
};

const EM_ABERTO: StatusParcela[] = ["EM_ABERTO", "A_VENCER", "VENCIDO"];
const centavos = (valor: Prisma.Decimal | number) => Math.round(Number(valor) * 100);

export async function listarRepasses(filialId: string, filtro: FiltroRepasses, hoje: Date) {
  const parcelas = await prisma.parcela.findMany({
    where: {
      status: { notIn: ["CANCELADO", "RENEGOCIADO"] },
      ...(filtro.inicio || filtro.fim
        ? { dataVencimento: { ...(filtro.inicio ? { gte: filtro.inicio } : {}), ...(filtro.fim ? { lte: filtro.fim } : {}) } }
        : {}),
      titulo: {
        filialId,
        tipo: "RECEBER",
        pedidoVenda: {
          is: filtro.operadoraId ? { operadoraCartaoId: filtro.operadoraId } : { operadoraCartaoId: { not: null } },
        },
      },
    },
    include: {
      repasseCartao: { select: { data: true } },
      titulo: {
        select: {
          _count: { select: { parcelas: true } },
          pedidoVenda: {
            select: {
              numero: true,
              operadoraCartao: { select: { nome: true } },
              tituloTaxa: { select: { parcelas: { select: { numero: true, valorAtualizado: true, status: true } } } },
            },
          },
        },
      },
    },
    orderBy: [{ dataVencimento: "asc" }, { numero: "asc" }],
  });

  const listados = parcelas.map((p) => {
    const pedido = p.titulo.pedidoVenda!;
    const parcelaTaxa = pedido.tituloTaxa?.parcelas.find((t) => t.numero === p.numero && t.status !== "CANCELADO");
    const bruto = centavos(p.valorAtualizado);
    const taxa = parcelaTaxa ? centavos(parcelaTaxa.valorAtualizado) : 0;
    const situacao: SituacaoRepasse =
      p.repasseCartao || p.status === "PAGO" ? "RECEBIDO" : p.dataVencimento < hoje ? "ATRASADO" : "A_RECEBER";
    return {
      parcelaId: p.id,
      operadora: pedido.operadoraCartao!.nome,
      pedidoNumero: pedido.numero,
      numero: p.numero,
      totalRepasses: p.titulo._count.parcelas,
      dataPrevista: p.dataVencimento,
      bruto: bruto / 100,
      taxa: taxa / 100,
      liquido: (bruto - taxa) / 100,
      situacao,
      recebidoEm: p.repasseCartao?.data ?? null,
    };
  });
  if (!filtro.situacao) return listados;
  if (filtro.situacao === "PENDENTES") return listados.filter((r) => r.situacao !== "RECEBIDO");
  return listados.filter((r) => r.situacao === filtro.situacao);
}

export type RepasseListado = Awaited<ReturnType<typeof listarRepasses>>[number];

/** D-39: baixa o bruto e a taxa do repasse, já efetivadas, numa transação só. */
export async function confirmarRepasses(sessao: SessaoAtiva, parcelaIds: string[], data: Date): Promise<void> {
  requirePermission(sessao.perfil, "titulo:baixar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  const ids = [...new Set(parcelaIds)];
  if (ids.length === 0) throw new Error("Marque ao menos um repasse");
  if (data.getTime() > hojeDeCalendario().getTime()) throw new Error("A data do recebimento não pode ser futura");

  await prisma.$transaction(async (tx) => {
    // Trava as parcelas: duas confirmações simultâneas não baixam o mesmo repasse duas vezes.
    await tx.$queryRaw`SELECT id FROM parcelas WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
    const parcelas = await tx.parcela.findMany({
      where: { id: { in: ids }, titulo: { filialId: sessao.filialId } },
      include: {
        repasseCartao: { select: { id: true } },
        titulo: {
          select: {
            tipo: true,
            pedidoVenda: {
              select: {
                numero: true,
                operadoraCartao: { select: { contaBancariaId: true } },
                tituloTaxa: { select: { parcelas: true } },
              },
            },
          },
        },
      },
      orderBy: [{ tituloId: "asc" }, { numero: "asc" }],
    });
    if (parcelas.length !== ids.length) throw new Error("Repasse não encontrado");

    for (const parcela of parcelas) {
      const pedido = parcela.titulo.pedidoVenda;
      if (parcela.titulo.tipo !== "RECEBER" || !pedido?.operadoraCartao) {
        throw new Error("Esta parcela não é repasse de venda na maquininha");
      }
      if (parcela.repasseCartao || !EM_ABERTO.includes(parcela.status)) {
        throw new Error(`O repasse ${parcela.numero} do PV-${pedido.numero} já foi confirmado ou não está em aberto`);
      }
      const contaBancariaId = pedido.operadoraCartao.contaBancariaId;
      const baixaRecebimento = await tx.baixa.create({
        data: { parcelaId: parcela.id, data, valorPago: parcela.valorAtualizado, contaBancariaId, usuarioId: sessao.usuarioId, statusAprovacao: "PENDENTE" },
      });
      await efetivarBaixa(tx, sessao, baixaRecebimento.id);

      const parcelaTaxa = pedido.tituloTaxa?.parcelas.find((t) => t.numero === parcela.numero && EM_ABERTO.includes(t.status));
      let baixaTaxaId: string | null = null;
      if (parcelaTaxa) {
        const baixaTaxa = await tx.baixa.create({
          data: { parcelaId: parcelaTaxa.id, data, valorPago: parcelaTaxa.valorAtualizado, contaBancariaId, usuarioId: sessao.usuarioId, statusAprovacao: "PENDENTE" },
        });
        await efetivarBaixa(tx, sessao, baixaTaxa.id);
        baixaTaxaId = baixaTaxa.id;
      }

      await tx.repasseCartaoConfirmado.create({
        data: { parcelaId: parcela.id, baixaRecebimentoId: baixaRecebimento.id, baixaTaxaId, data, usuarioId: sessao.usuarioId },
      });
      await registrarAuditoria(
        {
          empresaId: sessao.empresaId,
          filialId: sessao.filialId,
          usuarioId: sessao.usuarioId,
          entidade: "Parcela",
          entidadeId: parcela.id,
          acao: "CONFIRMAR_REPASSE",
          anterior: { status: parcela.status },
          novo: { data, baixaRecebimentoId: baixaRecebimento.id, baixaTaxaId },
        },
        tx,
      );
    }
  });
}

export async function desfazerRepasse(sessao: SessaoAtiva, parcelaId: string): Promise<void> {
  requirePermission(sessao.perfil, "titulo:baixar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await prisma.$transaction(async (tx) => {
    const repasse = await tx.repasseCartaoConfirmado.findFirst({
      where: { parcelaId, parcela: { titulo: { filialId: sessao.filialId } } },
    });
    if (!repasse) throw new Error("Este repasse não foi confirmado");
    const baixaIds = [repasse.baixaRecebimentoId, repasse.baixaTaxaId].filter((id): id is string => id !== null);
    const conciliados = await tx.lancamentoBancario.count({
      where: { baixaId: { in: baixaIds }, grupoConciliacaoId: { not: null } },
    });
    if (conciliados > 0) throw new Error("O repasse já foi conciliado. Desconcilie na Conciliação antes");

    const baixas = await tx.baixa.findMany({ where: { id: { in: baixaIds } }, select: { parcelaId: true } });
    await tx.repasseCartaoConfirmado.delete({ where: { id: repasse.id } });
    await tx.lancamentoBancario.deleteMany({ where: { baixaId: { in: baixaIds } } });
    await tx.baixa.deleteMany({ where: { id: { in: baixaIds } } });
    for (const baixa of baixas) await recalcularEPersistirStatusParcela(baixa.parcelaId, tx);

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Parcela",
        entidadeId: parcelaId,
        acao: "DESFAZER_REPASSE",
        anterior: { data: repasse.data, baixaRecebimentoId: repasse.baixaRecebimentoId, baixaTaxaId: repasse.baixaTaxaId },
        novo: null,
      },
      tx,
    );
  });
}
```

A mensagem de "já confirmado" no teste é `O repasse 1 do PV-N já foi confirmado`; o serviço diz `... já foi confirmado ou não está em aberto` — o `toThrow` com string faz busca por trecho, então passa. Se `efetivarBaixa` exigir `ContextoTitulo`, `sessao` serve (tem `empresaId`, `filialId`, `usuarioId`). Se o nome da tabela não for `parcelas`, conferir o `@@map` de `Parcela` (é `parcelas`).

- [ ] **Step 5: Rodar** — `npx vitest run src/server/services/repasseCartao.test.ts src/server/services/baixa.test.ts` → PASS.

- [ ] **Step 6: Commit** — `git add src; git commit -m "feat(cartao): confirmar e desfazer repasses; baixa manual bloqueada"`.

---

### Task 7: Cancelamento do pedido na maquininha

**Files:**
- Modify: `src/server/services/pedidoVenda.ts`, `src/server/services/repasseCartao.test.ts`

- [ ] **Step 1: Testes que falham** — acrescentar ao `describe` de `repasseCartao.test.ts` (importar `cancelarPedido, situacaoParaCancelar` de `./pedidoVenda`):

```ts
  test("cancelar sem repasse confirmado cancela os dois títulos", async () => {
    const v = await vendaParcelada();
    await cancelarPedido(fx.sessao("FINANCEIRO"), v.pedidoId, "Cliente desistiu");
    const parcelas = await prisma.parcela.findMany({
      where: { id: { in: [...v.parcelas, ...v.parcelasTaxa].map((p) => p.id) } },
    });
    expect(parcelas.every((p) => p.status === "CANCELADO")).toBe(true);
  });

  test("com repasse confirmado o cancelamento é recusado", async () => {
    const v = await vendaParcelada();
    await confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelas[0].id], d("2026-11-11"));
    const pedido = await prisma.pedidoVenda.findUniqueOrThrow({ where: { id: v.pedidoId } });
    expect(await situacaoParaCancelar(pedido)).toEqual({
      pode: false,
      motivo: "Desfaça a confirmação dos repasses antes de cancelar",
    });
    await expect(cancelarPedido(fx.sessao("FINANCEIRO"), v.pedidoId, "Cliente desistiu")).rejects.toThrow(
      "Desfaça a confirmação dos repasses antes de cancelar",
    );
  });
```

Se `FINANCEIRO` não tiver `venda:cancelar`, usar `ADMINISTRADOR`.

- [ ] **Step 2: Rodar** → FAIL (o 2º recebe a mensagem "O financeiro registrou um recebimento"; o 1º deixa a taxa em aberto).

- [ ] **Step 3: Implementar** — em `situacaoParaCancelar`, logo depois do `if (pedido.status === "CANCELADO")`:

```ts
  if (pedido.tituloId) {
    const confirmados = await db.repasseCartaoConfirmado.count({ where: { parcela: { tituloId: pedido.tituloId } } });
    if (confirmados > 0) return { pode: false, motivo: "Desfaça a confirmação dos repasses antes de cancelar" };
  }
```

Em `cancelarPedido`, depois do `updateMany` das parcelas do `tituloId`:

```ts
    if (pedido.tituloTaxaId) {
      await tx.parcela.updateMany({ where: { tituloId: pedido.tituloTaxaId }, data: { status: "CANCELADO" } });
    }
```

- [ ] **Step 4: Rodar** — `npx vitest run src/server/services/repasseCartao.test.ts src/server/services/pedidoVenda.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add src; git commit -m "feat(cartao): cancelamento do pedido na maquininha"`.

---

### Task 8: Formulário, detalhe e recibo do pedido

**Files:**
- Modify: `src/app/(dashboard)/vendas/pedidos/novo/page.tsx`, `.../novo/pedido-form.tsx`, `.../[numero]/page.tsx`, `.../[numero]/recibo/route.ts`, `src/app/(dashboard)/vendas/_shared/formatos.tsx`, `src/app/(dashboard)/vendas/pedidos/page.tsx`, `src/server/services/pedidoVenda.ts` (`obterPedido`, `listarPedidos`)

**Interfaces:**
- Consumes: `calcularRepasses`, `condicaoParaVenda`, `descricaoPagamentoCartao`, `rotuloSituacaoPagamento`, `listarOperadoras`, `condicoesDaOperadora`.
- Produces: `OpcoesPedido.operadoras: { id: string; nome: string; condicoes: CondicaoCartao[] }[]`; `SituacaoPagamentoBadge({ situacao, naMaquininha? })`.

- [ ] **Step 1: Badge** — em `formatos.tsx`:

```tsx
import { rotuloSituacaoPagamento, type SituacaoPagamento } from "@/lib/producao/venda";
...
export function SituacaoPagamentoBadge({ situacao, naMaquininha = false }: { situacao: SituacaoPagamento; naMaquininha?: boolean }) {
  return <Badge variant={VARIANTE_SITUACAO[situacao]}>{rotuloSituacaoPagamento(situacao, naMaquininha)}</Badge>;
}
```

(remover o import de `ROTULOS_SITUACAO_PAGAMENTO` se ficar sem uso). Na lista `vendas/pedidos/page.tsx`, passar `naMaquininha={pedido.operadoraCartaoId !== null}` onde o badge é usado.

- [ ] **Step 2: Opções do formulário** — em `novo/page.tsx`, acrescentar `listarOperadoras(sessao.filialId)` ao `Promise.all` e ao `opcoes`:

```ts
    operadoras: operadoras
      .filter((o) => o.ativo)
      .map((o) => ({ id: o.id, nome: o.nome, condicoes: condicoesDaOperadora(o) })),
```

- [ ] **Step 3: Formulário** — em `pedido-form.tsx`:
  - `OpcoesPedido` ganha `operadoras: { id: string; nome: string; condicoes: CondicaoCartao[] }[];`
  - imports: `MODALIDADE_CARTAO, ROTULOS_MODALIDADE_CARTAO` de enums; `calcularRepasses, condicaoParaVenda, type CondicaoCartao, type ModalidadeCartaoValor` de `@/lib/producao/cartao`.
  - estados novos depois de `forma`:

```tsx
  const [operadoraId, setOperadoraId] = useState(opcoes.operadoras.length === 1 ? opcoes.operadoras[0].id : "");
  const [modalidade, setModalidade] = useState<ModalidadeCartaoValor | "">("");
  const [parcelasCartao, setParcelasCartao] = useState("2");
```

  - trocar `const aVista = forma !== "A_PRAZO";` por:

```tsx
  const naMaquininha = forma === "CARTAO";
  const aVista = forma !== "A_PRAZO" && !naMaquininha;
```

  e trocar `{aVista ? (<Campo id="contaBancariaId" ...>) : (<Campo id="prazos" ...>)}` por `{aVista ? (conta) : forma === "A_PRAZO" ? (prazos) : null}`; as condições `!aVista` das parcelas a prazo (input escondido `parcelas`, `geradas`, `erroParcelas`, seção "Parcelas", `disabled` do botão) passam a usar `forma === "A_PRAZO"`.
  - cálculo da prévia, depois de `totais`:

```tsx
  const operadora = opcoes.operadoras.find((o) => o.id === operadoraId);
  const modalidadesDaOperadora = MODALIDADE_CARTAO.filter((m) => operadora?.condicoes.some((c) => c.modalidade === m));
  const nParcelas = modalidade === "CREDITO_PARCELADO" ? Number(parcelasCartao) : 1;
  const condicaoCartao = operadora && modalidade ? condicaoParaVenda(operadora.condicoes, modalidade, nParcelas) : null;
  const repassesPrevia =
    naMaquininha && condicaoCartao && totais.valor > 0 && data
      ? calcularRepasses(dataDeCalendario(data), totais.valor, condicaoCartao, nParcelas)
      : [];
  const opcoesParcelas = (operadora?.condicoes ?? [])
    .filter((c) => c.modalidade === "CREDITO_PARCELADO")
    .flatMap((c) => Array.from({ length: c.parcelasAte - c.parcelasDe + 1 }, (_, i) => c.parcelasDe + i));
```

  - inputs escondidos (junto dos outros):

```tsx
      {naMaquininha ? (
        <>
          <input type="hidden" name="operadoraCartaoId" value={operadoraId} />
          <input type="hidden" name="modalidadeCartao" value={modalidade} />
          <input type="hidden" name="parcelasCartao" value={modalidade === "CREDITO_PARCELADO" ? parcelasCartao : ""} />
        </>
      ) : null}
```

  - campos (no lugar onde ficava a conta, quando `naMaquininha`):

```tsx
        {naMaquininha ? (
          <>
            <Campo id="operadoraCartao" rotulo="Operadora">
              <Select value={operadoraId || null} onValueChange={(v) => { setOperadoraId(v ?? ""); setModalidade(""); }}>
                <SelectTrigger id="operadoraCartao" className="w-full"><SelectValue placeholder="Selecione a operadora" /></SelectTrigger>
                <SelectContent>
                  {opcoes.operadoras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </Campo>
            <Campo id="modalidadeCartao" rotulo="Modalidade">
              <Select value={modalidade || null} onValueChange={(v) => setModalidade((v ?? "") as ModalidadeCartaoValor | "")}>
                <SelectTrigger id="modalidadeCartao" className="w-full"><SelectValue placeholder="Selecione a modalidade" /></SelectTrigger>
                <SelectContent>
                  {modalidadesDaOperadora.map((m) => <SelectItem key={m} value={m}>{ROTULOS_MODALIDADE_CARTAO[m]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Campo>
            {modalidade === "CREDITO_PARCELADO" ? (
              <Campo id="parcelasCartao" rotulo="Parcelas">
                <Select value={parcelasCartao} onValueChange={(v) => v && setParcelasCartao(v)}>
                  <SelectTrigger id="parcelasCartao" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {opcoesParcelas.map((n) => <SelectItem key={n} value={String(n)}>{n}x</SelectItem>)}
                  </SelectContent>
                </Select>
              </Campo>
            ) : null}
            {opcoes.operadoras.length === 0 ? (
              <p className="text-sm text-destructive sm:col-span-2">Cadastre uma operadora em Cadastros → Operadoras de cartão.</p>
            ) : null}
          </>
        ) : null}
```

  - seção da prévia (antes do resumo de totais):

```tsx
      {naMaquininha && repassesPrevia.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Repasses previstos</h2>
          {repassesPrevia.map((r) => (
            <p key={r.numero} className="text-sm tabular-nums">
              {repassesPrevia.length > 1 ? `${r.numero}ª · ` : ""}
              {formatarData(paraDataIso(r.data))} · bruto {formatarMoeda(r.bruto)} · taxa {formatarMoeda(r.taxa)} ·
              líquido {formatarMoeda(r.liquido)}
            </p>
          ))}
        </section>
      ) : null}
```

  - botão: acrescentar `|| (naMaquininha && !condicaoCartao)` ao `disabled`.
  - `formatarData` recebe `AAAA-MM-DD` neste arquivo (é como as validades são passadas); se aceitar `Date`, passar `r.data` direto.

- [ ] **Step 4: Detalhe** — em `obterPedido` (`pedidoVenda.ts`), acrescentar ao `include`:

```ts
      operadoraCartao: { select: { nome: true } },
      tituloTaxa: { select: { parcelas: { select: { numero: true, valorAtualizado: true, status: true } } } },
```

e em `titulo.select.parcelas` trocar por `parcelas: { orderBy: { numero: "asc" }, include: { repasseCartao: { select: { data: true } } } }`. Em `listarPedidos` nada muda (`operadoraCartaoId` já vem no modelo).

Em `[numero]/page.tsx`:
  - "Forma de pagamento": `{pedido.modalidadeCartao ? descricaoPagamentoCartao(pedido.modalidadeCartao, pedido.parcelasCartao, pedido.operadoraCartao?.nome) : ROTULOS_FORMA_PAGAMENTO_VENDA[pedido.formaPagamento]}`.
  - `<SituacaoPagamentoBadge situacao={pedido.situacao} naMaquininha={pedido.operadoraCartaoId !== null} />`.
  - No card Pagamento, quando `pedido.operadoraCartaoId`, trocar a lista de parcelas por:

```tsx
            {pedido.operadoraCartaoId
              ? pedido.titulo?.parcelas.map((parcela, _, todas) => {
                  const taxa = pedido.tituloTaxa?.parcelas.find((t) => t.numero === parcela.numero && t.status !== "CANCELADO");
                  const valorTaxa = taxa ? Number(taxa.valorAtualizado) : 0;
                  return (
                    <p key={parcela.id} className="text-sm tabular-nums">
                      {todas.length > 1 ? `${parcela.numero}º repasse · ` : "Repasse · "}
                      previsto {formatarData(parcela.dataVencimento)} · bruto {formatarMoeda(parcela.valorAtualizado)} ·
                      taxa {formatarMoeda(valorTaxa)} · líquido {formatarMoeda(Number(parcela.valorAtualizado) - valorTaxa)}
                      {" · "}
                      <span className="whitespace-nowrap text-muted-foreground">
                        {parcela.repasseCartao ? `recebido em ${formatarData(parcela.repasseCartao.data)}` : ROTULOS_STATUS_PARCELA[parcela.status]}
                      </span>
                    </p>
                  );
                })
              : /* lista atual de parcelas, sem mudança */}
```

  - O link "Ver em Contas a receber" vira, na maquininha, `href="/financeiro/repasses-cartao"` com o texto "Ver em Repasses de cartão".

- [ ] **Step 5: Recibo** — em `recibo/route.ts`, linha da forma: `formaPagamento: pedido.modalidadeCartao ? descricaoPagamentoCartao(pedido.modalidadeCartao, pedido.parcelasCartao) : ROTULOS_FORMA_PAGAMENTO_VENDA[pedido.formaPagamento],` (conferir que o objeto `pedido` usado ali traz os campos escalares).

- [ ] **Step 6: Verificar** — `npx tsc --noEmit`, `npx eslint src/app`, `npx vitest run src/server/services/pedidoVenda.test.ts` → ok.

- [ ] **Step 7: Commit** — `git add src; git commit -m "feat(cartao): maquininha no formulário, detalhe e recibo do pedido"`.

---

### Task 9: Tela Repasses de cartão

**Files:**
- Create: `src/app/(dashboard)/financeiro/repasses-cartao/page.tsx`, `.../actions.ts`, `.../repasses-lista.tsx`
- Modify: `src/app/(dashboard)/nav-items.ts`, `nav-items.test.ts` (se listar itens do Financeiro)

**Interfaces:**
- Consumes: `listarRepasses`, `confirmarRepasses`, `desfazerRepasse`, `RepasseListado` (Task 6); `BarraDeFiltros` de `../../producao/_shared/barra-de-filtros`.

- [ ] **Step 1: Actions** `actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { confirmarRepasses, desfazerRepasse } from "@/server/services/repasseCartao";

export type FormState = { erro?: string; sucesso?: boolean };
const mensagemErro = (erro: unknown) => (erro instanceof Error ? erro.message : "Ocorreu um erro inesperado");

function revalidar() {
  revalidatePath("/financeiro", "layout");
  revalidatePath("/vendas", "layout");
}

export async function confirmarRepassesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const data = String(formData.get("data") ?? "");
  let ids: string[] = [];
  try {
    ids = JSON.parse(String(formData.get("parcelaIds") ?? "[]"));
  } catch {
    ids = [];
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Informe a data do recebimento" };
  try {
    await confirmarRepasses(sessao, ids, new Date(`${data}T00:00:00.000Z`));
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
  revalidar();
  return { sucesso: true };
}

export async function desfazerRepasseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  try {
    await desfazerRepasse(sessao, String(formData.get("parcelaId") ?? ""));
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }
  revalidar();
  return { sucesso: true };
}
```

- [ ] **Step 2: Lista (client)** `repasses-lista.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { confirmarRepassesAction, desfazerRepasseAction, type FormState } from "./actions";

export type LinhaRepasse = {
  parcelaId: string;
  operadora: string;
  pedidoNumero: number;
  numero: number;
  totalRepasses: number;
  dataPrevista: string;
  bruto: number;
  taxa: number;
  liquido: number;
  situacao: "A_RECEBER" | "ATRASADO" | "RECEBIDO";
  recebidoEm: string | null;
};

const ROTULO = { A_RECEBER: "A receber", ATRASADO: "Atrasado", RECEBIDO: "Recebido" } as const;
const VARIANTE = { A_RECEBER: "secondary", ATRASADO: "destructive", RECEBIDO: "default" } as const;
const INICIAL: FormState = {};

function Desfazer({ parcelaId }: { parcelaId: string }) {
  const [state, action, pendente] = useActionState(desfazerRepasseAction, INICIAL);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="parcelaId" value={parcelaId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente}>Desfazer</Button>
      {state.erro ? <span className="text-xs text-destructive">{state.erro}</span> : null}
    </form>
  );
}

export function RepassesLista({ linhas, hoje, podeConfirmar }: { linhas: LinhaRepasse[]; hoje: string; podeConfirmar: boolean }) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [state, action, pendente] = useActionState(async (anterior: FormState, dados: FormData) => {
    const r = await confirmarRepassesAction(anterior, dados);
    if (r.sucesso) setMarcados(new Set());
    return r;
  }, INICIAL);
  const selecionadas = linhas.filter((l) => marcados.has(l.parcelaId));
  const liquido = selecionadas.reduce((t, l) => t + Math.round(l.liquido * 100), 0) / 100;
  const dataPadrao = selecionadas[0]?.dataPrevista && selecionadas[0].dataPrevista <= hoje ? selecionadas[0].dataPrevista : hoje;
  const alternar = (id: string) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  return (
    <div className="space-y-4">
      {podeConfirmar ? (
        <form action={action} className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/40 p-3">
          <input type="hidden" name="parcelaIds" value={JSON.stringify([...marcados])} />
          <div className="text-sm">
            <p className="text-muted-foreground">{selecionadas.length} repasse(s) marcado(s)</p>
            <p className="text-base font-semibold tabular-nums">Líquido {formatarMoeda(liquido)}</p>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Recebido em
            <Input key={dataPadrao} type="date" name="data" defaultValue={dataPadrao} max={hoje} className="w-40" />
          </label>
          <Button type="submit" disabled={pendente || selecionadas.length === 0}>
            {pendente ? "Confirmando..." : "Confirmar recebimento"}
          </Button>
          {state.erro ? <p className="w-full text-sm text-destructive">{state.erro}</p> : null}
        </form>
      ) : null}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {podeConfirmar ? <TableHead className="w-8" /> : null}
              <TableHead>Previsto</TableHead>
              <TableHead>Operadora</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead className="text-right">Bruto</TableHead>
              <TableHead className="text-right">Taxa</TableHead>
              <TableHead className="text-right">Líquido</TableHead>
              <TableHead>Situação</TableHead>
              {podeConfirmar ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={l.parcelaId}>
                {podeConfirmar ? (
                  <TableCell>
                    {l.situacao !== "RECEBIDO" ? (
                      <input
                        type="checkbox"
                        className="size-4"
                        aria-label={`Marcar repasse ${l.numero} do pedido ${l.pedidoNumero}`}
                        checked={marcados.has(l.parcelaId)}
                        onChange={() => alternar(l.parcelaId)}
                      />
                    ) : null}
                  </TableCell>
                ) : null}
                <TableCell className="tabular-nums">{formatarData(l.dataPrevista)}</TableCell>
                <TableCell>{l.operadora}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <Link href={`/vendas/pedidos/${l.pedidoNumero}`} className="underline-offset-4 hover:underline">
                    PV-{l.pedidoNumero}
                  </Link>
                  {l.totalRepasses > 1 ? ` · ${l.numero}/${l.totalRepasses}` : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(l.bruto)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(l.taxa)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(l.liquido)}</TableCell>
                <TableCell>
                  <Badge variant={VARIANTE[l.situacao]}>{ROTULO[l.situacao]}</Badge>
                  {l.recebidoEm ? <span className="ml-2 text-xs text-muted-foreground">em {formatarData(l.recebidoEm)}</span> : null}
                </TableCell>
                {podeConfirmar ? (
                  <TableCell className="text-right">{l.situacao === "RECEBIDO" ? <Desfazer parcelaId={l.parcelaId} /> : null}</TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {linhas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum repasse com estes filtros.</p> : null}
    </div>
  );
}
```

- [ ] **Step 3: Página** `page.tsx`:

```tsx
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar, requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import { listarRepasses, type FiltroRepasses } from "@/server/services/repasseCartao";
import { hojeDeCalendario, paraDataIso } from "@/lib/producao/periodo";
import { BarraDeFiltros } from "../../producao/_shared/barra-de-filtros";
import { RepassesLista } from "./repasses-lista";

type Parametros = { operadora?: string; inicio?: string; fim?: string; situacao?: string };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const SITUACOES = ["PENDENTES", "A_RECEBER", "ATRASADO", "RECEBIDO"] as const;

export default async function RepassesCartaoPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:baixar");
  const podeConfirmar = sessao.podeAlterarFilial && podeExecutar(sessao.perfil, "titulo:baixar");

  const sp = await searchParams;
  const situacao = SITUACOES.find((s) => s === sp.situacao) ?? "PENDENTES";
  const filtro: FiltroRepasses = {
    operadoraId: sp.operadora || undefined,
    inicio: sp.inicio && ISO.test(sp.inicio) ? new Date(`${sp.inicio}T00:00:00.000Z`) : undefined,
    fim: sp.fim && ISO.test(sp.fim) ? new Date(`${sp.fim}T00:00:00.000Z`) : undefined,
    situacao,
  };
  const hoje = hojeDeCalendario();
  const [repasses, operadoras] = await Promise.all([
    listarRepasses(sessao.filialId, filtro, hoje),
    prisma.operadoraCartao.findMany({ where: { filialId: sessao.filialId }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Repasses de cartão</h1>
        <p className="text-sm text-muted-foreground">
          Marque os repasses que caíram na conta e confirme. Depois concilie o depósito em grupo na Conciliação.
        </p>
      </div>
      <BarraDeFiltros
        valores={{ operadora: sp.operadora ?? "", inicio: sp.inicio ?? "", fim: sp.fim ?? "", situacao }}
        campos={[
          { tipo: "select", campo: "operadora", rotulo: "Operadora", rotuloTodos: "Todas", opcoes: operadoras.map((o) => ({ valor: o.id, rotulo: o.nome })) },
          { tipo: "data", campo: "inicio", rotulo: "Previsto de" },
          { tipo: "data", campo: "fim", rotulo: "Até" },
          {
            tipo: "select",
            campo: "situacao",
            rotulo: "Situação",
            rotuloTodos: "A receber e atrasados",
            opcoes: [
              { valor: "A_RECEBER", rotulo: "A receber" },
              { valor: "ATRASADO", rotulo: "Atrasados" },
              { valor: "RECEBIDO", rotulo: "Recebidos" },
            ],
          },
        ]}
      />
      <RepassesLista
        hoje={paraDataIso(hoje)}
        podeConfirmar={podeConfirmar}
        linhas={repasses.map((r) => ({
          ...r,
          dataPrevista: paraDataIso(r.dataPrevista),
          recebidoEm: r.recebidoEm ? paraDataIso(r.recebidoEm) : null,
        }))}
      />
    </div>
  );
}
```

Conferir o tipo `CampoFiltro` em `barra-de-filtros.tsx` (nomes `rotuloTodos`/`opcoes`; o "todos" do select manda valor vazio, que vira `PENDENTES` aqui).

- [ ] **Step 4: Menu** — em `nav-items.ts`, Financeiro, depois de "Aprovações pendentes":
`{ href: "/financeiro/repasses-cartao", label: "Repasses de cartão", acao: "titulo:baixar" },`
Rodar `nav-items.test.ts` e ajustar listas esperadas se houver.

- [ ] **Step 5: Verificar** — `npx tsc --noEmit`, `npx eslint src/app`, `npx vitest run "src/app/(dashboard)/nav-items.test.ts"`.

- [ ] **Step 6: Commit** — `git add src; git commit -m "feat(cartao): tela de repasses de cartão"`.

---

### Task 10: Documentação

**Files:**
- Modify: `docs/modulos/producao-estoque-vendas/08-duvidas-decisoes.md`, `docs/modulos/producao-estoque-vendas/03-regras-de-negocio.md`, `content/ajuda/passo-a-passo.md`, `docs/backlog.md`, `docs/superpowers/specs/2026-11-19-recebimento-cartao-design.md` (status)

- [ ] **Step 1: Doc 08** — três linhas novas no fim da tabela, no mesmo formato da D-36 (colunas: nº, tema, dúvida, sugestão, origem, decisão):

```markdown
| D-37 | Venda no cartão | A venda no cartão era baixada na hora pelo valor cheio; a operadora paga depois e desconta a taxa. | Receita bruta, taxa como despesa, repasses previstos. | Backlog | **Venda na maquininha** gera título a receber com um repasse por parcela (bruto, na data prevista) e título a pagar da taxa (mesmas datas); nada é baixado na venda; o recebimento é confirmado em Repasses de cartão e conciliado em grupo com o depósito líquido (2026-11-19). |
| D-38 | Em nome de quem fica o repasse | Depois da venda, quem deve é a operadora. | Operadora. | — | Título a receber **em nome da operadora** (cliente com o CNPJ dela, criado pelo cadastro); taxa em nome do fornecedor com o mesmo CNPJ; relatórios de venda seguem o cliente do pedido (2026-11-19). |
| D-39 | Aprovação da confirmação | Baixa comum passa pela aprovação (e pela segregação). | Efetivar direto. | — | **Confirmação de repasse efetiva direto**: valores vêm do pedido e do cadastro, o dinheiro entra, e o erro aparece na conciliação; mesmo critério da baixa automática à vista (2026-11-19). |
```

- [ ] **Step 2: Doc 03** — depois da RN-34, no mesmo estilo:

```markdown
**RN-35 — Venda na maquininha.** Forma "Maquininha (cartão ou Pix)" com operadora, modalidade (débito, crédito à vista, crédito parcelado 2–12x, Pix na maquininha) e parcelas. A condição da operadora define taxa e prazo (dias corridos). Repasses: um só (débito, crédito à vista, Pix, parcelado antecipado) ou um por parcela de 30 em 30 dias; bruto dividido igual e taxa total arredondada na mesma proporção, sobras de centavos na última. A venda cria o título a receber em nome da operadora e o título da taxa (sem taxa, sem título), sem baixa; a taxa usada fica congelada no pedido. A confirmação em Repasses de cartão baixa bruto e taxa na conta da operadora; pode ser desfeita enquanto não conciliada. Os títulos não aceitam baixa manual. Pedido com repasse confirmado só é cancelado depois de desfazer a confirmação.
```

- [ ] **Step 3: Ajuda** — em `content/ajuda/passo-a-passo.md`:
  - nova `### 3.3. Repasses de cartão` depois de "3.2. Aprovações pendentes", renumerando as seções seguintes de 3 (Tesouraria vira 3.4 etc.) e o índice, se houver; texto: o que é a lista, como marcar, conferir o líquido com o extrato, confirmar com a data do depósito, conciliar em grupo na Conciliação, desfazer (só antes de conciliar).
  - em "6.1. Novo pedido": parágrafo sobre a forma "Maquininha (cartão ou Pix)" — operadora, modalidade, parcelas, prévia dos repasses; Pix direto na conta continua sendo "Pix".
  - em "6.2": cancelamento com repasse confirmado exige desfazer antes.
  - nova `### 7.7. Operadoras de cartão`: campos, CNPJ cria cliente e fornecedor, condições (taxa, prazo em dias corridos, faixas do parcelado, antecipado).
  - Conferir se algum teste lê a numeração da ajuda: `npx vitest run src/lib` e procurar `passo-a-passo` em testes (`Grep`).

- [ ] **Step 4: Backlog** — em `docs/backlog.md`, apagar o item "Recebimento por cartão..." (e a seção "Financeiro — controles e conciliação" se ficar vazia).

- [ ] **Step 5: Spec** — trocar `Status: desenho aprovado` por `Status: implementada (2026-11-19)`.

- [ ] **Step 6: Commit** — `git add docs content; git commit -m "docs(cartao): decisões D-37 a D-39, RN-35, ajuda e backlog"`.

---

### Task 11: Verificação final e navegador

- [ ] **Step 1:** `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` → tudo verde (anotar o total de testes).
- [ ] **Step 2:** `npm run build` → ok.
- [ ] **Step 3: Navegador** (`npm run dev`; login admin@nx-control-erp.local / TrocarSenha123!, Empresa Demonstração, Matriz):
  1. Cadastros → Operadoras de cartão: criar "Stone teste" com débito, crédito à vista e parcelado 2–6x (sem antecipação), conta corrente e uma categoria de despesa.
  2. Vendas → Novo pedido: maquininha, crédito 3x; conferir a prévia; salvar; conferir o detalhe (repasses, "Aguardando repasse").
  3. Contas a receber (em nome da Stone) e Contas a pagar (taxa); tentar baixar manualmente → mensagem.
  4. Fluxo de caixa projetado: entradas e saídas nas datas dos repasses.
  5. Financeiro → Repasses de cartão: marcar o 1º repasse, conferir o líquido, confirmar.
  6. Conciliação: se a conta tiver extrato de teste, conciliar em grupo; senão, conferir os dois lançamentos na Tesouraria.
  7. Desfazer o repasse; cancelar o pedido.
  8. Console sem erros.
- [ ] **Step 4: Limpeza** — apagar do banco de dev a operadora, cliente/fornecedor criados, o pedido e os títulos de teste (SQL via `docker exec -i nx-control-erp-db psql -U postgres -d nx_control_erp`), apagar `.playwright-mcp/`, parar o servidor e liberar a porta 3000.
- [ ] **Step 5:** commit de qualquer ajuste; reportar ao usuário (decisões, pendências, o que foi conferido).
