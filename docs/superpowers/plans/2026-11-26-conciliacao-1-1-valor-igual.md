# Confirmar 1:1 só com valor igual — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nenhuma conciliação é gravada com soma diferente entre extrato e lançamentos; o Confirmar (1:1) só aceita e só oferece lançamento de valor e sentido iguais.

**Architecture:** a reconferência da soma vai para `vincularEmGrupo`, o ponto único que grava conciliações, dentro da transação e depois de prender as linhas. `confirmarConciliacaoManual` confere valor e sentido antes, com mensagem própria. Os candidatos da linha ganham `valorIgual` e `diasDeDiferenca`; a tela mostra só os de valor igual e, sem nenhum, um aviso.

**Tech Stack:** Next.js (App Router, server actions), Prisma 7 + PostgreSQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-conciliacao-1-1-valor-igual-design.md`

## Global Constraints

- Textos de tela, mensagens e comentários em pt-BR, no estilo dos arquivos vizinhos.
- Mensagem da corrida (exata): "Algum lançamento mudou enquanto você conciliava. Confira os valores e tente de novo."
- Soma "com sentido": entrada +, saída −, calculada por `diferencaDoGrupo` (`src/lib/conciliacaoGrupo.ts`).
- Nada de consultas em paralelo (`Promise.all`) dentro de `prisma.$transaction`.
- Testes de serviço usam o banco de teste e `criarFixtureFinanceiro(sufixo, "TESOURARIA")`. Rodar pelo PowerShell: `Set-Location D:\Projetos\nx-control-erp; npx vitest run <arquivo>`.
- Sem mudança de schema. Edite com a ferramenta Edit; nunca Prettier.
- Commits em pt-BR `tipo(escopo): descrição`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Arquivos

| Arquivo | O quê |
|---|---|
| `src/server/services/conciliacao.ts` | reconferência em `vincularEmGrupo`, erro novo, pulo na automática, checagens do 1:1, campos dos candidatos |
| `src/server/services/conciliacao.test.ts` | testes novos |
| `src/app/(dashboard)/financeiro/conciliacao/actions.ts` | repassar `valorIgual` e `diasDeDiferenca` |
| `src/app/(dashboard)/financeiro/conciliacao/linha-extrato-actions.tsx` | caixa só com valor igual; aviso |
| `src/ajuda/conciliacao/roteiros.ts` (+ `roteiros.test.ts`) | textos |
| `docs/backlog.md`, spec | tirar o item 8; status |

---

### Task 1: Soma conferida em todo vínculo

**Files:**
- Modify: `src/server/services/conciliacao.ts` (`ItemJaConciliadoError` ~175, `vincularEmGrupo` ~187-211, `processarLinhasPendentes` ~226-270, `conciliarEmGrupo` ~620-647)
- Test: `src/server/services/conciliacao.test.ts`

**Interfaces:**
- Produces: classe interna `SomaDoGrupoMudouError` (mensagem da corrida); `vincularEmGrupo` passa a lançá-la quando a soma relida não fecha.

- [ ] **Step 1: Testes que falham**

No FIM de `conciliacao.test.ts` (depois de todos os `describe`; `ofxCom`, `TransacaoOfx`, `arquivoOfx` e `lancamentosDoGrupoDaLinha` já existem no arquivo), acrescente o import que faltar (`conciliarAutomaticamente`, `confirmarConciliacaoManual` — confira os imports do topo e do meio do arquivo e não duplique) e:

```ts
describe("soma conferida dentro da transação", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBS", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  async function lancamento(valor: number, tipo: "ENTRADA" | "SAIDA", descricao: string, data = "2026-10-05") {
    return prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date(`${data}T00:00:00Z`),
        tipo,
        valor,
        descricao,
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
      },
    });
  }

  async function importar(transacoes: TransacaoOfx[]) {
    const extrato = await importarExtratoOfx(fixture.sessao, fixture.contaBancariaId, ofxCom(transacoes));
    const criadas = await prisma.linhaExtrato.findMany({ where: { extratoImportadoId: extrato.id } });
    return { extrato, linhas: transacoes.map((t) => criadas.find((l) => l.identificadorBancario === t.fitid)!) };
  }

  test("1:1: lançamento editado entre a leitura e o vínculo — erro e nada é gravado", async () => {
    const { linhas: [linha] } = await importar([{ fitid: "SOMA-1", data: "20261005", valor: "-300.00", nome: "TARIFA" }]);
    const lanc = await lancamento(300, "SAIDA", "Tarifa");
    const lido = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lanc.id } });
    await prisma.lancamentoBancario.update({ where: { id: lanc.id }, data: { valor: 310 } });
    // O serviço recebe a leitura de antes da edição.
    const espiao = vi.spyOn(prisma.lancamentoBancario, "findFirst").mockResolvedValueOnce(lido);
    try {
      await expect(confirmarConciliacaoManual(fixture.sessao, linha.id, lanc.id)).rejects.toThrow(
        "Algum lançamento mudou enquanto você conciliava. Confira os valores e tente de novo.",
      );
    } finally {
      espiao.mockRestore();
    }
    const linhaDepois = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linha.id } });
    expect(linhaDepois.grupoConciliacaoId).toBeNull();
    const lancDepois = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lanc.id } });
    expect(lancDepois.conciliado).toBe(false);
    expect(lancDepois.grupoConciliacaoId).toBeNull();
  });

  test("automática: lançamento editado depois da classificação — a linha é pulada e a rodada segue", async () => {
    const { extrato, linhas: [linha] } = await importar([
      { fitid: "SOMA-AUTO-1", data: "20261006", valor: "-150.00", nome: "TARIFA" },
    ]);
    const lanc = await lancamento(150, "SAIDA", "Tarifa automática", "2026-10-06");
    const candidatosLidos = await prisma.lancamentoBancario.findMany({ where: { id: lanc.id } });
    await prisma.lancamentoBancario.update({ where: { id: lanc.id }, data: { valor: 160 } });
    // A busca de candidatos da rodada recebe a leitura de antes da edição.
    const espiao = vi.spyOn(prisma.lancamentoBancario, "findMany").mockResolvedValueOnce(candidatosLidos);
    try {
      const resultado = await conciliarAutomaticamente(fixture.sessao, extrato.id);
      expect(resultado.conciliadasAutomaticamente).toBe(0);
    } finally {
      espiao.mockRestore();
    }
    const linhaDepois = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linha.id } });
    expect(linhaDepois.grupoConciliacaoId).toBeNull();
    expect((await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lanc.id } })).conciliado).toBe(false);
  });
});
```

Confira antes: `importarExtratoOfx` não chama `prisma.lancamentoBancario.findMany` (se chamar, o `mockResolvedValueOnce` seria consumido na importação — nesse caso, importe ANTES de criar o espião, como já está no código acima, e confirme que `conciliarAutomaticamente` é quem faz a primeira chamada a `findMany`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/conciliacao.test.ts -t "soma conferida"`
Expected: FAIL — o 1:1 grava (sem erro) e a automática concilia 1.

- [ ] **Step 3: Implementar**

1. Logo depois de `class ItemJaConciliadoError`:

```ts
/** A soma relida dentro da transação não fecha: algum lançamento foi editado no meio do caminho. */
class SomaDoGrupoMudouError extends Error {
  constructor() {
    super("Algum lançamento mudou enquanto você conciliava. Confira os valores e tente de novo.");
  }
}
```

2. Em `vincularEmGrupo`, depois do `if (linhas.count !== ... ) throw new ItemJaConciliadoError();` e antes do `return grupo.id;`:

```ts
  // Lançamentos podem ser editados na Tesouraria. Com linhas e lançamentos já presos (e travados) pelo vínculo,
  // confere de novo a soma com o que está gravado; se algo mudou desde a leitura, o erro desfaz tudo.
  const linhasAtuais = await tx.linhaExtrato.findMany({ where: { id: { in: dados.linhaIds } } });
  const lancamentosAtuais = await tx.lancamentoBancario.findMany({ where: { id: { in: dados.lancamentoIds } } });
  const diferenca = diferencaDoGrupo(
    linhasAtuais.map((l) => ({ valor: Number(l.valor), tipo: l.tipo })),
    lancamentosAtuais.map((l) => ({ valor: Number(l.valor), tipo: l.tipo })),
  );
  if (diferenca !== 0) throw new SomaDoGrupoMudouError();
```

Atualize o comentário JSDoc de `vincularEmGrupo`: "Quem chama já conferiu filial e conta; a soma é conferida aqui, com o que está gravado."

3. Em `processarLinhasPendentes`, no `catch`:

```ts
        // Outra pessoa conciliou a linha ou o lançamento, ou editou o lançamento, no meio da rodada: segue.
        if (erro instanceof ItemJaConciliadoError || erro instanceof SomaDoGrupoMudouError) continue;
```

4. Em `conciliarEmGrupo`, apague o bloco que vem depois de `vincularEmGrupo` (o comentário "Os lançamentos agora podem ser editados…", `idsDosLancamentos`, `linhasAtuais`, `lancamentosAtuais`, `diferencaAtual` e o `throw`), deixando o `return { grupoConciliacaoId, lancamentoDiferencaId };`. Se `idsDosLancamentos` era usado só ali, ele sai junto; a chamada a `vincularEmGrupo` continua passando os ids com o da diferença.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/services/conciliacao.test.ts`
Expected: PASS — inclusive o teste existente "lançamento editado entre a leitura e o vínculo: erro e nada é gravado" do `conciliarEmGrupo`, que agora passa pela conferência em `vincularEmGrupo`.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/conciliacao.ts src/server/services/conciliacao.test.ts
git commit -m "fix(conciliacao): soma conferida dentro da transação em todo vínculo"
```

---

### Task 2: 1:1 com valor e sentido iguais; candidatos marcados

**Files:**
- Modify: `src/server/services/conciliacao.ts` (`buscarCandidatosDaLinha` ~336, `confirmarConciliacaoManual` ~346)
- Test: `src/server/services/conciliacao.test.ts`

**Interfaces:**
- Consumes: `vincularEmGrupo` com a reconferência (Task 1).
- Produces: `buscarCandidatosDaLinha(sessao, linhaExtratoId)` devolve os registros de `LancamentoBancario` de antes, cada um com mais `valorIgual: boolean` e `diasDeDiferenca: number` (inteiro, |data do candidato − data da linha| em dias, arredondado).

- [ ] **Step 1: Testes que falham**

No `describe("soma conferida dentro da transação")` da Task 1 (mesma fixture e helpers), acrescente:

```ts
  test("1:1 com valor diferente é recusado e nada é gravado", async () => {
    const { linhas: [linha] } = await importar([{ fitid: "VAL-1", data: "20261007", valor: "-990.00", nome: "BOLETO" }]);
    const lanc = await lancamento(1000, "SAIDA", "Boleto", "2026-10-07");
    await expect(confirmarConciliacaoManual(fixture.sessao, linha.id, lanc.id)).rejects.toThrow(
      /tem valor diferente da linha .* Se foi digitado errado, corrija na Tesouraria; se a diferença é real, use Conciliar em grupo com “Lançar a diferença”\./,
    );
    expect((await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linha.id } })).grupoConciliacaoId).toBeNull();
  });

  test("1:1 com sentido diferente é recusado", async () => {
    const { linhas: [linha] } = await importar([{ fitid: "SEN-1", data: "20261008", valor: "-200.00", nome: "PIX" }]);
    const lanc = await lancamento(200, "ENTRADA", "Recebimento", "2026-10-08");
    await expect(confirmarConciliacaoManual(fixture.sessao, linha.id, lanc.id)).rejects.toThrow(
      "O lançamento é uma entrada e a linha do extrato é uma saída.",
    );
  });

  test("1:1 com valor igual e data a mais de 3 dias (Divergência de data) passa", async () => {
    const { linhas: [linha] } = await importar([{ fitid: "DAT-1", data: "20261009", valor: "-75.00", nome: "TARIFA" }]);
    const lanc = await lancamento(75, "SAIDA", "Tarifa atrasada", "2026-10-19");
    await confirmarConciliacaoManual(fixture.sessao, linha.id, lanc.id);
    expect(await lancamentosDoGrupoDaLinha(linha.id)).toEqual([lanc.id]);
  });

  test("candidatos da linha vêm com valorIgual e diasDeDiferenca", async () => {
    const { linhas: [linha] } = await importar([{ fitid: "CAN-1", data: "20261012", valor: "-500.00", nome: "BOLETO" }]);
    const igual = await lancamento(500, "SAIDA", "Boleto certo", "2026-10-14");
    const diferente = await lancamento(550, "SAIDA", "Boleto errado", "2026-10-12");
    const candidatos = await buscarCandidatosDaLinha(fixture.sessao, linha.id);
    const porId = new Map(candidatos.map((c) => [c.id, c]));
    expect(porId.get(igual.id)).toMatchObject({ valorIgual: true, diasDeDiferenca: 2 });
    expect(porId.get(diferente.id)).toMatchObject({ valorIgual: false, diasDeDiferenca: 0 });
  });
```

As linhas do OFX são gravadas ao meio-dia (`DTPOSTED …120000`); confira em `ofxParser.ts` como a data é guardada. Se for meio-dia UTC, a diferença entre a linha (12/10 12:00) e o lançamento de 14/10 00:00 é 1,5 dia: o arredondamento (`Math.round`) dá 2; e 12/10 00:00 dá 0,5 → `Math.round(0.5)` = 1 em JS. Para não depender disso, calcule `diasDeDiferenca` comparando só o DIA em UTC (`toISOString().slice(0, 10)`), como no código abaixo — aí as expectativas acima (2 e 0) valem.

Garanta os imports de `buscarCandidatosDaLinha` e `confirmarConciliacaoManual` no arquivo (sem duplicar).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/conciliacao.test.ts -t "soma conferida"`
Expected: FAIL — valor/sentido diferentes são aceitos; `valorIgual` indefinido.

- [ ] **Step 3: Implementar**

1. Perto de `janelaDeBusca`:

```ts
/** Dias entre duas datas, comparando só o dia (UTC): a linha do OFX vem com hora, o lançamento não. */
function diasEntre(a: Date, b: Date): number {
  const dia = (d: Date) => Date.parse(d.toISOString().slice(0, 10));
  return Math.round(Math.abs(dia(a) - dia(b)) / UM_DIA_MS);
}
```

2. `buscarCandidatosDaLinha`:

```ts
export async function buscarCandidatosDaLinha(sessao: SessaoAtiva, linhaExtratoId: string) {
  const linha = await prisma.linhaExtrato.findFirst({
    where: { id: linhaExtratoId, contaBancaria: { filialId: sessao.filialId } },
  });
  if (!linha) {
    throw new Error("Linha de extrato não pertence à filial ativa");
  }
  const candidatos = await buscarCandidatosLancamento(linha.contaBancariaId, linha.tipo, linha.data);
  // O Confirmar (1:1) só aceita valor igual; os outros servem para o aviso da tela.
  return candidatos.map((c) => ({
    ...c,
    valorIgual: c.valor.equals(linha.valor),
    diasDeDiferenca: diasEntre(c.data, linha.data),
  }));
}
```

3. `confirmarConciliacaoManual`, depois do `if (!lancamento) throw …` e antes do `prisma.$transaction`:

```ts
  const sentido = (tipo: TipoLancamento) => (tipo === "ENTRADA" ? "uma entrada" : "uma saída");
  if (lancamento.tipo !== linha.tipo) {
    throw new Error(`O lançamento é ${sentido(lancamento.tipo)} e a linha do extrato é ${sentido(linha.tipo)}.`);
  }
  if (!lancamento.valor.equals(linha.valor)) {
    throw new Error(
      `O lançamento tem valor diferente da linha (${formatarMoeda(lancamento.valor)} no lançamento, ` +
        `${formatarMoeda(linha.valor)} no extrato). Se foi digitado errado, corrija na Tesouraria; ` +
        "se a diferença é real, use Conciliar em grupo com “Lançar a diferença”.",
    );
  }
```

(`TipoLancamento` e `formatarMoeda` já são importados no arquivo.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/services/conciliacao.test.ts`
Expected: PASS (todo o arquivo; os testes antigos de 1:1 usam valor e sentido iguais — se algum usar valor diferente, é o comportamento que a spec proíbe: ajuste o dado do teste para valor igual e anote no relatório).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/conciliacao.ts src/server/services/conciliacao.test.ts
git commit -m "fix(conciliacao): confirmar 1:1 só com valor e sentido iguais"
```

---

### Task 3: Tela da Conciliação

**Files:**
- Modify: `src/app/(dashboard)/financeiro/conciliacao/actions.ts:88-99`
- Modify: `src/app/(dashboard)/financeiro/conciliacao/linha-extrato-actions.tsx`

**Interfaces:**
- Consumes: `buscarCandidatosDaLinha` com `valorIgual` e `diasDeDiferenca` (Task 2).

- [ ] **Step 1: Ação**

```ts
export async function buscarCandidatosAction(linhaExtratoId: string) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "conciliacao:ler");
  const candidatos = await conciliacaoService.buscarCandidatosDaLinha(sessao, linhaExtratoId);
  return candidatos.map((c) => ({
    id: c.id,
    data: formatarData(c.data),
    valor: formatarMoeda(c.valor),
    descricao: c.descricao,
    conciliado: c.conciliado,
    valorIgual: c.valorIgual,
    diasDeDiferenca: c.diasDeDiferenca,
  }));
}
```

- [ ] **Step 2: Componente**

Em `linha-extrato-actions.tsx`:

1. Tipo: `type Candidato = { id: string; data: string; valor: string; descricao: string; conciliado: boolean; valorIgual: boolean; diasDeDiferenca: number };`
2. Troque `const candidatosSelecionaveis = candidatos.filter((c) => !c.conciliado);` por:

```tsx
  // O Confirmar (1:1) só aceita lançamento de valor igual ao da linha.
  const candidatosSelecionaveis = candidatos.filter((c) => !c.conciliado && c.valorIgual);
  const valorDiferente = candidatos
    .filter((c) => !c.conciliado && !c.valorIgual)
    .sort((a, b) => a.diasDeDiferenca - b.diasDeDiferenca);
  const maisProximo = valorDiferente[0];
```

3. Logo depois do bloco do aviso de Duplicado e antes de `{candidatosSelecionaveis.length > 0 && (`, acrescente:

```tsx
      {candidatosSelecionaveis.length === 0 && maisProximo ? (
        <p className="max-w-xs text-right text-xs text-muted-foreground">
          {`Há lançamento com valor diferente: ${maisProximo.descricao} — ${maisProximo.valor} em ${maisProximo.data}` +
            (valorDiferente.length > 1 ? ` e mais ${valorDiferente.length - 1}` : "") +
            ". Se foi digitado errado, corrija na Tesouraria; se a diferença é real (tarifa, juros), use Conciliar em " +
            "grupo com “Lançar a diferença”."}
        </p>
      ) : null}
```

Mantenha o comentário do topo ("Espelhado na ajuda…").

- [ ] **Step 3: Tipos e lint**

Run: `npx tsc --noEmit -p .` (os 2 erros em `.next/types/validator.ts` são antigos) e `npm run lint`.
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/financeiro/conciliacao/actions.ts" "src/app/(dashboard)/financeiro/conciliacao/linha-extrato-actions.tsx"
git commit -m "feat(conciliacao): caixa do Confirmar só com valor igual e aviso de valor diferente"
```

---

### Task 4: Ajuda, backlog e spec

**Files:**
- Modify: `src/ajuda/conciliacao/roteiros.ts` (~linhas 100-103, 113-117, 124-139)
- Modify: `src/ajuda/conciliacao/roteiros.test.ts`
- Modify: `docs/backlog.md` (seção "### 8. Confirmar 1:1 na Conciliação aceita valor diferente")
- Modify: `docs/superpowers/specs/2026-11-26-conciliacao-1-1-valor-igual-design.md`

As cenas não mudam: nenhuma linha do exemplo está em Divergência de valor (l1 Conciliado, l2 e l3 Não conciliado, l4 Sugestão).

- [ ] **Step 1: Teste que falha**

Em `roteiros.test.ts`, dentro do `describe`:

```ts
  test("nenhum texto diz que o Confirmar aceita valor diferente", () => {
    const textos = JSON.stringify(roteiros);
    expect(textos).not.toMatch(/aceita confirmar com valor diferente/);
    expect(textos).toMatch(/corrija o valor na Tesouraria/);
  });
```

Run: `npx vitest run src/ajuda/conciliacao`
Expected: FAIL.

- [ ] **Step 2: Textos**

Em `src/ajuda/conciliacao/roteiros.ts`:

1. Roteiro `entender-status`, passo `l2.status`, `dica`:

```ts
        dica:
          "Outros status: Divergência de valor (há um lançamento com data próxima e valor diferente; se ele foi " +
          "digitado errado, corrija o valor na Tesouraria, e se a diferença é real, use Conciliar em grupo com " +
          "“Lançar a diferença”), Divergência de data (mesmo valor, mas mais de 3 dias de diferença) e Duplicado " +
          "(o lançamento igual já está conciliado com outra linha: confira se a linha não veio repetida no extrato).",
```

2. `eDepois` do `entender-status`:

```ts
      texto:
        "Resolva as linhas pendentes com Confirmar (Sugestão e Divergência de data), Conciliar em grupo (um " +
        "movimento com vários lançamentos, ou uma diferença real como uma tarifa) ou Criar lançamento (o que ainda " +
        "não foi lançado).",
```

3. Roteiro `confirmar-sugestao`:
   - `quandoUsar`:
     ```ts
      "Quando a linha está como Sugestão ou Divergência de data e você sabe qual lançamento é o dela. O " +
      "lançamento precisa ter o mesmo valor da linha.",
     ```
   - passo `l4.selecionar`, `explicacao`:
     ```ts
          "A caixa lista os lançamentos da mesma conta, no mesmo sentido, com o mesmo valor da linha e até 30 " +
          "dias de diferença, que ainda não foram conciliados. No exemplo, o saque de R$ 2.000,00 é a " +
          "transferência para o caixa.",
     ```
   - passo `l4.selecionar`, `dica`:
     ```ts
          "Se só existe lançamento com valor diferente, a caixa não aparece e a linha mostra um aviso com o " +
          "lançamento encontrado. Se ele foi digitado errado, corrija o valor na Tesouraria e volte para " +
          "confirmar; se a diferença é real (uma tarifa, juros), use Conciliar em grupo com “Lançar a diferença”.",
     ```

- [ ] **Step 3: Backlog e spec**

- `docs/backlog.md`: apague a seção inteira "### 8. Confirmar 1:1 na Conciliação aceita valor diferente", do título até a linha antes de "### 9.". Não renumere. Use a ferramenta Edit.
- Spec: `Status: aprovada, aguardando plano` → `Status: implementada (2026-11-26)`. Na seção "Candidatos da linha", acrescente que o serviço também devolve `diasDeDiferenca` (dias entre a data do candidato e a da linha, comparando só o dia), usado para o aviso mostrar o de data mais próxima. Na seção "Ajuda", registre que as cenas não mudaram (nenhuma linha do exemplo está em Divergência de valor).

- [ ] **Step 4: Rodar**

Run: `npx vitest run src/ajuda`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ajuda/conciliacao docs/backlog.md docs/superpowers/specs/2026-11-26-conciliacao-1-1-valor-igual-design.md
git commit -m "docs(ajuda): Confirmar só com valor igual; item 8 sai do backlog"
```

---

### Task 5: Verificação final

- [ ] **Step 1:** `npx vitest run` (suíte inteira), `npx tsc --noEmit -p .`, `npm run lint`. Tudo verde (exceto os 2 erros antigos de `.next/types/validator.ts`).
- [ ] **Step 2: Navegador** (Matriz da Empresa Demonstração; cenário por SQL apagado no fim): uma linha com lançamento de valor igual mostra a caixa e confirma; uma linha só com lançamento de valor diferente mostra o aviso, sem caixa; Conciliar em grupo com "Lançar a diferença" continua funcionando nessa linha.
