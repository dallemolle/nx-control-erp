# Corrigir e excluir lançamento manual e transferência — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** permitir editar e excluir, na Tesouraria, lançamentos de origem Manual e Transferência, com trava para os que estão ligados ao extrato.

**Architecture:** três funções novas no serviço `lancamentoBancario.ts` (`editarLancamentoManual`, `editarTransferencia`, `excluirLancamento`) que gravam com `updateMany`/`deleteMany` filtrando o `grupoConciliacaoId` lido, para não perder a corrida com a Conciliação. Uma função pura em `src/lib/lancamentoEditavel.ts` prepara, para cada linha da lista, o que o diálogo de edição precisa. Os diálogos de criação ganham um modo edição, e a lista ganha uma coluna de ações e o selo "Conciliado".

**Tech Stack:** Next.js (App Router, server actions), Prisma 7 + PostgreSQL, Vitest, shadcn/base-ui.

**Spec:** `docs/superpowers/specs/2026-11-26-corrigir-lancamento-design.md`

## Global Constraints

- Textos de tela, mensagens e comentários em pt-BR, no estilo dos arquivos vizinhos.
- Só origem `MANUAL` e `TRANSFERENCIA` são editáveis/excluíveis; `BAIXA` é recusada com "Lançamento de baixa: corrija estornando a baixa".
- "Ligado ao extrato" = `grupoConciliacaoId !== null`. `conciliado = true` sem grupo (conta Caixa) **não** trava nada.
- Permissão: `requirePermission(sessao.perfil, "lancamento:escrever")` + `requireAlteracaoFilial(sessao.podeAlterarFilial)`.
- Excluir apaga o registro (sem status "excluído"); motivo obrigatório (`trim()` não vazio).
- Auditoria: `EDITAR`, `EDITAR_TRANSFERENCIA`, `EXCLUIR`, `EXCLUIR_TRANSFERENCIA`, entidade `LancamentoBancario`. Toda ação nova precisa de rótulo em `src/lib/auditoria/rotulos.ts` (há teste que confere).
- Nada de consultas em paralelo (`Promise.all`) dentro de `prisma.$transaction` (ver backlog, "Banco de dados — consultas paralelas na transação").
- Testes de serviço usam o banco de teste e a fixture `criarFixtureFinanceiro(sufixo, "TESOURARIA")`. Rodar com `npx vitest run <arquivo>`.
- Ambiente: depois de mexer em nada do schema não é preciso `prisma generate` (este plano não muda o schema). Arquivos podem estar em CRLF: ao editar, preserve.
- Commits pequenos, mensagem em pt-BR no padrão `tipo(escopo): descrição`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Arquivos

| Arquivo | O quê |
|---|---|
| `src/server/services/lancamentoBancario.ts` | modificar: 3 funções novas + helpers |
| `src/server/services/lancamentoBancario.test.ts` | modificar: testes novos |
| `src/lib/auditoria/rotulos.ts` | modificar: 4 rótulos |
| `src/lib/lancamentoEditavel.ts` (+ `.test.ts`) | criar: tipos e funções puras para a tela |
| `src/app/(dashboard)/financeiro/tesouraria/actions.ts` | modificar: 3 ações |
| `src/app/(dashboard)/_shared/campos-classificacao-lancamento.tsx` | modificar: valores iniciais |
| `src/app/(dashboard)/financeiro/tesouraria/lancamento-dialog-form.tsx` | modificar: modo edição |
| `src/app/(dashboard)/financeiro/tesouraria/transferencia-dialog-form.tsx` | modificar: modo edição |
| `src/app/(dashboard)/financeiro/tesouraria/excluir-lancamento-dialog.tsx` | criar |
| `src/app/(dashboard)/financeiro/tesouraria/acoes-do-lancamento.tsx` | criar |
| `src/app/(dashboard)/financeiro/tesouraria/page.tsx` | modificar: coluna de ações e selo |
| `src/ajuda/tesouraria/{alvos,exemplo,cenas,roteiros,index,roteiros.test}.ts(x)` | modificar |
| `src/ajuda/registro.test.ts` | modificar: 5 roteiros |
| `src/ajuda/conciliacao/roteiros.ts` | modificar: "E depois?" do `criar-lancamento` |
| `docs/backlog.md`, spec | modificar: tirar o item 6; status da spec |

---

### Task 1: `editarLancamentoManual`

**Files:**
- Modify: `src/server/services/lancamentoBancario.ts`
- Modify: `src/lib/auditoria/rotulos.ts`
- Test: `src/server/services/lancamentoBancario.test.ts`

**Interfaces:**
- Produces: `editarLancamentoManual(sessao: SessaoAtiva, id: string, dados: LancamentoManualFormValues): Promise<LancamentoBancario>`; constantes de mensagem exportadas `MSG_CORRIDA_CONCILIACAO`, `MSG_BAIXA_NAO_SE_CORRIGE`, `MSG_LANCAMENTO_NAO_ENCONTRADO`; helpers internos `mesmoDiaUtc(a: Date, b: Date): boolean` e `registroParaAuditoria(l)` (usados nas Tasks 2 e 3).

- [ ] **Step 1: Escrever os testes que falham**

No fim de `lancamentoBancario.test.ts`, um `describe` novo com fixture própria (`"LBE"`, perfil TESOURARIA) e uma conta Caixa extra. Importe `editarLancamentoManual` de `./lancamentoBancario` e `vi` de `vitest`.

```ts
describe("editarLancamentoManual", () => {
  let fx: FixtureFinanceiro;
  let contaCaixaId: string;

  beforeAll(async () => {
    fx = await criarFixtureFinanceiro("LBE", "TESOURARIA");
    const caixa = await prisma.contaBancaria.create({
      data: { filialId: fx.filialId, bancoId: fx.bancoId, agencia: "0000", conta: "caixa-lbe", tipo: "CAIXA", saldoInicial: 0 },
    });
    contaCaixaId = caixa.id;
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fx);
  });

  function dadosBase(overrides: Partial<Parameters<typeof criarLancamentoManual>[1]> = {}) {
    return {
      contaBancariaId: fx.contaBancariaId,
      data: new Date("2026-11-20T00:00:00Z"),
      tipo: "SAIDA" as const,
      valor: 459,
      descricao: "Tarifa de manutenção",
      categoriaFinanceiraId: fx.categoriaFinanceiraId,
      ...overrides,
    };
  }

  async function conciliar(lancamentoId: string) {
    const lanc = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lancamentoId } });
    const grupo = await prisma.grupoConciliacao.create({
      data: { filialId: fx.filialId, contaBancariaId: lanc.contaBancariaId, usuarioId: fx.usuarioId },
    });
    await prisma.lancamentoBancario.update({
      where: { id: lancamentoId },
      data: { grupoConciliacaoId: grupo.id, conciliado: true },
    });
    return grupo.id;
  }

  test("sem grupo, corrige o valor e todos os campos, e audita antes e depois", async () => {
    const lanc = await criarLancamentoManual(fx.sessao, dadosBase());
    const editado = await editarLancamentoManual(fx.sessao, lanc.id, dadosBase({ valor: 45.9, descricao: "Tarifa corrigida", tipo: "SAIDA" }));

    expect(Number(editado.valor)).toBe(45.9);
    expect(editado.descricao).toBe("Tarifa corrigida");

    const log = await prisma.auditLog.findFirstOrThrow({ where: { entidadeId: lanc.id, acao: "EDITAR" } });
    expect(log.valorAnterior).toMatchObject({ valor: "459", descricao: "Tarifa de manutenção" });
    expect(log.valorNovo).toMatchObject({ valor: "45.9", descricao: "Tarifa corrigida" });
  });

  test("trocar de banco para Caixa deixa conciliado; de Caixa para banco, não", async () => {
    const lanc = await criarLancamentoManual(fx.sessao, dadosBase());
    expect(lanc.conciliado).toBe(false);

    const noCaixa = await editarLancamentoManual(fx.sessao, lanc.id, dadosBase({ contaBancariaId: contaCaixaId }));
    expect(noCaixa.conciliado).toBe(true);
    expect(noCaixa.grupoConciliacaoId).toBeNull();

    const deVolta = await editarLancamentoManual(fx.sessao, lanc.id, dadosBase());
    expect(deVolta.conciliado).toBe(false);
  });

  test("com grupo, muda descrição e categoria, mas não valor, data, tipo ou conta", async () => {
    const lanc = await criarLancamentoManual(fx.sessao, dadosBase());
    const grupoId = await conciliar(lanc.id);

    const editado = await editarLancamentoManual(
      fx.sessao,
      lanc.id,
      dadosBase({ descricao: "Tarifa de novembro", categoriaFinanceiraId: "__nenhum__" }),
    );
    expect(editado.descricao).toBe("Tarifa de novembro");
    expect(editado.categoriaFinanceiraId).toBeNull();
    expect(editado.grupoConciliacaoId).toBe(grupoId);
    expect(editado.conciliado).toBe(true);

    for (const mudanca of [
      { valor: 45.9 },
      { data: new Date("2026-11-21T00:00:00Z") },
      { tipo: "ENTRADA" as const },
      { contaBancariaId: contaCaixaId },
    ]) {
      await expect(editarLancamentoManual(fx.sessao, lanc.id, dadosBase(mudanca))).rejects.toThrow(
        /conciliado com o extrato: só descrição e classificação podem mudar/,
      );
    }
  });

  test("com grupo, data no mesmo dia em outro horário não conta como mudança", async () => {
    const lanc = await criarLancamentoManual(fx.sessao, dadosBase({ data: new Date("2026-11-20T15:30:00Z") }));
    await conciliar(lanc.id);
    const editado = await editarLancamentoManual(fx.sessao, lanc.id, dadosBase({ descricao: "Mesmo dia" }));
    expect(editado.data.toISOString()).toBe("2026-11-20T15:30:00.000Z");
  });

  test("origem BAIXA e TRANSFERENCIA são recusadas", async () => {
    const { saida } = await criarTransferencia(fx.sessao, {
      contaOrigemId: fx.contaBancariaId,
      contaDestinoId: contaCaixaId,
      data: new Date("2026-11-20T00:00:00Z"),
      valor: 100,
      descricao: "Saque",
    });
    await expect(editarLancamentoManual(fx.sessao, saida.id, dadosBase())).rejects.toThrow(/Transferência/);

    const lanc = await criarLancamentoManual(fx.sessao, dadosBase());
    await prisma.lancamentoBancario.update({ where: { id: lanc.id }, data: { origem: "BAIXA" } });
    await expect(editarLancamentoManual(fx.sessao, lanc.id, dadosBase())).rejects.toThrow(
      "Lançamento de baixa: corrija estornando a baixa",
    );
  });

  test("lançamento de outra filial não é encontrado; conta de outra filial é recusada", async () => {
    const outra = await criarFixtureFinanceiro("LBE2", "TESOURARIA");
    try {
      const lancOutra = await criarLancamentoManual(outra.sessao, {
        ...dadosBase(),
        contaBancariaId: outra.contaBancariaId,
        categoriaFinanceiraId: "__nenhum__",
      });
      await expect(editarLancamentoManual(fx.sessao, lancOutra.id, dadosBase())).rejects.toThrow(
        "Lançamento não encontrado na filial ativa",
      );

      const meu = await criarLancamentoManual(fx.sessao, dadosBase());
      await expect(
        editarLancamentoManual(fx.sessao, meu.id, dadosBase({ contaBancariaId: outra.contaBancariaId })),
      ).rejects.toThrow(/não pertence à filial ativa/);
      await expect(
        editarLancamentoManual(fx.sessao, meu.id, dadosBase({ categoriaFinanceiraId: outra.categoriaFinanceiraId })),
      ).rejects.toThrow(/não pertence à filial ativa/);
    } finally {
      await limparFixtureFinanceiro(outra);
    }
  });

  test("perfil sem lancamento:escrever é recusado", async () => {
    const lanc = await criarLancamentoManual(fx.sessao, dadosBase());
    await expect(editarLancamentoManual(fx.sessaoSomenteLeitura, lanc.id, dadosBase())).rejects.toThrow(PermissionError);
  });

  test("se o lançamento ganhar grupo entre a leitura e a gravação, nada é gravado", async () => {
    const lanc = await criarLancamentoManual(fx.sessao, dadosBase());
    const lido = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lanc.id } });
    await conciliar(lanc.id);
    // Simula a leitura feita antes da conciliação.
    const espiao = vi.spyOn(prisma.lancamentoBancario, "findFirst").mockResolvedValueOnce(lido);
    try {
      await expect(editarLancamentoManual(fx.sessao, lanc.id, dadosBase({ valor: 45.9 }))).rejects.toThrow(
        /conciliado ou desconciliado agora há pouco/,
      );
    } finally {
      espiao.mockRestore();
    }
    const depois = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lanc.id } });
    expect(Number(depois.valor)).toBe(459);
  });
});
```

Confira na fixture o nome do campo de sessão só leitura (`sessaoSomenteLeitura`) e se `criarFixtureFinanceiro` aceita sufixos de 4 letras (os existentes usam "LBF", "LBT"). Se a fixture não aceitar `tipo` na conta, crie a conta como acima mesmo (o campo `tipo` existe em `ContaBancaria`).

Se `vi.spyOn` no delegate do Prisma não funcionar (erro de propriedade não configurável), troque o teste de corrida pela versão com dois passos: chame o serviço num lançamento conciliado com `dadosBase({ descricao: "x" })` depois de remover o grupo direto no banco **entre** um `findFirst` e o serviço não é possível; nesse caso, apague o teste e anote no relatório da task que a corrida ficou coberta só pela leitura do código.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/lancamentoBancario.test.ts`
Expected: FAIL — `editarLancamentoManual` não é exportado.

- [ ] **Step 3: Implementar**

Em `lancamentoBancario.ts`:

1. Troque `import type { Prisma, TipoComprovante } from "@prisma/client";` por
   ```ts
   import { Prisma, type LancamentoBancario, type TipoComprovante } from "@prisma/client";
   ```
   e ajuste os usos de `Prisma.LancamentoBancarioOrderByWithRelationInput` (continua funcionando como tipo).

2. Depois de `buscarContaDaFilial`, acrescente:

```ts
export const MSG_LANCAMENTO_NAO_ENCONTRADO = "Lançamento não encontrado na filial ativa";
export const MSG_BAIXA_NAO_SE_CORRIGE = "Lançamento de baixa: corrija estornando a baixa";
export const MSG_CORRIDA_CONCILIACAO =
  "O lançamento foi conciliado ou desconciliado agora há pouco. Abra de novo e confira.";
const MSG_MANUAL_CONCILIADO_EDITAR =
  "Este lançamento está conciliado com o extrato: só descrição e classificação podem mudar. " +
  "Desconcilie na Conciliação para mudar conta, tipo, data ou valor.";

/** O formulário manda só o dia (meia-noite UTC); a linha do extrato pode ter hora. */
function mesmoDiaUtc(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/** Campos que a correção pode mudar, no formato gravado na auditoria. */
function camposEditaveis(l: LancamentoBancario) {
  return {
    contaBancariaId: l.contaBancariaId,
    tipo: l.tipo,
    data: l.data,
    valor: l.valor,
    descricao: l.descricao,
    categoriaFinanceiraId: l.categoriaFinanceiraId,
    centroCustoId: l.centroCustoId,
    centroLucroId: l.centroLucroId,
    safraId: l.safraId,
    projetoId: l.projetoId,
    classificacaoFiscal: l.classificacaoFiscal,
    tipoComprovante: l.tipoComprovante,
    numeroComprovante: l.numeroComprovante,
  };
}

/** O registro inteiro (sem relações), para a auditoria da exclusão. */
function registroParaAuditoria(l: LancamentoBancario) {
  return { ...l, valor: l.valor.toString(), data: l.data.toISOString(), criadoEm: l.criadoEm.toISOString() };
}
```

3. Depois de `criarTransferencia`, a função:

```ts
/**
 * Corrige um lançamento manual. Ligado ao extrato (com grupo de conciliação),
 * só a classificação muda: conta, tipo, data e valor foram confirmados pelo
 * banco, e para mudá-los é preciso desconciliar antes.
 */
export async function editarLancamentoManual(sessao: SessaoAtiva, id: string, dados: LancamentoManualFormValues) {
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const atual = await prisma.lancamentoBancario.findFirst({ where: { id, filialId: sessao.filialId } });
  if (!atual) throw new Error(MSG_LANCAMENTO_NAO_ENCONTRADO);
  if (atual.origem === "BAIXA") throw new Error(MSG_BAIXA_NAO_SE_CORRIGE);
  if (atual.origem === "TRANSFERENCIA") {
    throw new Error("Transferência: corrija pela transferência, que muda os dois lados juntos");
  }

  const conta = await buscarContaDaFilial(sessao.filialId, dados.contaBancariaId);

  const referencias = {
    categoriaFinanceiraId: normalizarOpcional(dados.categoriaFinanceiraId),
    centroCustoId: normalizarOpcional(dados.centroCustoId),
    centroLucroId: normalizarOpcional(dados.centroLucroId),
    safraId: normalizarOpcional(dados.safraId),
    projetoId: normalizarOpcional(dados.projetoId),
  };
  await validarReferenciasDoLancamento(sessao.filialId, referencias);

  const classificacaoFiscal = dados.classificacaoFiscal ?? "FISCAL";
  const tipoComprovante = normalizarOpcional(dados.tipoComprovante) as TipoComprovante | null;
  garantirComprovanteValido({ classificacaoFiscal, tipoComprovante });

  const valor = new Prisma.Decimal(dados.valor);
  const mesmoDia = mesmoDiaUtc(dados.data, atual.data);
  const mudouMovimento =
    conta.id !== atual.contaBancariaId || dados.tipo !== atual.tipo || !mesmoDia || !valor.equals(atual.valor);
  const ligadoAoExtrato = atual.grupoConciliacaoId !== null;
  if (ligadoAoExtrato && mudouMovimento) throw new Error(MSG_MANUAL_CONCILIADO_EDITAR);

  const novo = {
    descricao: dados.descricao,
    ...referencias,
    classificacaoFiscal,
    tipoComprovante,
    numeroComprovante: normalizarOpcional(dados.numeroComprovante),
    ...(ligadoAoExtrato
      ? {}
      : {
          contaBancariaId: conta.id,
          tipo: dados.tipo,
          data: mesmoDia ? atual.data : dados.data,
          valor,
          // Mesma regra da criação: dinheiro em espécie não tem extrato.
          conciliado: conta.tipo === "CAIXA",
        }),
  };

  // O filtro pelo grupo lido evita gravar por cima de uma conciliação (ou desconciliação) feita no meio do caminho.
  const { count } = await prisma.lancamentoBancario.updateMany({
    where: { id, filialId: sessao.filialId, grupoConciliacaoId: atual.grupoConciliacaoId },
    data: novo,
  });
  if (count === 0) throw new Error(MSG_CORRIDA_CONCILIACAO);

  const gravado = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "LancamentoBancario",
    entidadeId: id,
    acao: "EDITAR",
    anterior: camposEditaveis(atual),
    novo: camposEditaveis(gravado),
  });

  return gravado;
}
```

Observação: `registroParaAuditoria` ainda não é usado nesta task; se o lint reclamar de função não usada, deixe-a para a Task 3.

4. Em `src/lib/auditoria/rotulos.ts`, no `ROTULOS_ACAO_AUDITORIA`, em ordem alfabética:
```ts
  EDITAR: "Editar",
  EDITAR_TRANSFERENCIA: "Editar transferência",
  ...
  EXCLUIR: "Excluir",
  EXCLUIR_TRANSFERENCIA: "Excluir transferência",
```
(`EDITAR*` depois de `DISPENSAR_REJEICAO`; `EXCLUIR*` depois de `ESTORNAR`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/services/lancamentoBancario.test.ts src/lib/auditoria/rotulos.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/lancamentoBancario.ts src/server/services/lancamentoBancario.test.ts src/lib/auditoria/rotulos.ts
git commit -m "feat(tesouraria): corrigir lançamento manual"
```

---

### Task 2: `editarTransferencia`

**Files:**
- Modify: `src/server/services/lancamentoBancario.ts`
- Test: `src/server/services/lancamentoBancario.test.ts`

**Interfaces:**
- Consumes: `mesmoDiaUtc`, `MSG_CORRIDA_CONCILIACAO` (Task 1); `nomeDaContaBancaria` de `@/lib/contaBancaria`.
- Produces: `editarTransferencia(sessao: SessaoAtiva, transferenciaId: string, dados: TransferenciaFormValues): Promise<void>`.

- [ ] **Step 1: Escrever os testes que falham**

Novo `describe("editarTransferencia")`, fixture `"LBX"` TESOURARIA, com uma segunda conta de banco (`contaDestinoId`) e uma conta Caixa (`contaCaixaId`), criadas como na Task 1. Reaproveite a mesma função `conciliar` (copie-a para este `describe`).

```ts
  function dadosTransf(overrides: Partial<Parameters<typeof criarTransferencia>[1]> = {}) {
    return {
      contaOrigemId: fx.contaBancariaId,
      contaDestinoId,
      data: new Date("2026-11-18T00:00:00Z"),
      valor: 2000,
      descricao: "Saque para o caixa",
      ...overrides,
    };
  }

  test("sem grupo, muda contas, data e valor nos dois lados e audita", async () => {
    const { saida, entrada } = await criarTransferencia(fx.sessao, dadosTransf());
    await editarTransferencia(
      fx.sessao,
      saida.transferenciaId!,
      dadosTransf({ contaDestinoId: contaCaixaId, valor: 1500, data: new Date("2026-11-19T00:00:00Z"), descricao: "Saque corrigido" }),
    );

    const novaSaida = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: saida.id } });
    const novaEntrada = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: entrada.id } });
    expect(Number(novaSaida.valor)).toBe(1500);
    expect(Number(novaEntrada.valor)).toBe(1500);
    expect(novaEntrada.contaBancariaId).toBe(contaCaixaId);
    expect(novaEntrada.conciliado).toBe(true); // lado Caixa
    expect(novaSaida.conciliado).toBe(false);
    expect(novaSaida.data.toISOString().slice(0, 10)).toBe("2026-11-19");
    expect(novaEntrada.descricao).toBe("Saque corrigido");

    const log = await prisma.auditLog.findFirstOrThrow({ where: { entidadeId: saida.id, acao: "EDITAR_TRANSFERENCIA" } });
    expect(log.valorNovo).toMatchObject({ valor: "1500", contaDestinoId: contaCaixaId });
  });

  test("com um lado no grupo, só a descrição muda", async () => {
    const { saida, entrada } = await criarTransferencia(fx.sessao, dadosTransf());
    await conciliar(saida.id);

    await editarTransferencia(fx.sessao, saida.transferenciaId!, dadosTransf({ descricao: "Saque de novembro" }));
    const novaEntrada = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: entrada.id } });
    expect(novaEntrada.descricao).toBe("Saque de novembro");

    await expect(
      editarTransferencia(fx.sessao, saida.transferenciaId!, dadosTransf({ valor: 1500 })),
    ).rejects.toThrow(/Esta transferência está conciliada com o extrato \(lado de .+\): só a descrição pode mudar/);
    const intacta = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: entrada.id } });
    expect(Number(intacta.valor)).toBe(2000);
  });

  test("transferência de outra filial não é encontrada", async () => {
    await expect(editarTransferencia(fx.sessao, crypto.randomUUID(), dadosTransf())).rejects.toThrow(
      "Transferência não encontrada na filial ativa",
    );
  });
```

(`crypto.randomUUID` é global no Node 20+; se o TS reclamar, `import { randomUUID } from "crypto"`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/lancamentoBancario.test.ts -t editarTransferencia`
Expected: FAIL — função não exportada.

- [ ] **Step 3: Implementar**

Importe `nomeDaContaBancaria` de `@/lib/contaBancaria`. Depois de `editarLancamentoManual`:

```ts
const INCLUI_CONTA = { contaBancaria: { include: { banco: true } } } as const;

async function buscarLadosDaTransferencia(filialId: string, transferenciaId: string) {
  const lados = await prisma.lancamentoBancario.findMany({
    where: { transferenciaId, filialId, origem: "TRANSFERENCIA" },
    include: INCLUI_CONTA,
  });
  const saida = lados.find((l) => l.tipo === "SAIDA");
  const entrada = lados.find((l) => l.tipo === "ENTRADA");
  if (lados.length !== 2 || !saida || !entrada) throw new Error("Transferência não encontrada na filial ativa");
  return { saida, entrada };
}

/** Corrige os dois lados juntos. Com algum lado ligado ao extrato, só a descrição muda. */
export async function editarTransferencia(sessao: SessaoAtiva, transferenciaId: string, dados: TransferenciaFormValues) {
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const { saida, entrada } = await buscarLadosDaTransferencia(sessao.filialId, transferenciaId);
  const contaOrigem = await buscarContaDaFilial(sessao.filialId, dados.contaOrigemId);
  const contaDestino = await buscarContaDaFilial(sessao.filialId, dados.contaDestinoId);

  const valor = new Prisma.Decimal(dados.valor);
  const mesmoDia = mesmoDiaUtc(dados.data, saida.data);
  const mudouMovimento =
    contaOrigem.id !== saida.contaBancariaId ||
    contaDestino.id !== entrada.contaBancariaId ||
    !mesmoDia ||
    !valor.equals(saida.valor);
  const ladoConciliado = [saida, entrada].find((l) => l.grupoConciliacaoId !== null);
  if (ladoConciliado && mudouMovimento) {
    throw new Error(
      `Esta transferência está conciliada com o extrato (lado de ${nomeDaContaBancaria(ladoConciliado.contaBancaria)}): ` +
        "só a descrição pode mudar. Desconcilie na Conciliação para mudar contas, data ou valor.",
    );
  }

  const data = mesmoDia ? saida.data : dados.data;
  const lados = [
    { lado: saida, conta: contaOrigem },
    { lado: entrada, conta: contaDestino },
  ];

  await prisma.$transaction(async (tx) => {
    // Em sequência (nada de Promise.all dentro da transação).
    for (const { lado, conta } of lados) {
      const { count } = await tx.lancamentoBancario.updateMany({
        where: { id: lado.id, filialId: sessao.filialId, grupoConciliacaoId: lado.grupoConciliacaoId },
        data: ladoConciliado
          ? { descricao: dados.descricao }
          : { descricao: dados.descricao, contaBancariaId: conta.id, data, valor, conciliado: conta.tipo === "CAIXA" },
      });
      if (count === 0) throw new Error(MSG_CORRIDA_CONCILIACAO);
    }
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "LancamentoBancario",
    entidadeId: saida.id,
    acao: "EDITAR_TRANSFERENCIA",
    anterior: {
      transferenciaId,
      contaOrigemId: saida.contaBancariaId,
      contaDestinoId: entrada.contaBancariaId,
      data: saida.data,
      valor: saida.valor,
      descricao: saida.descricao,
    },
    novo: {
      transferenciaId,
      contaOrigemId: ladoConciliado ? saida.contaBancariaId : contaOrigem.id,
      contaDestinoId: ladoConciliado ? entrada.contaBancariaId : contaDestino.id,
      data: ladoConciliado ? saida.data : data,
      valor: ladoConciliado ? saida.valor : valor,
      descricao: dados.descricao,
    },
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/services/lancamentoBancario.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/lancamentoBancario.ts src/server/services/lancamentoBancario.test.ts
git commit -m "feat(tesouraria): corrigir transferência nos dois lados"
```

---

### Task 3: `excluirLancamento`

**Files:**
- Modify: `src/server/services/lancamentoBancario.ts`
- Test: `src/server/services/lancamentoBancario.test.ts`

**Interfaces:**
- Consumes: `registroParaAuditoria`, `INCLUI_CONTA`, mensagens (Tasks 1–2).
- Produces: `excluirLancamento(sessao: SessaoAtiva, id: string, motivo: string): Promise<void>`. Para transferência, o `id` pode ser de qualquer um dos dois lados.

- [ ] **Step 1: Escrever os testes que falham**

Novo `describe("excluirLancamento")`, fixture `"LBD"` TESOURARIA, segunda conta de banco `contaDestinoId`, função `conciliar` copiada.

```ts
  test("exclui lançamento manual sem grupo, com motivo na auditoria", async () => {
    const lanc = await criarLancamentoManual(fx.sessao, {
      contaBancariaId: fx.contaBancariaId, data: new Date("2026-11-20T00:00:00Z"), tipo: "SAIDA",
      valor: 459, descricao: "Tarifa digitada errada", categoriaFinanceiraId: "__nenhum__",
    });
    await excluirLancamento(fx.sessao, lanc.id, "  valor digitado errado  ");

    expect(await prisma.lancamentoBancario.findUnique({ where: { id: lanc.id } })).toBeNull();
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entidadeId: lanc.id, acao: "EXCLUIR" } });
    expect(log.valorNovo).toMatchObject({ motivo: "valor digitado errado" });
    expect(log.valorAnterior).toMatchObject({ descricao: "Tarifa digitada errada", valor: "459" });
  });

  test("motivo vazio ou só espaços é recusado", async () => {
    const lanc = await criarLancamentoManual(fx.sessao, {
      contaBancariaId: fx.contaBancariaId, data: new Date(), tipo: "SAIDA",
      valor: 10, descricao: "Qualquer", categoriaFinanceiraId: "__nenhum__",
    });
    await expect(excluirLancamento(fx.sessao, lanc.id, "   ")).rejects.toThrow("Informe o motivo da exclusão");
    expect(await prisma.lancamentoBancario.findUnique({ where: { id: lanc.id } })).not.toBeNull();
  });

  test("lançamento com grupo não é excluído", async () => {
    const lanc = await criarLancamentoManual(fx.sessao, {
      contaBancariaId: fx.contaBancariaId, data: new Date(), tipo: "SAIDA",
      valor: 10, descricao: "Conciliado", categoriaFinanceiraId: "__nenhum__",
    });
    await conciliar(lanc.id);
    await expect(excluirLancamento(fx.sessao, lanc.id, "errado")).rejects.toThrow(
      "Este lançamento está conciliado com o extrato. Desconcilie na Conciliação antes de excluir.",
    );
  });

  test("excluir um lado da transferência apaga os dois", async () => {
    const { saida, entrada } = await criarTransferencia(fx.sessao, {
      contaOrigemId: fx.contaBancariaId, contaDestinoId, data: new Date(), valor: 300, descricao: "TED errada",
    });
    await excluirLancamento(fx.sessao, entrada.id, "TED não aconteceu");

    expect(await prisma.lancamentoBancario.count({ where: { id: { in: [saida.id, entrada.id] } } })).toBe(0);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entidadeId: saida.id, acao: "EXCLUIR_TRANSFERENCIA" } });
    expect(log.valorNovo).toMatchObject({ motivo: "TED não aconteceu" });
  });

  test("transferência com um lado no grupo: nenhum lado é apagado", async () => {
    const { saida, entrada } = await criarTransferencia(fx.sessao, {
      contaOrigemId: fx.contaBancariaId, contaDestinoId, data: new Date(), valor: 300, descricao: "TED conciliada",
    });
    await conciliar(entrada.id);
    await expect(excluirLancamento(fx.sessao, saida.id, "errado")).rejects.toThrow(
      /Esta transferência está conciliada com o extrato \(lado de .+\)\. Desconcilie na Conciliação antes de excluir\./,
    );
    expect(await prisma.lancamentoBancario.count({ where: { id: { in: [saida.id, entrada.id] } } })).toBe(2);
  });

  test("origem BAIXA é recusada; outra filial não é encontrada", async () => {
    const lanc = await criarLancamentoManual(fx.sessao, {
      contaBancariaId: fx.contaBancariaId, data: new Date(), tipo: "SAIDA",
      valor: 10, descricao: "Vira baixa", categoriaFinanceiraId: "__nenhum__",
    });
    await prisma.lancamentoBancario.update({ where: { id: lanc.id }, data: { origem: "BAIXA" } });
    await expect(excluirLancamento(fx.sessao, lanc.id, "x")).rejects.toThrow("Lançamento de baixa: corrija estornando a baixa");
    await expect(excluirLancamento(fx.sessao, crypto.randomUUID(), "x")).rejects.toThrow(
      "Lançamento não encontrado na filial ativa",
    );
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/lancamentoBancario.test.ts -t excluirLancamento`
Expected: FAIL — função não exportada.

- [ ] **Step 3: Implementar**

```ts
/**
 * Apaga um lançamento manual, ou os dois lados de uma transferência. A
 * auditoria guarda o registro inteiro e o motivo. Ligado ao extrato não se
 * exclui: desconcilie antes.
 */
export async function excluirLancamento(sessao: SessaoAtiva, id: string, motivo: string) {
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const motivoLimpo = motivo.trim();
  if (!motivoLimpo) throw new Error("Informe o motivo da exclusão");

  const alvo = await prisma.lancamentoBancario.findFirst({
    where: { id, filialId: sessao.filialId },
    include: INCLUI_CONTA,
  });
  if (!alvo) throw new Error(MSG_LANCAMENTO_NAO_ENCONTRADO);
  if (alvo.origem === "BAIXA") throw new Error(MSG_BAIXA_NAO_SE_CORRIGE);

  const ehTransferencia = alvo.origem === "TRANSFERENCIA" && alvo.transferenciaId !== null;
  const lados = ehTransferencia
    ? Object.values(await buscarLadosDaTransferencia(sessao.filialId, alvo.transferenciaId!))
    : [alvo];

  const conciliado = lados.find((l) => l.grupoConciliacaoId !== null);
  if (conciliado) {
    throw new Error(
      ehTransferencia
        ? `Esta transferência está conciliada com o extrato (lado de ${nomeDaContaBancaria(conciliado.contaBancaria)}). ` +
            "Desconcilie na Conciliação antes de excluir."
        : "Este lançamento está conciliado com o extrato. Desconcilie na Conciliação antes de excluir.",
    );
  }

  const ids = lados.map((l) => l.id);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.lancamentoBancario.deleteMany({
      where: { id: { in: ids }, filialId: sessao.filialId, grupoConciliacaoId: null },
    });
    if (count !== ids.length) throw new Error(MSG_CORRIDA_CONCILIACAO);
  });

  const semConta = lados.map(({ contaBancaria: _conta, ...registro }) => registroParaAuditoria(registro));
  const saida = lados.find((l) => l.tipo === "SAIDA") ?? alvo;
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "LancamentoBancario",
    entidadeId: ehTransferencia ? saida.id : alvo.id,
    acao: ehTransferencia ? "EXCLUIR_TRANSFERENCIA" : "EXCLUIR",
    anterior: ehTransferencia ? { transferenciaId: alvo.transferenciaId, lancamentos: semConta } : semConta[0],
    novo: { motivo: motivoLimpo },
  });
}
```

Se o ESLint reclamar de `_conta` não usado, use o padrão já adotado no repositório para descartar propriedades (procure `no-unused-vars` em `eslint.config.*`), ou monte o objeto com `const { contaBancaria, ...registro } = l; void contaBancaria;`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/services/lancamentoBancario.test.ts src/lib/auditoria/rotulos.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/lancamentoBancario.ts src/server/services/lancamentoBancario.test.ts
git commit -m "feat(tesouraria): excluir lançamento manual ou transferência com motivo"
```

---

### Task 4: Dados da tela e ações

**Files:**
- Create: `src/lib/lancamentoEditavel.ts`
- Test: `src/lib/lancamentoEditavel.test.ts`
- Modify: `src/app/(dashboard)/financeiro/tesouraria/actions.ts`

**Interfaces:**
- Consumes: serviços das Tasks 1–3.
- Produces:
  ```ts
  export type LancamentoEditavel = {
    tipo: "manual"; id: string; contaBancariaId: string; contaNome: string;
    tipoLancamento: "ENTRADA" | "SAIDA"; data: string /* aaaa-mm-dd */; valor: string /* "459.00" */;
    descricao: string; categoriaFinanceiraId: string | null; centroCustoId: string | null;
    centroLucroId: string | null; safraId: string | null; projetoId: string | null;
    classificacaoFiscal: "FISCAL" | "GERENCIAL"; tipoComprovante: string | null; numeroComprovante: string | null;
    ligadoAoExtrato: boolean; resumo: string;
  };
  export type TransferenciaEditavel = {
    tipo: "transferencia"; idParaExcluir: string; transferenciaId: string;
    contaOrigemId: string; contaOrigemNome: string; contaDestinoId: string; contaDestinoNome: string;
    data: string; valor: string; descricao: string; ladoConciliado: string | null; resumo: string;
  };
  export type Editavel = LancamentoEditavel | TransferenciaEditavel;
  export function montarEditaveis(lancamentos: readonly LancamentoDaLista[]): Record<string, Editavel>;
  export function opcoesComAtual(opcoes: readonly Opcao[], atual: Opcao | null): Opcao[];
  export function paraCampoDeData(data: Date): string;
  ```
  Ações: `editarLancamentoManualAction(prev: FormState, formData: FormData)`, `editarTransferenciaAction(prev: FormState, formData: FormData)` (ambas leem `id`/`transferenciaId` do `formData`), `excluirLancamentoAction(id: string, motivo: string): Promise<FormState>`.

- [ ] **Step 1: Escrever os testes que falham**

`src/lib/lancamentoEditavel.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { montarEditaveis, opcoesComAtual, paraCampoDeData, type LancamentoDaLista } from "./lancamentoEditavel";

const BANCO = { tipo: "CORRENTE", agencia: "1234", conta: "12345-6", banco: { nome: "Banco do Brasil" } };
const CAIXA = { tipo: "CAIXA", agencia: "0000", conta: "Fazenda", banco: { nome: "—" } };

function lanc(over: Partial<LancamentoDaLista>): LancamentoDaLista {
  return {
    id: "l1", contaBancariaId: "banco", contaBancaria: BANCO, tipo: "SAIDA",
    data: new Date("2026-11-20T00:00:00Z"), valor: "459", descricao: "Tarifa", origem: "MANUAL",
    transferenciaId: null, grupoConciliacaoId: null, categoriaFinanceiraId: "cat", centroCustoId: null,
    centroLucroId: null, safraId: null, projetoId: null, classificacaoFiscal: "FISCAL",
    tipoComprovante: null, numeroComprovante: null, ...over,
  };
}

describe("montarEditaveis", () => {
  test("lançamento manual vira editável com data do campo e valor com duas casas", () => {
    const r = montarEditaveis([lanc({})]);
    expect(r.l1).toMatchObject({
      tipo: "manual", data: "2026-11-20", valor: "459.00", ligadoAoExtrato: false,
      contaNome: "Banco do Brasil - Ag 1234/CC 12345-6", resumo: "20/11/2026 · Banco do Brasil - Ag 1234/CC 12345-6 · R$ 459,00",
    });
  });

  test("baixa não é editável", () => {
    expect(montarEditaveis([lanc({ origem: "BAIXA" })]).l1).toBeUndefined();
  });

  test("os dois lados da transferência apontam para a mesma transferência", () => {
    const r = montarEditaveis([
      lanc({ id: "s", origem: "TRANSFERENCIA", transferenciaId: "t1", tipo: "SAIDA", valor: "2000", classificacaoFiscal: null }),
      lanc({ id: "e", origem: "TRANSFERENCIA", transferenciaId: "t1", tipo: "ENTRADA", valor: "2000",
        contaBancariaId: "caixa", contaBancaria: CAIXA, grupoConciliacaoId: null, classificacaoFiscal: null }),
    ]);
    expect(r.s).toEqual(r.e);
    expect(r.s).toMatchObject({
      tipo: "transferencia", idParaExcluir: "s", contaOrigemId: "banco", contaDestinoId: "caixa",
      contaDestinoNome: "Caixa · Fazenda", ladoConciliado: null, valor: "2000.00",
    });
  });

  test("transferência com um lado conciliado diz qual", () => {
    const r = montarEditaveis([
      lanc({ id: "s", origem: "TRANSFERENCIA", transferenciaId: "t1", tipo: "SAIDA", grupoConciliacaoId: "g" }),
      lanc({ id: "e", origem: "TRANSFERENCIA", transferenciaId: "t1", tipo: "ENTRADA", contaBancariaId: "caixa", contaBancaria: CAIXA }),
    ]);
    expect(r.e).toMatchObject({ ladoConciliado: "Banco do Brasil - Ag 1234/CC 12345-6" });
  });

  test("transferência com um lado só na lista fica sem ações", () => {
    expect(montarEditaveis([lanc({ origem: "TRANSFERENCIA", transferenciaId: "t1" })]).l1).toBeUndefined();
  });
});

describe("opcoesComAtual", () => {
  test("acrescenta o cadastro gravado que não está entre os ativos", () => {
    expect(opcoesComAtual([{ id: "a", nome: "A" }], { id: "x", nome: "Inativa" })).toEqual([
      { id: "a", nome: "A" },
      { id: "x", nome: "Inativa" },
    ]);
  });
  test("não duplica e aceita nulo", () => {
    expect(opcoesComAtual([{ id: "a", nome: "A" }], { id: "a", nome: "A" })).toHaveLength(1);
    expect(opcoesComAtual([{ id: "a", nome: "A" }], null)).toHaveLength(1);
  });
});

test("paraCampoDeData usa o dia em UTC", () => {
  expect(paraCampoDeData(new Date("2026-11-20T00:00:00Z"))).toBe("2026-11-20");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/lancamentoEditavel.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/lib/lancamentoEditavel.ts`**

```ts
import { nomeDaContaBancaria } from "@/lib/contaBancaria";
import { formatarData, formatarMoeda } from "@/lib/formatacao";

/** O que a lista da Tesouraria já carrega de cada lançamento (`listarLancamentos`). */
export type LancamentoDaLista = {
  id: string;
  contaBancariaId: string;
  contaBancaria: Parameters<typeof nomeDaContaBancaria>[0];
  tipo: "ENTRADA" | "SAIDA";
  data: Date;
  valor: { toString(): string } | number | string;
  descricao: string;
  origem: "MANUAL" | "BAIXA" | "TRANSFERENCIA";
  transferenciaId: string | null;
  grupoConciliacaoId: string | null;
  categoriaFinanceiraId: string | null;
  centroCustoId: string | null;
  centroLucroId: string | null;
  safraId: string | null;
  projetoId: string | null;
  classificacaoFiscal: "FISCAL" | "GERENCIAL" | null;
  tipoComprovante: string | null;
  numeroComprovante: string | null;
};

export type LancamentoEditavel = {
  tipo: "manual";
  id: string;
  contaBancariaId: string;
  contaNome: string;
  tipoLancamento: "ENTRADA" | "SAIDA";
  data: string;
  valor: string;
  descricao: string;
  categoriaFinanceiraId: string | null;
  centroCustoId: string | null;
  centroLucroId: string | null;
  safraId: string | null;
  projetoId: string | null;
  classificacaoFiscal: "FISCAL" | "GERENCIAL";
  tipoComprovante: string | null;
  numeroComprovante: string | null;
  ligadoAoExtrato: boolean;
  /** "20/11/2026 · Conta · R$ 459,00", para a confirmação da exclusão. */
  resumo: string;
};

export type TransferenciaEditavel = {
  tipo: "transferencia";
  /** Um dos lados: o serviço exclui os dois a partir de qualquer um. */
  idParaExcluir: string;
  transferenciaId: string;
  contaOrigemId: string;
  contaOrigemNome: string;
  contaDestinoId: string;
  contaDestinoNome: string;
  data: string;
  valor: string;
  descricao: string;
  /** Nome da conta do lado ligado ao extrato, ou null. */
  ladoConciliado: string | null;
  resumo: string;
};

export type Editavel = LancamentoEditavel | TransferenciaEditavel;
export type Opcao = { id: string; nome: string };

/** Valor de um `<input type="date">`: o dia em UTC, como o formulário grava. */
export function paraCampoDeData(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function valorDoCampo(valor: LancamentoDaLista["valor"]): string {
  return Number(valor.toString()).toFixed(2);
}

/**
 * O que o diálogo de edição precisa, por id de lançamento. Baixa fica de fora
 * (corrige-se pelo estorno). Os dois lados de uma transferência apontam para o
 * mesmo objeto; se só um lado estiver na lista, ela fica sem ações.
 */
export function montarEditaveis(lancamentos: readonly LancamentoDaLista[]): Record<string, Editavel> {
  const resultado: Record<string, Editavel> = {};
  const porTransferencia = new Map<string, LancamentoDaLista[]>();

  for (const l of lancamentos) {
    if (l.origem === "MANUAL") {
      const contaNome = nomeDaContaBancaria(l.contaBancaria);
      resultado[l.id] = {
        tipo: "manual",
        id: l.id,
        contaBancariaId: l.contaBancariaId,
        contaNome,
        tipoLancamento: l.tipo,
        data: paraCampoDeData(l.data),
        valor: valorDoCampo(l.valor),
        descricao: l.descricao,
        categoriaFinanceiraId: l.categoriaFinanceiraId,
        centroCustoId: l.centroCustoId,
        centroLucroId: l.centroLucroId,
        safraId: l.safraId,
        projetoId: l.projetoId,
        classificacaoFiscal: l.classificacaoFiscal ?? "FISCAL",
        tipoComprovante: l.tipoComprovante,
        numeroComprovante: l.numeroComprovante,
        ligadoAoExtrato: l.grupoConciliacaoId !== null,
        resumo: `${formatarData(l.data)} · ${contaNome} · ${formatarMoeda(l.valor)}`,
      };
    } else if (l.origem === "TRANSFERENCIA" && l.transferenciaId) {
      porTransferencia.set(l.transferenciaId, [...(porTransferencia.get(l.transferenciaId) ?? []), l]);
    }
  }

  for (const [transferenciaId, lados] of porTransferencia) {
    const saida = lados.find((l) => l.tipo === "SAIDA");
    const entrada = lados.find((l) => l.tipo === "ENTRADA");
    if (lados.length !== 2 || !saida || !entrada) continue;
    const conciliado = lados.find((l) => l.grupoConciliacaoId !== null);
    const contaOrigemNome = nomeDaContaBancaria(saida.contaBancaria);
    const contaDestinoNome = nomeDaContaBancaria(entrada.contaBancaria);
    const editavel: TransferenciaEditavel = {
      tipo: "transferencia",
      idParaExcluir: saida.id,
      transferenciaId,
      contaOrigemId: saida.contaBancariaId,
      contaOrigemNome,
      contaDestinoId: entrada.contaBancariaId,
      contaDestinoNome,
      data: paraCampoDeData(saida.data),
      valor: valorDoCampo(saida.valor),
      descricao: saida.descricao,
      ladoConciliado: conciliado ? nomeDaContaBancaria(conciliado.contaBancaria) : null,
      resumo: `${formatarData(saida.data)} · ${contaOrigemNome} → ${contaDestinoNome} · ${formatarMoeda(saida.valor)}`,
    };
    resultado[saida.id] = editavel;
    resultado[entrada.id] = editavel;
  }

  return resultado;
}

/**
 * As opções ativas mais o cadastro já gravado no lançamento, se ele estiver
 * inativo. Sem isso o campo viria vazio e salvar apagaria a classificação.
 */
export function opcoesComAtual(opcoes: readonly Opcao[], atual: Opcao | null): Opcao[] {
  if (!atual || opcoes.some((o) => o.id === atual.id)) return [...opcoes];
  return [...opcoes, atual];
}
```

Confira se `formatarMoeda` devolve "R$ 459,00" com espaço normal ou não separável (` `). Se for não separável, ajuste a expectativa do teste para usar o mesmo caractere (por exemplo, monte o esperado com `formatarMoeda(459)`).

- [ ] **Step 4: Ações em `actions.ts`**

Acrescente os imports `editarLancamentoManual`, `editarTransferencia`, `excluirLancamento` (já vêm pelo `lancamentoService`) e no fim:

```ts
export async function editarLancamentoManualAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { erro: "Lançamento não informado" };
  const parsed = lancamentoManualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await lancamentoService.editarLancamentoManual(sessao, id, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/tesouraria");
  return { sucesso: true };
}

export async function editarTransferenciaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const transferenciaId = formData.get("transferenciaId");
  if (typeof transferenciaId !== "string" || !transferenciaId) return { erro: "Transferência não informada" };
  const parsed = transferenciaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await lancamentoService.editarTransferencia(sessao, transferenciaId, parsed.data);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/tesouraria");
  return { sucesso: true };
}

export async function excluirLancamentoAction(id: string, motivo: string): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  if (typeof id !== "string" || typeof motivo !== "string") return { erro: "Informe o motivo da exclusão" };

  try {
    await lancamentoService.excluirLancamento(sessao, id, motivo);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath("/financeiro/tesouraria");
  return { sucesso: true };
}
```

(A spec previa um `exclusaoLancamentoSchema`; o motivo é validado no serviço, como no estorno de baixa, e o schema não é necessário.)

- [ ] **Step 5: Rodar testes e tipos**

Run: `npx vitest run src/lib/lancamentoEditavel.test.ts && npx tsc --noEmit -p .`
Expected: PASS, sem erros de tipo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/lancamentoEditavel.ts src/lib/lancamentoEditavel.test.ts "src/app/(dashboard)/financeiro/tesouraria/actions.ts"
git commit -m "feat(tesouraria): dados de edição e ações de corrigir e excluir"
```

---

### Task 5: Tela da Tesouraria

**Files:**
- Modify: `src/app/(dashboard)/_shared/campos-classificacao-lancamento.tsx`
- Modify: `src/app/(dashboard)/financeiro/tesouraria/lancamento-dialog-form.tsx`
- Modify: `src/app/(dashboard)/financeiro/tesouraria/transferencia-dialog-form.tsx`
- Create: `src/app/(dashboard)/financeiro/tesouraria/excluir-lancamento-dialog.tsx`
- Create: `src/app/(dashboard)/financeiro/tesouraria/acoes-do-lancamento.tsx`
- Modify: `src/app/(dashboard)/financeiro/tesouraria/page.tsx`

**Interfaces:**
- Consumes: `Editavel`, `LancamentoEditavel`, `TransferenciaEditavel`, `opcoesComAtual`, `montarEditaveis` (Task 4); ações da Task 4.
- Produces: `<AcoesDoLancamento editavel opcoes />` usado pela página.

- [ ] **Step 1: Valores iniciais na classificação**

Em `CamposClassificacaoLancamento`, acrescente a prop opcional
`inicial?: { classificacaoFiscal: ClassificacaoFiscal; tipoComprovante: string | null; numeroComprovante: string | null }`
e use-a nos estados e no número:

```ts
  const [classificacao, setClassificacao] = useState<ClassificacaoFiscal>(inicial?.classificacaoFiscal ?? "FISCAL");
  const [tipo, setTipo] = useState<string>(inicial?.tipoComprovante ?? SEM_VALOR);
  ...
          <Input id={id("numeroComprovante")} name="numeroComprovante" placeholder="Opcional"
            defaultValue={inicial?.numeroComprovante ?? ""} />
```

- [ ] **Step 2: `LancamentoDialogForm` em modo edição**

Acrescente as props opcionais `lancamento?: LancamentoEditavel` e `gatilho?: ReactElement` (o botão que abre; padrão: o "Novo lançamento" de hoje). Regras:

- `const editando = lancamento !== undefined;`
- `const travado = lancamento?.ligadoAoExtrato ?? false;`
- Ação: `editando ? editarLancamentoManualAction : criarLancamentoManualAction` no `useAcaoDoDialogo`.
- Título: `editando ? "Editar lançamento" : "Novo lançamento"`.
- Dentro do `<form>`, quando editando: `<input type="hidden" name="id" value={lancamento.id} />`.
- Quando `travado`, logo abaixo do título:
  ```tsx
  <p className="text-sm text-muted-foreground">
    Ligado ao extrato: para mudar conta, tipo, data ou valor, desconcilie na Conciliação.
  </p>
  ```
- Conta, tipo, data e valor: `defaultValue` vindo do lançamento (`lancamento?.contaBancariaId`, `lancamento?.tipoLancamento ?? "ENTRADA"`, `lancamento?.data`, `lancamento?.valor`) e `disabled={travado}`. Campo desabilitado não vai no envio do formulário: quando `travado`, **tire o `name`** do controle visível e mande o valor num `<input type="hidden">`:
  ```tsx
  {travado ? <input type="hidden" name="contaBancariaId" value={lancamento.contaBancariaId} /> : null}
  <Select name={travado ? undefined : "contaBancariaId"} defaultValue={lancamento?.contaBancariaId} disabled={travado}>
  ```
  O mesmo para `tipo`, `valor` e `data`.
- Descrição: `defaultValue={lancamento?.descricao}`.
- Categoria e dimensões: `defaultValue={lancamento?.categoriaFinanceiraId ?? SEM_VALOR}` (e igual para `centroCustoId`, `centroLucroId`, `safraId`, `projetoId`).
- `<CamposClassificacaoLancamento comNumero inicial={lancamento ? { classificacaoFiscal: lancamento.classificacaoFiscal, tipoComprovante: lancamento.tipoComprovante, numeroComprovante: lancamento.numeroComprovante } : undefined} />`.
- `DialogTrigger`: `gatilho ? <DialogTrigger render={gatilho} /> : <DialogTrigger render={<Button variant="outline" size="sm" />}>Novo lançamento</DialogTrigger>`. Confira como `render` com filhos funciona no `DialogTrigger` do projeto (base-ui); se `render={gatilho}` sem filhos não mostrar o texto, passe o texto como filho: `<DialogTrigger render={<Button variant="ghost" size="sm" />}>Editar</DialogTrigger>`, recebendo `rotuloGatilho?: string` em vez de `gatilho`. Escolha a forma que funcionar e use a mesma na transferência.

Mantenha o comentário do topo ("Espelhado na ajuda...").

- [ ] **Step 3: `TransferenciaDialogForm` em modo edição**

Props opcionais `transferencia?: TransferenciaEditavel` e o mesmo gatilho do Step 2.

- `editando`, `travado = transferencia?.ladoConciliado != null`.
- Ação: `editando ? editarTransferenciaAction : criarTransferenciaAction`; título `"Editar transferência"`.
- Hidden `transferenciaId` quando editando.
- Nota quando travado:
  `Ligado ao extrato (lado de {transferencia.ladoConciliado}): para mudar contas, data ou valor, desconcilie na Conciliação.`
- Origem, destino, data e valor com `defaultValue` e a mesma técnica de hidden + sem `name` quando travado. Descrição sempre liberada.

- [ ] **Step 4: Diálogo de exclusão**

`excluir-lancamento-dialog.tsx`, no molde de `src/app/(dashboard)/financeiro/_titulos/estornar-dialog.tsx`:

```tsx
"use client";
// Espelhado na ajuda (src/ajuda/tesouraria/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Editavel } from "@/lib/lancamentoEditavel";
import { excluirLancamentoAction } from "./actions";

export function ExcluirLancamentoDialog({
  editavel,
  aberto,
  onOpenChange,
}: {
  editavel: Editavel;
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string>();
  const [pendente, iniciarTransicao] = useTransition();
  const ehTransferencia = editavel.tipo === "transferencia";

  function mudarAbertura(novo: boolean) {
    if (!novo) {
      setMotivo("");
      setErro(undefined);
    }
    onOpenChange(novo);
  }

  function confirmar() {
    const id = editavel.tipo === "transferencia" ? editavel.idParaExcluir : editavel.id;
    iniciarTransicao(async () => {
      const resultado = await excluirLancamentoAction(id, motivo);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      mudarAbertura(false);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={mudarAbertura}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ehTransferencia ? "Excluir transferência" : "Excluir lançamento"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p>{editavel.resumo}</p>
          <p className="text-muted-foreground">
            {ehTransferencia
              ? "Os dois lados da transferência saem das contas. A exclusão fica registrada na Auditoria, com o motivo."
              : "O lançamento sai da conta e dos relatórios. A exclusão fica registrada na Auditoria, com o motivo."}
          </p>
          <div className="space-y-2">
            <Label htmlFor="motivo-exclusao">Motivo</Label>
            <Input
              id="motivo-exclusao"
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Ex.: valor digitado errado"
            />
          </div>
          {erro ? (
            <p className="text-sm text-destructive" role="alert">
              {erro}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={pendente} onClick={() => mudarAbertura(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              disabled={pendente || motivo.trim().length === 0}
              onClick={confirmar}
            >
              {pendente ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Ações da linha**

`acoes-do-lancamento.tsx`:

```tsx
"use client";
// Espelhado na ajuda (src/ajuda/tesouraria/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Editavel, Opcao } from "@/lib/lancamentoEditavel";
import { LancamentoDialogForm } from "./lancamento-dialog-form";
import { TransferenciaDialogForm } from "./transferencia-dialog-form";
import { ExcluirLancamentoDialog } from "./excluir-lancamento-dialog";

export type OpcoesDoLancamento = {
  contasBancarias: Opcao[];
  categorias: Opcao[];
  centrosCusto: Opcao[];
  centrosLucro: Opcao[];
  safras: Opcao[];
  projetos: Opcao[];
};

export function AcoesDoLancamento({ editavel, opcoes }: { editavel: Editavel; opcoes: OpcoesDoLancamento }) {
  const [excluindo, setExcluindo] = useState(false);
  const ligadoAoExtrato = editavel.tipo === "manual" ? editavel.ligadoAoExtrato : editavel.ladoConciliado !== null;

  return (
    <div className="flex justify-end gap-1">
      {editavel.tipo === "manual" ? (
        <LancamentoDialogForm lancamento={editavel} {...opcoes} /* + o gatilho "Editar" escolhido no Step 2 */ />
      ) : (
        <TransferenciaDialogForm transferencia={editavel} contasBancarias={opcoes.contasBancarias} /* + gatilho */ />
      )}
      {/* span: botão desabilitado não mostra o title em todos os navegadores */}
      <span title={ligadoAoExtrato ? "Desconcilie na Conciliação para excluir" : undefined}>
        <Button variant="ghost" size="sm" disabled={ligadoAoExtrato} onClick={() => setExcluindo(true)}>
          Excluir
        </Button>
      </span>
      <ExcluirLancamentoDialog editavel={editavel} aberto={excluindo} onOpenChange={setExcluindo} />
    </div>
  );
}
```

O gatilho de edição é um `Button variant="ghost" size="sm"` com o texto "Editar".

- [ ] **Step 6: Página**

Em `page.tsx`:

1. Imports: `montarEditaveis`, `opcoesComAtual` de `@/lib/lancamentoEditavel`; `AcoesDoLancamento`, `type OpcoesDoLancamento` de `./acoes-do-lancamento`.
2. Depois de `opcoesContasBancarias`:

```ts
  const editaveis = podeEscrever ? montarEditaveis(lancamentos) : {};
  const porId = <T extends { id: string; nome: string }>(lista: readonly T[], id: string | null) =>
    id ? (lista.find((item) => item.id === id) ?? null) : null;
  const ativos = <T extends { ativo: boolean }>(lista: readonly T[]) => lista.filter((item) => item.ativo);

  /** Opções do diálogo de edição: as ativas mais o que já está gravado no lançamento. */
  function opcoesDe(lancamento: (typeof lancamentos)[number]): OpcoesDoLancamento {
    const contaAtual = { id: lancamento.contaBancariaId, nome: nomeDaContaBancaria(lancamento.contaBancaria) };
    return {
      contasBancarias: opcoesComAtual(opcoesContasBancarias, contaAtual),
      categorias: opcoesComAtual(ativos(categorias), porId(categorias, lancamento.categoriaFinanceiraId)),
      centrosCusto: opcoesComAtual(ativos(centrosCusto), porId(centrosCusto, lancamento.centroCustoId)),
      centrosLucro: opcoesComAtual(ativos(centrosLucro), porId(centrosLucro, lancamento.centroLucroId)),
      safras: opcoesComAtual(ativos(safras), porId(safras, lancamento.safraId)),
      projetos: opcoesComAtual(ativos(projetos), porId(projetos, lancamento.projetoId)),
    };
  }
```

Para transferência, a conta da outra ponta também precisa estar nas opções. No editável de transferência, acrescente as duas contas: em `opcoesDe`, quando `editaveis[lancamento.id]?.tipo === "transferencia"`, use
`opcoesComAtual(opcoesComAtual(opcoesContasBancarias, { id: e.contaOrigemId, nome: e.contaOrigemNome }), { id: e.contaDestinoId, nome: e.contaDestinoNome })`.

Observação: o "Novo lançamento" passa hoje `categorias` sem filtrar ativo. Mantenha como está no botão de criar (não é escopo).

3. Selo "Conciliado" na célula da origem (visível para todos):

```tsx
              <TableCell>
                <Badge variant="outline">{ORIGEM_LABEL[lancamento.origem]}</Badge>
                {lancamento.grupoConciliacaoId ? (
                  <Badge variant="secondary" className="ml-1">
                    Conciliado
                  </Badge>
                ) : null}
              </TableCell>
```

4. Coluna de ações, só com `podeEscrever`: `<TableHead className="w-0" />` no cabeçalho e, no fim da linha,

```tsx
              {podeEscrever ? (
                <TableCell>
                  {editaveis[lancamento.id] ? (
                    <AcoesDoLancamento editavel={editaveis[lancamento.id]} opcoes={opcoesDe(lancamento)} />
                  ) : null}
                </TableCell>
              ) : null}
```

`listarLancamentos` já devolve `grupoConciliacaoId`, `transferenciaId` e os ids das dimensões (é o registro inteiro com `contaBancaria.banco`); confira e, se o tipo do `lancamentos` não bater com `LancamentoDaLista` (por exemplo `valor` como `Decimal`), ajuste `LancamentoDaLista` em vez de converter na página.

- [ ] **Step 7: Tipos, lint e testes**

Run: `npx tsc --noEmit -p . && npm run lint && npx vitest run src/lib src/server/services/lancamentoBancario.test.ts`
Expected: tudo passa.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/_shared/campos-classificacao-lancamento.tsx" "src/app/(dashboard)/financeiro/tesouraria"
git commit -m "feat(tesouraria): editar e excluir na lista de lançamentos, com selo Conciliado"
```

---

### Task 6: Ajuda, backlog e spec

**Files:**
- Modify: `src/ajuda/tesouraria/alvos.ts`, `exemplo.ts`, `cenas.tsx`, `roteiros.ts`, `index.ts`, `roteiros.test.ts`
- Modify: `src/ajuda/registro.test.ts:38`
- Modify: `src/ajuda/conciliacao/roteiros.ts:262-266`
- Modify: `docs/backlog.md` (seção "### 6. Lançamento manual e transferência não podem ser corrigidos", linhas 262–283)
- Modify: `docs/superpowers/specs/2026-11-26-corrigir-lancamento-design.md`

**Interfaces:**
- Consumes: textos e rótulos da tela (Task 5): botões "Editar" e "Excluir", selo "Conciliado", títulos "Editar lançamento" e "Excluir lançamento", campo "Motivo".

O exemplo do roteiro novo usa a linha "Diárias da colheita" (Caixa, Manual, R$ 650,00) que já está na lista da cena: foram R$ 560,00. A tarifa não serve, porque na história ela ainda não foi lançada. O lado do Banco do Brasil do saque aparece Conciliado.

- [ ] **Step 1: Testes que falham**

Em `src/ajuda/tesouraria/roteiros.test.ts`:

```ts
  test("são os 5 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual([
      "lancar-avulso",
      "transferir",
      "conferir-saldo",
      "ver-lancamentos",
      "corrigir-lancamento",
    ]);
  });

  test("a lista mostra o selo Conciliado e as ações só em Manual e Transferência", () => {
    const html = renderToStaticMarkup(createElement(cenas.painel, { valores: {} }));
    expect(html).toContain("Conciliado");
    expect(html).toContain('data-alvo="painel.acoes"');
    expect(html.match(/>Editar</g)?.length).toBe(3); // 2 lados do saque + diárias; a baixa fica sem
  });

  test("nenhum texto diz mais que o lançamento não pode ser corrigido", () => {
    const textos = JSON.stringify(roteiros);
    expect(textos).not.toMatch(/não pode ser editad|sentido contrário/);
  });
```

(substitua o teste "são os 4 roteiros"). Em `src/ajuda/registro.test.ts:38`, troque `toBe(4)` por `toBe(5)`.

Run: `npx vitest run src/ajuda/tesouraria src/ajuda/registro.test.ts`
Expected: FAIL.

- [ ] **Step 2: Exemplo e alvos**

`exemplo.ts`: em cada item de `LANCAMENTOS`, acrescente `conciliado` e `acoes` onde couber:
- Baixa: sem mudança (sem ações).
- Saque, lado Banco do Brasil: `conciliado: true, acoes: true`.
- Saque, lado Caixa: `acoes: true`.
- Diárias da colheita: `acoes: true`.

E no fim:

```ts
/** Lançamento corrigido no roteiro "Corrigir ou excluir um lançamento". */
export const DIARIAS = {
  descricao: "Diárias da colheita",
  valorErrado: "650,00",
  valorCerto: "560,00",
  motivo: "Lançado em duplicidade",
} as const;
```

`alvos.ts`: em `painel`, acrescente `"painel.acoes"` e `"painel.conciliado"`; novas cenas:

```ts
  editar: ["editar.valor", "editar.salvar"],
  excluir: ["excluir.motivo", "excluir.confirmar"],
```

- [ ] **Step 3: Cenas**

Em `cenas.tsx` (`CenaPainel`):
- Na célula da origem, depois do selo da origem:
  ```tsx
  {"conciliado" in l && l.conciliado ? (
    i === 1 ? (
      <Alvo nome="painel.conciliado" className="ml-1 inline-block">
        <Badge variant="secondary">Conciliado</Badge>
      </Alvo>
    ) : (
      <Badge variant="secondary" className="ml-1">Conciliado</Badge>
    )
  ) : null}
  ```
  (só a primeira ocorrência leva o alvo; hoje só uma linha é conciliada, então basta `<Alvo nome="painel.conciliado" ...>` sem o ternário, se preferir.)
- Coluna nova no cabeçalho `<TableHead className="w-0" />` e, no fim da linha:
  ```tsx
  <TableCell>
    {"acoes" in l && l.acoes ? (
      l.descricao === DIARIAS.descricao ? (
        <Alvo nome="painel.acoes" className="inline-flex gap-1">
          <BotaoSimulado variant="ghost" size="sm">Editar</BotaoSimulado>
          <BotaoSimulado variant="ghost" size="sm">Excluir</BotaoSimulado>
        </Alvo>
      ) : (
        <div className="flex gap-1">
          <BotaoSimulado variant="ghost" size="sm">Editar</BotaoSimulado>
          <BotaoSimulado variant="ghost" size="sm">Excluir</BotaoSimulado>
        </div>
      )
    ) : null}
  </TableCell>
  ```
  Confira se `BotaoSimulado` aceita `disabled`; se aceitar, desabilite o Excluir das duas linhas do saque (a transferência tem um lado conciliado). Se não aceitar, acrescente a prop `disabled?: boolean` repassada ao `Button` em `src/components/ajuda/campos-simulados.tsx`.

Cenas novas:

```tsx
export function CenaEditar({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo="Editar lançamento">
      <SelectSimulado rotulo="Conta bancária" valor={CAIXA} />
      <div className="grid grid-cols-2 gap-4">
        <SelectSimulado rotulo="Tipo" valor="Saída" />
        <CampoSimulado alvo="editar.valor" rotulo="Valor" valor={valores["editar.valor"] ?? DIARIAS.valorErrado} />
      </div>
      <CampoSimulado rotulo="Data" valor="18/11/2026" />
      <CampoSimulado rotulo="Descrição" valor={DIARIAS.descricao} />
      <div className="grid grid-cols-2 gap-4">
        <SelectSimulado rotulo="Classificação" valor="Gerencial (sem nota)" />
        <SelectSimulado rotulo="Comprovante" valor="Nenhum" />
      </div>
      <BotaoSimulado alvo="editar.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

export function CenaExcluir({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo="Excluir lançamento">
      <p className="text-sm">{`18/11/2026 · ${CAIXA} · R$ ${DIARIAS.valorErrado}`}</p>
      <p className="text-sm text-muted-foreground">
        O lançamento sai da conta e dos relatórios. A exclusão fica registrada na Auditoria, com o motivo.
      </p>
      <CampoSimulado
        alvo="excluir.motivo"
        rotulo="Motivo"
        valor={valores["excluir.motivo"]}
        placeholder="Ex.: valor digitado errado"
      />
      <BotaoSimulado alvo="excluir.confirmar" variant="destructive" largo>
        Excluir
      </BotaoSimulado>
    </JanelaSimulada>
  );
}
```

Confira se `CampoSimulado` e `SelectSimulado` aceitam ser usados sem `alvo` (o `SelectSimulado` já é usado assim em `CenaLancamento`; para `CampoSimulado`, verifique a assinatura e, se `alvo` for obrigatório, use `SelectSimulado` ou um `<div>` simples). Confira também se `BotaoSimulado` aceita `variant="destructive"`.

Em `index.ts`, registre `editar: CenaEditar, excluir: CenaExcluir` em `cenas` e importe as funções.

- [ ] **Step 4: Roteiros**

Em `src/ajuda/tesouraria/roteiros.ts`:

1. Apague a constante `SEM_CORRECAO` e troque a `explicacao` do passo `lanc.salvar` por:
   `"O lançamento entra na lista na hora. Se errar, dá para corrigir ou excluir depois pela própria lista (roteiro “Corrigir ou excluir um lançamento”)."`
2. No passo `transf.salvar` do `transferir`, troque a explicação por:
   `"A transferência entra na lista como dois lançamentos. Se errar, Editar ou Excluir em qualquer um dos dois lados corrige a transferência inteira."`
3. No `ver-lancamentos`, troque `eDepois` por:
   ```ts
    eDepois: {
      texto:
        "Lançou errado? Os lançamentos Manuais e as Transferências têm Editar e Excluir na própria linha. Para " +
        "conferir com o banco, use o roteiro “Conferir o saldo com o extrato”.",
      proximoRoteiro: "corrigir-lancamento",
    },
   ```
4. Acrescente o roteiro (importe `DIARIAS` de `./exemplo`):

```ts
  roteiro({
    id: "corrigir-lancamento",
    titulo: "Corrigir ou excluir um lançamento",
    quandoUsar:
      "Quando um lançamento manual ou uma transferência foi salvo com conta, valor, data, descrição ou " +
      "classificação errados, ou nem deveria existir. Lançamentos de origem Baixa não aparecem com esses botões: " +
      "eles se corrigem estornando a baixa, em Contas a pagar ou a receber.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "painel",
        alvo: "painel.acoes",
        instrucao: "Na linha do lançamento, clique em Editar",
        explicacao:
          `No exemplo, as diárias da colheita foram lançadas como R$ ${DIARIAS.valorErrado}, mas foram ` +
          `R$ ${DIARIAS.valorCerto}. Numa transferência, Editar em qualquer um dos dois lados abre a ` +
          "transferência inteira.",
      },
      {
        cena: "editar",
        alvo: "editar.valor",
        instrucao: "Corrija o que estiver errado",
        explicacao:
          "Todos os campos do lançamento podem mudar: conta, tipo, valor, data, descrição, classificação, " +
          "categoria e as dimensões.",
        preenche: { "editar.valor": DIARIAS.valorCerto },
      },
      {
        cena: "editar",
        alvo: "editar.salvar",
        instrucao: "Clique em Salvar",
        explicacao:
          "O saldo, o fluxo de caixa e o orçamento passam a usar o valor novo. A Auditoria guarda o antes e o " +
          "depois, com quem mudou e quando.",
      },
      {
        cena: "painel",
        alvo: "painel.conciliado",
        instrucao: "Repare no selo Conciliado",
        explicacao:
          "Ele aparece no lançamento que já foi ligado a uma linha do extrato. Nele, só a descrição e a " +
          "classificação mudam, e o Excluir fica desabilitado: conta, tipo, valor e data já foram confirmados " +
          "pelo banco.",
        dica:
          "Se a conciliação estiver errada, desfaça-a na Conciliação (roteiro “Desfazer uma conciliação”). O " +
          "lançamento volta a ficar solto e pode ser corrigido ou excluído.",
      },
      {
        cena: "excluir",
        alvo: "excluir.motivo",
        instrucao: "Para excluir, clique em Excluir e escreva o motivo",
        explicacao:
          "O motivo é obrigatório. Numa transferência, os dois lados saem juntos.",
        preenche: { "excluir.motivo": DIARIAS.motivo },
      },
      {
        cena: "excluir",
        alvo: "excluir.confirmar",
        instrucao: "Confirme em Excluir",
        explicacao:
          "O lançamento sai da lista e dos relatórios. A Auditoria guarda o lançamento inteiro, quem excluiu, " +
          "quando e o motivo.",
      },
    ],
    eDepois: {
      texto:
        "Confira o saldo da conta no quadro do alto da tela. Se tinha informado o saldo do banco, a diferença já " +
        "considera a correção.",
      proximoRoteiro: "conferir-saldo",
    },
  }),
```

Confira em `src/ajuda/tipos.ts` se `dica` é aceito no passo (é: `dica?: string`) e se o id do roteiro de desconciliar na Conciliação tem esse título ("Desfazer uma conciliação e reprocessar pendentes"); ajuste o nome citado na dica para o título real.

- [ ] **Step 5: Conciliação**

Em `src/ajuda/conciliacao/roteiros.ts`, no `eDepois` do `criar-lancamento`:

```ts
      texto:
        "O lançamento aparece na Tesouraria com a origem Manual e o selo Conciliado, e a linha fica Conciliado. " +
        "Descrição e classificação podem ser corrigidas depois na Tesouraria; para mudar valor ou data, ou " +
        "excluir, desfaça a conciliação antes.",
```

- [ ] **Step 6: Backlog e spec**

- `docs/backlog.md`: apague a seção inteira "### 6. Lançamento manual e transferência não podem ser corrigidos" (do título até a linha antes de "### 7."). Não renumere os outros itens.
- Spec: troque `Status: aprovada, aguardando plano` por `Status: implementada (2026-11-26)`. Na seção "Ajuda", troque "Exemplo: a tarifa de R$ 45,90 lançada como R$ 459,00, nos dados de `exemplo.ts`" por "Exemplo: as diárias da colheita lançadas como R$ 650,00 em vez de R$ 560,00 (a tarifa, na história da ajuda, ainda não foi lançada)". Na seção "Ações", registre que o motivo é validado no serviço, sem `exclusaoLancamentoSchema`.

- [ ] **Step 7: Rodar os testes**

Run: `npx vitest run src/ajuda src/lib/auditoria`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ajuda docs/backlog.md docs/superpowers/specs/2026-11-26-corrigir-lancamento-design.md
git commit -m "docs(ajuda): corrigir ou excluir lançamento na Tesouraria; item 6 sai do backlog"
```

---

### Task 7: Verificação final

- [ ] **Step 1: Suíte inteira, tipos e lint**

Run: `npx vitest run && npx tsc --noEmit -p . && npm run lint`
Expected: tudo passa. Se algum teste falhar por motivo alheio (por exemplo, dependente da hora), confira em `git stash` se já falhava na `staging` antes de mexer.

- [ ] **Step 2: Conferência no navegador**

Com `npm run dev` (porta 3000; ver armadilhas do ambiente de desenvolvimento), logado como Administrador numa filial com conta de banco e conta Caixa:
1. Lançamento manual no banco: Editar → mudar valor e categoria → Salvar; saldo muda.
2. Mudar a conta para Caixa; lançamento fica sem precisar do extrato.
3. Conciliar um lançamento na Conciliação; na Tesouraria aparece o selo, Editar trava conta/tipo/data/valor com a nota, Excluir fica desabilitado.
4. Transferência: Editar pelo lado da entrada muda os dois lados; Excluir com motivo apaga os dois.
5. Excluir manual sem motivo: botão desabilitado; com motivo, sai da lista.
6. Auditoria mostra Editar, Editar transferência, Excluir e Excluir transferência com antes/depois e motivo.
7. Ajuda (?) da Tesouraria: roteiro novo passo a passo, alvos destacados.

Anote o que foi visto; corrija o que falhar antes de declarar pronto.
