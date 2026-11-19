# Comparação entre safras sem corte de data — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** na comparação entre safras, o realizado e o projetado de cada safra passam a somar tudo o que está marcado com ela, sem corte pelas datas da safra.

**Architecture:** em `fluxoDeCaixaPorDimensao.ts`, a consulta e a agregação do realizado e do projetado viram funções internas que recebem um filtro Prisma. As funções por período passam a usá-las com o filtro de data, e duas funções novas usam o filtro "marcado com uma destas safras". `listarComparativoSafras` faz as duas consultas uma vez, para todas as safras.

**Tech Stack:** TypeScript, Prisma, Next.js (server component), Vitest (integração usa o Postgres de dev).

**Spec:** `docs/superpowers/specs/2026-11-19-comparacao-safras-sem-corte-de-data-design.md`

## Global Constraints

- Realizado = lançamentos bancários `conciliado: true`, em conta `ativo: true`, da filial, marcados com a safra; a safra do lançamento vale primeiro, e só sem ela vale a do título da baixa (`direto ?? viaBaixa`).
- Projetado = parcelas com status `EM_ABERTO`, `A_VENCER`, `VENCIDO` ou `PARCIALMENTE_PAGO`, de título da filial marcado com a safra, com o saldo de `saldoRemanescenteParcela`.
- Nenhum corte por `dataInicio`/`dataFim` nesses valores. O relatório mensal por dimensão continua com corte por mês, sem mudança de comportamento.
- O filtro de classificação (Fiscal/Gerencial) continua filtrando realizado e projetado; o orçado não muda.
- Sem coluna nova na tela.
- Textos de interface e docs em português.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Rodar Vitest pelo PowerShell: `Set-Location D:\Projetos\nx-control-erp; npx vitest run <arquivos>` (pelo Git Bash falha com "reading 'config'"). Se o Prisma Client reclamar, `npx prisma generate`.
- Nunca rodar Prettier em arquivo existente. Formatar à mão, linhas até ~120 colunas. Os arquivos podem ser CRLF: editar com a ferramenta Edit.

## Arquivos

- Modificar: `src/server/services/fluxoDeCaixaPorDimensao.ts` (funções internas e buscas por safras)
- Modificar: `src/server/services/fluxoDeCaixaPorDimensao.test.ts`
- Modificar: `src/server/services/orcamentoSafra.ts` (`listarComparativoSafras`)
- Modificar: `src/server/services/orcamentoSafra.test.ts`
- Modificar: `src/app/(dashboard)/controladoria/comparacao-safras/page.tsx` (texto)
- Modificar (docs): `content/ajuda/passo-a-passo.md`, `docs/fases/fase-5-controladoria.md`, `docs/backlog.md`, `docs/superpowers/specs/2026-09-11-comparacao-safras-design.md`, `docs/superpowers/specs/2026-11-19-comparacao-safras-sem-corte-de-data-design.md`

---

### Task 1: Buscas por safras sem corte de data

**Files:**
- Modify: `src/server/services/fluxoDeCaixaPorDimensao.ts:1-140`
- Test: `src/server/services/fluxoDeCaixaPorDimensao.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function buscarRealizadoPorSafras(
    filialId: string,
    safraIds: string[],
    classificacao?: FiltroClassificacao,
  ): Promise<Map<string | null, { entradas: number; saidas: number }>>;
  export async function buscarProjetadoPorSafras(
    filialId: string,
    safraIds: string[],
    classificacao?: FiltroClassificacao,
  ): Promise<Map<string | null, { entradas: number; saidas: number }>>;
  ```
  O mapa é chaveado por `safraId`. Com `safraIds` vazio, devolve um mapa vazio sem consultar o banco. `buscarRealizadoPorDimensaoNoPeriodo` e `buscarProjetadoPorDimensaoNoPeriodo` mantêm assinatura e comportamento.

- [ ] **Step 1: Testes que falham**

Em `fluxoDeCaixaPorDimensao.test.ts`, acrescentar ao import de `./fluxoDeCaixaPorDimensao` (linhas 6–13) os nomes `buscarRealizadoPorSafras` e `buscarProjetadoPorSafras`:

```ts
import {
  buscarRealizadoPorDimensao,
  buscarProjetadoPorDimensao,
  buscarRealizadoPorDimensaoNoPeriodo,
  buscarProjetadoPorDimensaoNoPeriodo,
  buscarRealizadoPorSafras,
  buscarProjetadoPorSafras,
  listarValoresDimensao,
  listarFluxoDeCaixaPorDimensao,
} from "./fluxoDeCaixaPorDimensao";
```

Dentro do `describe("fluxoDeCaixaPorDimensao", ...)`, logo antes do `describe("listarValoresDimensao", ...)`, acrescentar:

```ts
  describe("buscarRealizadoPorSafras / buscarProjetadoPorSafras (sem corte de data)", () => {
    // Cada teste cria a própria safra, com período mar–jun/2026, para não somar com os outros.
    async function criarSafra(nome: string) {
      const safra = await prisma.safra.create({
        data: {
          filialId: fixture.filialId,
          nome: `${nome} ${Date.now()}`,
          dataInicio: new Date("2026-03-01T00:00:00Z"),
          dataFim: new Date("2026-06-30T00:00:00Z"),
        },
      });
      return safra.id;
    }

    function lancamento(safraId: string | null, data: string, tipo: "ENTRADA" | "SAIDA", valor: number, conciliado = true) {
      return prisma.lancamentoBancario.create({
        data: {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date(data),
          tipo,
          valor,
          descricao: "Lançamento de safra",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado,
          safraId,
        },
      });
    }

    function tituloDaSafra(safraId: string, tipo: "PAGAR" | "RECEBER", parcelas: { dataVencimento: Date; valorOriginal: number }[]) {
      return criarTitulo(fixture.sessao, tipo, {
        contraparteId: tipo === "PAGAR" ? fixture.fornecedorId : fixture.clienteId,
        documento: `FCD-SAFRA-${Date.now()}-${Math.random()}`,
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        centroCustoId: "",
        centroLucroId: "",
        safraId,
        projetoId: "",
        contaBancariaId: fixture.contaBancariaId,
        formaPagamento: "",
        parcelas: parcelas.map((p, i) => ({ numero: i + 1, ...p })),
      });
    }

    test("realizado soma lançamentos da safra antes do início e depois do fim; ignora outra safra e não conciliado", async () => {
      const safraId = await criarSafra("Sem corte");
      const outraSafraId = await criarSafra("Outra");
      await lancamento(safraId, "2025-12-10T00:00:00Z", "SAIDA", 100);
      await lancamento(safraId, "2026-09-10T00:00:00Z", "ENTRADA", 250);
      await lancamento(safraId, "2026-04-01T00:00:00Z", "SAIDA", 777, false);
      await lancamento(outraSafraId, "2026-04-01T00:00:00Z", "SAIDA", 999);

      const totais = await buscarRealizadoPorSafras(fixture.filialId, [safraId]);
      expect(totais.get(safraId)).toEqual({ entradas: 250, saidas: 100 });
      expect(totais.has(outraSafraId)).toBe(false);
    });

    test("realizado usa o título da baixa quando o lançamento não tem safra, fora do período", async () => {
      const safraId = await criarSafra("Fallback");
      const titulo = await tituloDaSafra(safraId, "PAGAR", [
        { dataVencimento: new Date("2027-02-01T00:00:00Z"), valorOriginal: 400 },
      ]);
      const baixa = await registrarBaixa(fixture.sessao, titulo.parcelas[0].id, {
        data: new Date("2027-02-05T00:00:00Z"),
        valorPago: 400,
        valorJuros: 0,
        valorMulta: 0,
        valorDesconto: 0,
        contaBancariaId: fixture.contaBancariaId,
      });
      await aprovarBaixa(fixture.sessaoAdmin, baixa.id);
      // Simula dado histórico: sem a safra direta no lançamento, só o vínculo via baixa.
      await prisma.lancamentoBancario.updateMany({
        where: { baixaId: baixa.id },
        data: { safraId: null, conciliado: true },
      });

      const totais = await buscarRealizadoPorSafras(fixture.filialId, [safraId]);
      expect(totais.get(safraId)?.saidas).toBe(400);
    });

    test("projetado soma parcelas em aberto vencidas antes do início e vencendo depois do fim; ignora paga", async () => {
      const safraId = await criarSafra("Projetado");
      const titulo = await tituloDaSafra(safraId, "PAGAR", [
        { dataVencimento: new Date("2027-08-01T00:00:00Z"), valorOriginal: 300 },
        { dataVencimento: new Date("2025-01-10T00:00:00Z"), valorOriginal: 200 },
        { dataVencimento: new Date("2026-04-10T00:00:00Z"), valorOriginal: 50 },
      ]);
      const paga = titulo.parcelas.find((p) => Number(p.valorOriginal) === 50)!;
      const baixa = await registrarBaixa(fixture.sessao, paga.id, {
        data: new Date("2026-04-10T00:00:00Z"),
        valorPago: 50,
        valorJuros: 0,
        valorMulta: 0,
        valorDesconto: 0,
        contaBancariaId: fixture.contaBancariaId,
      });
      await aprovarBaixa(fixture.sessaoAdmin, baixa.id);

      const totais = await buscarProjetadoPorSafras(fixture.filialId, [safraId]);
      expect(totais.get(safraId)).toEqual({ entradas: 0, saidas: 500 });
    });

    test("lista de safras vazia devolve mapa vazio", async () => {
      expect((await buscarRealizadoPorSafras(fixture.filialId, [])).size).toBe(0);
      expect((await buscarProjetadoPorSafras(fixture.filialId, [])).size).toBe(0);
    });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run (PowerShell): `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/fluxoDeCaixaPorDimensao.test.ts`
Expected: FAIL nos 4 testes novos (`buscarRealizadoPorSafras is not a function`).

- [ ] **Step 3: Implementar**

Em `fluxoDeCaixaPorDimensao.ts`, acrescentar depois da linha 1:

```ts
import type { Prisma } from "@prisma/client";
```

Substituir `buscarRealizadoPorDimensaoNoPeriodo` inteira (linhas 47–84) por:

```ts
/**
 * Consulta e agregação do realizado por dimensão — campo direto primeiro,
 * fallback via baixa->parcela->titulo; sem os dois, chave `null`. `filtro`
 * restringe o que entra (período, safras) além do recorte fixo: filial,
 * conciliado, conta ativa e classificação.
 */
async function somarRealizadoPorDimensao(
  filialId: string,
  tipoDimensao: TipoDimensao,
  filtro: Prisma.LancamentoBancarioWhereInput,
  classificacao?: FiltroClassificacao,
): Promise<Map<string | null, TotaisPorDimensao>> {
  const campo = CAMPO_POR_DIMENSAO[tipoDimensao];

  const lancamentos = await prisma.lancamentoBancario.findMany({
    where: {
      AND: [
        { filialId, conciliado: true, contaBancaria: { ativo: true }, ...whereLancamentoPorClassificacao(classificacao) },
        filtro,
      ],
    },
    include: {
      baixa: {
        include: {
          parcela: {
            include: { titulo: { select: { centroCustoId: true, centroLucroId: true, safraId: true, projetoId: true } } },
          },
        },
      },
    },
  });

  const totais = new Map<string | null, TotaisPorDimensao>();
  for (const lancamento of lancamentos) {
    const direto = lancamento[campo];
    const viaBaixa = lancamento.baixa?.parcela.titulo[campo] ?? null;
    const dimensaoId = direto ?? viaBaixa;

    somar(totais, dimensaoId, lancamento.tipo === "ENTRADA" ? "entradas" : "saidas", Number(lancamento.valor));
  }
  return totais;
}

export function buscarRealizadoPorDimensaoNoPeriodo(
  filialId: string,
  tipoDimensao: TipoDimensao,
  inicio: Date,
  fim: Date,
  classificacao?: FiltroClassificacao,
): Promise<Map<string | null, TotaisPorDimensao>> {
  return somarRealizadoPorDimensao(filialId, tipoDimensao, { data: { gte: inicio, lte: fim } }, classificacao);
}

/**
 * Realizado de cada safra pela marcação, sem corte de data (comparação entre
 * safras). Mesmo critério de `direto ?? viaBaixa`: o lançamento com safra
 * própria vale por ela; sem safra própria, vale a do título da baixa.
 */
export async function buscarRealizadoPorSafras(
  filialId: string,
  safraIds: string[],
  classificacao?: FiltroClassificacao,
): Promise<Map<string | null, TotaisPorDimensao>> {
  if (safraIds.length === 0) return new Map();
  return somarRealizadoPorDimensao(
    filialId,
    "SAFRA",
    {
      OR: [
        { safraId: { in: safraIds } },
        { safraId: null, baixa: { parcela: { titulo: { safraId: { in: safraIds } } } } },
      ],
    },
    classificacao,
  );
}
```

Substituir `buscarProjetadoPorDimensaoNoPeriodo` inteira (a que começa em `export async function buscarProjetadoPorDimensaoNoPeriodo(` e termina no `return totais;` + `}` antes do comentário "Projetado por dimensão — sempre via `Titulo`") por:

```ts
/**
 * Consulta e agregação do projetado por dimensão — parcelas em aberto, pelo
 * saldo remanescente, na dimensão do título. `filtro` restringe o que entra
 * (período, safras) além do recorte fixo: filial, classificação e status.
 */
async function somarProjetadoPorDimensao(
  filialId: string,
  tipoDimensao: TipoDimensao,
  filtro: Prisma.ParcelaWhereInput,
  classificacao?: FiltroClassificacao,
): Promise<Map<string | null, TotaisPorDimensao>> {
  const campo = CAMPO_POR_DIMENSAO[tipoDimensao];

  const parcelas = await prisma.parcela.findMany({
    where: {
      AND: [
        {
          titulo: { filialId, ...whereTituloPorClassificacao(classificacao) },
          status: { in: ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"] },
        },
        filtro,
      ],
    },
    include: {
      titulo: { select: { tipo: true, centroCustoId: true, centroLucroId: true, safraId: true, projetoId: true } },
      baixas: { where: { statusAprovacao: "APROVADO" } },
    },
  });

  const totais = new Map<string | null, TotaisPorDimensao>();
  for (const parcela of parcelas) {
    const saldo = saldoRemanescenteParcela(
      Number(parcela.valorAtualizado),
      parcela.baixas.map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
    );
    const dimensaoId = parcela.titulo[campo];
    somar(totais, dimensaoId, parcela.titulo.tipo === "RECEBER" ? "entradas" : "saidas", saldo);
  }
  return totais;
}

export function buscarProjetadoPorDimensaoNoPeriodo(
  filialId: string,
  tipoDimensao: TipoDimensao,
  inicio: Date,
  fim: Date,
  classificacao?: FiltroClassificacao,
): Promise<Map<string | null, TotaisPorDimensao>> {
  return somarProjetadoPorDimensao(filialId, tipoDimensao, { dataVencimento: { gte: inicio, lte: fim } }, classificacao);
}

/** Projetado de cada safra pela marcação do título, sem corte de vencimento (comparação entre safras). */
export async function buscarProjetadoPorSafras(
  filialId: string,
  safraIds: string[],
  classificacao?: FiltroClassificacao,
): Promise<Map<string | null, TotaisPorDimensao>> {
  if (safraIds.length === 0) return new Map();
  return somarProjetadoPorDimensao(filialId, "SAFRA", { titulo: { safraId: { in: safraIds } } }, classificacao);
}
```

Atualizar o comentário de `buscarRealizadoPorDimensao`: trocar "a lógica de query vive só em `buscarRealizadoPorDimensaoNoPeriodo`." por "a lógica de query vive só em `somarRealizadoPorDimensao`."

- [ ] **Step 4: Rodar e ver passar**

Run (PowerShell): `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/fluxoDeCaixaPorDimensao.test.ts src/server/services/classificacaoRelatorios.test.ts src/server/services/orcamentoSafra.test.ts`
Expected: PASS (os testes antigos do período e da classificação provam que a refatoração não mudou comportamento).

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/fluxoDeCaixaPorDimensao.ts src/server/services/fluxoDeCaixaPorDimensao.test.ts
git commit -m "feat(controladoria): buscas de realizado e projetado por safra sem corte de data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Comparação entre safras usa as buscas sem corte

**Files:**
- Modify: `src/server/services/orcamentoSafra.ts:5,83-123`
- Modify: `src/app/(dashboard)/controladoria/comparacao-safras/page.tsx:31-36`
- Test: `src/server/services/orcamentoSafra.test.ts` (describe `listarComparativoSafras (integração)`)

**Interfaces:**
- Consumes: `buscarRealizadoPorSafras(filialId, safraIds, classificacao?)` e `buscarProjetadoPorSafras(filialId, safraIds, classificacao?)` da Task 1.
- Produces: `listarComparativoSafras` com a mesma assinatura e o mesmo `LinhaComparativoSafra[]`, na mesma ordem (`dataInicio desc`).

- [ ] **Step 1: Teste que falha**

Em `orcamentoSafra.test.ts`, dentro do `describe("listarComparativoSafras (integração)", ...)`, logo depois do primeiro teste (o que termina com `expect(linha?.projetado).toBeLessThanOrEqual(-800);`), acrescentar:

```ts
  test("realizado e projetado incluem o que está marcado com a safra fora do período dela", async () => {
    const safra = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra com pré-safra",
        status: "EM_ANDAMENTO",
        dataInicio: new Date("2026-09-01T00:00:00Z"),
        dataFim: new Date("2027-03-31T00:00:00Z"),
      },
    });

    await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-07-20T00:00:00Z"),
        tipo: "SAIDA",
        valor: 600,
        descricao: "Insumo de pré-safra",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
        safraId: safra.id,
      },
    });

    await criarTitulo(fixture.sessao, "RECEBER", {
      contraparteId: fixture.clienteId,
      documento: `ORCSAF3-POS-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: safra.id,
      projetoId: "",
      contaBancariaId: fixture.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date("2027-06-30T00:00:00Z"), valorOriginal: 900 }],
    });

    const linha = (await listarComparativoSafras(fixture.sessao)).find((l) => l.safraId === safra.id);
    expect(linha?.realizado).toBe(-600);
    expect(linha?.projetado).toBe(900);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run (PowerShell): `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/orcamentoSafra.test.ts`
Expected: FAIL no teste novo (`realizado` vem `0` e `projetado` vem `0`).

- [ ] **Step 3: Implementar**

Em `orcamentoSafra.ts`, trocar o import da linha 5 por:

```ts
import { buscarRealizadoPorSafras, buscarProjetadoPorSafras } from "./fluxoDeCaixaPorDimensao";
```

Substituir `listarComparativoSafras` inteira (linhas 83–123) por:

```ts
/**
 * Realizado e projetado de cada safra somam tudo o que está marcado com ela,
 * em qualquer data: as datas da safra não cortam os valores (compras de
 * pré-safra e vendas pós-colheita entram). Uma consulta de cada para todas
 * as safras.
 */
export async function listarComparativoSafras(
  sessao: SessaoAtiva,
  // Filtra só realizado e projetado; o orçado da safra é um só.
  opcoes: { classificacao?: FiltroClassificacao } = {},
): Promise<LinhaComparativoSafra[]> {
  requirePermission(sessao.perfil, "orcamento:ler");

  // Todos os status entram (PLANEJADO, EM_ANDAMENTO, ENCERRADO), sem
  // limite de quantidade. `ativo: true` segue o mesmo convention de
  // `listarValoresDimensao` (2a) — uma safra desativada não aparece como
  // item comparável nesta tela de gestão.
  const safras = await prisma.safra.findMany({
    where: { filialId: sessao.filialId, ativo: true },
    orderBy: { dataInicio: "desc" },
  });
  const safraIds = safras.map((safra) => safra.id);

  const [orcamentos, realizadoPorSafra, projetadoPorSafra] = await Promise.all([
    prisma.orcamentoSafra.findMany({ where: { filialId: sessao.filialId } }),
    buscarRealizadoPorSafras(sessao.filialId, safraIds, opcoes.classificacao),
    buscarProjetadoPorSafras(sessao.filialId, safraIds, opcoes.classificacao),
  ]);

  return safras.map((safra) => {
    const orcamento = orcamentos.find((o) => o.safraId === safra.id);
    const r = realizadoPorSafra.get(safra.id) ?? { entradas: 0, saidas: 0 };
    const p = projetadoPorSafra.get(safra.id) ?? { entradas: 0, saidas: 0 };
    return montarLinhaComparativoSafra(
      safra.id,
      safra.nome,
      safra.status,
      orcamento ? Number(orcamento.valor) : 0,
      r.entradas - r.saidas,
      p.entradas - p.saidas,
    );
  });
}
```

Atualizar o comentário de `montarLinhaComparativoSafra` (linhas 20–25): trocar "do período da safra" por "de tudo o que está marcado com a safra".

Em `comparacao-safras/page.tsx`, trocar o parágrafo das linhas 31–36 por:

```tsx
        <p className="text-sm text-muted-foreground">
          Orçado, realizado e projetado por safra. Realizado e projetado somam
          tudo o que está marcado com a safra, em qualquer data (inclusive
          compras de pré-safra e vendas depois da colheita). Realizado usa
          apenas movimentações já conciliadas; projetado usa títulos em
          aberto.
        </p>
```

- [ ] **Step 4: Rodar e ver passar**

Run (PowerShell): `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/orcamentoSafra.test.ts src/server/services/classificacaoRelatorios.test.ts src/server/services/fluxoDeCaixaPorDimensao.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit` e `npx eslint src/server/services/orcamentoSafra.ts "src/app/(dashboard)/controladoria/comparacao-safras"`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/orcamentoSafra.ts src/server/services/orcamentoSafra.test.ts "src/app/(dashboard)/controladoria/comparacao-safras/page.tsx"
git commit -m "fix(controladoria): comparação entre safras soma o que está marcado com a safra em qualquer data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Docs, ajuda e backlog

**Files:**
- Modify: `content/ajuda/passo-a-passo.md` (seção 4.3)
- Modify: `docs/fases/fase-5-controladoria.md` (seção "Comparação entre safras — implementado")
- Modify: `docs/superpowers/specs/2026-09-11-comparacao-safras-design.md` (topo)
- Modify: `docs/superpowers/specs/2026-11-19-comparacao-safras-sem-corte-de-data-design.md` (status)
- Modify: `docs/backlog.md`

- [ ] **Step 1: Ajuda**

Na seção 4.3 de `content/ajuda/passo-a-passo.md`, depois do parágrafo que começa "Permite orçar um valor único por safra", acrescentar um parágrafo novo (linha em branco antes):

```markdown
Realizado e projetado somam tudo o que está marcado com a safra, em qualquer data: uma compra de pré-safra ou uma venda recebida depois da colheita entram na safra em que foram marcadas, não no período em que aconteceram. O realizado considera só movimentações conciliadas; o projetado, os títulos em aberto (inclusive os atrasados).
```

- [ ] **Step 2: Fase 5**

Em `docs/fases/fase-5-controladoria.md`, na seção "Comparação entre safras — implementado":
- No item que começa "Realizado/projetado por safra reaproveitam a mesma lógica", trocar o trecho "— chamada com o período próprio de cada safra." por "— hoje pelas buscas por safras sem corte de data (`buscarRealizadoPorSafras`/`buscarProjetadoPorSafras`, 2026-11-19): conta tudo o que está marcado com a safra, em qualquer data." (mantendo a quebra de linha do arquivo, até ~76 colunas).
- Substituir o item que começa "Duas decisões conscientes registradas em `docs/backlog.md`" por:

```markdown
- Decisão consciente registrada em `docs/backlog.md`: o orçado é sempre
  ≥0 enquanto realizado/projetado têm sinal. A outra (o realizado ignorava
  lançamento marcado com a safra mas datado fora do período oficial) foi
  revista em 2026-11-19.
```

- [ ] **Step 3: Spec de 2026-09-11 e status da spec nova**

Em `docs/superpowers/specs/2026-09-11-comparacao-safras-design.md`, inserir depois da linha 1 (o título) uma linha em branco e:

```markdown
> **Revisto em 2026-11-19:** realizado e projetado deixaram de ser cortados pelo período da safra e somam tudo o que está marcado com ela — ver [spec](2026-11-19-comparacao-safras-sem-corte-de-data-design.md).
```

Em `2026-11-19-comparacao-safras-sem-corte-de-data-design.md`, trocar `Status: aprovada para implementação` por `Status: implementada (2026-11-19)`.

- [ ] **Step 4: Backlog**

Em `docs/backlog.md`, na seção `## Comparação entre safras (Fase 5, sub-projeto 2b)`, apagar o item inteiro que começa "**Realizado/projetado por safra ignora lançamentos marcados fora da janela `dataInicio`/`dataFim`.**" (até a linha em branco antes do item do sinal do orçado). O item do sinal do orçado e o título da seção ficam.

- [ ] **Step 5: Suíte inteira**

Run (PowerShell): `Set-Location D:\Projetos\nx-control-erp; npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add content/ajuda/passo-a-passo.md docs/fases/fase-5-controladoria.md docs/backlog.md docs/superpowers/specs/2026-09-11-comparacao-safras-design.md docs/superpowers/specs/2026-11-19-comparacao-safras-sem-corte-de-data-design.md
git commit -m "docs(controladoria): ajuda, fase 5 e backlog da comparação entre safras sem corte de data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
