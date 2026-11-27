# Parcela com baixa pendente — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** parcela com baixa pendente não pode ser cancelada nem renegociada; renegociar só parcela em aberto; aprovar baixa de parcela cancelada/renegociada é recusado; repasse de cartão trava parcelas em ordem fixa.

**Architecture:** um guarda único em `baixa.ts` (`garantirSemBaixaPendente`) usado por registrar baixa, cancelar e renegociar, sempre dentro de transação com a parcela travada (`FOR UPDATE`). `efetivarBaixa` recusa parcela fechada. Aprovações mostra um aviso para pendências antigas. A tela esconde Cancelar/Renegociar quando há pendente.

**Tech Stack:** Next.js (server actions), Prisma 7 + PostgreSQL (`$queryRaw ... FOR UPDATE`), Vitest (integração no Postgres local).

**Spec:** `docs/superpowers/specs/2026-11-26-parcela-com-baixa-pendente-design.md`

## Global Constraints

- Todo texto (mensagens, testes, ajuda, commits) em português do Brasil.
- Mensagem de pendente (as três variações, montadas pelo mesmo guarda):
  `Esta parcela já tem uma baixa aguardando aprovação: <valor> de <data>, registrada por <nome>. Peça para aprovarem ou rejeitarem essa baixa antes de <fim>.` com `<fim>` = `registrar outra` (registrar baixa, texto atual, não muda), `cancelar a parcela`, `renegociar a parcela`.
- Mensagem de renegociar parcela fechada: `Esta parcela está <paga|cancelada|renegociada> e não pode ser renegociada` (rótulos de `ROTULO_PARCELA_FECHADA`).
- Mensagem de aprovar baixa de parcela fechada: `A parcela desta baixa foi <cancelada|renegociada>. Rejeite a baixa.`
- Status em aberto = `STATUS_QUE_ACEITAM_BAIXA` = EM_ABERTO, A_VENCER, VENCIDO, PARCIALMENTE_PAGO.
- Dentro de `$transaction`, leituras em sequência (sem `Promise.all` nem `include` de várias relações): ver "consultas paralelas na transação" no backlog.
- Rodar testes pelo **PowerShell** (`npx vitest run <arquivo>`); no Git Bash o Vitest quebra. `npx tsc --noEmit` tem 2 erros antigos em `.next/types/validator.ts` — ignorar; nenhum erro novo nos arquivos tocados.
- Arquivos CRLF: preservar fins de linha (usar a ferramenta Edit; nunca Prettier; nunca `Get-Content | Set-Content`).
- Toda mensagem de commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Guarda de pendente e recusa na aprovação (`baixa.ts`)

**Files:**
- Modify: `src/server/services/baixa.ts`
- Test: `src/server/services/baixa.test.ts`

**Interfaces:**
- Produces:
  - `export const STATUS_QUE_ACEITAM_BAIXA` (já existe; passa a ser exportado).
  - `export const ROTULO_PARCELA_FECHADA` (já existe; passa a ser exportado).
  - `export async function garantirSemBaixaPendente(tx: Prisma.TransactionClient, parcelaId: string, antesDe: string): Promise<void>` — lança `BaixaPendenteError` com a mensagem das Global Constraints (`antesDe` é o `<fim>`).
  - `efetivarBaixa` lança `BaixaParcelaFechadaError` quando a parcela está CANCELADO ou RENEGOCIADO.

- [ ] **Step 1: Teste da recusa na aprovação (falha)**

Em `baixa.test.ts`, no `describe` onde estão os testes de `aprovarBaixa` com `fixtureTesouraria` (use o helper `criarParcelaDeTeste` e o padrão de sessão aprovadora que os testes vizinhos de aprovação já usam — leia-os antes; a segregação `exigirAprovacaoPorOutro` exige que quem aprova seja outra pessoa), acrescente:

```ts
  test.each([
    ["CANCELADO", "cancelada"],
    ["RENEGOCIADO", "renegociada"],
  ] as const)("aprovar baixa pendente de parcela %s é recusado, sem lançamento", async (status, rotulo) => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 500);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date("2026-10-14T00:00:00Z"),
      valorPago: 500,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });
    // Pendência antiga: a parcela foi fechada antes desta regra existir.
    await prisma.parcela.update({ where: { id: parcela.id }, data: { status } });

    const tentativa = aprovarBaixa(/* a sessão aprovadora usada pelos testes vizinhos */, baixa.id);

    await expect(tentativa).rejects.toThrow(BaixaParcelaFechadaError);
    await expect(tentativa).rejects.toThrow(`A parcela desta baixa foi ${rotulo}. Rejeite a baixa.`);
    expect((await prisma.baixa.findUniqueOrThrow({ where: { id: baixa.id } })).statusAprovacao).toBe("PENDENTE");
    expect(await prisma.lancamentoBancario.count({ where: { baixaId: baixa.id } })).toBe(0);
  });
```

Importe `BaixaParcelaFechadaError` se ainda não estiver importado.

- [ ] **Step 2: Rodar e ver falhar**

Run (PowerShell): `npx vitest run src/server/services/baixa.test.ts -t "parcela"`
Expected: FAIL — a aprovação passa.

- [ ] **Step 3: Implementar**

Em `baixa.ts`:

1. `export const STATUS_QUE_ACEITAM_BAIXA ...` e `export const ROTULO_PARCELA_FECHADA ...` (só acrescentar `export`).
2. Extrair o trecho de `registrarBaixa` que busca a pendente e lança `BaixaPendenteError` para:

```ts
/**
 * A parcela não pode ter baixa esperando aprovação. Chame com a parcela já travada (`FOR UPDATE`) na mesma
 * transação: assim registrar, cancelar e renegociar ao mesmo tempo ficam em fila e o segundo vê o primeiro.
 */
export async function garantirSemBaixaPendente(
  tx: Prisma.TransactionClient,
  parcelaId: string,
  antesDe: string,
): Promise<void> {
  // Leituras em sequência (sem include): ver "consultas paralelas na transação" no backlog.
  const pendente = await tx.baixa.findFirst({
    where: { parcelaId, statusAprovacao: "PENDENTE" },
    select: { valorPago: true, data: true, usuarioId: true },
  });
  if (!pendente) return;
  const quem = await tx.usuario.findUniqueOrThrow({ where: { id: pendente.usuarioId }, select: { nome: true } });
  throw new BaixaPendenteError(
    `Esta parcela já tem uma baixa aguardando aprovação: ${formatarMoeda(pendente.valorPago)} de ` +
      `${formatarData(pendente.data)}, registrada por ${quem.nome}. ` +
      `Peça para aprovarem ou rejeitarem essa baixa antes de ${antesDe}.`,
  );
}
```

   e em `registrarBaixa` trocar o trecho por `await garantirSemBaixaPendente(tx, parcelaId, "registrar outra");` (a mensagem final fica idêntica à atual).
3. Em `efetivarBaixa`, logo depois de ler `parcela`:

```ts
  // Pendência antiga de parcela fechada depois do registro: aprovar geraria lançamento de parcela que não existe mais.
  if (parcela.status === "CANCELADO" || parcela.status === "RENEGOCIADO") {
    throw new BaixaParcelaFechadaError(
      `A parcela desta baixa foi ${ROTULO_PARCELA_FECHADA[parcela.status]}. Rejeite a baixa.`,
    );
  }
```

   Confira se `aprovarBaixaAction` (em `src/app/(dashboard)/financeiro/aprovacoes/`) devolve a mensagem do erro para a tela; se ela só trata erros específicos, faça tratar `BaixaParcelaFechadaError` do mesmo jeito.

- [ ] **Step 4: Rodar**

Run: `npx vitest run src/server/services/baixa.test.ts`
Expected: PASS (inclusive o teste existente "recusa a segunda baixa enquanto a primeira está pendente, dizendo qual é", que fixa a mensagem antiga).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/baixa.ts src/server/services/baixa.test.ts
git commit -m "fix(baixa): aprovação recusa baixa de parcela cancelada ou renegociada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Inclua no `git add` a action de Aprovações, se mudou.)

---

### Task 2: Cancelar e renegociar travam a parcela e recusam pendente

**Files:**
- Modify: `src/server/services/titulo.ts` (`cancelarParcela`, ~linha 539)
- Modify: `src/server/services/renegociacao.ts`
- Test: `src/server/services/titulo.test.ts`, `src/server/services/renegociacao.test.ts`

**Interfaces:**
- Consumes (Task 1): `garantirSemBaixaPendente`, `BaixaPendenteError`, `STATUS_QUE_ACEITAM_BAIXA`, `ROTULO_PARCELA_FECHADA` de `./baixa`.
- Cuidado com import circular: `baixa.ts` já importa `type ContextoTitulo` de `./titulo` (só tipo). Importar valores de `./baixa` em `titulo.ts` cria ciclo de valores; se o Vitest ou o Next reclamarem, mova `garantirSemBaixaPendente`, `BaixaPendenteError`, `BaixaParcelaFechadaError`, `STATUS_QUE_ACEITAM_BAIXA` e `ROTULO_PARCELA_FECHADA` para um módulo novo `src/server/services/baixaGuardas.ts` e reexporte-os de `baixa.ts` (os imports existentes continuam funcionando).

- [ ] **Step 1: Testes que falham**

`titulo.test.ts` — perto dos testes de `cancelarParcela` existentes (~linha 370-400), usando a fixture e o padrão de criação de título deles. A fixture precisa registrar baixa: use uma sessão com `titulo:baixar` (veja qual sessão os testes vizinhos usam; `fixture.sessaoAdmin` serve) e a conta `fixture.contaBancariaId`:

```ts
  test("cancelar parcela com baixa pendente é recusado, dizendo qual é a baixa", async () => {
    const titulo = /* crie um título PAGAR de 1 parcela como os testes vizinhos */;
    const parcelaId = titulo.parcelas[0].id;
    await registrarBaixa(fixture.sessaoAdmin, parcelaId, {
      data: new Date("2026-10-14T00:00:00Z"),
      valorPago: 300,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });
    const admin = await prisma.usuario.findUniqueOrThrow({ where: { id: fixture.sessaoAdmin.usuarioId } });

    const tentativa = cancelarParcela(fixture.sessao, parcelaId);

    await expect(tentativa).rejects.toThrow(BaixaPendenteError);
    await expect(tentativa).rejects.toThrow(
      `Esta parcela já tem uma baixa aguardando aprovação: ${formatarMoeda(300)} de 14/10/2026, ` +
        `registrada por ${admin.nome}. Peça para aprovarem ou rejeitarem essa baixa antes de cancelar a parcela.`,
    );
    expect((await prisma.parcela.findUniqueOrThrow({ where: { id: parcelaId } })).status).not.toBe("CANCELADO");
  });
```

(Os testes existentes "cancela" e "recusa cancelar CANCELADO/RENEGOCIADO" continuam valendo.)

`renegociacao.test.ts` — no `describe("renegociarParcela")`; extraia um helper local `criarTituloVencido(valor)` com o corpo de criação do primeiro teste para não repetir:

```ts
  test("com baixa pendente é recusado, dizendo qual é a baixa", async () => {
    const original = (await criarTituloVencido(1000)).parcelas[0];
    await registrarBaixa(fixture.sessaoAdmin, original.id, {
      data: new Date("2026-10-14T00:00:00Z"),
      valorPago: 300,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });

    const tentativa = renegociarParcela(fixture.sessao, original.id, [
      { dataVencimento: new Date("2099-01-01"), valorOriginal: 1000 },
    ]);

    await expect(tentativa).rejects.toThrow(BaixaPendenteError);
    await expect(tentativa).rejects.toThrow("antes de renegociar a parcela.");
    expect((await prisma.parcela.findUniqueOrThrow({ where: { id: original.id } })).status).not.toBe("RENEGOCIADO");
    expect(await prisma.parcela.count({ where: { parcelaOrigemId: original.id } })).toBe(0);
  });

  test.each([
    ["PAGO", "paga"],
    ["CANCELADO", "cancelada"],
    ["RENEGOCIADO", "renegociada"],
  ] as const)("parcela %s não é renegociada", async (status, rotulo) => {
    const original = (await criarTituloVencido(1000)).parcelas[0];
    await prisma.parcela.update({ where: { id: original.id }, data: { status } });

    await expect(
      renegociarParcela(fixture.sessao, original.id, [{ dataVencimento: new Date("2099-01-01"), valorOriginal: 1000 }]),
    ).rejects.toThrow(`Esta parcela está ${rotulo} e não pode ser renegociada`);
    expect(await prisma.parcela.count({ where: { parcelaOrigemId: original.id } })).toBe(0);
  });
```

Confira que `criarFixtureFinanceiro` (perfil padrão FINANCEIRO) tem `sessaoAdmin` e `contaBancariaId`; se `fixture.sessao` não tiver `titulo:escrever`, use a sessão que o teste existente usa.

Run (PowerShell): `npx vitest run src/server/services/titulo.test.ts src/server/services/renegociacao.test.ts`
Expected: FAIL nos testes novos.

- [ ] **Step 2: Implementar `cancelarParcela`**

```ts
export async function cancelarParcela(sessao: SessaoAtiva, parcelaId: string) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await prisma.parcela.findFirstOrThrow({ where: { id: parcelaId, titulo: { filialId: sessao.filialId } } });

  return prisma.$transaction(async (tx) => {
    // Trava a parcela: um registro de baixa ao mesmo tempo fica em fila e um vê o outro.
    await tx.$queryRaw`SELECT id FROM parcelas WHERE id = ${parcelaId} FOR UPDATE`;
    const anterior = await tx.parcela.findUniqueOrThrow({ where: { id: parcelaId } });

    // CANCELADO e RENEGOCIADO são estados terminais: sobrescrever um RENEGOCIADO
    // apagaria o sentido da cadeia de renegociação (`parcelaOrigemId`).
    if (anterior.status === "CANCELADO" || anterior.status === "RENEGOCIADO") {
      throw new Error("Não é possível cancelar uma parcela já renegociada ou cancelada");
    }
    await garantirSemBaixaPendente(tx, parcelaId, "cancelar a parcela");

    const parcela = await tx.parcela.update({ where: { id: parcelaId }, data: { status: "CANCELADO" } });

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Parcela",
        entidadeId: parcelaId,
        acao: "CANCELAR",
        anterior: { status: anterior.status },
        novo: { status: "CANCELADO" },
      },
      tx,
    );

    return parcela;
  });
}
```

(Confirme que `registrarAuditoria` aceita o `tx` como segundo argumento — `baixa.ts` já usa assim.)

- [ ] **Step 3: Implementar `renegociarParcela`**

Troque a transação em lote por interativa:

```ts
  await prisma.parcela.findFirstOrThrow({ where: { id: parcelaId, titulo: { filialId: sessao.filialId } } });

  const { original, criadas } = await prisma.$transaction(async (tx) => {
    // Trava a parcela: um registro de baixa ao mesmo tempo fica em fila e um vê o outro.
    await tx.$queryRaw`SELECT id FROM parcelas WHERE id = ${parcelaId} FOR UPDATE`;
    const original = await tx.parcela.findUniqueOrThrow({ where: { id: parcelaId } });
    if (!STATUS_QUE_ACEITAM_BAIXA.includes(original.status)) {
      throw new Error(
        `Esta parcela está ${ROTULO_PARCELA_FECHADA[original.status] ?? "fechada"} e não pode ser renegociada`,
      );
    }
    await garantirSemBaixaPendente(tx, parcelaId, "renegociar a parcela");

    const ultimoNumero = await tx.parcela.aggregate({ where: { tituloId: original.tituloId }, _max: { numero: true } });
    let proximoNumero = (ultimoNumero._max.numero ?? 0) + 1;

    await tx.parcela.update({ where: { id: parcelaId }, data: { status: "RENEGOCIADO" } });
    const criadas = [];
    for (const nova of novasParcelas) {
      criadas.push(
        await tx.parcela.create({
          data: {
            tituloId: original.tituloId,
            numero: proximoNumero++,
            dataVencimento: nova.dataVencimento,
            valorOriginal: nova.valorOriginal,
            valorAtualizado: nova.valorOriginal,
            parcelaOrigemId: parcelaId,
          },
        }),
      );
    }

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Parcela",
        entidadeId: parcelaId,
        acao: "RENEGOCIAR",
        anterior: { status: original.status },
        novo: { status: "RENEGOCIADO", novasParcelas: criadas.map((parcela) => parcela.id) },
      },
      tx,
    );
    return { original, criadas };
  });

  return criadas;
```

(A validação "Informe ao menos uma nova parcela" continua antes de tudo. Remova a variável `original` não usada fora da transação se o lint reclamar.)

- [ ] **Step 4: Rodar**

Run (PowerShell): `npx vitest run src/server/services/titulo.test.ts src/server/services/renegociacao.test.ts src/server/services/baixa.test.ts`
Expected: PASS. Depois `npx tsc --noEmit` e `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/titulo.ts src/server/services/renegociacao.ts src/server/services/titulo.test.ts src/server/services/renegociacao.test.ts
git commit -m "fix(parcela): cancelar e renegociar recusam parcela com baixa pendente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Inclua `baixa.ts`/`baixaGuardas.ts` se moveu os guardas.)

---

### Task 3: Aviso "Parcela cancelada/renegociada" em Aprovações

**Files:**
- Modify: `src/lib/financeiro/avisosDaBaixa.ts`
- Modify: `src/app/(dashboard)/financeiro/aprovacoes/page.tsx` (~linha 61)
- Modify: `src/ajuda/aprovacoes/roteiros.ts` (roteiro `entender-avisos`, ~linha 87)
- Test: `src/lib/financeiro/avisosDaBaixa.test.ts`

**Interfaces:**
- Produces: `TipoAvisoBaixa` ganha `"PARCELA_FECHADA"`; `DadosAvisoBaixa` ganha `statusParcela?: string`.

- [ ] **Step 1: Testes que falham**

Em `avisosDaBaixa.test.ts`, usando os dados-base que os testes existentes usam (leia o arquivo):

```ts
  test.each([
    ["CANCELADO", "Parcela cancelada: rejeite esta baixa"],
    ["RENEGOCIADO", "Parcela renegociada: rejeite esta baixa"],
  ])("parcela %s: aviso próprio, primeiro, sem os avisos de valor", (statusParcela, texto) => {
    const avisos = avisosDaBaixa({ ...BASE, valorPago: 1, statusParcela }); // BASE = os dados-base do arquivo
    expect(avisos[0]).toEqual({ tipo: "PARCELA_FECHADA", texto });
    expect(avisos.map((a) => a.tipo)).not.toContain("PARCIAL");
    expect(avisos.map((a) => a.tipo)).not.toContain("PARCELA_PAGA");
    expect(avisos.map((a) => a.tipo)).not.toContain("ACIMA_DO_SALDO");
  });

  test("parcela em aberto não gera o aviso de parcela fechada", () => {
    expect(avisosDaBaixa({ ...BASE, statusParcela: "VENCIDO" }).map((a) => a.tipo)).not.toContain("PARCELA_FECHADA");
  });
```

Run (PowerShell): `npx vitest run src/lib/financeiro/avisosDaBaixa.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementar**

`avisosDaBaixa.ts`:
- `TipoAvisoBaixa` ganha `| "PARCELA_FECHADA"` (primeiro da união).
- `DadosAvisoBaixa` ganha:

```ts
  /** Status gravado da parcela. Cancelada ou renegociada: a aprovação é recusada e o aviso manda rejeitar. */
  statusParcela?: string;
```

- No começo de `avisosDaBaixa`, antes dos avisos de data:

```ts
  const fechada =
    dados.statusParcela === "CANCELADO" ? "cancelada" : dados.statusParcela === "RENEGOCIADO" ? "renegociada" : null;
  if (fechada) {
    avisos.push({ tipo: "PARCELA_FECHADA", texto: `Parcela ${fechada}: rejeite esta baixa` });
  }
```

- O bloco dos avisos de valor (`if (saldo <= 0) ... else if ...`) só roda quando `!fechada`.
- Atualize o JSDoc: "Ordem: parcela fechada, data, valor, outra baixa pendente. Só informa, exceto parcela fechada: essa a aprovação recusa."

`aprovacoes/page.tsx`: na chamada de `avisosDaBaixa`, acrescente `statusParcela: baixa.parcela.status,` (a parcela já vem em `listarBaixasPendentes`).

`src/ajuda/aprovacoes/roteiros.ts`, roteiro `entender-avisos`, passo `lista.l2.avisos`: acrescente ao fim da `dica` (mantendo o texto atual):

```ts
          " “Parcela cancelada: rejeite esta baixa” (ou renegociada) é o único aviso que impede a aprovação: a " +
          "parcela foi fechada depois de a baixa ser registrada, então rejeite a baixa."
```

(Confira o espaço entre as frases e que o `quandoUsar` do roteiro — que diz que o aviso "não impede a aprovação" — continue verdadeiro para os demais; troque "mas não impede a aprovação" por "e, com uma exceção, não impede a aprovação".)

- [ ] **Step 3: Rodar**

Run (PowerShell): `npx vitest run src/lib/financeiro src/ajuda/aprovacoes`
Expected: PASS. `npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/financeiro/avisosDaBaixa.ts src/lib/financeiro/avisosDaBaixa.test.ts "src/app/(dashboard)/financeiro/aprovacoes/page.tsx" src/ajuda/aprovacoes/roteiros.ts
git commit -m "feat(aprovacoes): aviso de parcela cancelada ou renegociada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Tela, ajuda de títulos, repasse e fechamento

**Files:**
- Modify: `src/app/(dashboard)/financeiro/_titulos/titulo-table.tsx` (~linhas 305-322)
- Modify: `src/ajuda/contas-a-pagar/roteiros.ts` e `src/ajuda/contas-a-receber/roteiros.ts` (roteiros `renegociar` e `cancelar-parcela`)
- Modify: `src/server/services/repasseCartao.ts` (~linha 111)
- Modify: `docs/backlog.md` (itens 59 e 60), `docs/superpowers/specs/2026-11-26-parcela-com-baixa-pendente-design.md` (status)

- [ ] **Step 1: Botões**

Em `titulo-table.tsx`, o botão Renegociar passa a exigir `!parcela.temBaixaPendente`:

```tsx
                        {podeEscrever && parcela.status === "VENCIDO" && !parcela.temBaixaPendente && (
```

e o form de Cancelar:

```tsx
                        {podeEscrever && !STATUS_TERMINAIS.includes(parcela.status) && !parcela.temBaixaPendente && (
```

Se a réplica da ajuda (`src/ajuda/contas-a-pagar/cenas.tsx` / `contas-a-receber/cenas.tsx`) mostra uma parcela com "Baixa aguardando aprovação" junto de Cancelar/Renegociar, ajuste-a igual (comentário "Espelho" nos arquivos).

- [ ] **Step 2: Ajuda dos títulos**

Nos dois arquivos de roteiros (pagar e receber), roteiro `renegociar`, o `quandoUsar` termina com "O botão Renegociar só aparece em parcela vencida." → "O botão Renegociar só aparece em parcela vencida e sem baixa aguardando aprovação."

Roteiro `cancelar-parcela`, passo "Clique em “Cancelar” na parcela", a `dica` ganha ao fim:

```ts
          " Com baixa aguardando aprovação, Cancelar não aparece: peça para aprovarem ou rejeitarem a baixa antes."
```

(Em contas a receber, use o texto equivalente que já existe lá; só acrescente as mesmas frases.)

Run (PowerShell): `npx vitest run src/ajuda/contas-a-pagar src/ajuda/contas-a-receber`
Expected: PASS.

- [ ] **Step 3: Repasse (item 60)**

Em `confirmarRepasses`:

```ts
    // Trava as parcelas sempre na mesma ordem: duas confirmações com parcelas em comum ficam em fila em vez de
    // travar uma à outra (deadlock), e a segunda não baixa o mesmo repasse duas vezes.
    await tx.$queryRaw`SELECT id FROM parcelas WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
```

Run (PowerShell): `npx vitest run src/server/services/repasseCartao.test.ts`
Expected: PASS.

- [ ] **Step 4: Backlog e spec**

`docs/backlog.md`: logo abaixo de `### 59. ...` e de `### 60. ...`, no formato dos itens 1-5 e 13:

```markdown
- **Status:** feito na branch `fix/parcela-com-baixa-pendente` (2026-11-26, spec
  e plano `2026-11-26-parcela-com-baixa-pendente*`): cancelar e renegociar
  recusam parcela com baixa pendente (e somem da tela); renegociar só parcela
  em aberto; aprovar baixa de parcela cancelada/renegociada é recusado, com
  aviso em Aprovações.
```

e, no 60:

```markdown
- **Status:** feito na branch `fix/parcela-com-baixa-pendente` (2026-11-26):
  `ORDER BY id` no `FOR UPDATE`.
```

Spec: `Status: aprovada` → `Status: implementada (2026-11-26)`.

- [ ] **Step 5: Verificação completa**

Run (PowerShell, comandos separados): `npx tsc --noEmit`, `npm run lint`, `npx vitest run`
Expected: tudo verde (fora os 2 erros antigos do `.next`).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/financeiro/_titulos/titulo-table.tsx" src/ajuda/contas-a-pagar src/ajuda/contas-a-receber src/server/services/repasseCartao.ts docs/backlog.md docs/superpowers/specs/2026-11-26-parcela-com-baixa-pendente-design.md
git commit -m "fix(titulos): Cancelar e Renegociar somem com baixa pendente; repasse trava em ordem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Conferir no navegador** (sessão principal)

Uma parcela com baixa pendente sem Cancelar/Renegociar; uma pendente de parcela cancelada (montada por SQL no banco de dev) com o aviso em Aprovações e a aprovação recusada com a mensagem. Apagar os dados de teste no fim.
