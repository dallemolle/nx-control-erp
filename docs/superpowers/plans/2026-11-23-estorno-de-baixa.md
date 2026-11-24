# Estorno de baixa aprovada — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** permitir estornar uma baixa aprovada: a baixa fica `ESTORNADO` (com motivo, quem e quando), o lançamento bancário dela é apagado e a parcela é recalculada.

**Architecture:** um serviço novo `estornarBaixa` em `src/server/services/baixa.ts`, numa transação, com as travas de status, repasse, conciliação e segregação. A tela de Contas a pagar/receber ganha, embaixo de cada parcela, a lista das baixas aprovadas e estornadas, com o botão Estornar e um diálogo com motivo. A ajuda ganha o roteiro `estornar-baixa` nas duas telas.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 + PostgreSQL, Vitest, React 19, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-11-23-estorno-de-baixa-design.md`. Leia antes de começar: ela traz as decisões e o porquê de cada uma.

## Global Constraints

- Textos da tela e mensagens de erro em português, exatamente como estão neste plano.
- Mensagens do serviço (copiar literalmente):
  - `"Informe o motivo do estorno"`
  - `"Só baixas aprovadas podem ser estornadas"`
  - `"Esta baixa é de um repasse de cartão: use Desfazer repasse em Repasses de cartão"`
  - `"O lançamento desta baixa já foi conciliado. Desconcilie na Conciliação antes de estornar"`
  - `"Quem registrou a baixa não pode estorná-la. Peça a outra pessoa com permissão de aprovação."`
  - `"Esta baixa já foi estornada"`
- Permissão: `titulo:aprovar` (Administrador e Tesouraria) + permissão de alteração na filial.
- **Nunca rode Prettier** nem `prisma format`: o código não é formatado por eles. Formate à mão, linhas até ~120 colunas.
- Edite arquivos com a ferramenta Edit (os arquivos misturam CRLF e LF; `sed`/PowerShell `Set-Content` corrompem).
- Rode o Vitest **pelo PowerShell**: `Set-Location D:\Projetos\nx-control-erp; npx vitest run <arquivo>`. Pelo Bash o cwd fica minúsculo e todo teste falha com "Cannot read properties of undefined (reading 'config')".
- Os testes usam o Postgres de dev (docker `nx-control-erp-db`); a migration aplicada vale para eles.
- Todo commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Confira com `git log -1 --format=%B` depois de cada commit.
- Prefixos de commit em português como no repo: `feat(financeiro): …`, `test(...)`, `docs(...)`.

---

## Mapa de arquivos

| Arquivo | O que muda |
|---|---|
| `prisma/schema.prisma` | `ESTORNADO` no enum; `estornadoPorId`, `estornadoEm`, `motivoEstorno` e relação `estornadoPor` na `Baixa`; lado inverso no `Usuario` |
| `prisma/migrations/20261123120000_estorno_baixa/migration.sql` | novo |
| `src/lib/schemas/enums.ts` | `ESTORNADO` em `STATUS_APROVACAO_BAIXA` |
| `src/lib/auditoria/rotulos.ts` | rótulo `ESTORNAR: "Estornar"` |
| `src/server/services/baixa.ts` | `estornarBaixa` e as mensagens exportadas |
| `src/server/services/baixa.test.ts` | testes do estorno |
| `src/server/services/recepcaoFruto.ts` | contar só `PENDENTE` e `APROVADO` |
| `src/server/services/recepcaoFruto.test.ts`, `pedidoVenda.test.ts`, `repasseCartao.test.ts` | testes de integração do estorno |
| `src/server/services/titulo.ts` | `include` das baixas em `listarTitulos` |
| `src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.ts` (+ teste) | baixas aprovadas/estornadas para a tela |
| `src/app/(dashboard)/financeiro/_titulos/baixas-da-parcela.tsx` (+ teste) | novo: a lista de baixas de uma parcela |
| `src/app/(dashboard)/financeiro/_titulos/estornar-dialog.tsx` | novo: diálogo com motivo |
| `src/app/(dashboard)/financeiro/_titulos/actions.ts` | `estornarBaixaAction` |
| `src/app/(dashboard)/financeiro/_titulos/titulo-table.tsx`, `contas-client-panel.tsx` | ligar a lista e o diálogo |
| `src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx`, `contas-a-receber/page.tsx` | passar `podeAprovar` |
| `src/ajuda/_titulos/{exemplo,alvos,cenas}.ts(x)` (+ `cenas.test.ts`) | baixa do exemplo, alvos e cena nova |
| `src/ajuda/contas-a-pagar/{exemplo,roteiros}.ts`, `contas-a-receber/{exemplo,roteiros}.ts` (+ testes) | roteiro `estornar-baixa` |
| `src/ajuda/aprovacoes/roteiros.ts` | tirar "não pode ser desfeita" |
| `docs/backlog.md`, a spec | status ao concluir |

---

### Task 1: Migration e serviço `estornarBaixa`

**Files:**
- Modify: `prisma/schema.prisma` (enum `StatusAprovacaoBaixa` ~linha 579; model `Baixa` ~linha 661; model `Usuario` ~linha 189)
- Create: `prisma/migrations/20261123120000_estorno_baixa/migration.sql`
- Modify: `src/lib/schemas/enums.ts:52`
- Modify: `src/lib/auditoria/rotulos.ts` (mapa `ROTULOS_ACAO_AUDITORIA`)
- Modify: `src/server/services/baixa.ts`
- Test: `src/server/services/baixa.test.ts`

**Interfaces:**
- Produces:
  - `estornarBaixa(sessao: SessaoAtiva, baixaId: string, motivo: string): Promise<Baixa>` (retorna a baixa já `ESTORNADO`)
  - constantes exportadas `MSG_ESTORNO_REPASSE`, `MSG_ESTORNO_CONCILIADA`, `MSG_ESTORNO_POR_QUEM_REGISTROU`
  - campos novos na `Baixa`: `estornadoPorId: string | null`, `estornadoEm: Date | null`, `motivoEstorno: string | null`, relação `estornadoPor`
  - valor novo `ESTORNADO` em `StatusAprovacaoBaixa`

- [ ] **Step 1: Schema**

Em `prisma/schema.prisma`:

```prisma
enum StatusAprovacaoBaixa {
  PENDENTE
  APROVADO
  REJEITADO
  ESTORNADO
}
```

No model `Baixa`, depois de `motivoRejeicao  String?`:

```prisma
  estornadoPorId  String?
  estornadoEm     DateTime?
  motivoEstorno   String?
```

e, depois da linha `avaliadoPor   Usuario? @relation("BaixaAvaliadaPor", ...)`:

```prisma
  estornadoPor  Usuario?             @relation("BaixaEstornadaPor", fields: [estornadoPorId], references: [id])
```

No model `Usuario`, depois de `baixasAvaliadas ... @relation("BaixaAvaliadaPor")`:

```prisma
  baixasEstornadas          Baixa[]                  @relation("BaixaEstornadaPor")
```

Alinhe as colunas à mão com as linhas vizinhas. **Não** rode `prisma format`.

- [ ] **Step 2: Gerar e aplicar a migration** (o `migrate dev` recusa rodar em ambiente não interativo)

```powershell
Set-Location D:\Projetos\nx-control-erp
New-Item -ItemType Directory -Force prisma/migrations/20261123120000_estorno_baixa
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --output prisma/migrations/20261123120000_estorno_baixa/migration.sql
npx prisma migrate deploy
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Esperado: o SQL tem `ALTER TYPE "StatusAprovacaoBaixa" ADD VALUE 'ESTORNADO';`, três `ADD COLUMN` em `"baixas"` e a FK `baixas_estornadoPorId_fkey` para `"usuarios"`. O último comando sai com código 0 (sem diferença). Se o SQL trouxer qualquer outra mudança, pare e investigue (banco de dev fora de sincronia).

- [ ] **Step 3: Enum e rótulo da auditoria**

`src/lib/schemas/enums.ts:52`:

```ts
export const STATUS_APROVACAO_BAIXA = ["PENDENTE", "APROVADO", "REJEITADO", "ESTORNADO"] as const;
```

`src/lib/auditoria/rotulos.ts`, em ordem alfabética dentro de `ROTULOS_ACAO_AUDITORIA` (depois de `ENCERRAR`):

```ts
  ESTORNAR: "Estornar",
```

- [ ] **Step 4: Escrever os testes que falham**

Em `src/server/services/baixa.test.ts`, acrescente `estornarBaixa` ao import de `./baixa`, `MSG_ESTORNO_CONCILIADA` e `MSG_ESTORNO_POR_QUEM_REGISTROU` também, e `cancelarParcela` ao import de `./titulo`. No fim do arquivo:

```ts
describe("estorno de baixa", () => {
  let fx: FixtureFinanceiro; // TESOURARIA, segregação desligada (padrão da fixture)
  let fxFinanceiro: FixtureFinanceiro; // FINANCEIRO: não estorna; também é a "outra filial"

  beforeAll(async () => {
    fx = await criarFixtureFinanceiro("BXE", "TESOURARIA");
    fxFinanceiro = await criarFixtureFinanceiro("BXEF");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fx);
    await limparFixtureFinanceiro(fxFinanceiro);
  });

  async function parcela(f: FixtureFinanceiro, valor: number) {
    const titulo = await criarTitulo(f.sessaoAdmin, "PAGAR", {
      contraparteId: f.fornecedorId,
      documento: `EST-${Date.now()}-${Math.random()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: f.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: f.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: valor }],
    });
    return titulo.parcelas[0];
  }

  async function baixaAprovada(f: FixtureFinanceiro, parcelaId: string, valor: number, contaBancariaId = f.contaBancariaId) {
    const baixa = await registrarBaixa(f.sessaoAdmin, parcelaId, {
      data: new Date(),
      valorPago: valor,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId,
    });
    await aprovarBaixa(f.sessaoAdmin, baixa.id);
    return baixa;
  }

  test("estorna: apaga o lançamento, marca a baixa e reabre a parcela", async () => {
    const p = await parcela(fx, 200);
    const baixa = await baixaAprovada(fx, p.id, 200);
    const lancamento = await prisma.lancamentoBancario.findFirstOrThrow({ where: { baixaId: baixa.id } });

    const estornada = await estornarBaixa(fx.sessao, baixa.id, "  conta errada  ");

    expect(estornada).toMatchObject({
      statusAprovacao: "ESTORNADO",
      estornadoPorId: fx.usuarioId,
      motivoEstorno: "conta errada",
    });
    expect(estornada.estornadoEm).toBeInstanceOf(Date);
    expect(await prisma.lancamentoBancario.count({ where: { baixaId: baixa.id } })).toBe(0);
    const depois = await prisma.parcela.findUniqueOrThrow({ where: { id: p.id } });
    expect(["EM_ABERTO", "A_VENCER", "VENCIDO"]).toContain(depois.status);

    const auditoria = await prisma.auditLog.findFirstOrThrow({ where: { entidadeId: baixa.id, acao: "ESTORNAR" } });
    expect(auditoria.valorAnterior).toMatchObject({
      statusAprovacao: "APROVADO",
      lancamentos: [{ id: lancamento.id, contaBancariaId: fx.contaBancariaId, tipo: "SAIDA", valor: "200" }],
    });
    expect(auditoria.valorNovo).toMatchObject({ statusAprovacao: "ESTORNADO", motivoEstorno: "conta errada" });
  });

  test("com outra baixa aprovada, a parcela fica PARCIALMENTE_PAGO", async () => {
    const p = await parcela(fx, 200);
    await baixaAprovada(fx, p.id, 100);
    const segunda = await baixaAprovada(fx, p.id, 100);
    expect((await prisma.parcela.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PAGO");

    await estornarBaixa(fx.sessao, segunda.id, "lançada em dobro");

    expect((await prisma.parcela.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PARCIALMENTE_PAGO");
  });

  test("só baixa aprovada: pendente, rejeitada e já estornada são recusadas", async () => {
    const p = await parcela(fx, 300);
    const pendente = await registrarBaixa(fx.sessaoAdmin, p.id, {
      data: new Date(),
      valorPago: 10,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fx.contaBancariaId,
    });
    await expect(estornarBaixa(fx.sessao, pendente.id, "teste")).rejects.toThrow(
      "Só baixas aprovadas podem ser estornadas",
    );

    await rejeitarBaixa(fx.sessaoAdmin, pendente.id, "não");
    await expect(estornarBaixa(fx.sessao, pendente.id, "teste")).rejects.toThrow(
      "Só baixas aprovadas podem ser estornadas",
    );

    const aprovada = await baixaAprovada(fx, p.id, 20);
    await estornarBaixa(fx.sessao, aprovada.id, "teste");
    await expect(estornarBaixa(fx.sessao, aprovada.id, "teste")).rejects.toThrow(
      "Só baixas aprovadas podem ser estornadas",
    );
  });

  test("lançamento conciliado bloqueia o estorno", async () => {
    const p = await parcela(fx, 150);
    const baixa = await baixaAprovada(fx, p.id, 150);
    const grupo = await prisma.grupoConciliacao.create({
      data: { filialId: fx.filialId, contaBancariaId: fx.contaBancariaId, usuarioId: fx.usuarioId },
    });
    await prisma.lancamentoBancario.updateMany({
      where: { baixaId: baixa.id },
      data: { grupoConciliacaoId: grupo.id, conciliado: true },
    });

    await expect(estornarBaixa(fx.sessao, baixa.id, "teste")).rejects.toThrow(MSG_ESTORNO_CONCILIADA);
    expect((await prisma.baixa.findUniqueOrThrow({ where: { id: baixa.id } })).statusAprovacao).toBe("APROVADO");
    expect(await prisma.lancamentoBancario.count({ where: { baixaId: baixa.id } })).toBe(1);
  });

  test("conta Caixa (conciliada sem extrato) pode ser estornada", async () => {
    const caixa = await prisma.contaBancaria.create({
      data: {
        filialId: fx.filialId,
        bancoId: fx.bancoId,
        agencia: "0000",
        conta: `CX-${Date.now()}`,
        tipo: "CAIXA",
        saldoInicial: 0,
      },
    });
    const p = await parcela(fx, 80);
    const baixa = await baixaAprovada(fx, p.id, 80, caixa.id);
    expect((await prisma.lancamentoBancario.findFirstOrThrow({ where: { baixaId: baixa.id } })).conciliado).toBe(true);

    await estornarBaixa(fx.sessao, baixa.id, "não foi pago em dinheiro");

    expect(await prisma.lancamentoBancario.count({ where: { baixaId: baixa.id } })).toBe(0);
  });

  test("parcela cancelada continua cancelada depois do estorno", async () => {
    const p = await parcela(fx, 100);
    const baixa = await baixaAprovada(fx, p.id, 50);
    await cancelarParcela(fx.sessaoAdmin, p.id);

    await estornarBaixa(fx.sessao, baixa.id, "teste");

    expect((await prisma.parcela.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("CANCELADO");
    expect(await prisma.lancamentoBancario.count({ where: { baixaId: baixa.id } })).toBe(0);
  });

  test("motivo vazio, perfil sem titulo:aprovar e baixa de outra filial são recusados", async () => {
    const p = await parcela(fx, 60);
    const baixa = await baixaAprovada(fx, p.id, 60);
    await expect(estornarBaixa(fx.sessao, baixa.id, "   ")).rejects.toThrow("Informe o motivo do estorno");
    await expect(estornarBaixa(fxFinanceiro.sessao, baixa.id, "teste")).rejects.toThrow(PermissionError);
    // fxFinanceiro.sessaoAdmin tem titulo:aprovar, mas está em outra filial.
    await expect(estornarBaixa(fxFinanceiro.sessaoAdmin, baixa.id, "teste")).rejects.toThrow();
    expect((await prisma.baixa.findUniqueOrThrow({ where: { id: baixa.id } })).statusAprovacao).toBe("APROVADO");
  });
});

describe("segregação no estorno", () => {
  let fx: FixtureFinanceiro; // TESOURARIA

  beforeAll(async () => {
    fx = await criarFixtureFinanceiro("BXES", "TESOURARIA");
    await prisma.empresa.update({ where: { id: fx.empresaId }, data: { exigirAprovacaoPorOutro: true } });
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fx);
  });

  /** Registrada por `fx.sessao` (Tesouraria) e aprovada pelo Administrador. */
  async function registradaPelaTesouraria() {
    const titulo = await criarTitulo(fx.sessaoAdmin, "PAGAR", {
      contraparteId: fx.fornecedorId,
      documento: `ESS-${Date.now()}-${Math.random()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fx.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fx.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });
    const baixa = await registrarBaixa(fx.sessao, titulo.parcelas[0].id, {
      data: new Date(),
      valorPago: 100,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fx.contaBancariaId,
    });
    await aprovarBaixa(fx.sessaoAdmin, baixa.id);
    return baixa;
  }

  test("quem registrou não estorna; baixa e lançamento ficam como estavam", async () => {
    const baixa = await registradaPelaTesouraria();
    await expect(estornarBaixa(fx.sessao, baixa.id, "teste")).rejects.toThrow(MSG_ESTORNO_POR_QUEM_REGISTROU);
    expect((await prisma.baixa.findUniqueOrThrow({ where: { id: baixa.id } })).statusAprovacao).toBe("APROVADO");
    expect(await prisma.lancamentoBancario.count({ where: { baixaId: baixa.id } })).toBe(1);
  });

  test("outra pessoa estorna, mesmo tendo aprovado", async () => {
    const baixa = await registradaPelaTesouraria();
    const estornada = await estornarBaixa(fx.sessaoAdmin, baixa.id, "teste");
    expect(estornada.statusAprovacao).toBe("ESTORNADO");
  });

  test("com a regra desligada, quem registrou estorna", async () => {
    await prisma.empresa.update({ where: { id: fx.empresaId }, data: { exigirAprovacaoPorOutro: false } });
    try {
      const baixa = await registradaPelaTesouraria();
      const estornada = await estornarBaixa(fx.sessao, baixa.id, "teste");
      expect(estornada.statusAprovacao).toBe("ESTORNADO");
    } finally {
      await prisma.empresa.update({ where: { id: fx.empresaId }, data: { exigirAprovacaoPorOutro: true } });
    }
  });
});
```

Observação: `valorAnterior.lancamentos[].valor` é gravado como string (`lancamento.valor.toString()`), porque o JSON da auditoria não guarda `Decimal`. Por isso o teste espera `"200"`.

- [ ] **Step 5: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/baixa.test.ts`
Expected: FAIL. `estornarBaixa` e as constantes `MSG_ESTORNO_*` não existem.

- [ ] **Step 6: Implementar**

Em `src/server/services/baixa.ts`, depois de `garantirAprovacaoPorOutraPessoa`:

```ts
export const MSG_ESTORNO_REPASSE =
  "Esta baixa é de um repasse de cartão: use Desfazer repasse em Repasses de cartão";
export const MSG_ESTORNO_CONCILIADA =
  "O lançamento desta baixa já foi conciliado. Desconcilie na Conciliação antes de estornar";
export const MSG_ESTORNO_POR_QUEM_REGISTROU =
  "Quem registrou a baixa não pode estorná-la. Peça a outra pessoa com permissão de aprovação.";
```

No fim do arquivo:

```ts
/**
 * Desfaz uma baixa aprovada (spec 2026-11-23-estorno-de-baixa): a baixa fica ESTORNADO, com
 * motivo, e continua no histórico; o lançamento que ela gerou é apagado e a parcela,
 * recalculada. Lançamento conciliado bloqueia (desconciliar antes), baixa de repasse
 * de cartão é desfeita em Repasses de cartão, e a segregação é a mesma da aprovação.
 */
export async function estornarBaixa(sessao: SessaoAtiva, baixaId: string, motivo: string) {
  requirePermission(sessao.perfil, "titulo:aprovar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length < 3) throw new Error("Informe o motivo do estorno");

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.baixa.findFirstOrThrow({
      where: { id: baixaId, parcela: { titulo: { filialId: sessao.filialId } } },
      include: {
        lancamentos: true,
        repasseRecebimento: { select: { id: true } },
        repasseTaxa: { select: { id: true } },
      },
    });
    if (anterior.statusAprovacao !== "APROVADO") throw new Error("Só baixas aprovadas podem ser estornadas");
    if (anterior.repasseRecebimento || anterior.repasseTaxa) throw new Error(MSG_ESTORNO_REPASSE);
    if (anterior.lancamentos.some((l) => l.grupoConciliacaoId !== null)) throw new Error(MSG_ESTORNO_CONCILIADA);
    // Depois das travas acima: baixa de repasse ou conciliada mostra o motivo que de fato a impede.
    if (anterior.usuarioId === sessao.usuarioId && (await exigeAprovacaoPorOutro(sessao.empresaId))) {
      throw new Error(MSG_ESTORNO_POR_QUEM_REGISTROU);
    }

    // Condicional: de dois estornos simultâneos, só um passa daqui.
    const { count: estornadas } = await tx.baixa.updateMany({
      where: { id: baixaId, statusAprovacao: "APROVADO" },
      data: {
        statusAprovacao: "ESTORNADO",
        estornadoPorId: sessao.usuarioId,
        estornadoEm: new Date(),
        motivoEstorno: motivoLimpo,
      },
    });
    if (estornadas !== 1) throw new Error("Esta baixa já foi estornada");

    // Só os que seguem fora de conciliação: se alguém conciliou no meio, a contagem não bate e tudo volta.
    const { count: apagados } = await tx.lancamentoBancario.deleteMany({
      where: { baixaId, grupoConciliacaoId: null },
    });
    if (apagados !== anterior.lancamentos.length) throw new Error(MSG_ESTORNO_CONCILIADA);

    await recalcularEPersistirStatusParcela(anterior.parcelaId, tx);

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Baixa",
        entidadeId: baixaId,
        acao: "ESTORNAR",
        anterior: {
          statusAprovacao: anterior.statusAprovacao,
          lancamentos: anterior.lancamentos.map((l) => ({
            id: l.id,
            contaBancariaId: l.contaBancariaId,
            data: l.data,
            tipo: l.tipo,
            valor: l.valor.toString(),
          })),
        },
        novo: { statusAprovacao: "ESTORNADO", motivoEstorno: motivoLimpo },
      },
      tx,
    );

    return tx.baixa.findUniqueOrThrow({ where: { id: baixaId } });
  });
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/baixa.test.ts src/lib/auditoria/rotulos.test.ts`
Expected: PASS. O teste de rótulos confirma que `ESTORNAR` tem rótulo. Rode também `npx tsc --noEmit`, esperando nenhum erro.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261123120000_estorno_baixa src/lib/schemas/enums.ts src/lib/auditoria/rotulos.ts src/server/services/baixa.ts src/server/services/baixa.test.ts
git commit -m "feat(financeiro): estorno de baixa aprovada no serviço

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Estorno junto de recepção, venda à vista e repasse

**Files:**
- Modify: `src/server/services/recepcaoFruto.ts` (duas consultas, ~linhas 247 e 274)
- Test: `src/server/services/recepcaoFruto.test.ts`, `src/server/services/pedidoVenda.test.ts`, `src/server/services/repasseCartao.test.ts`

**Interfaces:**
- Consumes: `estornarBaixa`, `MSG_ESTORNO_REPASSE` (Task 1)

- [ ] **Step 1: Testes que falham**

Em `src/server/services/recepcaoFruto.test.ts`, depois do teste `"cancelar é recusado com pagamento registrado"`, acrescente (o `cancelarRecepcao` e o `prisma` já estão importados):

```ts
  test("baixa estornada não impede cancelar a recepção", async () => {
    const r = await criarRecepcao(fx.sessao("PRODUCAO"), terceiro());
    const parcela = await prisma.parcela.findFirstOrThrow({ where: { tituloId: r.tituloId! } });
    const banco = await prisma.banco.findFirstOrThrow();
    const conta = await prisma.contaBancaria.create({
      data: { filialId: fx.filialAId, bancoId: banco.id, agencia: "1", conta: `E-${Date.now()}`, tipo: "CORRENTE" },
    });
    await prisma.baixa.create({
      data: {
        parcelaId: parcela.id,
        data: new Date("2026-11-10"),
        valorPago: 240,
        contaBancariaId: conta.id,
        usuarioId: fx.usuarioId,
        statusAprovacao: "ESTORNADO",
      },
    });
    await cancelarRecepcao(fx.sessao("PRODUCAO"), r.recepcaoId, "Erro");
    const recepcao = await prisma.recepcaoFruto.findUniqueOrThrow({ where: { id: r.recepcaoId } });
    expect(recepcao.status).toBe("CANCELADA");
  });
```

Em `src/server/services/pedidoVenda.test.ts`, troque o import `import { registrarBaixa, rejeitarBaixa } from "./baixa";` por `import { estornarBaixa, registrarBaixa, rejeitarBaixa } from "./baixa";` e, depois do teste `"Pix: lançamento não conciliado na conta de recebimento"`:

```ts
  test("venda à vista: estornar a baixa reabre a parcela e o pedido ainda pode ser cancelado", async () => {
    const lote = await novoLote();
    const r = await criarPedido(
      fx.sessao("VENDAS"),
      pedido([{ loteId: lote.id, quantidadeKg: 10, precoKg: 5 }], { formaPagamento: "PIX" }),
    );
    const gravado = await prisma.pedidoVenda.findUniqueOrThrow({ where: { id: r.pedidoId } });
    // A baixa automática é registrada por quem vendeu, o mesmo usuário da fixture: desliga a segregação.
    await prisma.empresa.update({ where: { id: fx.empresaId }, data: { exigirAprovacaoPorOutro: false } });
    try {
      await estornarBaixa(fx.sessao("TESOURARIA"), gravado.baixaAutomaticaId!, "conta errada");
    } finally {
      await prisma.empresa.update({ where: { id: fx.empresaId }, data: { exigirAprovacaoPorOutro: true } });
    }
    expect(await prisma.lancamentoBancario.count({ where: { baixaId: gravado.baixaAutomaticaId! } })).toBe(0);
    expect((await tituloDo(r.pedidoId)).parcelas[0].status).not.toBe("PAGO");

    await cancelarPedido(fx.sessao("FINANCEIRO"), r.pedidoId, "Cliente desistiu");
    expect((await prisma.pedidoVenda.findUniqueOrThrow({ where: { id: r.pedidoId } })).status).toBe("CANCELADO");
  });
```

Antes de escrever, confira o valor padrão de `exigirAprovacaoPorOutro` na empresa de `criarFixtureProducao` (`src/server/services/producaoTestFixtures.ts`). O padrão do schema é `true`; se a fixture definir outro valor, restaure esse valor no `finally`.

Em `src/server/services/repasseCartao.test.ts`, troque o import `import { MSG_BAIXA_MAQUININHA, registrarBaixa } from "./baixa";` por `import { estornarBaixa, MSG_BAIXA_MAQUININHA, MSG_ESTORNO_REPASSE, registrarBaixa } from "./baixa";` e, depois do teste `"desfazer volta a parcela para aberto; conciliado recusa"`:

```ts
  test("baixa de repasse não é estornada: o caminho é Desfazer repasse", async () => {
    const v = await vendaParcelada();
    await confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelas[0].id], d("2026-11-11"));
    const repasse = await prisma.repasseCartaoConfirmado.findUniqueOrThrow({ where: { parcelaId: v.parcelas[0].id } });

    await expect(estornarBaixa(fx.sessao("TESOURARIA"), repasse.baixaRecebimentoId, "teste")).rejects.toThrow(
      MSG_ESTORNO_REPASSE,
    );
    await expect(estornarBaixa(fx.sessao("TESOURARIA"), repasse.baixaTaxaId!, "teste")).rejects.toThrow(
      MSG_ESTORNO_REPASSE,
    );
  });
```

- [ ] **Step 2: Rodar e ver qual falha**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/server/services/recepcaoFruto.test.ts src/server/services/pedidoVenda.test.ts src/server/services/repasseCartao.test.ts`
Expected: falha só o teste da recepção ("A conta a pagar já tem pagamento registrado…"). Os de venda e repasse já passam: o serviço da Task 1 cobre os dois, e esses testes travam o comportamento.

- [ ] **Step 3: Corrigir a recepção**

Em `src/server/services/recepcaoFruto.ts`, nas duas consultas (`verificarCancelamento` e `situacoesParaCancelar`), troque:

```ts
statusAprovacao: { not: "REJEITADO" }
```

por:

```ts
statusAprovacao: { in: ["PENDENTE", "APROVADO"] }
```

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo do Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/recepcaoFruto.ts src/server/services/recepcaoFruto.test.ts src/server/services/pedidoVenda.test.ts src/server/services/repasseCartao.test.ts
git commit -m "fix(producao): baixa estornada não impede excluir a recepção

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Baixas da parcela nos dados da tela

**Files:**
- Modify: `src/server/services/titulo.ts:211` (`include` de `listarTitulos`)
- Modify: `src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.ts`
- Test: `src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.test.ts`

**Interfaces:**
- Produces (exportado de `titulos-para-cliente.ts`):

```ts
export type BaixaDaParcela = {
  id: string;
  data: Date;
  status: "APROVADO" | "ESTORNADO";
  valorPago: number;
  valorJuros: number;
  valorMulta: number;
  valorDesconto: number;
  /** Nome pronto (`nomeDaContaBancaria`). */
  conta: string;
  registradaPor: string;
  aprovadaPor: string | null;
  estornadaPor: string | null;
  estornadaEm: Date | null;
  motivoEstorno: string | null;
  /** Algum lançamento da baixa está num grupo de conciliação. */
  conciliada: boolean;
  /** Baixa criada pela confirmação de um repasse de cartão. */
  deRepasse: boolean;
};
```

Cada parcela de `titulosParaCliente(...)` passa a ter `baixas: BaixaDaParcela[]`, só com as aprovadas e as estornadas, em ordem de `data` e depois de `criadoEm`.

- [ ] **Step 1: Teste que falha**

Substitua o conteúdo de `titulos-para-cliente.test.ts` por:

```ts
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { titulosParaCliente } from "./titulos-para-cliente";

const vencimento = new Date("2026-11-10T00:00:00.000Z");
const conta = { tipo: "CORRENTE", agencia: "0001", conta: "123-4", banco: { nome: "Banco X" } };
const dec = (valor: string) => new Prisma.Decimal(valor);

function baixa(id: string, statusAprovacao: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    data: new Date("2026-10-15T00:00:00.000Z"),
    criadoEm: new Date("2026-10-15T13:00:00.000Z"),
    statusAprovacao,
    valorPago: dec("1012.00"),
    valorJuros: dec("12.00"),
    valorMulta: dec("0"),
    valorDesconto: dec("0"),
    contaBancaria: conta,
    usuario: { nome: "Maria" },
    avaliadoPor: { nome: "João" },
    estornadoPor: null,
    estornadoEm: null,
    motivoEstorno: null,
    lancamentos: [{ grupoConciliacaoId: null }],
    repasseRecebimento: null,
    repasseTaxa: null,
    ...extra,
  };
}

const tituloDoServico = {
  id: "t1",
  documento: "NF 1",
  contaBancaria: {
    tipo: "CORRENTE",
    agencia: "0001",
    conta: "123-4",
    saldoInicial: dec("1000.00"),
    banco: { nome: "Banco X", codigo: "001" },
  },
  parcelas: [
    {
      id: "p1",
      numero: 1,
      dataVencimento: vencimento,
      valorOriginal: dec("150.00"),
      valorAtualizado: dec("150.25"),
      status: "ABERTA",
      baixas: [] as ReturnType<typeof baixa>[],
    },
  ],
};

describe("titulosParaCliente", () => {
  it("converte valorAtualizado para number e descarta campos Decimal não usados", () => {
    const [titulo] = titulosParaCliente([tituloDoServico]);

    expect(titulo.parcelas).toEqual([
      { id: "p1", numero: 1, dataVencimento: vencimento, valorAtualizado: 150.25, status: "ABERTA", baixas: [] },
    ]);
    expect(titulo.contaBancaria).toEqual({ tipo: "CORRENTE", agencia: "0001", conta: "123-4", banco: { nome: "Banco X" } });
    expect(titulo.documento).toBe("NF 1");
  });

  it("leva só as baixas aprovadas e estornadas, convertidas", () => {
    const estornadaEm = new Date("2026-10-16T12:40:00.000Z");
    const parcela = {
      ...tituloDoServico.parcelas[0],
      baixas: [
        baixa("pendente", "PENDENTE"),
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

    expect(titulo.parcelas[0].baixas).toEqual([
      {
        id: "estornada",
        data: new Date("2026-10-15T00:00:00.000Z"),
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

  it("marca conciliada e de repasse", () => {
    const parcela = {
      ...tituloDoServico.parcelas[0],
      baixas: [
        baixa("conciliada", "APROVADO", { lancamentos: [{ grupoConciliacaoId: "g1" }] }),
        baixa("repasse", "APROVADO", { repasseTaxa: { id: "r1" } }),
      ],
    };
    const [titulo] = titulosParaCliente([{ ...tituloDoServico, parcelas: [parcela] }]);
    const [conciliada, repasse] = titulo.parcelas[0].baixas;
    expect(conciliada).toMatchObject({ conciliada: true, deRepasse: false });
    expect(repasse).toMatchObject({ conciliada: false, deRepasse: true });
  });

  it("não sobra nenhum Decimal no resultado", () => {
    const parcela = { ...tituloDoServico.parcelas[0], baixas: [baixa("aprovada", "APROVADO")] };
    const resultado = titulosParaCliente([{ ...tituloDoServico, parcelas: [parcela] }]);
    const temDecimal = (valor: unknown): boolean =>
      Prisma.Decimal.isDecimal(valor) ||
      (typeof valor === "object" && valor !== null && !(valor instanceof Date) && Object.values(valor).some(temDecimal));
    expect(temDecimal(resultado)).toBe(false);
  });

  it("mantém contaBancaria nula", () => {
    const [titulo] = titulosParaCliente([{ ...tituloDoServico, contaBancaria: null }]);
    expect(titulo.contaBancaria).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run "src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.test.ts"`
Expected: FAIL. Falta `baixas` nas parcelas.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `titulos-para-cliente.ts` por:

```ts
import { nomeDaContaBancaria } from "@/lib/contaBancaria";

type ValorDecimal = number | string | { toString(): string };

type ContaDoServico = { tipo: string; agencia: string; conta: string; banco: { nome: string } };

type BaixaDoServico = {
  id: string;
  data: Date;
  criadoEm: Date;
  statusAprovacao: string;
  valorPago: ValorDecimal;
  valorJuros: ValorDecimal;
  valorMulta: ValorDecimal;
  valorDesconto: ValorDecimal;
  contaBancaria: ContaDoServico;
  usuario: { nome: string };
  avaliadoPor: { nome: string } | null;
  estornadoPor: { nome: string } | null;
  estornadoEm: Date | null;
  motivoEstorno: string | null;
  lancamentos: { grupoConciliacaoId: string | null }[];
  repasseRecebimento: { id: string } | null;
  repasseTaxa: { id: string } | null;
};

type TituloDoServico = {
  contaBancaria: ContaDoServico | null;
  parcelas: {
    id: string;
    numero: number;
    dataVencimento: Date;
    valorAtualizado: ValorDecimal;
    status: string;
    baixas: BaixaDoServico[];
  }[];
};

export type BaixaDaParcela = {
  id: string;
  data: Date;
  status: "APROVADO" | "ESTORNADO";
  valorPago: number;
  valorJuros: number;
  valorMulta: number;
  valorDesconto: number;
  /** Nome pronto (`nomeDaContaBancaria`). */
  conta: string;
  registradaPor: string;
  aprovadaPor: string | null;
  estornadaPor: string | null;
  estornadaEm: Date | null;
  motivoEstorno: string | null;
  /** Algum lançamento da baixa está num grupo de conciliação. */
  conciliada: boolean;
  /** Baixa criada pela confirmação de um repasse de cartão. */
  deRepasse: boolean;
};

const numero = (valor: ValorDecimal) => Number(valor.toString());

/** Só as que mexeram no saldo: aprovadas e estornadas (pendentes e rejeitadas são os itens 4 e 5 do backlog). */
function baixasParaCliente(baixas: BaixaDoServico[]): BaixaDaParcela[] {
  return baixas
    .filter((b) => b.statusAprovacao === "APROVADO" || b.statusAprovacao === "ESTORNADO")
    .sort((a, b) => a.data.getTime() - b.data.getTime() || a.criadoEm.getTime() - b.criadoEm.getTime())
    .map((b) => ({
      id: b.id,
      data: b.data,
      status: b.statusAprovacao as "APROVADO" | "ESTORNADO",
      valorPago: numero(b.valorPago),
      valorJuros: numero(b.valorJuros),
      valorMulta: numero(b.valorMulta),
      valorDesconto: numero(b.valorDesconto),
      conta: nomeDaContaBancaria(b.contaBancaria),
      registradaPor: b.usuario.nome,
      aprovadaPor: b.avaliadoPor?.nome ?? null,
      estornadaPor: b.estornadoPor?.nome ?? null,
      estornadaEm: b.estornadoEm,
      motivoEstorno: b.motivoEstorno,
      conciliada: b.lancamentos.some((l) => l.grupoConciliacaoId !== null),
      deRepasse: b.repasseRecebimento !== null || b.repasseTaxa !== null,
    }));
}

/**
 * Prepara o retorno de `listarTitulos` para a tabela (Client Component): o
 * `Decimal` do Prisma não é um "plain object" e gera aviso na serialização.
 * Converte os valores para `number` e descarta o que a tela não usa
 * (colunas da conta bancária como `saldoInicial`, baixas pendentes e rejeitadas).
 */
export function titulosParaCliente<T extends TituloDoServico>(titulos: T[]) {
  return titulos.map(({ contaBancaria, parcelas, ...titulo }) => ({
    ...titulo,
    contaBancaria: contaBancaria
      ? {
          tipo: contaBancaria.tipo,
          agencia: contaBancaria.agencia, conta: contaBancaria.conta, banco: { nome: contaBancaria.banco.nome } }
      : null,
    parcelas: parcelas.map((parcela) => ({
      id: parcela.id,
      numero: parcela.numero,
      dataVencimento: parcela.dataVencimento,
      valorAtualizado: numero(parcela.valorAtualizado),
      status: parcela.status,
      baixas: baixasParaCliente(parcela.baixas),
    })),
  }));
}
```

Em `src/server/services/titulo.ts:211`, troque:

```ts
  parcelas: { include: { baixas: true }, orderBy: { numero: "asc" } },
```

por:

```ts
  parcelas: {
    include: {
      // A tela lista as baixas na parcela (aprovadas e estornadas) com conta, pessoas e se dá para estornar.
      baixas: {
        include: {
          contaBancaria: { include: { banco: true } },
          usuario: { select: { nome: true } },
          avaliadoPor: { select: { nome: true } },
          estornadoPor: { select: { nome: true } },
          lancamentos: { select: { grupoConciliacaoId: true } },
          repasseRecebimento: { select: { id: true } },
          repasseTaxa: { select: { id: true } },
        },
      },
    },
    orderBy: { numero: "asc" },
  },
```

`sincronizarStatusDasParcelas` continua usando `baixa.statusAprovacao` e `baixa.valorPago`, que seguem no resultado.

- [ ] **Step 4: Rodar e ver passar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run "src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.test.ts" src/server/services/titulo.test.ts`
Expected: PASS. Em seguida `npx tsc --noEmit`. Pode acusar erro em `titulo-table.tsx`, porque `ParcelaLinha` ainda não tem `baixas`; o tipo é estrutural e a parcela com um campo a mais costuma passar. Se acusar, a Task 4 resolve: anote e siga.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/titulo.ts "src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.ts" "src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.test.ts"
git commit -m "feat(financeiro): baixas aprovadas e estornadas nos dados das parcelas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Lista de baixas na parcela e diálogo de estorno

**Files:**
- Create: `src/app/(dashboard)/financeiro/_titulos/baixas-da-parcela.tsx`
- Create: `src/app/(dashboard)/financeiro/_titulos/baixas-da-parcela.test.ts`
- Create: `src/app/(dashboard)/financeiro/_titulos/estornar-dialog.tsx`
- Modify: `src/app/(dashboard)/financeiro/_titulos/actions.ts`
- Modify: `src/app/(dashboard)/financeiro/_titulos/titulo-table.tsx`
- Modify: `src/app/(dashboard)/financeiro/_titulos/contas-client-panel.tsx`
- Modify: `src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx`, `src/app/(dashboard)/financeiro/contas-a-receber/page.tsx`

**Interfaces:**
- Consumes: `BaixaDaParcela` (Task 3), `estornarBaixa` (Task 1)
- Produces:
  - `BaixasDaParcela({ baixas, podeEstornar, onEstornar }: { baixas: BaixaDaParcela[]; podeEstornar: boolean; onEstornar: (baixa: BaixaDaParcela) => void })`
  - `textoDosAjustes(baixa: Pick<BaixaDaParcela, "valorJuros" | "valorMulta" | "valorDesconto">): string`
  - `EstornarDialog({ tipo, baixa, onOpenChange }: { tipo: TipoTitulo; baixa: BaixaDaParcela | null; onOpenChange: (aberto: boolean) => void })`
  - `estornarBaixaAction(tipo: TipoTitulo, baixaId: string, motivo: string): Promise<FormState>`

- [ ] **Step 1: Teste que falha**

Crie `baixas-da-parcela.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { BaixasDaParcela, textoDosAjustes } from "./baixas-da-parcela";
import type { BaixaDaParcela } from "./titulos-para-cliente";

const aprovada: BaixaDaParcela = {
  id: "b1",
  data: new Date("2026-10-15T00:00:00.000Z"),
  status: "APROVADO",
  valorPago: 1012,
  valorJuros: 12,
  valorMulta: 0,
  valorDesconto: 0,
  conta: "Sicredi - Ag 0101/CC 98765-4",
  registradaPor: "Maria",
  aprovadaPor: "João",
  estornadaPor: null,
  estornadaEm: null,
  motivoEstorno: null,
  conciliada: false,
  deRepasse: false,
};

const html = (baixas: BaixaDaParcela[], podeEstornar = true) =>
  renderToStaticMarkup(createElement(BaixasDaParcela, { baixas, podeEstornar, onEstornar: () => {} }));

describe("BaixasDaParcela", () => {
  test("mostra data, conta, valor, ajustes e quem registrou e aprovou", () => {
    const saida = html([aprovada]);
    expect(saida).toContain("Baixa de 15/10/2026");
    expect(saida).toContain("Sicredi - Ag 0101/CC 98765-4");
    expect(saida).toContain("+ juros R$");
    expect(saida).toContain("registrada por Maria · aprovada por João");
    expect(saida).toContain(">Estornar<");
  });

  test("sem permissão, nem botão nem explicação", () => {
    const saida = html([{ ...aprovada, conciliada: true }], false);
    expect(saida).not.toContain(">Estornar<");
    expect(saida).not.toContain("desconcilie");
  });

  test("conciliada e de repasse trocam o botão pelo motivo", () => {
    expect(html([{ ...aprovada, conciliada: true }])).toContain("Conciliada: desconcilie antes de estornar");
    expect(html([{ ...aprovada, deRepasse: true }])).toContain("Repasse de cartão: desfaça em Repasses de cartão");
    expect(html([{ ...aprovada, conciliada: true }])).not.toContain(">Estornar<");
  });

  test("estornada: selo, quem, quando (Brasília) e motivo, sem ações", () => {
    const saida = html([
      {
        ...aprovada,
        status: "ESTORNADO",
        estornadaPor: "João",
        estornadaEm: new Date("2026-10-16T12:40:00.000Z"),
        motivoEstorno: "conta errada",
      },
    ]);
    expect(saida).toContain("Estornada");
    expect(saida).toContain("estornada por João em 16/10/2026 09:40: conta errada");
    expect(saida).not.toContain(">Estornar<");
  });
});

describe("textoDosAjustes", () => {
  test("só os ajustes diferentes de zero", () => {
    expect(textoDosAjustes({ valorJuros: 0, valorMulta: 0, valorDesconto: 0 })).toBe("");
    expect(textoDosAjustes({ valorJuros: 12, valorMulta: 2, valorDesconto: 5 })).toMatch(
      /^\+ juros R\$\s12,00 · \+ multa R\$\s2,00 · − desconto R\$\s5,00$/,
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run "src/app/(dashboard)/financeiro/_titulos/baixas-da-parcela.test.ts"`
Expected: FAIL. O módulo não existe.

- [ ] **Step 3: Componente da lista**

Crie `baixas-da-parcela.tsx`:

```tsx
"use client";
// Espelhado na ajuda (src/ajuda/_titulos/cenas.tsx): mudou rótulo ou texto? Ajuste a ajuda junto.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatacao";
import type { BaixaDaParcela } from "./titulos-para-cliente";

/** "+ juros R$ 12,00 · − desconto R$ 5,00": só os ajustes diferentes de zero. */
export function textoDosAjustes(baixa: Pick<BaixaDaParcela, "valorJuros" | "valorMulta" | "valorDesconto">): string {
  return [
    baixa.valorJuros > 0 ? `+ juros ${formatarMoeda(baixa.valorJuros)}` : null,
    baixa.valorMulta > 0 ? `+ multa ${formatarMoeda(baixa.valorMulta)}` : null,
    baixa.valorDesconto > 0 ? `− desconto ${formatarMoeda(baixa.valorDesconto)}` : null,
  ]
    .filter((ajuste) => ajuste !== null)
    .join(" · ");
}

function AcaoDoEstorno({ baixa, onEstornar }: { baixa: BaixaDaParcela; onEstornar: (baixa: BaixaDaParcela) => void }) {
  if (baixa.deRepasse) {
    return <span className="text-xs text-muted-foreground">Repasse de cartão: desfaça em Repasses de cartão</span>;
  }
  if (baixa.conciliada) {
    return <span className="text-xs text-muted-foreground">Conciliada: desconcilie antes de estornar</span>;
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => onEstornar(baixa)}>
      Estornar
    </Button>
  );
}

/** As baixas aprovadas e estornadas de uma parcela, com o estorno para quem pode aprovar. */
export function BaixasDaParcela({
  baixas,
  podeEstornar,
  onEstornar,
}: {
  baixas: BaixaDaParcela[];
  podeEstornar: boolean;
  onEstornar: (baixa: BaixaDaParcela) => void;
}) {
  return (
    <div className="space-y-1 text-sm">
      <div className="text-xs font-medium text-muted-foreground">Baixas</div>
      <ul className="space-y-2">
        {baixas.map((baixa) => {
          const estornada = baixa.status === "ESTORNADO";
          const ajustes = textoDosAjustes(baixa);
          return (
            <li key={baixa.id} className="flex flex-wrap items-start justify-between gap-2">
              <div className={estornada ? "text-muted-foreground" : undefined}>
                <p>
                  Baixa de {formatarData(baixa.data)} · {baixa.conta} ·{" "}
                  <span className={estornada ? "line-through" : "font-medium"}>{formatarMoeda(baixa.valorPago)}</span>
                  {ajustes ? ` (${ajustes})` : null}
                  {estornada && (
                    <Badge variant="secondary" className="ml-2">
                      Estornada
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  registrada por {baixa.registradaPor}
                  {baixa.aprovadaPor ? ` · aprovada por ${baixa.aprovadaPor}` : null}
                </p>
                {estornada && baixa.estornadaEm && (
                  <p className="text-xs">
                    estornada por {baixa.estornadaPor} em {formatarDataHora(baixa.estornadaEm)}: {baixa.motivoEstorno}
                  </p>
                )}
              </div>
              {!estornada && podeEstornar && <AcaoDoEstorno baixa={baixa} onEstornar={onEstornar} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo do Step 2.
Expected: PASS. Se `"registrada por Maria · aprovada por João"` falhar por o React inserir `<!-- -->` entre os textos, junte cada linha numa template string única: `{`registrada por ${baixa.registradaPor}${baixa.aprovadaPor ? ` · aprovada por ${baixa.aprovadaPor}` : ""}`}`. Faça o mesmo com a linha "estornada por … em …: …" e com "Baixa de … · … ·".

- [ ] **Step 5: Server action**

Em `src/app/(dashboard)/financeiro/_titulos/actions.ts`, depois de `registrarBaixaAction`:

```ts
export async function estornarBaixaAction(tipo: TipoTitulo, baixaId: string, motivo: string): Promise<FormState> {
  const sessao = await requireSessaoAtiva();

  try {
    await baixaService.estornarBaixa(sessao, baixaId, motivo);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath(rotaPara(tipo));
  return { sucesso: true };
}
```

- [ ] **Step 6: Diálogo**

Crie `estornar-dialog.tsx`:

```tsx
"use client";
// Espelhado na ajuda (src/ajuda/_titulos/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TipoTitulo } from "@prisma/client";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { estornarBaixaAction } from "./actions";
import type { BaixaDaParcela } from "./titulos-para-cliente";

export function EstornarDialog({
  tipo,
  baixa,
  onOpenChange,
}: {
  tipo: TipoTitulo;
  baixa: BaixaDaParcela | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string>();
  const [pendente, iniciarTransicao] = useTransition();

  function mudarAbertura(aberto: boolean) {
    if (!aberto) {
      setMotivo("");
      setErro(undefined);
    }
    onOpenChange(aberto);
  }

  function confirmar() {
    if (!baixa) return;
    iniciarTransicao(async () => {
      const resultado = await estornarBaixaAction(tipo, baixa.id, motivo);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      mudarAbertura(false);
    });
  }

  return (
    <Dialog open={baixa !== null} onOpenChange={mudarAbertura}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Estornar baixa</DialogTitle>
        </DialogHeader>
        {baixa && (
          <div className="space-y-4 text-sm">
            <p>{`Baixa de ${formatarData(baixa.data)} · ${baixa.conta} · ${formatarMoeda(baixa.valorPago)}`}</p>
            <p className="text-muted-foreground">
              {`O lançamento sai da conta ${baixa.conta} e a parcela volta a ficar em aberto. ` +
                "A baixa continua no histórico como estornada."}
            </p>
            <div className="space-y-2">
              <Label htmlFor="motivo-estorno">Motivo</Label>
              <Input
                id="motivo-estorno"
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                placeholder="Ex.: lançada na conta errada"
              />
            </div>
            {erro ? (
              <p className="text-sm text-destructive" role="alert">
                {erro}
              </p>
            ) : null}
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              disabled={pendente || motivo.trim().length < 3}
              onClick={confirmar}
            >
              {pendente ? "Estornando..." : "Estornar baixa"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: Ligar na tabela**

Em `titulo-table.tsx`:

1. Imports: `import { BaixasDaParcela } from "./baixas-da-parcela";` e `import type { BaixaDaParcela } from "./titulos-para-cliente";`.
2. `ParcelaLinha` ganha `baixas: BaixaDaParcela[];`.
3. Props de `TituloTable`: acrescente `podeAprovar: boolean;` e `onAbrirEstorno: (baixa: BaixaDaParcela) => void;` (na desestruturação e no tipo).
4. No `titulo.parcelas.map((parcela) => (...))`, troque o retorno de um `<TableRow>` por um `<Fragment key={parcela.id}>` com o `<TableRow>` atual (tire o `key` dele) e, logo depois:

```tsx
                    {parcela.baixas.length > 0 && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={5} className="pl-12">
                          <BaixasDaParcela
                            baixas={parcela.baixas}
                            podeEstornar={podeAprovar}
                            onEstornar={onAbrirEstorno}
                          />
                        </TableCell>
                      </TableRow>
                    )}
```

`Fragment` já está importado de `react` no arquivo.

Em `contas-client-panel.tsx`:

1. Imports: `import { EstornarDialog } from "./estornar-dialog";` e `import type { BaixaDaParcela } from "./titulos-para-cliente";`.
2. Prop nova `podeAprovar: boolean` (no tipo e na desestruturação).
3. Estado: `const [baixaEstorno, setBaixaEstorno] = useState<BaixaDaParcela | null>(null);`
4. No `<TituloTable ...>`: `podeAprovar={podeAprovar}` e `onAbrirEstorno={setBaixaEstorno}`.
5. Depois do `<RenegociarDialog .../>`:

```tsx
      <EstornarDialog
        tipo={tipo}
        baixa={baixaEstorno}
        onOpenChange={(aberto) => !aberto && setBaixaEstorno(null)}
      />
```

Nas duas páginas (`contas-a-pagar/page.tsx` e `contas-a-receber/page.tsx`):

1. No import de `@/server/auth/permissions`, acrescente `podeAprovarBaixa`.
2. Depois de `const podeBaixar = ...`: `const podeAprovar = podeAprovarBaixa(sessao.perfil, sessao.podeAlterarFilial);`
3. No `<ContasClientePanel ...>`: `podeAprovar={podeAprovar}`.

- [ ] **Step 8: Verificar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx tsc --noEmit; npm run lint; npx vitest run "src/app/(dashboard)/financeiro/_titulos"`
Expected: sem erros de tipo nem de lint; testes PASS.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(dashboard)/financeiro/_titulos" "src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx" "src/app/(dashboard)/financeiro/contas-a-receber/page.tsx"
git commit -m "feat(financeiro): estornar baixa na parcela de Contas a pagar e a receber

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ajuda — roteiro de estorno e textos da aprovação

**Files:**
- Modify: `src/ajuda/_titulos/exemplo.ts`, `src/ajuda/_titulos/alvos.ts`, `src/ajuda/_titulos/cenas.tsx`
- Modify: `src/ajuda/_titulos/cenas.test.ts`
- Modify: `src/ajuda/contas-a-pagar/exemplo.ts`, `src/ajuda/contas-a-pagar/roteiros.ts`, `src/ajuda/contas-a-pagar/roteiros.test.ts`
- Modify: `src/ajuda/contas-a-receber/exemplo.ts`, `src/ajuda/contas-a-receber/roteiros.ts`, `src/ajuda/contas-a-receber/roteiros.test.ts`
- Modify: `src/ajuda/aprovacoes/roteiros.ts`

**Interfaces:**
- Consumes: os textos da tela da Task 4 ("Baixas", "Baixa de … · … · …", "registrada por … · aprovada por …", "Estornada", "estornada por … em …: …", "Estornar", "Estornar baixa", "Motivo" e o aviso do diálogo). A cena tem que repetir esses textos.
- Produces: alvos `lista.p1.baixa`, `lista.p1.estornar`; cena `estornar` com alvos `estorno.resumo`, `estorno.motivo`, `estorno.confirmar`; valor `"lista.p1.baixa"` = `"aprovada" | "estornada"`.

- [ ] **Step 1: Tipo e dados do exemplo**

Em `src/ajuda/_titulos/exemplo.ts`, no tipo `ExemploTitulos`, depois de `renegociacao`:

```ts
  /** Baixa aprovada da parcela 1, lançada na conta errada: a história do roteiro de estorno. */
  baixa: BaixaExemplo;
```

e, no fim do arquivo:

```ts
type BaixaExemplo = {
  data: string;
  /** A conta errada, onde a baixa foi lançada. */
  conta: string;
  valorFormatado: string;
  /** Como a tela mostra os ajustes: "+ juros R$ 12,00". */
  ajuste: string;
  registradaPor: string;
  aprovadaPor: string;
  estornadaPor: string;
  /** Data e hora no horário de Brasília: "16/10/2026 09:40". */
  estornadaEm: string;
  motivoEstorno: string;
};
```

Em `src/ajuda/contas-a-pagar/exemplo.ts`, depois de `renegociacao: [...]`:

```ts
  baixa: {
    data: "15/10/2026",
    conta: "Sicredi — CC 98765-4",
    valorFormatado: "R$ 1.012,00",
    ajuste: "+ juros R$ 12,00",
    registradaPor: "Maria",
    aprovadaPor: "João",
    estornadaPor: "João",
    estornadaEm: "16/10/2026 09:40",
    motivoEstorno: "Conta errada: o pagamento saiu do Banco do Brasil",
  },
```

Em `src/ajuda/contas-a-receber/exemplo.ts`, no mesmo lugar:

```ts
  baixa: {
    data: "15/10/2026",
    conta: "Sicredi — CC 98765-4",
    valorFormatado: "R$ 15.060,00",
    ajuste: "+ juros R$ 60,00",
    registradaPor: "Maria",
    aprovadaPor: "João",
    estornadaPor: "João",
    estornadaEm: "16/10/2026 09:40",
    motivoEstorno: "Conta errada: o PIX entrou no Banco do Brasil",
  },
```

- [ ] **Step 2: Alvos**

Em `src/ajuda/_titulos/alvos.ts`, na lista `lista`, depois de `"lista.p1.baixar",`:

```ts
    "lista.p1.baixa",
    "lista.p1.estornar",
```

e, depois da chave `renegociar`:

```ts
  estornar: ["estorno.resumo", "estorno.motivo", "estorno.confirmar"],
```

- [ ] **Step 3: Testes de cena que falham**

Em `src/ajuda/_titulos/cenas.test.ts`, troque a desestruturação por:

```ts
const {
  lista: CenaLista,
  novoTitulo: CenaNovoTitulo,
  baixa: CenaBaixa,
  renegociar: CenaRenegociar,
  estornar: CenaEstornar,
} = criarCenas("PAGAR", EXEMPLO);
```

e acrescente dentro do `describe`:

```ts
  test("baixa aprovada aparece embaixo da parcela 1, que fica PAGO e sem Baixar", () => {
    const saida = html(CenaLista, { "lista.linhaExemplo": "expandida", "lista.p1.baixa": "aprovada" });
    expect(saida).toContain('data-alvo="lista.p1.baixa"');
    expect(saida).toContain('data-alvo="lista.p1.estornar"');
    expect(saida).toContain("Baixa de 15/10/2026 · Sicredi — CC 98765-4");
    expect(saida).toContain("registrada por Maria · aprovada por João");
    expect(saida).not.toContain('data-alvo="lista.p1.baixar"');
  });

  test("baixa estornada: selo e motivo, sem Estornar, e a parcela volta a ter Baixar", () => {
    const saida = html(CenaLista, { "lista.linhaExemplo": "expandida", "lista.p1.baixa": "estornada" });
    expect(saida).toContain("Estornada");
    expect(saida).toContain("estornada por João em 16/10/2026 09:40: Conta errada");
    expect(saida).not.toContain('data-alvo="lista.p1.estornar"');
    expect(saida).toContain('data-alvo="lista.p1.baixar"');
  });

  test("sem baixa no roteiro, a parcela 1 não mostra a lista", () => {
    expect(html(CenaLista, { "lista.linhaExemplo": "expandida" })).not.toContain('data-alvo="lista.p1.baixa"');
  });

  test("estorno tem o resumo, o aviso e o botão da tela real", () => {
    const saida = html(CenaEstornar);
    expect(saida).toContain("Estornar baixa");
    expect(saida).toContain("Baixa de 15/10/2026 · Sicredi — CC 98765-4 · R$ 1.012,00");
    expect(saida).toContain("a parcela volta a ficar em aberto");
  });
```

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/ajuda/_titulos/cenas.test.ts`
Expected: FAIL (a cena `estornar` não existe; a lista não mostra baixa).

- [ ] **Step 4: Cenas**

Em `src/ajuda/_titulos/cenas.tsx`:

1. No topo, `import { Fragment } from "react";`.
2. Antes de `function LinhasDoExemplo`:

```tsx
/** A baixa da parcela 1 no roteiro de estorno: aprovada (com Estornar) ou já estornada. */
function BaixaDoExemplo({ estado, exemplo }: { estado: string; exemplo: ExemploTitulos }) {
  const { baixa } = exemplo;
  const estornada = estado === "estornada";
  return (
    <div className="space-y-1 text-sm">
      <div className="text-xs font-medium text-muted-foreground">Baixas</div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Alvo nome="lista.p1.baixa" className={estornada ? "p-1 text-muted-foreground" : "p-1"}>
          <p>
            {`Baixa de ${baixa.data} · ${baixa.conta} · `}
            <span className={estornada ? "line-through" : "font-medium"}>{baixa.valorFormatado}</span>
            {` (${baixa.ajuste})`}
            {estornada && (
              <Badge variant="secondary" className="ml-2">
                Estornada
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {`registrada por ${baixa.registradaPor} · aprovada por ${baixa.aprovadaPor}`}
          </p>
          {estornada && (
            <p className="text-xs">{`estornada por ${baixa.estornadaPor} em ${baixa.estornadaEm}: ${baixa.motivoEstorno}`}</p>
          )}
        </Alvo>
        {!estornada && (
          <BotaoSimulado alvo="lista.p1.estornar" variant="outline" size="sm">
            Estornar
          </BotaoSimulado>
        )}
      </div>
    </div>
  );
}
```

3. Em `LinhasDoExemplo`, logo depois de `const expandido = ...`:

```tsx
  // Só o roteiro de estorno define: "aprovada" (parcela 1 paga) ou "estornada" (volta ao status do exemplo).
  const estadoBaixa = valores["lista.p1.baixa"];
```

4. No `exemplo.parcelas.map((parcela) => { ... })`:
   - Depois de `const p = ...`, acrescente:

```tsx
            const paga = parcela.numero === 1 && estadoBaixa === "aprovada";
            const status = paga ? "PAGO" : parcela.status;
```

   - Troque o `return (<TableRow key={parcela.numero} ...>...</TableRow>);` por `return (<Fragment key={parcela.numero}> ... </Fragment>);`, com o `<TableRow>` sem `key`, o `Badge` usando `status` no lugar de `parcela.status` (nas duas ocorrências: `variant` e texto), e as ações dentro de `{!paga && (<div className="flex flex-wrap items-center justify-end gap-2">…</div>)}` (parcela PAGO não tem botões, como na tela real). Depois do `<TableRow>`, dentro do Fragment:

```tsx
                {parcela.numero === 1 && estadoBaixa && (
                  <TableRow className="bg-muted/30">
                    <TableCell colSpan={5} className="pl-12">
                      <BaixaDoExemplo estado={estadoBaixa} exemplo={exemplo} />
                    </TableCell>
                  </TableRow>
                )}
```

5. Depois de `function CenaRenegociar`:

```tsx
function CenaEstornar({ valores, exemplo }: PropsCena & Pick<ComExemplo, "exemplo">) {
  const { baixa } = exemplo;
  return (
    <JanelaSimulada titulo="Estornar baixa">
      <Alvo nome="estorno.resumo" className="space-y-2 p-1">
        <p>{`Baixa de ${baixa.data} · ${baixa.conta} · ${baixa.valorFormatado}`}</p>
        <p className="text-muted-foreground">
          {`O lançamento sai da conta ${baixa.conta} e a parcela volta a ficar em aberto. ` +
            "A baixa continua no histórico como estornada."}
        </p>
      </Alvo>
      <CampoSimulado
        alvo="estorno.motivo"
        rotulo="Motivo"
        valor={valores["estorno.motivo"]}
        placeholder="Ex.: lançada na conta errada"
      />
      <BotaoSimulado alvo="estorno.confirmar" variant="destructive" largo>
        Estornar baixa
      </BotaoSimulado>
    </JanelaSimulada>
  );
}
```

6. Em `criarCenas`, depois de `renegociar`:

```tsx
    estornar: function Estornar(props: PropsCena) {
      return <CenaEstornar {...props} exemplo={exemplo} />;
    },
```

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/ajuda/_titulos/cenas.test.ts`
Expected: PASS.

- [ ] **Step 5: Testes de roteiro que falham**

Em `src/ajuda/contas-a-pagar/roteiros.test.ts`, troque o primeiro teste por:

```ts
  test("são os 7 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual([
      "cadastrar-titulo",
      "pagar-parcela",
      "estornar-baixa",
      "mudar-vencimento",
      "renegociar",
      "cancelar-parcela",
      "encontrar-exportar",
    ]);
  });
```

Em `src/ajuda/contas-a-receber/roteiros.test.ts`, primeiro leia o teste equivalente para ver os ids atuais. Faça a mesma troca: `"estornar-baixa"` entra logo depois de `"receber-parcela"`, e o título do teste passa a dizer 7.

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/ajuda/contas-a-pagar src/ajuda/contas-a-receber`
Expected: FAIL (falta o roteiro).

- [ ] **Step 6: Roteiro em Contas a pagar**

Em `src/ajuda/contas-a-pagar/roteiros.ts`, depois de `const QUEM_BAIXA = ...`:

```ts
const QUEM_ESTORNA =
  "Quem pode: perfis Administrador e Tesouraria, com permissão de alteração na filial. Se a empresa exige " +
  "aprovação por outra pessoa (o padrão), quem registrou a baixa não pode estorná-la.";
```

No `eDepois` do `pagar-parcela`, acrescente ao fim do `texto` a frase `" Baixa aprovada com erro (conta, valor ou data) é estornada na própria parcela."` e troque `proximoRoteiro: "mudar-vencimento"` por `proximoRoteiro: "estornar-baixa"`.

Logo depois do roteiro `pagar-parcela` (antes de `mudar-vencimento`):

```ts
  roteiro({
    id: "estornar-baixa",
    titulo: "Estornar uma baixa aprovada",
    quandoUsar:
      "Quando uma baixa já aprovada está errada: foi lançada na conta errada, com o valor ou a data errados, ou o " +
      "pagamento nem aconteceu. O estorno tira o lançamento da conta e devolve a parcela para em aberto; a baixa " +
      "fica no histórico como estornada.",
    quemPode: QUEM_ESTORNA,
    passos: [
      { ...ABRIR_TITULO, preenche: { "lista.linhaExemplo": "expandida", "lista.p1.baixa": "aprovada" } },
      {
        cena: "lista",
        alvo: "lista.p1.baixa",
        instrucao: "Confira a baixa que vai estornar",
        explicacao:
          "Embaixo da parcela aparecem as baixas aprovadas, com data, conta, valor e quem registrou e aprovou. No " +
          `exemplo, a parcela 1 foi paga em ${EXEMPLO.baixa.data}, mas a baixa foi lançada em ` +
          `${EXEMPLO.baixa.conta}, e o dinheiro saiu de ${EXEMPLO.conta}.`,
      },
      {
        cena: "lista",
        alvo: "lista.p1.estornar",
        instrucao: "Clique em “Estornar”",
        explicacao: "O botão só aparece para quem pode estornar e só em baixa aprovada.",
        dica:
          "No lugar do botão aparece “Conciliada: desconcilie antes de estornar” quando o lançamento já foi " +
          "conciliado com o extrato: desfaça a conciliação na tela Conciliação e volte aqui. Em título de venda " +
          "na maquininha aparece “Repasse de cartão: desfaça em Repasses de cartão”.",
      },
      {
        cena: "estornar",
        alvo: "estorno.resumo",
        instrucao: "Confira o resumo",
        explicacao:
          "A janela repete a data, a conta e o valor da baixa e avisa o que vai acontecer: o lançamento sai da " +
          "conta e a parcela volta a ficar em aberto.",
      },
      {
        cena: "estornar",
        alvo: "estorno.motivo",
        instrucao: "Informe o motivo",
        explicacao:
          "O motivo é obrigatório e fica registrado na baixa e na Auditoria. Diga o que estava errado, para quem " +
          "ler depois entender.",
        preenche: { "estorno.motivo": EXEMPLO.baixa.motivoEstorno },
      },
      {
        cena: "estornar",
        alvo: "estorno.confirmar",
        instrucao: "Clique em “Estornar baixa”",
        explicacao:
          "Se a empresa exige aprovação por outra pessoa (o padrão) e foi você quem registrou a baixa, o sistema " +
          "recusa: peça a outra pessoa da Tesouraria ou ao Administrador.",
      },
      {
        cena: "lista",
        alvo: "lista.p1.baixa",
        instrucao: "Veja a baixa estornada",
        explicacao:
          "A baixa continua embaixo da parcela, apagada, com quem estornou, quando e o motivo. A parcela 1 voltou " +
          "a VENCIDO, com o botão Baixar.",
        preenche: { "lista.p1.baixa": "estornada" },
      },
    ],
    eDepois: {
      texto:
        "O lançamento saiu da conta (confira na Tesouraria) e a parcela voltou a ficar em aberto. Agora registre a " +
        "baixa de novo, com a conta, o valor e a data certos: ela passa outra vez pela aprovação.",
      proximoRoteiro: "mudar-vencimento",
    },
  }),
```

- [ ] **Step 7: Roteiro em Contas a receber**

Em `src/ajuda/contas-a-receber/roteiros.ts`, a mesma constante `QUEM_ESTORNA` e as mesmas mudanças no `eDepois` do `receber-parcela`: acrescente a frase `" Baixa aprovada com erro (conta, valor ou data) é estornada na própria parcela."` e troque `proximoRoteiro: "mudar-vencimento"` por `"estornar-baixa"`. Depois do `receber-parcela`, entra o mesmo roteiro, com estas diferenças de texto:

- `quandoUsar`: `"Quando uma baixa já aprovada está errada: foi lançada na conta errada, com o valor ou a data errados, ou o " + "recebimento nem aconteceu. O estorno tira o lançamento da conta e devolve a parcela para em aberto; a baixa " + "fica no histórico como estornada."`
- passo "Confira a baixa que vai estornar", `explicacao`: `"Embaixo da parcela aparecem as baixas aprovadas, com data, conta, valor e quem registrou e aprovou. No " + `exemplo, a parcela 1 foi recebida em ${EXEMPLO.baixa.data}, mas a baixa foi lançada em ` + `${EXEMPLO.baixa.conta}, e o dinheiro entrou em ${EXEMPLO.conta}.``
- a dica do "Clique em “Estornar”" troca "Em título de venda na maquininha" por "Em repasse de venda na maquininha".

O resto (passos, alvos, `preenche`, `eDepois`) é igual ao de Contas a pagar.

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/ajuda`
Expected: PASS. Isso inclui "o alvo de cada passo aparece na cena": se falhar, compare o `preenche` acumulado do passo com as condições da cena.

- [ ] **Step 8: Textos da aprovação**

Em `src/ajuda/aprovacoes/roteiros.ts`, no roteiro `aprovar-baixa`:

- a `dica` do passo "Confira o valor" passa a ser:

```ts
        dica:
          "Algo não bate com o comprovante? Rejeite com o motivo em vez de aprovar. Uma baixa aprovada por engano " +
          "pode ser estornada depois, na parcela em Contas a pagar ou a receber, enquanto não estiver conciliada.",
```

- no `eDepois.texto`, troque a frase final `"A aprovação não pode ser desfeita."` por `"Aprovou por engano? A baixa pode ser estornada na parcela, em Contas a pagar ou a receber, enquanto o lançamento não estiver conciliado."`. Ajuste a quebra das strings concatenadas para manter as linhas abaixo de ~120 colunas.

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/ajuda; npx tsc --noEmit; npm run lint`
Expected: PASS e nenhum erro.

- [ ] **Step 9: Commit**

```bash
git add src/ajuda
git commit -m "feat(ajuda): roteiro de estorno de baixa em Contas a pagar e a receber

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Conferência no navegador, backlog e spec

**Files:**
- Modify: `docs/backlog.md` (item 3, ~linha 158)
- Modify: `docs/superpowers/specs/2026-11-23-estorno-de-baixa-design.md` (linha de status)

- [ ] **Step 1: Suíte inteira**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run; npx tsc --noEmit; npm run lint`
Expected: tudo verde. Se algum teste de dashboard falhar entre 21h e meia-noite de Brasília, veja se ele passa em outro horário antes de culpar a mudança.

- [ ] **Step 2: Navegador** (feito pelo controlador, com o Playwright)

Suba `npm run dev` e entre com admin@nx-control-erp.local / TrocarSenha123! na "Empresa Demonstração". Monte o cenário por script temporário ou pela tela: um título a pagar com uma baixa aprovada numa conta corrente, outro com baixa numa conta Caixa, e um terceiro com baixa conciliada. Confira:

1. A lista "Baixas" aparece embaixo da parcela, com data, conta, valor, ajustes e as pessoas.
2. Estornar a baixa da conta corrente: o diálogo, o motivo obrigatório (o botão fica desabilitado com menos de 3 caracteres), a parcela volta a ficar em aberto, a baixa aparece como Estornada e o lançamento some da Tesouraria.
3. Estornar a da conta Caixa funciona.
4. A conciliada mostra "Conciliada: desconcilie antes de estornar".
5. Com a segregação ligada, quem registrou recebe a mensagem no diálogo.
6. O console sem erros (antes de culpar a mudança, veja a nota de "script tag" das armadilhas do ambiente).
7. A ajuda de Contas a pagar abre o roteiro "Estornar uma baixa aprovada" e percorre os 7 passos.

Apague do banco de dev os dados criados e a pasta `.playwright-mcp/`.

- [ ] **Step 3: Backlog e spec**

Em `docs/backlog.md`, no item `### 3. Baixa aprovada não pode ser desfeita (prioridade alta)`, acrescente logo abaixo do título, no mesmo formato do item 2:

```markdown
- **Status:** feito na branch `feat/estorno-de-baixa` (2026-11-23, spec
  `2026-11-23-estorno-de-baixa-design.md`): "Estornar" na lista de baixas da
  parcela (Administrador e Tesouraria, com motivo e a mesma segregação da
  aprovação); a baixa fica ESTORNADO, o lançamento é apagado e a parcela,
  recalculada; lançamento conciliado e baixa de repasse bloqueiam; ajuda com o
  roteiro novo `estornar-baixa`.
```

Na spec, troque `Status: aprovada para implementação` por `Status: implementada (2026-11-23)`.

- [ ] **Step 4: Commit**

```bash
git add docs/backlog.md docs/superpowers/specs/2026-11-23-estorno-de-baixa-design.md
git commit -m "docs(backlog): estorno de baixa feito

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
