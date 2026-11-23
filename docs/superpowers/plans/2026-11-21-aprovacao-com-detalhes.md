# Aprovações pendentes com os dados da baixa — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a tela Aprovações pendentes mostra data, conta, parcela, valor da parcela e ajustes de cada baixa, com avisos de data fora do normal, valor diferente do saldo e baixa em dobro; a ajuda da tela acompanha.

**Architecture:** a regra dos avisos é uma função pura em `src/lib/financeiro/avisosDaBaixa.ts`. `listarBaixasPendentes` passa a trazer o banco da conta, a contagem de parcelas do título e as baixas da parcela. A página monta a linha empilhada; dois componentes de apresentação (`AvisosDaBaixa`, `DetalheDoValor`) são usados pela página e pela réplica da ajuda.

**Tech Stack:** Next.js (App Router, Server Components), Prisma, Vitest, Tailwind, lucide-react.

**Spec:** [docs/superpowers/specs/2026-11-21-aprovacao-com-detalhes-design.md](../specs/2026-11-21-aprovacao-com-detalhes-design.md)

## Global Constraints

- Sem migration, sem mudança de permissão; o botão Aprovar não é bloqueado por aviso.
- Limite da data antiga: mais de **30** dias entre a data da baixa e o dia do registro (30 não avisa, 31 avisa).
- Hoje e dia do registro são dias de Brasília (`hojeDeCalendario` de `src/lib/producao/periodo.ts`).
- Saldo em aberto = `valorAtualizado` − soma do `valorPago` das baixas **APROVADO**; esperado = saldo + juros + multa − desconto; comparação em centavos.
- Textos dos avisos, exatamente: "Data da baixa no futuro"; "Data da baixa N dias antes do registro"; "A parcela já está paga"; "Pagamento parcial: faltam R$ X" / "Recebimento parcial: faltam R$ X"; "Acima do saldo em R$ X"; "Há outra baixa pendente nesta parcela".
- Rótulos das colunas: Título, Baixa, Valor, Registrado por, Ações.
- **Nunca rodar Prettier** (o projeto não usa; formatar à mão, linhas até ~120). Arquivos têm CRLF ou LF: editar com a ferramenta Edit.
- Vitest pelo PowerShell: `Set-Location D:\Projetos\nx-control-erp; npx vitest run <arquivo>`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Textos para o usuário em português claro, sem jargão; a ajuda espelha a tela (comentário de espelho no topo dos dois arquivos).

---

### Task 1: Regra dos avisos e formatação de data e hora

**Files:**
- Create: `src/lib/financeiro/avisosDaBaixa.ts`
- Create: `src/lib/financeiro/avisosDaBaixa.test.ts`
- Modify: `src/lib/formatacao.ts` (acrescentar `formatarDataHora`)
- Modify: `src/lib/formatacao.test.ts`

**Interfaces:**
- Produces:
  - `formatarDataHora(instante: Date): string` → `"15/10/2026 10:20"` (Brasília).
  - `type TipoAvisoBaixa = "DATA_FUTURA" | "DATA_ANTIGA" | "PARCELA_PAGA" | "PARCIAL" | "ACIMA_DO_SALDO" | "OUTRA_PENDENTE"`
  - `type AvisoBaixa = { tipo: TipoAvisoBaixa; texto: string }`
  - `type DadosAvisoBaixa = { tipoTitulo: "PAGAR" | "RECEBER"; data: Date; criadoEm: Date; valorPago: number; valorJuros: number; valorMulta: number; valorDesconto: number; valorParcela: number; totalAprovado: number; outrasPendentes: number; hoje: Date }`
  - `avisosDaBaixa(dados: DadosAvisoBaixa): AvisoBaixa[]`
  - `resumirBaixasDaParcela(baixaId: string, baixas: readonly { id: string; valorPago: number; statusAprovacao: string }[]): { totalAprovado: number; outrasPendentes: number }`
  - `DIAS_LIMITE_DATA_ANTIGA = 30`

- [ ] **Step 1: Teste de `formatarDataHora`** — em `src/lib/formatacao.test.ts`, trocar o import para `import { formatarData, formatarDataHora, formatarMoeda } from "./formatacao";` e acrescentar no fim:

```ts
describe("formatarDataHora", () => {
  it("mostra o instante no horário de Brasília", () => {
    expect(formatarDataHora(new Date("2026-10-15T13:20:00.000Z"))).toBe("15/10/2026 10:20");
  });

  it("perto da meia-noite UTC ainda é o dia anterior em Brasília", () => {
    expect(formatarDataHora(new Date("2026-10-16T02:30:00.000Z"))).toBe("15/10/2026 23:30");
  });
});
```

- [ ] **Step 2: Testes de `avisosDaBaixa`** — criar `src/lib/financeiro/avisosDaBaixa.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { avisosDaBaixa, resumirBaixasDaParcela, type DadosAvisoBaixa } from "./avisosDaBaixa";

// Intl usa espaço não separável entre "R$" e o número.
const semNbsp = (texto: string) => texto.replace(/ /g, " ");

const dia = (aaaammdd: string) => new Date(`${aaaammdd}T00:00:00.000Z`);

/** Pagamento de R$ 1.000,00 em dia, registrado no mesmo dia às 10:20 de Brasília: nenhum aviso. */
const BASE: DadosAvisoBaixa = {
  tipoTitulo: "PAGAR",
  data: dia("2026-10-15"),
  criadoEm: new Date("2026-10-15T13:20:00.000Z"),
  valorPago: 1000,
  valorJuros: 0,
  valorMulta: 0,
  valorDesconto: 0,
  valorParcela: 1000,
  totalAprovado: 0,
  outrasPendentes: 0,
  hoje: dia("2026-10-16"),
};

const textos = (dados: Partial<DadosAvisoBaixa>) => avisosDaBaixa({ ...BASE, ...dados }).map((a) => semNbsp(a.texto));
const tipos = (dados: Partial<DadosAvisoBaixa>) => avisosDaBaixa({ ...BASE, ...dados }).map((a) => a.tipo);

describe("avisosDaBaixa", () => {
  it("baixa certinha não tem aviso", () => {
    expect(avisosDaBaixa(BASE)).toEqual([]);
  });

  describe("data", () => {
    it("data de hoje não é futuro", () => {
      expect(tipos({ data: dia("2026-10-16"), criadoEm: new Date("2026-10-16T13:00:00.000Z") })).toEqual([]);
    });

    it("data depois de hoje avisa", () => {
      expect(textos({ data: dia("2026-10-17"), criadoEm: new Date("2026-10-16T13:00:00.000Z") })).toEqual([
        "Data da baixa no futuro",
      ]);
    });

    it("30 dias antes do registro não avisa; 31 avisa com o número de dias", () => {
      expect(tipos({ data: dia("2026-09-15") })).toEqual([]);
      expect(textos({ data: dia("2026-09-14") })).toEqual(["Data da baixa 31 dias antes do registro"]);
    });

    it("o dia do registro é o de Brasília (23:30 de 15/10 em Brasília é 02:30 de 16/10 UTC)", () => {
      // Pelo dia UTC seriam 31 dias; pelo de Brasília, 30.
      expect(tipos({ data: dia("2026-09-15"), criadoEm: new Date("2026-10-16T02:30:00.000Z") })).toEqual([]);
    });

    it("o exemplo da lacuna: 16/01 digitado em vez de 16/10", () => {
      expect(textos({ data: dia("2026-01-16"), criadoEm: new Date("2026-10-16T14:30:00.000Z") })).toEqual([
        "Data da baixa 273 dias antes do registro",
      ]);
    });
  });

  describe("valor", () => {
    it("juros e multa entram no esperado", () => {
      expect(tipos({ valorPago: 1015, valorJuros: 12, valorMulta: 3 })).toEqual([]);
    });

    it("desconto sai do esperado", () => {
      expect(tipos({ valorPago: 950, valorDesconto: 50 })).toEqual([]);
    });

    it("pagamento parcial diz quanto falta", () => {
      expect(textos({ valorPago: 600 })).toEqual(["Pagamento parcial: faltam R$ 400,00"]);
    });

    it("no recebimento o parcial diz Recebimento", () => {
      expect(textos({ tipoTitulo: "RECEBER", valorPago: 600 })).toEqual(["Recebimento parcial: faltam R$ 400,00"]);
    });

    it("acima do saldo diz a diferença", () => {
      expect(textos({ valorPago: 1012 })).toEqual(["Acima do saldo em R$ 12,00"]);
    });

    it("parcela com baixa parcial aprovada: o esperado é o que falta", () => {
      expect(tipos({ totalAprovado: 400, valorPago: 600 })).toEqual([]);
      expect(textos({ totalAprovado: 400, valorPago: 1000 })).toEqual(["Acima do saldo em R$ 400,00"]);
    });

    it("parcela já quitada mostra só 'já está paga', sem 'acima do saldo'", () => {
      expect(textos({ totalAprovado: 1000, valorPago: 1000 })).toEqual(["A parcela já está paga"]);
    });

    it("compara em centavos (0,1 + 0,2 não vira diferença)", () => {
      expect(tipos({ valorParcela: 0.3, valorPago: 0.1 + 0.2 })).toEqual([]);
    });
  });

  it("avisa outra baixa pendente na mesma parcela", () => {
    expect(textos({ outrasPendentes: 1 })).toEqual(["Há outra baixa pendente nesta parcela"]);
  });

  it("junta vários avisos na ordem: data, valor, pendente", () => {
    expect(tipos({ data: dia("2026-10-20"), valorPago: 500, outrasPendentes: 1 })).toEqual([
      "DATA_FUTURA",
      "PARCIAL",
      "OUTRA_PENDENTE",
    ]);
  });
});

describe("resumirBaixasDaParcela", () => {
  it("soma as aprovadas e conta as outras pendentes, sem contar a própria nem as rejeitadas", () => {
    const baixas = [
      { id: "esta", valorPago: 200, statusAprovacao: "PENDENTE" },
      { id: "a1", valorPago: 100.1, statusAprovacao: "APROVADO" },
      { id: "a2", valorPago: 0.2, statusAprovacao: "APROVADO" },
      { id: "p2", valorPago: 200, statusAprovacao: "PENDENTE" },
      { id: "r1", valorPago: 999, statusAprovacao: "REJEITADO" },
    ];
    expect(resumirBaixasDaParcela("esta", baixas)).toEqual({ totalAprovado: 100.3, outrasPendentes: 1 });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/lib/formatacao.test.ts src/lib/financeiro/avisosDaBaixa.test.ts`
Expected: FAIL (`formatarDataHora` não exportado; módulo `./avisosDaBaixa` não existe).

- [ ] **Step 4: Implementar `formatarDataHora`** — em `src/lib/formatacao.ts`, depois de `formatarData`:

```ts
const DATA_BRASILIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const HORA_BRASILIA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/** Formata um instante (criadoEm, avaliadoEm) como "dd/mm/aaaa hh:mm" no horário de Brasília. */
export function formatarDataHora(instante: Date): string {
  return `${DATA_BRASILIA.format(instante)} ${HORA_BRASILIA.format(instante)}`;
}
```

- [ ] **Step 5: Implementar `src/lib/financeiro/avisosDaBaixa.ts`**

```ts
import { formatarMoeda } from "@/lib/formatacao";
import { hojeDeCalendario } from "@/lib/producao/periodo";

/** Mais que isto, em dias, entre a data da baixa e o dia do registro vira aviso (provável erro de digitação). */
export const DIAS_LIMITE_DATA_ANTIGA = 30;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

export type TipoAvisoBaixa =
  | "DATA_FUTURA"
  | "DATA_ANTIGA"
  | "PARCELA_PAGA"
  | "PARCIAL"
  | "ACIMA_DO_SALDO"
  | "OUTRA_PENDENTE";

export type AvisoBaixa = { tipo: TipoAvisoBaixa; texto: string };

export type DadosAvisoBaixa = {
  tipoTitulo: "PAGAR" | "RECEBER";
  /** Data da baixa (data de calendário, meia-noite UTC). */
  data: Date;
  /** Instante em que a baixa foi registrada. */
  criadoEm: Date;
  /** Total que saiu ou entrou na conta, já com juros e multa. */
  valorPago: number;
  valorJuros: number;
  valorMulta: number;
  valorDesconto: number;
  /** `valorAtualizado` da parcela. */
  valorParcela: number;
  /** Soma do valor pago das baixas aprovadas da parcela. */
  totalAprovado: number;
  /** Outras baixas pendentes na mesma parcela, sem contar esta. */
  outrasPendentes: number;
  /** Hoje como data de calendário (`hojeDeCalendario()`). */
  hoje: Date;
};

const centavos = (valor: number) => Math.round(valor * 100);

/**
 * O que merece atenção de quem aprova a baixa. Só informa: a aprovação não é bloqueada.
 * Ordem: data, valor, outra baixa pendente.
 */
export function avisosDaBaixa(dados: DadosAvisoBaixa): AvisoBaixa[] {
  const avisos: AvisoBaixa[] = [];

  if (dados.data.getTime() > dados.hoje.getTime()) {
    avisos.push({ tipo: "DATA_FUTURA", texto: "Data da baixa no futuro" });
  }
  const diasAntes = Math.round((hojeDeCalendario(dados.criadoEm).getTime() - dados.data.getTime()) / UM_DIA_MS);
  if (diasAntes > DIAS_LIMITE_DATA_ANTIGA) {
    avisos.push({ tipo: "DATA_ANTIGA", texto: `Data da baixa ${diasAntes} dias antes do registro` });
  }

  const saldo = centavos(dados.valorParcela) - centavos(dados.totalAprovado);
  const esperado = saldo + centavos(dados.valorJuros) + centavos(dados.valorMulta) - centavos(dados.valorDesconto);
  const pago = centavos(dados.valorPago);
  if (saldo <= 0) {
    avisos.push({ tipo: "PARCELA_PAGA", texto: "A parcela já está paga" });
  } else if (pago < esperado) {
    const sentido = dados.tipoTitulo === "PAGAR" ? "Pagamento" : "Recebimento";
    avisos.push({ tipo: "PARCIAL", texto: `${sentido} parcial: faltam ${formatarMoeda((esperado - pago) / 100)}` });
  } else if (pago > esperado) {
    avisos.push({ tipo: "ACIMA_DO_SALDO", texto: `Acima do saldo em ${formatarMoeda((pago - esperado) / 100)}` });
  }

  if (dados.outrasPendentes > 0) {
    avisos.push({ tipo: "OUTRA_PENDENTE", texto: "Há outra baixa pendente nesta parcela" });
  }
  return avisos;
}

/** A partir de todas as baixas da parcela: soma das aprovadas e quantas outras esperam aprovação. */
export function resumirBaixasDaParcela(
  baixaId: string,
  baixas: readonly { id: string; valorPago: number; statusAprovacao: string }[],
): { totalAprovado: number; outrasPendentes: number } {
  const aprovadas = baixas.filter((b) => b.statusAprovacao === "APROVADO");
  return {
    totalAprovado: aprovadas.reduce((soma, b) => soma + centavos(b.valorPago), 0) / 100,
    outrasPendentes: baixas.filter((b) => b.statusAprovacao === "PENDENTE" && b.id !== baixaId).length,
  };
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/lib/formatacao.test.ts src/lib/financeiro/avisosDaBaixa.test.ts`
Expected: PASS. Se o teste de 273 dias ou o de 31 dias falhar por 1, conferir que `data` e `hoje` estão em meia-noite UTC e que o arredondamento é `Math.round`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/financeiro src/lib/formatacao.ts src/lib/formatacao.test.ts
git commit -m "feat(aprovacoes): regra dos avisos da baixa e data e hora de Brasília

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `listarBaixasPendentes` traz o que a linha precisa

**Files:**
- Modify: `src/server/services/baixa.ts:63-73`
- Test: `src/server/services/baixa.test.ts` (acrescentar teste depois do `listarBaixasPendentes só retorna baixas PENDENTE da filial`)

**Interfaces:**
- Consumes: `resumirBaixasDaParcela` (Task 1).
- Produces: cada item de `listarBaixasPendentes(filialId)` passa a ter `contaBancaria.banco`, `parcela.titulo._count.parcelas` e `parcela.baixas: { id, valorPago, statusAprovacao }[]` (todas as baixas da parcela). O resto do formato não muda.

- [ ] **Step 1: Teste** — em `baixa.test.ts`, acrescentar ao import: `import { resumirBaixasDaParcela } from "@/lib/financeiro/avisosDaBaixa";` e o teste:

```ts
  test("listarBaixasPendentes traz banco da conta, total de parcelas e as baixas da parcela", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 300);
    const dados = {
      data: new Date(),
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    };
    const aprovada = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, { ...dados, valorPago: 100 });
    await aprovarBaixa(fixtureTesouraria.sessao, aprovada.id);
    const primeira = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, { ...dados, valorPago: 200 });
    await registrarBaixa(fixtureTesouraria.sessao, parcela.id, { ...dados, valorPago: 200 });

    const pendentes = await listarBaixasPendentes(fixtureTesouraria.filialId);
    const linha = pendentes.find((b) => b.id === primeira.id);

    expect(linha).toBeDefined();
    expect(linha!.contaBancaria.banco.nome).not.toBe("");
    expect(linha!.parcela.titulo._count.parcelas).toBe(1);
    expect(
      resumirBaixasDaParcela(
        linha!.id,
        linha!.parcela.baixas.map((b) => ({ id: b.id, valorPago: Number(b.valorPago), statusAprovacao: b.statusAprovacao })),
      ),
    ).toEqual({ totalAprovado: 100, outrasPendentes: 1 });
    expect(pendentes.some((b) => b.id === aprovada.id)).toBe(false);
    expect(pendentes.every((b) => b.parcela.titulo.filialId === fixtureTesouraria.filialId)).toBe(true);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/baixa.test.ts`
Expected: FAIL (erro de tipo/undefined em `banco`, `_count` ou `baixas`).

- [ ] **Step 3: Implementar** — em `src/server/services/baixa.ts`, trocar o corpo de `listarBaixasPendentes` por:

```ts
export async function listarBaixasPendentes(filialId: string) {
  return prisma.baixa.findMany({
    where: { statusAprovacao: "PENDENTE", parcela: { titulo: { filialId } } },
    include: {
      parcela: {
        include: {
          titulo: { include: { fornecedor: true, cliente: true, _count: { select: { parcelas: true } } } },
          // Todas as baixas da parcela: a tela soma as aprovadas (saldo) e conta as outras pendentes (em dobro).
          baixas: { select: { id: true, valorPago: true, statusAprovacao: true } },
        },
      },
      contaBancaria: { include: { banco: true } },
      usuario: true,
    },
    orderBy: { criadoEm: "asc" },
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/baixa.test.ts`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/baixa.ts src/server/services/baixa.test.ts
git commit -m "feat(aprovacoes): baixas pendentes com conta, parcelas do título e baixas da parcela

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: A tela com a linha empilhada e os avisos

**Files:**
- Create: `src/app/(dashboard)/financeiro/aprovacoes/partes-da-linha.tsx`
- Modify: `src/app/(dashboard)/financeiro/aprovacoes/page.tsx` (reescrever a tabela)

**Interfaces:**
- Consumes: `avisosDaBaixa`, `resumirBaixasDaParcela`, `AvisoBaixa` (Task 1); `formatarDataHora` (Task 1); `listarBaixasPendentes` com os campos novos (Task 2).
- Produces (usados pela réplica da ajuda na Task 4):
  - `AvisosDaBaixa({ avisos }: { avisos: readonly AvisoBaixa[] })` — lista com `TriangleAlert`; não renderiza nada sem aviso.
  - `DetalheDoValor({ valorParcela, valorJuros, valorMulta, valorDesconto }: { valorParcela: number; valorJuros: number; valorMulta: number; valorDesconto: number })` — "parcela R$ …" e só os ajustes ≠ 0.

- [ ] **Step 1: Criar `partes-da-linha.tsx`** (sem `"use client"`: não tem estado, serve ao Server Component e à réplica client):

```tsx
// Usado na tela e na réplica da ajuda (src/ajuda/aprovacoes/cenas.tsx).

import { TriangleAlert } from "lucide-react";
import type { AvisoBaixa } from "@/lib/financeiro/avisosDaBaixa";
import { formatarMoeda } from "@/lib/formatacao";

/** Os avisos da baixa, um por linha. Só informam: não bloqueiam a aprovação. */
export function AvisosDaBaixa({ avisos }: { avisos: readonly AvisoBaixa[] }) {
  if (avisos.length === 0) return null;
  return (
    <ul className="mt-1 max-w-60 space-y-0.5 whitespace-normal">
      {avisos.map((aviso) => (
        <li key={aviso.tipo} className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-500">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {aviso.texto}
        </li>
      ))}
    </ul>
  );
}

/** Embaixo do valor pago: o valor da parcela e só os ajustes diferentes de zero. */
export function DetalheDoValor({
  valorParcela,
  valorJuros,
  valorMulta,
  valorDesconto,
}: {
  valorParcela: number;
  valorJuros: number;
  valorMulta: number;
  valorDesconto: number;
}) {
  const ajustes = [
    valorJuros > 0 ? `+ juros ${formatarMoeda(valorJuros)}` : null,
    valorMulta > 0 ? `+ multa ${formatarMoeda(valorMulta)}` : null,
    valorDesconto > 0 ? `− desconto ${formatarMoeda(valorDesconto)}` : null,
  ].filter((ajuste) => ajuste !== null);
  return (
    <div className="text-xs text-muted-foreground">
      <p>parcela {formatarMoeda(valorParcela)}</p>
      {ajustes.map((ajuste) => (
        <p key={ajuste}>{ajuste}</p>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Reescrever a tabela de `page.tsx`** — o arquivo inteiro fica:

```tsx
// Espelhado na ajuda (src/ajuda/aprovacoes/cenas.tsx): mudou rótulo, coluna ou botão? Ajuste a ajuda junto.

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { exigeAprovacaoPorOutro, listarBaixasPendentes } from "@/server/services/baixa";
import { aprovarBaixaAction } from "./actions";
import { RejeitarBaixaForm } from "./rejeitar-baixa-form";
import { AvisosDaBaixa, DetalheDoValor } from "./partes-da-linha";
import { avisosDaBaixa, resumirBaixasDaParcela } from "@/lib/financeiro/avisosDaBaixa";
import { nomeDaContaBancaria } from "@/lib/contaBancaria";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatacao";
import { hojeDeCalendario } from "@/lib/producao/periodo";
import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";

export default async function AprovacoesPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:aprovar");

  const [pendentes, exigeOutraPessoa] = await Promise.all([
    listarBaixasPendentes(sessao.filialId),
    exigeAprovacaoPorOutro(sessao.empresaId),
  ]);
  const hoje = hojeDeCalendario();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-semibold">Aprovações pendentes</h1>
          <BotaoAjuda tela="aprovacoes" />
        </div>
        <p className="text-sm text-muted-foreground">Baixas registradas aguardando aprovação de tesouraria.</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Título</TableHead>
            <TableHead>Baixa</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Registrado por</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pendentes.map((baixa) => {
            const titulo = baixa.parcela.titulo;
            const contraparte = titulo.fornecedor ?? titulo.cliente;
            const lista = titulo.tipo === "PAGAR" ? "contas-a-pagar" : "contas-a-receber";
            const bloqueada = exigeOutraPessoa && baixa.usuarioId === sessao.usuarioId;
            const valores = {
              valorPago: Number(baixa.valorPago),
              valorJuros: Number(baixa.valorJuros),
              valorMulta: Number(baixa.valorMulta),
              valorDesconto: Number(baixa.valorDesconto),
            };
            const valorParcela = Number(baixa.parcela.valorAtualizado);
            const avisos = avisosDaBaixa({
              tipoTitulo: titulo.tipo,
              data: baixa.data,
              criadoEm: baixa.criadoEm,
              ...valores,
              valorParcela,
              ...resumirBaixasDaParcela(
                baixa.id,
                baixa.parcela.baixas.map((b) => ({
                  id: b.id,
                  valorPago: Number(b.valorPago),
                  statusAprovacao: b.statusAprovacao,
                })),
              ),
              hoje,
            });
            return (
              <TableRow key={baixa.id} className="align-top">
                <TableCell>
                  <p className="font-medium">{titulo.documento}</p>
                  {contraparte ? (
                    <Link
                      href={`/financeiro/${lista}?contraparte=${contraparte.id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {contraparte.nome}
                    </Link>
                  ) : (
                    <p>—</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {titulo.tipo === "PAGAR" ? "Pagamento" : "Recebimento"} · parcela {baixa.parcela.numero}/
                    {titulo._count.parcelas}
                  </p>
                  <AvisosDaBaixa avisos={avisos} />
                </TableCell>
                <TableCell>
                  <p>{formatarData(baixa.data)}</p>
                  <p className="text-xs text-muted-foreground">{nomeDaContaBancaria(baixa.contaBancaria)}</p>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{formatarMoeda(valores.valorPago)}</p>
                  <DetalheDoValor
                    valorParcela={valorParcela}
                    valorJuros={valores.valorJuros}
                    valorMulta={valores.valorMulta}
                    valorDesconto={valores.valorDesconto}
                  />
                </TableCell>
                <TableCell>
                  {baixa.usuario.nome}
                  <p className="text-xs text-muted-foreground">{formatarDataHora(baixa.criadoEm)}</p>
                  {bloqueada && (
                    <p className="max-w-48 whitespace-normal text-xs text-muted-foreground">
                      Registrada por você: outra pessoa precisa aprovar
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <form action={aprovarBaixaAction}>
                      <input type="hidden" name="baixaId" value={baixa.id} />
                      <Button type="submit" size="sm" disabled={bloqueada}>
                        Aprovar
                      </Button>
                    </form>
                    <RejeitarBaixaForm baixaId={baixa.id} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {pendentes.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Nenhuma baixa pendente.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

Nota: a célula de Ações virou `div` dentro da célula porque `align-top` na linha não combina com `TableCell className="flex"`.

- [ ] **Step 3: Typecheck e lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep -v "^\.next/"` (Bash) — Expected: nenhuma linha.
Run: `npx eslint "src/app/(dashboard)/financeiro/aprovacoes" src/lib/financeiro` — Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/financeiro/aprovacoes"
git commit -m "feat(aprovacoes): linha da baixa com data, conta, parcela, ajustes e avisos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ajuda da tela (exemplo, réplica, roteiros, teste)

**Files:**
- Modify: `src/ajuda/aprovacoes/exemplo.ts` (reescrever)
- Modify: `src/ajuda/aprovacoes/alvos.ts` (reescrever)
- Modify: `src/ajuda/aprovacoes/cenas.tsx` (reescrever a tabela)
- Modify: `src/ajuda/aprovacoes/roteiros.ts`
- Modify: `src/ajuda/aprovacoes/roteiros.test.ts`

**Interfaces:**
- Consumes: `avisosDaBaixa`, `DadosAvisoBaixa` (Task 1); `formatarData`, `formatarDataHora`, `formatarMoeda`; `nomeDaContaBancaria`; `AvisosDaBaixa`, `DetalheDoValor` de `@/app/(dashboard)/financeiro/aprovacoes/partes-da-linha` (Task 3).
- Produces: `HOJE`, `VOCE`, `BAIXAS`, `avisosDoExemplo(baixa)`, `MOTIVO_REJEICAO` em `exemplo.ts`.

História do exemplo (hoje = 16/10/2026, quem lê a ajuda é o Carlos Lima, da Tesouraria). Ordem = ordem da tela (`criadoEm` asc):

| linha | baixa | registro | aviso esperado |
|---|---|---|---|
| l1 | NF-e 1234 · Agro Insumos Ltda · Pagamento · parcela 1/3 · 15/10/2026 · BB · R$ 1.012,00 (parcela 1.000 + juros 12) | Maria Souza, 15/10/2026 10:20 | nenhum |
| l2 | Recibo 88 · José da Silva · Pagamento · parcela 1/1 · 15/10/2026 · BB · R$ 1.200,00 (parcela 1.200, já aprovada 1.200) | Maria Souza, 15/10/2026 14:05 | "A parcela já está paga" |
| l3 | NF-e 321 · Fazenda Santa Luzia · Recebimento · parcela 1/3 · 15/10/2026 · BB · R$ 15.060,00 (parcela 15.000 + juros 60) | Carlos Lima (você), 15/10/2026 16:45 | nenhum |
| l4 | Fatura 556 · Energia Rural S.A. · Pagamento · parcela 1/1 · **16/01/2026** (era 16/10) · BB · R$ 845,30 | Maria Souza, 16/10/2026 11:30 | "Data da baixa 273 dias antes do registro" |

- [ ] **Step 1: Teste da réplica** — em `roteiros.test.ts`, trocar os dois primeiros testes por:

```ts
  test("são os 4 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["aprovar-baixa", "entender-avisos", "rejeitar-baixa", "aprovar-bloqueado"]);
  });

  test("a réplica tem as colunas da tela real e só a baixa do próprio usuário bloqueada", () => {
    const html = renderToStaticMarkup(createElement(cenas.lista, { valores: {} }));
    for (const coluna of ["Título", "Baixa", "Valor", "Registrado por", "Ações"]) {
      expect(html).toContain(coluna);
    }
    expect(html.match(/Registrada por você: outra pessoa precisa aprovar/g)).toHaveLength(1);
  });

  test("a réplica mostra os avisos da regra real: só o Recibo 88 e a Fatura 556 têm aviso", () => {
    const html = renderToStaticMarkup(createElement(cenas.lista, { valores: {} }));
    expect(html.match(/A parcela já está paga/g)).toHaveLength(1);
    expect(html.match(/Data da baixa 273 dias antes do registro/g)).toHaveLength(1);
    expect(BAIXAS.map((b) => avisosDoExemplo(b).length)).toEqual([0, 1, 0, 1]);
  });

  test("a réplica mostra data, conta, parcela, ajustes e o registro", () => {
    const html = renderToStaticMarkup(createElement(cenas.lista, { valores: {} }));
    for (const trecho of [
      "Pagamento · parcela 1/3",
      "Recebimento · parcela 1/3",
      "15/10/2026",
      "16/01/2026",
      "Banco do Brasil - Ag 1234/CC 12345-6",
      "+ juros",
      "15/10/2026 10:20",
    ]) {
      expect(html).toContain(trecho);
    }
  });
```

e acrescentar ao import: `import { BAIXAS, avisosDoExemplo } from "./exemplo";`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/ajuda/aprovacoes`
Expected: FAIL (`avisosDoExemplo` não existe; colunas antigas).

- [ ] **Step 3: Reescrever `exemplo.ts`**

```ts
import { avisosDaBaixa, type DadosAvisoBaixa } from "@/lib/financeiro/avisosDaBaixa";
import { nomeDaContaBancaria } from "@/lib/contaBancaria";

/**
 * As baixas que esperam aprovação no exemplo. Dados fictícios e fixos, da mesma história de Contas a pagar e
 * Contas a receber. Quem lê a ajuda é o Carlos Lima, da Tesouraria, em 16/10/2026: a terceira baixa foi
 * registrada por ele mesmo. Os avisos saem da regra real (`avisosDaBaixa`), não são escritos à mão.
 */
export const VOCE = "Carlos Lima";

export const HOJE = new Date("2026-10-16T00:00:00.000Z");

const CONTA_BB = nomeDaContaBancaria({ agencia: "1234", conta: "12345-6", banco: { nome: "Banco do Brasil" } });

export type BaixaDoExemplo = Omit<DadosAvisoBaixa, "hoje"> & {
  documento: string;
  contraparte: string;
  parcela: number;
  totalParcelas: number;
  conta: string;
  registradoPor: string;
};

const SEM_AJUSTE = { valorJuros: 0, valorMulta: 0, valorDesconto: 0 };

export const BAIXAS: readonly BaixaDoExemplo[] = [
  // A baixa do roteiro de Contas a pagar: parcela 1 do adubo, paga com R$ 12,00 de juros.
  {
    documento: "NF-e 1234",
    contraparte: "Agro Insumos Ltda",
    tipoTitulo: "PAGAR",
    parcela: 1,
    totalParcelas: 3,
    data: new Date("2026-10-15T00:00:00.000Z"),
    conta: CONTA_BB,
    valorPago: 1012,
    ...SEM_AJUSTE,
    valorJuros: 12,
    valorParcela: 1000,
    totalAprovado: 0,
    outrasPendentes: 0,
    registradoPor: "Maria Souza",
    criadoEm: new Date("2026-10-15T13:20:00.000Z"),
  },
  // Baixa em dobro: a parcela já tinha sido paga e aprovada em 05/10.
  {
    documento: "Recibo 88",
    contraparte: "José da Silva",
    tipoTitulo: "PAGAR",
    parcela: 1,
    totalParcelas: 1,
    data: new Date("2026-10-15T00:00:00.000Z"),
    conta: CONTA_BB,
    valorPago: 1200,
    ...SEM_AJUSTE,
    valorParcela: 1200,
    totalAprovado: 1200,
    outrasPendentes: 0,
    registradoPor: "Maria Souza",
    criadoEm: new Date("2026-10-15T17:05:00.000Z"),
  },
  // A baixa do roteiro de Contas a receber, registrada por quem está aprovando.
  {
    documento: "NF-e 321",
    contraparte: "Fazenda Santa Luzia",
    tipoTitulo: "RECEBER",
    parcela: 1,
    totalParcelas: 3,
    data: new Date("2026-10-15T00:00:00.000Z"),
    conta: CONTA_BB,
    valorPago: 15060,
    ...SEM_AJUSTE,
    valorJuros: 60,
    valorParcela: 15000,
    totalAprovado: 0,
    outrasPendentes: 0,
    registradoPor: VOCE,
    criadoEm: new Date("2026-10-15T19:45:00.000Z"),
  },
  // Conta de energia paga em 16/10: a Maria digitou janeiro em vez de outubro.
  {
    documento: "Fatura 556",
    contraparte: "Energia Rural S.A.",
    tipoTitulo: "PAGAR",
    parcela: 1,
    totalParcelas: 1,
    data: new Date("2026-01-16T00:00:00.000Z"),
    conta: CONTA_BB,
    valorPago: 845.3,
    ...SEM_AJUSTE,
    valorParcela: 845.3,
    totalAprovado: 0,
    outrasPendentes: 0,
    registradoPor: "Maria Souza",
    criadoEm: new Date("2026-10-16T14:30:00.000Z"),
  },
];

export function avisosDoExemplo(baixa: BaixaDoExemplo) {
  return avisosDaBaixa({ ...baixa, hoje: HOJE });
}

export const MOTIVO_REJEICAO = "Em dobro: parcela já paga em 05/10";
```

- [ ] **Step 4: Reescrever `alvos.ts`**

```ts
/** Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`). */
export const ALVOS = {
  lista: [
    "lista.tabela",
    "lista.l1.documento",
    "lista.l1.baixa",
    "lista.l1.valor",
    "lista.l1.registradoPor",
    "lista.l1.aprovar",
    "lista.l2.avisos",
    "lista.l2.motivo",
    "lista.l2.rejeitar",
    "lista.l3.registradoPor",
    "lista.l3.aprovar",
    "lista.l4.baixa",
    "lista.l4.avisos",
  ],
} as const;
```

- [ ] **Step 5: Reescrever `cenas.tsx`**

```tsx
"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado } from "@/components/ajuda/campos-simulados";
import { AvisosDaBaixa, DetalheDoValor } from "@/app/(dashboard)/financeiro/aprovacoes/partes-da-linha";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatacao";
import type { PropsCena } from "@/ajuda/tipos";
import { BAIXAS, VOCE, avisosDoExemplo } from "./exemplo";

// Espelho de src/app/(dashboard)/financeiro/aprovacoes/*. Mudou um rótulo ou campo lá? Ajuste aqui também.

export function CenaLista({ valores }: PropsCena) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-lg font-semibold">Aprovações pendentes</p>
        <p className="text-sm text-muted-foreground">Baixas registradas aguardando aprovação de tesouraria.</p>
      </div>
      <Alvo nome="lista.tabela">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Baixa</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Registrado por</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {BAIXAS.map((baixa, i) => {
              const l = `lista.l${i + 1}`;
              const bloqueada = baixa.registradoPor === VOCE;
              return (
                <TableRow key={baixa.documento} className="align-top">
                  <TableCell>
                    <Alvo nome={`${l}.documento`} className="inline-block p-1">
                      <p className="font-medium">{baixa.documento}</p>
                      <p className="text-primary">{baixa.contraparte}</p>
                      <p className="text-xs text-muted-foreground">
                        {baixa.tipoTitulo === "PAGAR" ? "Pagamento" : "Recebimento"} · parcela {baixa.parcela}/
                        {baixa.totalParcelas}
                      </p>
                    </Alvo>
                    <Alvo nome={`${l}.avisos`} className="inline-block p-1">
                      <AvisosDaBaixa avisos={avisosDoExemplo(baixa)} />
                    </Alvo>
                  </TableCell>
                  <TableCell>
                    <Alvo nome={`${l}.baixa`} className="inline-block p-1">
                      <p>{formatarData(baixa.data)}</p>
                      <p className="text-xs text-muted-foreground">{baixa.conta}</p>
                    </Alvo>
                  </TableCell>
                  <TableCell>
                    <Alvo nome={`${l}.valor`} className="inline-block p-1">
                      <p className="font-medium">{formatarMoeda(baixa.valorPago)}</p>
                      <DetalheDoValor
                        valorParcela={baixa.valorParcela}
                        valorJuros={baixa.valorJuros}
                        valorMulta={baixa.valorMulta}
                        valorDesconto={baixa.valorDesconto}
                      />
                    </Alvo>
                  </TableCell>
                  <TableCell>
                    <Alvo nome={`${l}.registradoPor`} className="inline-block p-1">
                      {baixa.registradoPor}
                      <p className="text-xs text-muted-foreground">{formatarDataHora(baixa.criadoEm)}</p>
                      {bloqueada && (
                        <p className="max-w-48 whitespace-normal text-xs text-muted-foreground">
                          Registrada por você: outra pessoa precisa aprovar
                        </p>
                      )}
                    </Alvo>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-start justify-end gap-2">
                      <BotaoSimulado alvo={`${l}.aprovar`} size="sm" className={bloqueada ? "opacity-50" : undefined}>
                        Aprovar
                      </BotaoSimulado>
                      <div className="flex gap-2">
                        <CampoSimulado
                          alvo={`${l}.motivo`}
                          valor={valores[`${l}.motivo`]}
                          placeholder="Motivo da rejeição"
                          className="w-40"
                        />
                        <BotaoSimulado alvo={`${l}.rejeitar`} variant="outline" size="sm">
                          Rejeitar
                        </BotaoSimulado>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Alvo>
    </div>
  );
}
```

Atenção: o alvo `lista.lN.avisos` só existe no HTML se o `Alvo` renderizar mesmo sem aviso (ele renderiza a `div`; `AvisosDaBaixa` devolve `null` dentro). Os roteiros só apontam para `l2.avisos` e `l4.avisos`, que têm aviso.

- [ ] **Step 6: Atualizar `roteiros.ts`**

6a. No roteiro `aprovar-baixa`, trocar os passos 2 a 4 (documento, valor, registradoPor) por estes cinco (o passo 1 `lista.tabela` e o último `lista.l1.aprovar` ficam):

```ts
      {
        cena: "lista",
        alvo: "lista.l1.documento",
        instrucao: "Ache a baixa pelo título",
        explicacao:
          "Documento é o do título (a nota, o boleto, o recibo). Embaixo vêm a contraparte (o fornecedor, quando é " +
          "um pagamento, ou o cliente, quando é um recebimento) e qual parcela está sendo baixada. No exemplo, o " +
          "pagamento da parcela 1 de 3 do adubo da Agro Insumos.",
        dica:
          "O nome da contraparte é um link: abre Contas a pagar ou Contas a receber só com os títulos dela, onde " +
          "estão as parcelas e os anexos (a nota, o boleto).",
      },
      {
        cena: "lista",
        alvo: "lista.l1.baixa",
        instrucao: "Confira a data e a conta",
        explicacao:
          "A data é o dia em que o dinheiro saiu ou entrou, e vira a data do lançamento na conta. Embaixo, a conta " +
          "bancária onde ele vai ser lançado. Compare as duas com o comprovante do banco. No exemplo, 15/10/2026, " +
          "no Banco do Brasil.",
      },
      {
        cena: "lista",
        alvo: "lista.l1.valor",
        instrucao: "Confira o valor",
        explicacao:
          "Valor pago é o total que saiu ou entrou na conta, já com juros e multa. Embaixo vêm o valor da parcela e " +
          "os ajustes: no exemplo, parcela de R$ 1.000,00 mais R$ 12,00 de juros dá R$ 1.012,00.",
        dica:
          "Algo não bate com o comprovante? Rejeite com o motivo em vez de aprovar: depois de aprovada, a baixa não " +
          "pode ser desfeita.",
      },
      {
        cena: "lista",
        alvo: "lista.l1.registradoPor",
        instrucao: "Veja quem registrou",
        explicacao:
          "É a pessoa que lançou a baixa, com o dia e a hora do registro. Se a empresa exige aprovação por outra " +
          "pessoa (o padrão), você só aprova baixas registradas por outra pessoa.",
      },
```

6b. Em `aprovar-baixa`, `eDepois.proximoRoteiro: "entender-avisos"`.

6c. Inserir o roteiro novo entre `aprovar-baixa` e `rejeitar-baixa`:

```ts
  roteiro({
    id: "entender-avisos",
    titulo: "Quando a baixa tem um aviso",
    quandoUsar:
      "Quando aparece um triângulo amarelo com um aviso embaixo do título da baixa. O aviso aponta o que costuma " +
      "ser erro de digitação ou baixa em dobro, mas não impede a aprovação: quem decide é você.",
    quemPode: QUEM_APROVA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.l4.avisos",
        instrucao: "Veja o aviso de data",
        explicacao:
          "A Fatura 556 foi registrada em 16/10/2026 com a data 16/01/2026: 273 dias antes. O sistema avisa quando " +
          "a data da baixa fica mais de 30 dias antes do dia do registro, e também quando ela é depois de hoje.",
      },
      {
        cena: "lista",
        alvo: "lista.l4.baixa",
        instrucao: "Compare com o comprovante",
        explicacao:
          "A conta de energia foi paga em 16/10, e a Maria digitou o mês errado. Aprovada assim, a saída entraria " +
          "na conta com data de janeiro, e o Fluxo de caixa e a Conciliação ficariam errados.",
        dica: "Rejeite com o motivo (por exemplo, “Data errada: pago em 16/10”) para a Maria lançar de novo.",
      },
      {
        cena: "lista",
        alvo: "lista.l2.avisos",
        instrucao: "Veja o aviso de valor",
        explicacao:
          "O Recibo 88 já tinha sido pago e aprovado: não sobra nada a pagar, e esta baixa é repetida. Os outros " +
          "avisos de valor comparam o valor pago com o que falta da parcela, mais juros e multa, menos o desconto: " +
          "“Pagamento parcial: faltam R$ …” (ou Recebimento parcial) e “Acima do saldo em R$ …”.",
        dica:
          "Pagamento parcial pode estar certo, quando foi combinado pagar em partes. “Há outra baixa pendente nesta " +
          "parcela” aparece quando a mesma parcela tem duas baixas esperando: confira se não é a mesma lançada duas " +
          "vezes.",
      },
    ],
    eDepois: {
      texto:
        "Se o aviso aponta um erro, rejeite a baixa com o motivo, como no próximo roteiro. Se está tudo certo (um " +
        "pagamento parcial combinado, por exemplo), aprove normalmente.",
      proximoRoteiro: "rejeitar-baixa",
    },
  }),
```

6d. No roteiro `rejeitar-baixa`, trocar a `explicacao` do passo `lista.l2.motivo` por:

```ts
        explicacao:
          "O campo fica ao lado do botão Rejeitar, na mesma linha. O motivo é obrigatório, com pelo menos 3 " +
          "letras. No exemplo, o Recibo 88 tem o aviso “A parcela já está paga”: ela foi paga e aprovada em 05/10, " +
          "e a baixa nova é repetida.",
```

- [ ] **Step 7: Rodar e ver passar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/ajuda`
Expected: PASS (inclui o teste de alvos: cada `alvo` dos passos aparece na cena).

- [ ] **Step 8: Conferir os textos dos roteiros contra o código** (regra da ajuda: texto errado já aconteceu três vezes)
  - "vira a data do lançamento": conferir em `efetivarBaixa` (`src/server/services/baixa.ts`) que o lançamento usa `baixa.data`.
  - "pelo menos 3 letras": conferir o schema do motivo em `rejeitar-baixa-form.tsx`/`actions.ts`.
  - O link da contraparte filtra por `contraparte` em Contas a pagar e Contas a receber (`filtro-titulos-url.ts`).
  Ajustar o texto se algo não bater.

- [ ] **Step 9: Commit**

```bash
git add src/ajuda/aprovacoes
git commit -m "feat(aprovacoes): ajuda com os dados da baixa e o roteiro dos avisos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Verificação completa, conferência no navegador e backlog

**Files:**
- Modify: `docs/backlog.md` (item 2)
- Temporário (não commitar): `scripts/tmp-baixas-aprovacao.ts`

- [ ] **Step 1: Suíte inteira, typecheck e lint**

Run (PowerShell): `Set-Location D:\Projetos\nx-control-erp; npx vitest run` — Expected: todos passam.
Run (Bash): `npx tsc --noEmit -p . 2>&1 | grep -v "^\.next/"` — Expected: vazio.
Run: `npx eslint src` — Expected: sem erro.

- [ ] **Step 2: Montar baixas de teste na Matriz da Empresa Demonstração** — criar `scripts/tmp-baixas-aprovacao.ts`:

```ts
import { prisma } from "@/server/db/client";

const PREFIXO = "TESTE-APROV";

async function main() {
  if (process.argv[2] === "limpar") {
    await prisma.titulo.deleteMany({ where: { documento: { startsWith: PREFIXO } } });
    await prisma.categoriaFinanceira.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    console.log("limpo");
    return;
  }
  const filial = await prisma.filial.findFirstOrThrow({
    where: { nome: "Matriz", empresa: { nomeFantasia: { contains: "Demonstra" } } },
  });
  const fornecedor = await prisma.fornecedor.findFirstOrThrow({ where: { empresaId: filial.empresaId } });
  const conta = await prisma.contaBancaria.findFirstOrThrow({ where: { filialId: filial.id, ativo: true } });
  // Registradas pelo admin: o teste é só de leitura da tela (não aprovar), então o Aprovar desabilitado não atrapalha.
  const usuario = await prisma.usuario.findFirstOrThrow({ where: { email: "admin@nx-control-erp.local" } });
  const categoria = await prisma.categoriaFinanceira.create({
    data: { filialId: filial.id, nome: `${PREFIXO} despesa`, tipo: "DESPESA" },
  });
  const hoje = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const diasAtras = (n: number) => new Date(hoje.getTime() - n * 86400000);

  async function titulo(sufixo: string, parcelas: number[]) {
    return prisma.titulo.create({
      data: {
        filialId: filial.id,
        tipo: "PAGAR",
        fornecedorId: fornecedor.id,
        documento: `${PREFIXO}-${sufixo}`,
        dataEmissao: hoje,
        dataCompetencia: hoje,
        categoriaFinanceiraId: categoria.id,
        parcelas: {
          create: parcelas.map((valor, i) => ({
            numero: i + 1,
            dataVencimento: hoje,
            valorOriginal: valor,
            valorAtualizado: valor,
          })),
        },
      },
      include: { parcelas: true },
    });
  }
  const baixa = (parcelaId: string, dados: { data?: Date; valorPago: number; juros?: number; status?: "PENDENTE" | "APROVADO" }) =>
    prisma.baixa.create({
      data: {
        parcelaId,
        data: dados.data ?? hoje,
        valorPago: dados.valorPago,
        valorJuros: dados.juros ?? 0,
        contaBancariaId: conta.id,
        usuarioId: usuario.id,
        statusAprovacao: dados.status ?? "PENDENTE",
      },
    });

  const limpa = await titulo("LIMPA", [1000, 1000, 1000]);
  await baixa(limpa.parcelas[0].id, { valorPago: 1012, juros: 12 });
  const antiga = await titulo("DATA-ANTIGA", [500]);
  await baixa(antiga.parcelas[0].id, { valorPago: 500, data: diasAtras(273) });
  const futura = await titulo("DATA-FUTURA", [500]);
  await baixa(futura.parcelas[0].id, { valorPago: 500, data: diasAtras(-3) });
  const parcial = await titulo("PARCIAL", [800]);
  await baixa(parcial.parcelas[0].id, { valorPago: 300 });
  const paga = await titulo("JA-PAGA", [1200]);
  await baixa(paga.parcelas[0].id, { valorPago: 1200, status: "APROVADO" });
  await baixa(paga.parcelas[0].id, { valorPago: 1200 });
  const dobro = await titulo("DOBRO", [400]);
  await baixa(dobro.parcelas[0].id, { valorPago: 400 });
  await baixa(dobro.parcelas[0].id, { valorPago: 400 });
  console.log("criado");
}

main().finally(() => prisma.$disconnect());
```

Run (Bash): `node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/tmp-baixas-aprovacao.ts`
Expected: `criado`. Se algum `findFirstOrThrow` falhar, ajustar o filtro olhando o banco (`docker exec -i nx-control-erp-db psql -U postgres -d nx_control_erp`).

- [ ] **Step 3: Conferir no navegador** (servidor `npm run dev` na porta 3000; login `admin@nx-control-erp.local` / `TrocarSenha123!`, Empresa Demonstração, Matriz) em `/financeiro/aprovacoes`:
  - LIMPA sem aviso, "Pagamento · parcela 1/3", "parcela R$ 1.000,00" e "+ juros R$ 12,00";
  - DATA-ANTIGA: "Data da baixa 273 dias antes do registro"; DATA-FUTURA: "Data da baixa no futuro";
  - PARCIAL: "Pagamento parcial: faltam R$ 500,00"; JA-PAGA: "A parcela já está paga";
  - DOBRO: as duas linhas com "Há outra baixa pendente nesta parcela";
  - o link da contraparte abre Contas a pagar filtrada; data e hora do registro em Brasília;
  - largura de celular (375 px): tabela com rolagem lateral, sem quebrar a página;
  - ícone ? → roteiros "Aprovar uma baixa" e "Quando a baixa tem um aviso" percorrem sem alvo sumido;
  - console sem erro (ver armadilhas: "script tag" do `next dev` some após recompilar).

- [ ] **Step 4: Limpar os dados e o script**

Run (Bash): `node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/tmp-baixas-aprovacao.ts limpar && rm scripts/tmp-baixas-aprovacao.ts && rm -rf .playwright-mcp`
Expected: `limpo`; `git status` sem arquivo do script.

- [ ] **Step 5: Backlog** — em `docs/backlog.md`, item `### 2. Aprovação às cegas (prioridade alta)`, acrescentar logo abaixo do título:

```markdown
- **Status:** feito na branch `feat/aprovacao-com-detalhes` (2026-11-21, spec
  `2026-11-21-aprovacao-com-detalhes-design.md`): a linha mostra data, conta,
  parcela n/total, valor da parcela e ajustes, com avisos de data fora do
  normal, valor diferente do saldo e outra baixa pendente; ajuda com o roteiro
  novo `entender-avisos`.
```

- [ ] **Step 6: Commit**

```bash
git add docs/backlog.md
git commit -m "docs(backlog): lacuna 2 (aprovação às cegas) feita

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
