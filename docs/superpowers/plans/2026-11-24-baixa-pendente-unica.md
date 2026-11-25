# Uma baixa pendente por parcela — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** uma parcela aceita no máximo uma baixa PENDENTE e só recebe baixa enquanto está em aberto; a tela mostra a pendente e troca o Baixar por "Baixa aguardando aprovação"; a ajuda acompanha.

**Architecture:** `registrarBaixa` passa a criar a baixa numa transação que trava a parcela (`SELECT … FOR UPDATE`), confere o status e a pendente, e lança erros próprios (`BaixaPendenteError`, `BaixaParcelaFechadaError`) que a API mapeia para 409. O mapeador da tela inclui as pendentes e marca `temBaixaPendente`. A ajuda de títulos ganha o estado "pendente" na réplica; a de Aprovações troca o exemplo do Recibo 88.

**Tech Stack:** Next.js (App Router, server actions), Prisma + PostgreSQL, Vitest, React.

**Spec:** `docs/superpowers/specs/2026-11-24-baixa-pendente-unica-design.md`

## Global Constraints

- Textos exatos:
  - pendente: "Esta parcela já tem uma baixa aguardando aprovação: {valor} de {data}, registrada por {nome}. Peça para aprovarem ou rejeitarem essa baixa antes de registrar outra." (`formatarMoeda`, `formatarData`)
  - fechada: "Esta parcela está {paga|cancelada|renegociada} e não aceita baixa"
  - tela: "Baixa aguardando aprovação" (no lugar do Baixar) e selo "Aguardando aprovação"
- Status que aceitam baixa: `EM_ABERTO`, `A_VENCER`, `VENCIDO`, `PARCIALMENTE_PAGO`.
- API: os dois erros → HTTP 409, corpo `{ erro }`.
- Dentro de transação, leituras sequenciais; nada de `include` com várias relações (backlog, "consultas paralelas na transação").
- Testes de banco rodam com `npx vitest run <arquivo>` (precisam do Postgres local do `.env`). Se o client estiver desatualizado: `npx prisma generate`.
- Commits em português, no padrão `tipo(escopo): descrição`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Arquivos do repo podem estar em CRLF: ao editar com ferramenta de substituição, conferir que o trecho casou.

---

### Task 1: Trava no serviço `registrarBaixa`

**Files:**
- Modify: `src/server/services/baixa.ts` (imports, novas classes/constantes, `registrarBaixa` linhas 88-130)
- Test: `src/server/services/baixa.test.ts`

**Interfaces:**
- Produces: `export class BaixaPendenteError extends Error`, `export class BaixaParcelaFechadaError extends Error` em `src/server/services/baixa.ts`. `registrarBaixa(sessao, parcelaId, dados)` mantém assinatura e retorno (`Baixa`).

- [ ] **Step 1: Ajustar o teste antigo que registra duas pendentes**

Em `baixa.test.ts`, teste "listarBaixasPendentes traz banco da conta, total de parcelas e as baixas da parcela", troque a linha

```ts
    await registrarBaixa(fixtureTesouraria.sessao, parcela.id, { ...dados, valorPago: 200 });
```

por uma pendente gravada direto no banco (simula baixa registrada antes da trava):

```ts
    // Pendente de antes da trava de uma pendente por parcela: gravada direto no banco.
    await prisma.baixa.create({
      data: {
        parcelaId: parcela.id,
        data: dados.data,
        valorPago: 200,
        contaBancariaId: dados.contaBancariaId,
        usuarioId: fixtureTesouraria.usuarioId,
        statusAprovacao: "PENDENTE",
      },
    });
```

- [ ] **Step 2: Escrever os testes novos**

Adicione aos imports de `./baixa`: `BaixaPendenteError, BaixaParcelaFechadaError`. Adicione `import { formatarMoeda } from "@/lib/formatacao";`. No fim do `describe("baixa (fluxo de aprovação)")`, antes do `});` que o fecha, acrescente:

```ts
  describe("uma baixa pendente por parcela", () => {
    const dadosBaixa = (valorPago: number, data = new Date()) => ({
      data,
      valorPago,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    test("recusa a segunda baixa enquanto a primeira está pendente, dizendo qual é", async () => {
      const parcela = await criarParcelaDeTeste(fixtureTesouraria, 1012);
      await registrarBaixa(fixtureTesouraria.sessao, parcela.id, dadosBaixa(1012, new Date("2026-10-14T00:00:00Z")));
      const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: fixtureTesouraria.usuarioId } });

      const tentativa = registrarBaixa(fixtureTesouraria.sessao, parcela.id, dadosBaixa(1012));

      await expect(tentativa).rejects.toThrow(BaixaPendenteError);
      await expect(tentativa).rejects.toThrow(
        `Esta parcela já tem uma baixa aguardando aprovação: ${formatarMoeda(1012)} de 14/10/2026, ` +
          `registrada por ${usuario.nome}. Peça para aprovarem ou rejeitarem essa baixa antes de registrar outra.`,
      );
      expect(await prisma.baixa.count({ where: { parcelaId: parcela.id } })).toBe(1);
    });

    test("depois de aprovar a primeira (parcial), a segunda é registrada", async () => {
      const parcela = await criarParcelaDeTeste(fixtureTesouraria, 1000);
      const primeira = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, dadosBaixa(400));
      await aprovarBaixa(fixtureTesouraria.sessao, primeira.id);

      const segunda = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, dadosBaixa(600));

      expect(segunda.statusAprovacao).toBe("PENDENTE");
    });

    test("depois de rejeitar a primeira, a segunda é registrada", async () => {
      const parcela = await criarParcelaDeTeste(fixtureTesouraria, 700);
      const primeira = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, dadosBaixa(7000));
      await rejeitarBaixa(fixtureTesouraria.sessao, primeira.id, "valor errado");

      const segunda = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, dadosBaixa(700));

      expect(segunda.statusAprovacao).toBe("PENDENTE");
    });

    test("duas baixas ao mesmo tempo: só uma é registrada", async () => {
      const parcela = await criarParcelaDeTeste(fixtureTesouraria, 900);

      const resultados = await Promise.allSettled([
        registrarBaixa(fixtureTesouraria.sessao, parcela.id, dadosBaixa(900)),
        registrarBaixa(fixtureTesouraria.sessao, parcela.id, dadosBaixa(900)),
      ]);

      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const recusa = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(recusa.reason).toBeInstanceOf(BaixaPendenteError);
      expect(await prisma.baixa.count({ where: { parcelaId: parcela.id } })).toBe(1);
    });

    test("parcela paga ou cancelada não aceita baixa", async () => {
      const paga = await criarParcelaDeTeste(fixtureTesouraria, 300);
      const baixa = await registrarBaixa(fixtureTesouraria.sessao, paga.id, dadosBaixa(300));
      await aprovarBaixa(fixtureTesouraria.sessao, baixa.id);
      await expect(registrarBaixa(fixtureTesouraria.sessao, paga.id, dadosBaixa(300))).rejects.toThrow(
        new BaixaParcelaFechadaError("Esta parcela está paga e não aceita baixa"),
      );

      const cancelada = await criarParcelaDeTeste(fixtureTesouraria, 300);
      await cancelarParcela(fixtureTesouraria.sessaoAdmin, cancelada.id);
      await expect(registrarBaixa(fixtureTesouraria.sessao, cancelada.id, dadosBaixa(300))).rejects.toThrow(
        "Esta parcela está cancelada e não aceita baixa",
      );
    });
  });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/server/services/baixa.test.ts`
Expected: FAIL — `BaixaPendenteError`/`BaixaParcelaFechadaError` não existem (import indefinido) e os testes novos falham.

- [ ] **Step 4: Implementar**

Em `src/server/services/baixa.ts`:

1. Imports: troque `import type { Prisma, StatusAprovacaoBaixa } from "@prisma/client";` por
   `import type { Prisma, StatusAprovacaoBaixa, StatusParcela } from "@prisma/client";` e acrescente
   `import { formatarData, formatarMoeda } from "@/lib/formatacao";`.

2. Logo depois de `garantirBaixaPendente`, acrescente:

```ts
/** A parcela já tem baixa esperando aprovação: a segunda só depois de aprovar ou rejeitar a primeira. */
export class BaixaPendenteError extends Error {}

/** Parcela paga, cancelada ou renegociada não recebe baixa. */
export class BaixaParcelaFechadaError extends Error {}

const STATUS_QUE_ACEITAM_BAIXA: readonly StatusParcela[] = ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"];

const ROTULO_PARCELA_FECHADA: Partial<Record<StatusParcela, string>> = {
  PAGO: "paga",
  CANCELADO: "cancelada",
  RENEGOCIADO: "renegociada",
};
```

3. Em `registrarBaixa`, substitua do `const baixa = await prisma.baixa.create({` até o `return baixa;` (inclusive) por:

```ts
  return prisma.$transaction(async (tx) => {
    // Trava a parcela: duas baixas ao mesmo tempo ficam em fila e a segunda vê a primeira.
    await tx.$queryRaw`SELECT id FROM parcelas WHERE id = ${parcelaId} FOR UPDATE`;

    const parcela = await tx.parcela.findUniqueOrThrow({ where: { id: parcelaId }, select: { status: true } });
    if (!STATUS_QUE_ACEITAM_BAIXA.includes(parcela.status)) {
      throw new BaixaParcelaFechadaError(
        `Esta parcela está ${ROTULO_PARCELA_FECHADA[parcela.status] ?? "fechada"} e não aceita baixa`,
      );
    }

    // Leituras em sequência (sem include): ver "consultas paralelas na transação" no backlog.
    const pendente = await tx.baixa.findFirst({
      where: { parcelaId, statusAprovacao: "PENDENTE" },
      select: { valorPago: true, data: true, usuarioId: true },
    });
    if (pendente) {
      const quem = await tx.usuario.findUniqueOrThrow({ where: { id: pendente.usuarioId }, select: { nome: true } });
      throw new BaixaPendenteError(
        `Esta parcela já tem uma baixa aguardando aprovação: ${formatarMoeda(pendente.valorPago)} de ` +
          `${formatarData(pendente.data)}, registrada por ${quem.nome}. ` +
          "Peça para aprovarem ou rejeitarem essa baixa antes de registrar outra.",
      );
    }

    const baixa = await tx.baixa.create({
      data: {
        parcelaId,
        data: dados.data,
        valorPago: dados.valorPago,
        valorJuros: dados.valorJuros,
        valorMulta: dados.valorMulta,
        valorDesconto: dados.valorDesconto,
        contaBancariaId: dados.contaBancariaId,
        usuarioId: sessao.usuarioId,
        statusAprovacao: "PENDENTE",
      },
    });

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Baixa",
        entidadeId: baixa.id,
        acao: "CRIAR",
        anterior: null,
        novo: { parcelaId, valorPago: dados.valorPago, statusAprovacao: "PENDENTE" },
      },
      tx,
    );

    return baixa;
  });
```

(As checagens anteriores — permissão, filial, `buscarParcelaDaFilial`, `garantirForaDaMaquininha`, conta da filial — ficam como estão, antes da transação.)

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/server/services/baixa.test.ts`
Expected: PASS (todos, inclusive os antigos).

- [ ] **Step 6: Rodar as outras suítes que registram baixa**

Run: `npx vitest run src/server/services/contaCaixa.test.ts src/server/services/fluxoDeCaixaPorDimensao.test.ts src/server/services/fluxoDeCaixaProjetado.test.ts src/server/services/orcamento.test.ts src/server/services/pedidoVenda.test.ts src/server/services/repasseCartao.test.ts src/server/services/tituloClassificacao.test.ts`
Expected: PASS. Se algum teste registrar duas pendentes na mesma parcela ou baixa em parcela fechada, ajuste-o como no Step 1 (pendente antiga gravada direto no banco) e anote no relatório.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/baixa.ts src/server/services/baixa.test.ts
git commit -m "fix(financeiro): parcela aceita só uma baixa pendente e só baixa em aberto"
```

---

### Task 2: API responde 409

**Files:**
- Modify: `src/server/api/executarRotaApi.ts` (imports; bloco `catch`, junto do 403)
- Test: `src/app/api/v1/baixas/route.test.ts`

**Interfaces:**
- Consumes: `BaixaPendenteError`, `BaixaParcelaFechadaError` de `@/server/services/baixa` (Task 1).

- [ ] **Step 1: Teste**

No fim do `describe` de `route.test.ts` acrescente (o primeiro teste do arquivo já deixou uma baixa pendente em `parcelaId`):

```ts
  test("parcela com baixa pendente -> 409 com a mensagem", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });
    const request = new Request("http://localhost/api/v1/baixas", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        parcelaId,
        data: "2026-09-30",
        valorPago: 300,
        contaBancariaAgencia: conta.agencia,
        contaBancariaConta: conta.conta,
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(409);
    expect((await resposta.json()).erro).toMatch(/^Esta parcela já tem uma baixa aguardando aprovação/);
  });
```

- [ ] **Step 2: Ver falhar**

Run: `npx vitest run src/app/api/v1/baixas/route.test.ts`
Expected: FAIL — status 500 em vez de 409.

- [ ] **Step 3: Implementar**

Em `executarRotaApi.ts`, acrescente o import
`import { BaixaParcelaFechadaError, BaixaPendenteError } from "@/server/services/baixa";`
e, logo depois do bloco que devolve 403, acrescente:

```ts
    if (erro instanceof BaixaPendenteError || erro instanceof BaixaParcelaFechadaError) {
      return Response.json({ erro: erro.message }, { status: 409 });
    }
```

- [ ] **Step 4: Ver passar**

Run: `npx vitest run src/app/api/v1/baixas/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/executarRotaApi.ts src/app/api/v1/baixas/route.test.ts
git commit -m "fix(api): baixa recusada por pendente ou parcela fechada responde 409"
```

---

### Task 3: Tela mostra a pendente e troca o Baixar

**Files:**
- Modify: `src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.ts`
- Modify: `src/app/(dashboard)/financeiro/_titulos/baixas-da-parcela.tsx`
- Modify: `src/app/(dashboard)/financeiro/_titulos/titulo-table.tsx:292-296`
- Test: `src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.test.ts`

**Interfaces:**
- Produces: `BaixaDaParcela.status: "PENDENTE" | "APROVADO" | "ESTORNADO"`, `BaixaDaParcela.registradaEm: Date`; cada parcela de `titulosParaCliente` ganha `temBaixaPendente: boolean`.

- [ ] **Step 1: Testes do mapeador**

Em `titulos-para-cliente.test.ts`:

1. No teste "converte valorAtualizado…", a parcela esperada passa a ter `temBaixaPendente: false`:

```ts
      {
        id: "p1",
        numero: 1,
        dataVencimento: vencimento,
        valorAtualizado: 150.25,
        status: "ABERTA",
        baixas: [],
        temBaixaPendente: false,
      },
```

2. Substitua o teste "leva só as baixas aprovadas e estornadas, convertidas" por:

```ts
  it("leva as baixas pendentes, aprovadas e estornadas, convertidas; rejeitadas ficam fora", () => {
    const estornadaEm = new Date("2026-10-16T12:40:00.000Z");
    const parcela = {
      ...tituloDoServico.parcelas[0],
      baixas: [
        baixa("pendente", "PENDENTE", { avaliadoPor: null, lancamentos: [] }),
        baixa("rejeitada", "REJEITADO"),
        baixa("estornada", "ESTORNADO", {
          estornadoPor: { nome: "João" },
          estornadoEm: estornadaEm,
          motivoEstorno: "conta errada",
          lancamentos: [],
        }),
        baixa("aprovada", "APROVADO", { data: new Date("2026-10-20T00:00:00.000Z") }),
      ],
    };
    const [titulo] = titulosParaCliente([{ ...tituloDoServico, parcelas: [parcela] }]);

    expect(titulo.parcelas[0].temBaixaPendente).toBe(true);
    expect(titulo.parcelas[0].baixas).toEqual([
      expect.objectContaining({ id: "pendente", status: "PENDENTE", aprovadaPor: null }),
      {
        id: "estornada",
        data: new Date("2026-10-15T00:00:00.000Z"),
        registradaEm: new Date("2026-10-15T13:00:00.000Z"),
        status: "ESTORNADO",
        valorPago: 1012,
        valorJuros: 12,
        valorMulta: 0,
        valorDesconto: 0,
        conta: "Banco X - Ag 0001/CC 123-4",
        registradaPor: "Maria",
        aprovadaPor: "João",
        estornadaPor: "João",
        estornadaEm,
        motivoEstorno: "conta errada",
        conciliada: false,
        deRepasse: false,
      },
      expect.objectContaining({ id: "aprovada", status: "APROVADO", estornadaPor: null }),
    ]);
  });

  it("parcela só com baixa rejeitada não tem pendente", () => {
    const parcela = { ...tituloDoServico.parcelas[0], baixas: [baixa("rejeitada", "REJEITADO")] };
    const [titulo] = titulosParaCliente([{ ...tituloDoServico, parcelas: [parcela] }]);
    expect(titulo.parcelas[0].temBaixaPendente).toBe(false);
    expect(titulo.parcelas[0].baixas).toEqual([]);
  });
```

- [ ] **Step 2: Ver falhar**

Run: `npx vitest run "src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.test.ts"`
Expected: FAIL (`temBaixaPendente` ausente, pendente filtrada, `registradaEm` ausente).

- [ ] **Step 3: Implementar o mapeador**

Em `titulos-para-cliente.ts`:

- Em `BaixaDaParcela`: `status: "PENDENTE" | "APROVADO" | "ESTORNADO";` e, logo depois de `data: Date;`, acrescente

```ts
  /** Quando a baixa foi registrada (a tela mostra na pendente). */
  registradaEm: Date;
```

- `baixasParaCliente`: o comentário vira `/** As que esperam aprovação ou mexeram no saldo: pendentes, aprovadas e estornadas (rejeitadas são o item 5 do backlog). */`; o filtro vira

```ts
    .filter((b) => b.statusAprovacao === "PENDENTE" || b.statusAprovacao === "APROVADO" || b.statusAprovacao === "ESTORNADO")
```

  e no `map`: `data: b.data,` seguido de `registradaEm: b.criadoEm,`, e `status: b.statusAprovacao as BaixaDaParcela["status"],`.

- `titulosParaCliente`: no doc, "baixas pendentes e rejeitadas" vira "baixas rejeitadas"; na parcela acrescente, depois de `baixas: …`:

```ts
      temBaixaPendente: parcela.baixas.some((b) => b.statusAprovacao === "PENDENTE"),
```

- [ ] **Step 4: Ver passar**

Run: `npx vitest run "src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.test.ts" "src/app/(dashboard)/financeiro/_titulos/baixas-da-parcela.test.ts"`
Expected: PASS.

- [ ] **Step 5: Lista "Baixas" mostra a pendente**

Em `baixas-da-parcela.tsx`:

- Doc do componente: `/** As baixas pendentes, aprovadas e estornadas de uma parcela, com o estorno para quem pode aprovar. */`
- No `map`, depois de `const estornada = …`, acrescente `const pendente = baixa.status === "PENDENTE";`.
- Logo depois do bloco `{estornada && (<Badge …>Estornada</Badge>)}`, acrescente:

```tsx
                  {pendente && (
                    <Badge variant="outline" className="ml-2">
                      Aguardando aprovação
                    </Badge>
                  )}
```

- O parágrafo `registrada por` vira:

```tsx
                <p className="text-xs text-muted-foreground">
                  {`registrada por ${baixa.registradaPor}` +
                    (pendente ? ` em ${formatarDataHora(baixa.registradaEm)}` : "") +
                    (baixa.aprovadaPor ? ` · aprovada por ${baixa.aprovadaPor}` : "")}
                </p>
```

- A ação: `{!estornada && !pendente && podeEstornar && <AcaoDoEstorno baixa={baixa} onEstornar={onEstornar} />}`

- [ ] **Step 6: Trocar o Baixar na tabela**

Em `titulo-table.tsx`, substitua

```tsx
                        {podeBaixar && !STATUS_TERMINAIS.includes(parcela.status) && (
                          <Button type="button" size="sm" onClick={() => onAbrirBaixa(parcela.id)}>
                            Baixar
                          </Button>
                        )}
```

por

```tsx
                        {podeBaixar &&
                          !STATUS_TERMINAIS.includes(parcela.status) &&
                          (parcela.temBaixaPendente ? (
                            <span className="text-xs text-muted-foreground">Baixa aguardando aprovação</span>
                          ) : (
                            <Button type="button" size="sm" onClick={() => onAbrirBaixa(parcela.id)}>
                              Baixar
                            </Button>
                          ))}
```

No mesmo arquivo, o tipo `ParcelaLinha` (linha 22) é declarado à mão: acrescente `temBaixaPendente: boolean;` depois de `baixas: BaixaDaParcela[];`.

- [ ] **Step 7: Tipos e testes da pasta**

Run: `npx tsc --noEmit` e `npx vitest run "src/app/(dashboard)/financeiro/_titulos"`
Expected: sem erros de tipo; PASS.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/financeiro/_titulos"
git commit -m "feat(financeiro): parcela mostra a baixa aguardando aprovação no lugar do Baixar"
```

---

### Task 4: Ajuda de Contas a pagar e a receber

**Files:**
- Modify: `src/ajuda/_titulos/alvos.ts`, `src/ajuda/_titulos/exemplo.ts`, `src/ajuda/_titulos/cenas.tsx`
- Modify: `src/ajuda/contas-a-pagar/exemplo.ts`, `src/ajuda/contas-a-receber/exemplo.ts`
- Modify: `src/ajuda/contas-a-pagar/roteiros.ts`, `src/ajuda/contas-a-receber/roteiros.ts`
- Test: `src/ajuda/_titulos/cenas.test.ts` (os testes de roteiro existentes cobrem os alvos)

**Interfaces:**
- Consumes: os textos "Baixa aguardando aprovação" e "Aguardando aprovação" da Task 3.
- Produces: alvo `lista.p1.aguardando`; estado `"pendente"` em `valores["lista.p1.baixa"]`; campo `registradaEm` em `BaixaExemplo`.

- [ ] **Step 1: Teste da cena**

Em `cenas.test.ts`, dentro do `describe`, acrescente:

```ts
  test("baixa pendente: selo na lista e aviso no lugar do Baixar", () => {
    const saida = html(CenaLista, { "lista.linhaExemplo": "expandida", "lista.p1.baixa": "pendente" });
    expect(saida).toContain("Aguardando aprovação");
    expect(saida).toContain('data-alvo="lista.p1.aguardando"');
    expect(saida).toContain("Baixa aguardando aprovação");
    expect(saida).toContain("registrada por Maria em 15/10/2026 10:20");
    expect(saida).not.toContain('data-alvo="lista.p1.baixar"');
    expect(saida).not.toContain('data-alvo="lista.p1.estornar"');
  });
```

- [ ] **Step 2: Ver falhar**

Run: `npx vitest run src/ajuda/_titulos/cenas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Exemplo e alvos**

- `alvos.ts`, lista: depois de `"lista.p1.baixar",` acrescente `"lista.p1.aguardando",`.
- `_titulos/exemplo.ts`, `BaixaExemplo`: o doc de `baixa` em `ExemploTitulos` vira `/** Baixa da parcela 1: pendente no roteiro de pagamento; aprovada na conta errada no de estorno. */`; depois de `registradaPor: string;` acrescente

```ts
  /** Data e hora do registro no horário de Brasília: "15/10/2026 10:20". */
  registradaEm: string;
```

- `contas-a-pagar/exemplo.ts` e `contas-a-receber/exemplo.ts`, em `baixa`, depois de `registradaPor: "Maria",`: `registradaEm: "15/10/2026 10:20",`.

- [ ] **Step 4: Cena**

Em `_titulos/cenas.tsx`:

- `BaixaDoExemplo`: doc vira `/** A baixa da parcela 1: pendente (roteiro de pagamento), aprovada (com Estornar) ou já estornada. */`. Depois de `const estornada = …` acrescente `const pendente = estado === "pendente";`. A conta mostrada é `pendente ? exemplo.conta : baixa.conta` (no pagamento a pessoa escolhe a conta do título). Depois do selo Estornada:

```tsx
            {pendente && (
              <Badge variant="outline" className="ml-2">
                Aguardando aprovação
              </Badge>
            )}
```

  A linha de registro:

```tsx
          <p className="text-xs text-muted-foreground">
            {pendente
              ? `registrada por ${baixa.registradaPor} em ${baixa.registradaEm}`
              : `registrada por ${baixa.registradaPor} · aprovada por ${baixa.aprovadaPor}`}
          </p>
```

  e o botão: `{!estornada && !pendente && (<BotaoSimulado alvo="lista.p1.estornar" …>Estornar</BotaoSimulado>)}`.

- `LinhasDoExemplo`: o comentário de `estadoBaixa` vira `// "pendente" (roteiro de pagamento), "aprovada" (parcela 1 paga) ou "estornada" (volta ao status do exemplo).` No `map` das parcelas, depois de `const paga = …`, acrescente `const pendente = parcela.numero === 1 && estadoBaixa === "pendente";`. Troque o `BotaoSimulado` do Baixar por:

```tsx
                        {pendente ? (
                          <Alvo nome={`${p}.aguardando`} className="p-1 text-xs text-muted-foreground">
                            Baixa aguardando aprovação
                          </Alvo>
                        ) : (
                          <BotaoSimulado alvo={`${p}.baixar`} size="sm">
                            Baixar
                          </BotaoSimulado>
                        )}
```

  (`Alvo` já é importado de `@/components/ajuda/campos-simulados` no arquivo; se não for, acrescente ao import existente.)

- [ ] **Step 5: Ver passar**

Run: `npx vitest run src/ajuda/_titulos/cenas.test.ts`
Expected: PASS.

- [ ] **Step 6: Roteiros**

Em `contas-a-pagar/roteiros.ts`, roteiro `pagar-parcela`, depois do passo `baixa.registrar`, acrescente:

```ts
      {
        cena: "lista",
        alvo: "lista.p1.aguardando",
        instrucao: "Veja a parcela aguardando aprovação",
        explicacao:
          "A janela fecha e a baixa aparece embaixo da parcela com o selo “Aguardando aprovação”. No lugar do " +
          "botão Baixar fica “Baixa aguardando aprovação”: a parcela não aceita outra baixa até esta ser aprovada " +
          "ou rejeitada. Assim o mesmo pagamento não é lançado duas vezes.",
        dica: "Pagou em partes? Registre a segunda parte depois que a primeira for aprovada.",
        preenche: { "lista.p1.baixa": "pendente" },
      },
```

e no passo `baixa.registrar` a explicação vira: `"O próprio botão avisa: a baixa fica pendente de aprovação. Por enquanto a parcela ainda não aparece como paga."` (sem mudança de texto; conferir que está assim).

Em `contas-a-receber/roteiros.ts`, roteiro `receber-parcela`, o mesmo passo, com "recebimento":

```ts
      {
        cena: "lista",
        alvo: "lista.p1.aguardando",
        instrucao: "Veja a parcela aguardando aprovação",
        explicacao:
          "A janela fecha e a baixa aparece embaixo da parcela com o selo “Aguardando aprovação”. No lugar do " +
          "botão Baixar fica “Baixa aguardando aprovação”: a parcela não aceita outra baixa até esta ser aprovada " +
          "ou rejeitada. Assim o mesmo recebimento não é lançado duas vezes.",
        dica: "Recebeu em partes? Registre a segunda parte depois que a primeira for aprovada.",
        preenche: { "lista.p1.baixa": "pendente" },
      },
```

- [ ] **Step 7: Testes da ajuda**

Run: `npx vitest run src/ajuda/_titulos src/ajuda/contas-a-pagar src/ajuda/contas-a-receber`
Expected: PASS (o teste "o alvo de cada passo aparece na cena" cobre o passo novo).

- [ ] **Step 8: Commit**

```bash
git add src/ajuda/_titulos src/ajuda/contas-a-pagar src/ajuda/contas-a-receber
git commit -m "feat(ajuda): baixa aguardando aprovação nos roteiros de pagar e receber parcela"
```

---

### Task 5: Ajuda de Aprovações

**Files:**
- Modify: `src/ajuda/aprovacoes/exemplo.ts`, `src/ajuda/aprovacoes/roteiros.ts`
- Test: `src/ajuda/aprovacoes/roteiros.test.ts`

- [ ] **Step 1: Teste**

Em `roteiros.test.ts`, no teste "a réplica mostra os avisos da regra real: só o Recibo 88 e a Fatura 556 têm aviso", troque

```ts
    expect(html.match(/A parcela já está paga/g)).toHaveLength(1);
```

por

```ts
    expect(html.match(/Acima do saldo em R\$\s10\.800,00/g)).toHaveLength(1);
    expect(html).not.toContain("A parcela já está paga");
```

- [ ] **Step 2: Ver falhar**

Run: `npx vitest run src/ajuda/aprovacoes`
Expected: FAIL.

- [ ] **Step 3: Exemplo**

Em `aprovacoes/exemplo.ts`, a entrada do Recibo 88: comentário vira `// Valor digitado errado: o recibo é de R$ 1.200,00 e a Maria lançou R$ 12.000,00.`; `valorPago: 12000,` e `totalAprovado: 0,`. `MOTIVO_REJEICAO = "Valor errado: o recibo é de R$ 1.200,00"`.

- [ ] **Step 4: Roteiros**

Em `aprovacoes/roteiros.ts`:

- `entender-avisos`, `quandoUsar`:

```ts
      "Quando aparece um triângulo amarelo com um aviso embaixo do título da baixa. O aviso aponta o que costuma " +
      "ser erro de digitação, no valor ou na data, mas não impede a aprovação: quem decide é você.",
```

- passo `lista.l2.avisos`, `explicacao` e `dica`:

```ts
        explicacao:
          "O recibo do José da Silva é de R$ 1.200,00, e a Maria digitou R$ 12.000,00. O sistema compara o valor " +
          "pago com o que falta da parcela, mais juros e multa, menos o desconto: “Acima do saldo em R$ …” quando " +
          "passa, “Pagamento parcial: faltam R$ …” (ou Recebimento parcial) quando fica abaixo.",
        dica:
          "Pagamento parcial pode estar certo, quando foi combinado pagar em partes. “A parcela já está paga” e " +
          "“Há outra baixa pendente nesta parcela” só aparecem em baixas registradas antes de o sistema impedir a " +
          "segunda baixa na mesma parcela: confira se não é o mesmo pagamento lançado duas vezes.",
```

- `rejeitar-baixa`, `quandoUsar`:

```ts
      "Quando a baixa está errada: o valor ou a data não batem com o comprovante, foi na parcela errada ou o " +
      "pagamento não aconteceu.",
```

- passo `lista.l2.motivo`, `explicacao`:

```ts
          "O campo fica ao lado do botão Rejeitar, na mesma linha. O motivo é obrigatório, com pelo menos 3 " +
          "letras. No exemplo, o Recibo 88 tem o aviso “Acima do saldo”: o recibo é de R$ 1.200,00 e a baixa foi " +
          "lançada com R$ 12.000,00.",
```

- `rejeitar-baixa`, `eDepois`: troque "a parcela continua como estava" por "a parcela continua como estava e volta a aceitar baixa" (o resto igual).

Procure no arquivo outras menções a "em dobro" ou "já paga" (`grep -n "dobro\|já paga\|já está paga" src/ajuda/aprovacoes/*.ts*`) e ajuste se descreverem o caso antigo.

- [ ] **Step 5: Ver passar**

Run: `npx vitest run src/ajuda/aprovacoes src/lib/financeiro`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ajuda/aprovacoes
git commit -m "feat(ajuda): exemplo de Aprovações sem baixa em dobro, que o sistema não deixa mais registrar"
```

---

### Task 6: Backlog, spec e conferência

**Files:**
- Modify: `docs/backlog.md` (item 4; item novo no fim da seção "Financeiro — lacunas…")
- Modify: `docs/superpowers/specs/2026-11-24-baixa-pendente-unica-design.md` (Status)

- [ ] **Step 1: Suíte inteira e tipos**

Run: `npx tsc --noEmit` e `npx vitest run`
Expected: sem erros; PASS (registre no relatório qualquer falha que já existia antes da branch).

- [ ] **Step 2: Backlog**

No item 4, logo abaixo do título, acrescente:

```markdown
- **Status:** feito na branch `fix/baixa-pendente-unica` (2026-11-24, spec
  `2026-11-24-baixa-pendente-unica-design.md`): uma baixa pendente por parcela
  (trava com `FOR UPDATE`, API 409), baixa só em parcela em aberto; a parcela
  mostra a pendente e "Baixa aguardando aprovação" no lugar do Baixar; ajuda de
  Aprovações sem o exemplo de baixa em dobro.
```

No fim da seção "Financeiro — lacunas achadas ao escrever a ajuda contextual", acrescente um item com o próximo número livre:

```markdown
### N. Cancelar ou renegociar parcela com baixa pendente

- **Problema:** `cancelarParcela` (`src/server/services/titulo.ts`) e a
  renegociação (`src/server/services/renegociacao.ts`) não olham as baixas
  pendentes da parcela.
- **Exemplo:** a baixa da parcela 1 espera aprovação; alguém cancela a parcela.
  Depois a Tesouraria aprova a baixa: sai o lançamento de uma parcela
  cancelada.
- **Impacto:** dado errado.
- **Caminhos:** bloquear cancelar/renegociar enquanto houver pendente; ou
  rejeitar a pendente junto, com motivo automático; ou recusar a aprovação de
  baixa em parcela fechada.
- **Cuidados:** cancelamento de pedido de venda também cancela parcelas.
```

- [ ] **Step 3: Spec**

`Status: aprovada, a implementar` → `Status: implementada (2026-11-24)`.

- [ ] **Step 4: Conferência no navegador**

Com `npm run dev` (ver memória "Armadilhas do ambiente dev"): em Contas a pagar, registrar baixa numa parcela → aparece o selo "Aguardando aprovação" e "Baixa aguardando aprovação" no lugar do Baixar; aprovar em Aprovações com outro usuário → o Baixar volta (se a parcela ficou parcial) ou some (paga). Abrir a ajuda de Contas a pagar no roteiro "Pagar uma parcela" e ver o último passo.

- [ ] **Step 5: Commit**

```bash
git add docs/backlog.md docs/superpowers/specs/2026-11-24-baixa-pendente-unica-design.md
git commit -m "docs(backlog): uma baixa pendente por parcela feito"
```
