# Transferência parcial de lote — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** permitir transferir parte de um lote para outro local, criando um lote filho `ORIGINAL/N` (ou somando no lote da família que já está no destino), sem perder rastreabilidade.

**Architecture:** `Lote.loteOrigemId` liga cada filho ao lote original da família; o par de movimentos `TRANSFERENCIA_SAIDA`/`TRANSFERENCIA_ENTRADA` (mesmo `transferenciaId`) move o saldo pelo caminho único `registrarMovimento`. As regras que olham recepção/OP do lote passam a olhar as do original quando o lote é filho; liberação de vencido e rastreabilidade passam a valer para a família.

**Tech Stack:** Next.js (App Router, server actions), Prisma + PostgreSQL, Zod, Vitest (banco real), shadcn/ui.

**Spec:** [docs/superpowers/specs/2026-11-18-transferencia-parcial-lote-design.md](../specs/2026-11-18-transferencia-parcial-lote-design.md)

## Global Constraints

- Branch `feat/transferencia-parcial-lote` (já criada a partir de `staging`).
- Código do filho: `ORIGINAL/N`, N numerado a partir do original (nunca `ORIGINAL/1/1`).
- Família = original (`loteOrigemId ?? id`) + lotes com `loteOrigemId` = original.
- Mensagens (exatas): "Informe uma quantidade maior que zero", "O lote já está neste local", "Local de armazenamento não encontrado ou inativo", `Saldo insuficiente no lote ${codigo}`, "Lote não encontrado", `O lote ${codigo} é de uma recepção excluída`, `O lote ${codigo} já teve venda, ajuste ou transferência`.
- Auditoria: `TRANSFERIR` (com movimento) e `MOVER` (só troca de local).
- Testes: `Set-Location D:\Projetos\nx-control-erp; npx vitest run <arquivo>` pelo **PowerShell** (pelo Bash falha).
- Nunca rodar Prettier. Editar com a ferramenta Edit (arquivos CRLF/LF misturados). Linhas até ~120.
- `npx prisma migrate dev` não gera o client: rodar `npx prisma generate` depois.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` + migration | `loteOrigemId`, tipos de movimento, `transferenciaId` |
| `src/lib/producao/lote.ts` | `proximoCodigoDeFilho` (puro) |
| `src/server/services/estoque.ts` | `transferirLote`, `SELECT_SITUACAO_LOTE`, `recepcaoExcluida`, `bloqueioDaProducao` pela família, `LOTE_LIBERADO` e `RECEPCAO_NAO_EXCLUIDA` pela família, liberação por família; remove `moverLote` e `SELECT_BLOQUEIO_PRODUCAO` |
| `src/server/services/{pedidoVenda,ajusteEstoque,ordemProducao}.ts` | usam a situação pela família |
| `src/app/(dashboard)/producao/lotes/[id]/etiqueta/route.ts` | etiqueta do filho |
| `src/server/services/rastreabilidade.ts` | consulta por família |
| `src/app/(dashboard)/producao/rastreabilidade/{cartoes,page}.tsx`, `src/server/export/rastreabilidade.ts` | seção "Lotes da família" |
| `src/lib/schemas/transferenciaLote.ts`, `producao/estoque/{actions.ts,transferir-lote-dialog.tsx,page.tsx}` | tela |
| docs (08, 03, ajuda, fase 7, backlog) | documentação |

---

### Task 1: Modelo e numeração do filho

**Files:**
- Modify: `prisma/schema.prisma` (enum `TipoMovimentoEstoque`, models `Lote` e `MovimentoEstoque`)
- Create: `prisma/migrations/<timestamp>_transferencia_lote/migration.sql` (gerada)
- Modify: `src/lib/producao/lote.ts`
- Test: `src/lib/producao/lote.test.ts`, `src/lib/producao/destinoLote.test.ts` (criar se não existir)

**Interfaces:**
- Produces: `proximoCodigoDeFilho(codigoOriginal: string, codigosExistentes: string[]): string`; campos Prisma `Lote.loteOrigemId`, `Lote.loteOrigem`, `Lote.filhos`, `MovimentoEstoque.transferenciaId`; enum `TRANSFERENCIA_SAIDA`, `TRANSFERENCIA_ENTRADA`.

- [ ] **Step 1: Testes que falham** — em `src/lib/producao/lote.test.ts` acrescentar (importando `proximoCodigoDeFilho` junto dos imports existentes):

```ts
describe("proximoCodigoDeFilho (D-36)", () => {
  test("primeiro filho é /1", () => {
    expect(proximoCodigoDeFilho("AGC-261110-01", [])).toBe("AGC-261110-01/1");
  });
  test("maior sufixo + 1, ignorando outros lotes e sufixos não numéricos", () => {
    expect(
      proximoCodigoDeFilho("AGC-261110-01", [
        "AGC-261110-01/1",
        "AGC-261110-01/3",
        "AGC-261110-01/x",
        "AGC-261110-010/9",
        "AGC-261110-02/7",
      ]),
    ).toBe("AGC-261110-01/4");
  });
});

test("proximoCodigoDeLote não conta os filhos /N", () => {
  expect(proximoCodigoDeLote("FA-261110", ["FA-261110-01", "FA-261110-01/1", "FA-261110-01/2"])).toBe("FA-261110-02");
});
```

Em `src/lib/producao/destinoLote.test.ts` (criar com os imports de `vitest` e `destinoDoLote` se o arquivo não existir):

```ts
test("transferências entre lotes da família se anulam e não viram linha (D-36)", () => {
  const destino = destinoDoLote(
    [
      { tipo: "ENTRADA", quantidadeKg: 100, motivo: null },
      { tipo: "TRANSFERENCIA_SAIDA", quantidadeKg: -40, motivo: null },
      { tipo: "TRANSFERENCIA_ENTRADA", quantidadeKg: 40, motivo: null },
      { tipo: "VENDA", quantidadeKg: -10, motivo: null },
    ],
    90,
  );
  expect(destino).toMatchObject({ entradaKg: 100, vendidoKg: 10, consumidoOpKg: 0, saldoKg: 90, confere: true });
  expect(linhasDoDestino(destino).map((l) => l.rotulo)).toEqual(["Entrada", "Vendido", "Consumido em OP", "Saldo"]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/producao/lote.test.ts src/lib/producao/destinoLote.test.ts`
Expected: FAIL — `proximoCodigoDeFilho` não exportado; o teste do destino falha na compilação de tipos só no `tsc` (o Vitest aceita a string), então pode passar já — tudo bem, ele protege contra regressão.

- [ ] **Step 3: Schema** — em `prisma/schema.prisma`:

No enum `TipoMovimentoEstoque`, depois de `ESTORNO_PRODUCAO_OP`:
```prisma
  TRANSFERENCIA_SAIDA
  TRANSFERENCIA_ENTRADA
```

No model `Lote`, depois de `motivoLiberacao String?`:
```prisma
  /// Transferência parcial (D-36): o lote original da família; vazio no próprio original.
  loteOrigemId        String?
```
e junto das relações:
```prisma
  // NoAction (checado no fim do comando): apagar a filial ou a fixture remove original e filhos juntos.
  loteOrigem       Lote?              @relation("FamiliaDoLote", fields: [loteOrigemId], references: [id], onDelete: NoAction)
  filhos           Lote[]             @relation("FamiliaDoLote")
```
e `@@index([loteOrigemId])` junto dos outros índices.

No model `MovimentoEstoque`, depois de `producaoOpId String?`:
```prisma
  /// Liga a saída e a entrada da mesma transferência (D-36).
  transferenciaId String?
```
e `@@index([transferenciaId])`.

- [ ] **Step 4: Migration e client**

Run: `git fetch; npx prisma migrate dev --name transferencia_lote; npx prisma generate`
Expected: migration criada e aplicada sem pedir reset (se acusar drift, PARAR e avisar: a branch pode ter nascido de staging velho).

- [ ] **Step 5: Função pura** — em `src/lib/producao/lote.ts`, depois de `proximoCodigoDeLote`:

```ts
/** Código do próximo filho da família (D-36): `ORIGINAL/N`, N = maior sufixo numérico existente + 1. */
export function proximoCodigoDeFilho(codigoOriginal: string, codigosExistentes: string[]): string {
  const inicio = `${codigoOriginal}/`;
  const maior = codigosExistentes.reduce((max, codigo) => {
    if (!codigo.startsWith(inicio)) return max;
    const sufixo = codigo.slice(inicio.length);
    return /^\d+$/.test(sufixo) ? Math.max(max, Number(sufixo)) : max;
  }, 0);
  return `${inicio}${maior + 1}`;
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/lib/producao/lote.test.ts src/lib/producao/destinoLote.test.ts; npx tsc --noEmit -p .`
Expected: PASS e `tsc` sem erros.

- [ ] **Step 7: Commit**

```bash
git add prisma src/lib/producao
git commit -m "feat(estoque): modelo da transferência parcial de lote"
```

---

### Task 2: `transferirLote`

**Files:**
- Modify: `src/server/services/estoque.ts`
- Modify: `src/server/services/estoque.test.ts` (substituir o teste do `moverLote`; novo `describe`)
- Modify: `src/server/services/ordemProducao.test.ts:739` (usa `moverLote`)
- Modify: `src/app/(dashboard)/producao/estoque/actions.ts` (só trocar a chamada; a tela muda na Task 7)

**Interfaces:**
- Consumes: Task 1 (`proximoCodigoDeFilho`, campos novos).
- Produces:
  - `transferirLote(sessao: SessaoAtiva, loteId: string, localId: string, kg: number, hoje?: Date): Promise<ResultadoTransferencia>`
  - `type ResultadoTransferencia = { loteDestinoId: string; codigoDestino: string; loteCriado: boolean }`
  - `SELECT_SITUACAO_LOTE` (Prisma.LoteSelect com `recepcao`, `producaoOP` e `loteOrigem: { select: { recepcao, producaoOP } }`)
  - `recepcaoExcluida(lote): boolean`; `bloqueioDaProducao(lote)` aceita `loteOrigem` opcional
  - `NovoMovimento.transferenciaId?: string`
  - `moverLote` é removido.

- [ ] **Step 1: Testes que falham** — em `estoque.test.ts`:

1. Trocar `moverLote` por `transferirLote` no import.
2. No teste `"moverLote muda o local e audita; ..."` (linha ~165), renomear para `"transferir o saldo inteiro muda o local e audita; recusa local de outra filial e perfil sem permissão"` e trocar as três chamadas: `moverLote(s, id, local)` → `transferirLote(s, id, local, Number(lote.saldoKg))`.
3. Acrescentar ao fim do arquivo:

```ts
describe("transferência de lote (D-36)", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let camara2: string;
  let camara3: string;
  const hoje = new Date("2026-11-18T00:00:00.000Z");
  const prod = () => fx.sessao("PRODUCAO");
  const transferir = (loteId: string, localId: string, kg: number) => transferirLote(prod(), loteId, localId, kg, hoje);
  const lerLote = (id: string) => prisma.lote.findUniqueOrThrow({ where: { id } });
  const polpa = (codigo: string, kg = 100, validade = new Date("2027-06-01")) =>
    criarLoteDeTeste(fx, { produtoId: cat.produtoPolpaId, localId: cat.localCamaraId, kg, custoKg: 12.5, validade, codigo });

  beforeAll(async () => {
    fx = await criarFixtureProducao("transferencia");
    cat = await criarCatalogoDeTeste(fx);
    camara2 = (await prisma.localArmazenamento.create({ data: { filialId: fx.filialAId, nome: "Câmara 02", tipo: "CAMARA_FRIA" } })).id;
    camara3 = (await prisma.localArmazenamento.create({ data: { filialId: fx.filialAId, nome: "Câmara 03", tipo: "CAMARA_FRIA" } })).id;
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("parcial cria o filho /1 no destino com os dados do original", async () => {
    const original = await polpa("AGC-T1");
    const r = await transferir(original.id, camara2, 30);
    expect(r).toMatchObject({ codigoDestino: "AGC-T1/1", loteCriado: true });

    const filho = await lerLote(r.loteDestinoId);
    expect(filho).toMatchObject({
      loteOrigemId: original.id,
      localId: camara2,
      produtoId: original.produtoId,
      origem: original.origem,
      validade: original.validade,
      data: original.data,
    });
    expect(Number(filho.saldoKg)).toBe(30);
    expect(Number(filho.quantidadeInicialKg)).toBe(30);
    expect(Number(filho.custoKg)).toBe(12.5);
    expect(Number((await lerLote(original.id)).saldoKg)).toBe(70);

    const movimentos = await prisma.movimentoEstoque.findMany({
      where: { loteId: { in: [original.id, filho.id] }, tipo: { in: ["TRANSFERENCIA_SAIDA", "TRANSFERENCIA_ENTRADA"] } },
    });
    expect(movimentos).toHaveLength(2);
    expect(movimentos[0].transferenciaId).not.toBeNull();
    expect(movimentos[0].transferenciaId).toBe(movimentos[1].transferenciaId);
    expect(movimentos.every((m) => m.data.getTime() === hoje.getTime())).toBe(true);
    expect(await prisma.auditLog.count({ where: { entidadeId: original.id, acao: "TRANSFERIR" } })).toBe(1);
  });

  test("numera a partir do original, inclusive quando o filho é transferido", async () => {
    const original = await polpa("AGC-T2");
    const a = await transferir(original.id, camara2, 10);
    const b = await transferir(original.id, cat.localRecepcaoId, 10);
    const c = await transferir(a.loteDestinoId, camara3, 5);
    expect([a.codigoDestino, b.codigoDestino, c.codigoDestino]).toEqual(["AGC-T2/1", "AGC-T2/2", "AGC-T2/3"]);
    expect((await lerLote(c.loteDestinoId)).loteOrigemId).toBe(original.id);
  });

  test("soma no lote da família que já está no destino; devolver junta no original", async () => {
    const original = await polpa("AGC-T3");
    const a = await transferir(original.id, camara2, 30);
    const b = await transferir(original.id, camara2, 20);
    expect(b).toMatchObject({ loteDestinoId: a.loteDestinoId, loteCriado: false });
    expect(Number((await lerLote(a.loteDestinoId)).saldoKg)).toBe(50);
    expect(await prisma.lote.count({ where: { loteOrigemId: original.id } })).toBe(1);

    const volta = await transferir(a.loteDestinoId, cat.localCamaraId, 50);
    expect(volta).toMatchObject({ loteDestinoId: original.id, loteCriado: false });
    expect(Number((await lerLote(original.id)).saldoKg)).toBe(100);
    expect(Number((await lerLote(a.loteDestinoId)).saldoKg)).toBe(0);
  });

  test("saldo inteiro sem família no destino só troca o local, sem movimento", async () => {
    const original = await polpa("AGC-T4", 40);
    const r = await transferir(original.id, camara2, 40);
    expect(r).toMatchObject({ loteDestinoId: original.id, codigoDestino: "AGC-T4", loteCriado: false });
    expect((await lerLote(original.id)).localId).toBe(camara2);
    expect(await prisma.movimentoEstoque.count({ where: { loteId: original.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entidadeId: original.id, acao: "MOVER" } })).toBe(1);
  });

  test("polpa de OP aberta: inteira muda de local, parcial é recusada", async () => {
    const op = await criarOP(fx.sessao("ADMINISTRADOR"), cabecalhoOPSchema.parse({ data: "2026-11-01", frutaId: cat.frutaId }));
    const producao = await adicionarProducao(
      fx.sessao("ADMINISTRADOR"),
      op.id,
      producaoSchema.parse({ produtoId: cat.produtoPolpaId, quantidadeKg: 10, localId: cat.localCamaraId, embalagens: "" }),
    );
    await expect(transferir(producao.loteId, camara2, 4)).rejects.toThrow(
      `O lote ${producao.codigoLote} está numa OP aberta`,
    );
    await transferir(producao.loteId, camara2, 10);
    expect((await lerLote(producao.loteId)).localId).toBe(camara2);
  });

  test("lote vencido pode ser transferido", async () => {
    const vencido = await polpa("AGC-T5", 10, new Date("2026-11-01"));
    const r = await transferir(vencido.id, camara2, 4);
    expect(r.loteCriado).toBe(true);
  });

  test("recusas", async () => {
    const lote = await polpa("AGC-T6", 10);
    await expect(transferir(lote.id, camara2, 0)).rejects.toThrow("Informe uma quantidade maior que zero");
    await expect(transferir(lote.id, camara2, 10.5)).rejects.toThrow(`Saldo insuficiente no lote ${lote.codigo}`);
    await expect(transferir(lote.id, cat.localCamaraId, 5)).rejects.toThrow("O lote já está neste local");

    const inativo = await prisma.localArmazenamento.create({
      data: { filialId: fx.filialAId, nome: "Inativo", tipo: "CAMARA_FRIA", ativo: false },
    });
    await expect(transferir(lote.id, inativo.id, 5)).rejects.toThrow("Local de armazenamento não encontrado ou inativo");
    const localB = await prisma.localArmazenamento.create({
      data: { filialId: fx.filialBId, nome: "Câmara B", tipo: "CAMARA_FRIA" },
    });
    await expect(transferir(lote.id, localB.id, 5)).rejects.toThrow("Local de armazenamento não encontrado ou inativo");
    const deB = await criarLoteDeTeste(fx, { produtoId: cat.produtoPolpaId, localId: localB.id, kg: 5, filialId: fx.filialBId });
    await expect(transferir(deB.id, camara2, 1)).rejects.toThrow("Lote não encontrado");

    await expect(transferirLote(fx.sessao("VENDAS"), lote.id, camara2, 5, hoje)).rejects.toThrow(PermissionError);
    await expect(
      transferirLote(fx.sessao("PRODUCAO", { somenteLeitura: true }), lote.id, camara2, 5, hoje),
    ).rejects.toThrow(FilialSomenteLeituraError);
    expect(Number((await lerLote(lote.id)).saldoKg)).toBe(10);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/estoque.test.ts`
Expected: FAIL — `transferirLote` não existe.

- [ ] **Step 3: Implementação** — em `src/server/services/estoque.ts`:

Imports: acrescentar `import { randomUUID } from "crypto";` e `import { proximoCodigoDeFilho } from "@/lib/producao/lote";`.

Em `NovoMovimento`, depois de `producaoOpId?: string;`:
```ts
  transferenciaId?: string;
```

Substituir `SELECT_BLOQUEIO_PRODUCAO` e `bloqueioDaProducao` por (manter `SELECT_BLOQUEIO_PRODUCAO` exportado nesta task — a Task 3 remove):
```ts
const SELECT_PRODUCAO_DO_LOTE = {
  select: { removidoEm: true, ordemProducao: { select: { status: true } } },
} as const;

export const SELECT_BLOQUEIO_PRODUCAO = { producaoOP: SELECT_PRODUCAO_DO_LOTE } satisfies Prisma.LoteSelect;

const SELECT_ORIGEM_DO_LOTE = {
  recepcao: { select: { status: true } },
  producaoOP: SELECT_PRODUCAO_DO_LOTE,
} satisfies Prisma.LoteSelect;

/** Recepção e OP do lote e do original da família: o filho segue a situação do original (D-36). */
export const SELECT_SITUACAO_LOTE = {
  ...SELECT_ORIGEM_DO_LOTE,
  loteOrigem: { select: SELECT_ORIGEM_DO_LOTE },
} satisfies Prisma.LoteSelect;

type ProducaoDoLote = { removidoEm: Date | null; ordemProducao: { status: StatusOrdemProducao } };

/** O lote excluído na recepção (o filho olha a recepção do original). */
export function recepcaoExcluida(lote: {
  recepcao: { status: string } | null;
  loteOrigem?: { recepcao: { status: string } | null } | null;
}): boolean {
  return (lote.loteOrigem ?? lote).recepcao?.status === "CANCELADA";
}

/** Mensagem do bloqueio de um lote de polpa, ou null se ele pode sair (o filho olha a OP do original). */
export function bloqueioDaProducao(lote: {
  codigo: string;
  producaoOP: ProducaoDoLote | null;
  loteOrigem?: { producaoOP: ProducaoDoLote | null } | null;
}): string | null {
  const producao = (lote.loteOrigem ?? lote).producaoOP;
  if (!producao) return null;
  if (producao.removidoEm) return `O lote ${lote.codigo} foi removido da OP`;
  if (producao.ordemProducao.status === "CANCELADA") return `O lote ${lote.codigo} é de uma OP cancelada`;
  if (producao.ordemProducao.status === "ABERTA") return `O lote ${lote.codigo} está numa OP aberta`;
  return null;
}
```

Substituir `moverLote` inteiro por:
```ts
export type ResultadoTransferencia = { loteDestinoId: string; codigoDestino: string; loteCriado: boolean };

/**
 * Transfere kg do lote para outro local (D-15, D-36). Se a família já tem lote no
 * destino, soma nele; se não tem e é o saldo inteiro, só troca o local; se é
 * parcial, cria o filho `ORIGINAL/N`. As transferências da mesma família são
 * serializadas pela trava na linha do original.
 */
export async function transferirLote(
  sessao: SessaoAtiva,
  loteId: string,
  localId: string,
  kg: number,
  hoje: Date = hojeDeCalendario(),
): Promise<ResultadoTransferencia> {
  requirePermission(sessao.perfil, "producao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  const quantidade = arredondar(kg, 3);
  if (!(quantidade > 0)) throw new Error("Informe uma quantidade maior que zero");

  return prisma.$transaction(async (tx) => {
    const alvo = await tx.lote.findFirst({
      where: { id: loteId, filialId: sessao.filialId },
      select: { id: true, loteOrigemId: true },
    });
    if (!alvo) throw new Error("Lote não encontrado");
    const origemId = alvo.loteOrigemId ?? alvo.id;
    await tx.$queryRaw`SELECT id FROM lotes WHERE id = ${origemId} FOR UPDATE`;

    const lote = await tx.lote.findUniqueOrThrow({ where: { id: loteId }, include: SELECT_SITUACAO_LOTE });
    if (lote.localId === localId) throw new Error("O lote já está neste local");
    const local = await tx.localArmazenamento.findFirst({
      where: { id: localId, filialId: sessao.filialId, ativo: true },
      select: { id: true },
    });
    if (!local) throw new Error("Local de armazenamento não encontrado ou inativo");
    const saldo = Number(lote.saldoKg);
    if (quantidade > saldo) throw new Error(`Saldo insuficiente no lote ${lote.codigo}`);

    let destino = await tx.lote.findFirst({
      where: { filialId: sessao.filialId, localId, OR: [{ id: origemId }, { loteOrigemId: origemId }] },
      select: { id: true, codigo: true },
    });

    if (!destino && Math.abs(quantidade - saldo) < 0.0005) {
      await tx.lote.update({ where: { id: lote.id }, data: { localId } });
      await registrarAuditoria(
        {
          empresaId: sessao.empresaId,
          filialId: sessao.filialId,
          usuarioId: sessao.usuarioId,
          entidade: "Lote",
          entidadeId: lote.id,
          acao: "MOVER",
          anterior: { localId: lote.localId },
          novo: { localId },
        },
        tx,
      );
      return { loteDestinoId: lote.id, codigoDestino: lote.codigo, loteCriado: false };
    }

    // Com movimento, só lote que pode sair (D-07): polpa de OP aberta ainda muda de custo.
    if (recepcaoExcluida(lote)) throw new Error(`O lote ${lote.codigo} é de uma recepção excluída`);
    const bloqueio = bloqueioDaProducao(lote);
    if (bloqueio) throw new Error(bloqueio);

    let loteCriado = false;
    if (!destino) {
      const original = await tx.lote.findUniqueOrThrow({ where: { id: origemId }, select: { codigo: true } });
      const irmaos = await tx.lote.findMany({
        where: { filialId: sessao.filialId, codigo: { startsWith: `${original.codigo}/` } },
        select: { codigo: true },
      });
      destino = await tx.lote.create({
        data: {
          filialId: sessao.filialId,
          codigo: proximoCodigoDeFilho(original.codigo, irmaos.map((l) => l.codigo)),
          produtoId: lote.produtoId,
          origem: lote.origem,
          data: lote.data,
          validade: lote.validade,
          localId,
          quantidadeInicialKg: quantidade,
          saldoKg: 0,
          custoKg: lote.custoKg,
          liberadoAte: lote.liberadoAte,
          liberadoEm: lote.liberadoEm,
          liberadoPorId: lote.liberadoPorId,
          motivoLiberacao: lote.motivoLiberacao,
          loteOrigemId: origemId,
        },
        select: { id: true, codigo: true },
      });
      loteCriado = true;
    }

    const transferenciaId = randomUUID();
    const movimento = { filialId: sessao.filialId, data: hoje, usuarioId: sessao.usuarioId, transferenciaId };
    await registrarMovimento(tx, { ...movimento, loteId: lote.id, tipo: "TRANSFERENCIA_SAIDA", quantidadeKg: -quantidade });
    await registrarMovimento(tx, { ...movimento, loteId: destino.id, tipo: "TRANSFERENCIA_ENTRADA", quantidadeKg: quantidade });

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Lote",
        entidadeId: lote.id,
        acao: "TRANSFERIR",
        anterior: { localId: lote.localId, saldoKg: saldo },
        novo: { localDestinoId: localId, kg: quantidade, loteDestino: destino.codigo, loteCriado },
      },
      tx,
    );
    return { loteDestinoId: destino.id, codigoDestino: destino.codigo, loteCriado };
  });
}
```

Confirmar que `registrarAuditoria` aceita o `tx` como 2º argumento (já usado assim em `recepcaoFruto.ts`).

- [ ] **Step 4: Ajustar os outros usos de `moverLote`**

`src/server/services/ordemProducao.test.ts` (~linha 43 e ~739): trocar o import `moverLote` por `transferirLote` e a chamada `moverLote(fx.sessao("PRODUCAO"), grosso.loteId, cat.localRecepcaoId)` por:
```ts
      const saldoGrosso = Number((await prisma.lote.findUniqueOrThrow({ where: { id: grosso.loteId } })).saldoKg);
      await transferirLote(fx.sessao("PRODUCAO"), grosso.loteId, cat.localRecepcaoId, saldoGrosso);
```
(ler o teste antes: se a intenção era só trocar o local do lote inteiro, essa troca preserva o comportamento.)

`src/app/(dashboard)/producao/estoque/actions.ts`: provisoriamente, em `moverLoteAction`, trocar `moverLote` por `transferirLote` com o saldo do lote:
```ts
import { prisma } from "@/server/db/client";
...
    const lote = await prisma.lote.findFirst({ where: { id: loteId, filialId: sessao.filialId }, select: { saldoKg: true } });
    if (!lote) return { erro: "Lote não encontrado" };
    await transferirLote(sessao, loteId, localId, Number(lote.saldoKg));
```
(dentro do `try` existente; a Task 7 substitui esta action.)

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/server/services/estoque.test.ts src/server/services/ordemProducao.test.ts; npx tsc --noEmit -p .`
Expected: PASS; `tsc` limpo.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(estoque): transferência parcial de lote com lote filho"
```

---

### Task 3: Filho segue o original na venda, OP, ajuste e etiqueta

**Files:**
- Modify: `src/server/services/estoque.ts` (`LOTE_LIBERADO`, `RECEPCAO_NAO_EXCLUIDA`, `listarLotes`, `liberarLoteVencido`; remover `SELECT_BLOQUEIO_PRODUCAO`)
- Modify: `src/server/services/pedidoVenda.ts:70-85`
- Modify: `src/server/services/ajusteEstoque.ts:17-28`
- Modify: `src/server/services/ordemProducao.ts:291-301` (`adicionarConsumo`), `:536-543` (`situacaoParaDesfazer`), `:849-859` (`lotesParaConsumo`)
- Modify: `src/app/(dashboard)/producao/lotes/[id]/etiqueta/route.ts`
- Test: `src/server/services/familiaLote.test.ts` (novo); ajustar testes que esperam "já teve venda ou ajuste"

**Interfaces:**
- Consumes: Task 2 (`transferirLote`, `SELECT_SITUACAO_LOTE`, `recepcaoExcluida`, `bloqueioDaProducao`).
- Produces: `RECEPCAO_NAO_EXCLUIDA: Prisma.LoteWhereInput`; `LOTE_LIBERADO` pela família.

- [ ] **Step 1: Testes que falham** — criar `src/server/services/familiaLote.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { recepcaoSchema } from "@/lib/schemas/recepcao";
import { cabecalhoOPSchema, consumoSchema, processoOPSchema, producaoSchema } from "@/lib/schemas/ordemProducao";
import { pedidoVendaSchema } from "@/lib/schemas/pedidoVenda";
import { ajusteSchema } from "@/lib/schemas/ajusteEstoque";
import {
  configurarVendas,
  criarCadastrosDeVenda,
  criarCatalogoDeTeste,
  criarFixtureProducao,
  parcelaUnicaAPrazo,
  type CadastrosDeVenda,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "./producaoTestFixtures";
import { cancelarRecepcao, criarRecepcao } from "./recepcaoFruto";
import {
  adicionarConsumo,
  adicionarProducao,
  atualizarProcessoOP,
  cancelarOP,
  criarOP,
  encerrarOP,
  lotesParaConsumo,
  reabrirOP,
} from "./ordemProducao";
import { criarPedido, lotesParaVenda } from "./pedidoVenda";
import { criarAjuste } from "./ajusteEstoque";
import { transferirLote } from "./estoque";

/** Fruto recebido e transferido em parte; polpa de OP encerrada transferida em parte (D-36). */
describe("lote filho segue o original (D-36)", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  let camara2: string;
  const adm = () => fx.sessao("ADMINISTRADOR");
  const hoje = new Date("2026-11-10T00:00:00.000Z");
  const ids = { recepcao: "", fruto: "", frutoFilho: "", op: "", polpa: "", polpaFilho: "" };

  beforeAll(async () => {
    fx = await criarFixtureProducao("familia");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
    await configurarVendas(fx, cad);
    await prisma.configuracaoProducao.update({
      where: { filialId: fx.filialAId },
      data: { categoriaCompraFrutoId: cat.categoriaCompraId, prazoPagamentoProdutorDias: 7 },
    });
    camara2 = (await prisma.localArmazenamento.create({ data: { filialId: fx.filialAId, nome: "Câmara 02", tipo: "CAMARA_FRIA" } })).id;

    const recepcao = await criarRecepcao(
      adm(),
      recepcaoSchema.parse({
        data: "2026-11-10",
        produtoId: cat.produtoFrutoId,
        localId: cat.localRecepcaoId,
        unidade: "KG",
        descarte: "0",
        origem: "PROPRIA",
        talhaoId: cat.talhaoId,
        pesoBruto: "100",
      }),
    );
    ids.recepcao = recepcao.recepcaoId;
    ids.fruto = recepcao.loteId;
    ids.frutoFilho = (await transferirLote(adm(), recepcao.loteId, camara2, 40, hoje)).loteDestinoId;

    const op = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    ids.op = op.id;
    await adicionarConsumo(adm(), op.id, consumoSchema.parse({ loteId: ids.frutoFilho, quantidadeKg: 30 }));
    const polpa = await adicionarProducao(
      adm(),
      op.id,
      producaoSchema.parse({ produtoId: cat.produtoPolpaId, quantidadeKg: 20, localId: cat.localCamaraId }),
    );
    ids.polpa = polpa.loteId;
    await atualizarProcessoOP(
      adm(),
      op.id,
      processoOPSchema.parse({
        branqueamentoTemperaturaC: "85",
        branqueamentoTempoS: "12",
        aguaLitros: "0",
        carocoResiduoKg: "9",
        perdaKg: "1",
      }),
    );
    await encerrarOP(adm(), op.id, { confirmarVerificar: true });
    ids.polpaFilho = (await transferirLote(adm(), polpa.loteId, camara2, 5, hoje)).loteDestinoId;
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("filho de fruto aparece para consumo e é consumido na OP", async () => {
    const lotes = await lotesParaConsumo(fx.filialAId, cat.frutaId, hoje);
    expect(lotes.map((l) => l.id)).toContain(ids.frutoFilho);
    expect(Number((await prisma.lote.findUniqueOrThrow({ where: { id: ids.frutoFilho } })).saldoKg)).toBe(10);
  });

  test("filhos de fruto e de polpa de OP encerrada saem na venda e no ajuste", async () => {
    const paraVenda = (await lotesParaVenda(fx.filialAId, hoje)).map((l) => l.id);
    expect(paraVenda).toEqual(expect.arrayContaining([ids.frutoFilho, ids.polpaFilho]));

    await criarPedido(
      adm(),
      pedidoVendaSchema.parse({
        data: "2026-11-10",
        clienteId: cad.clienteId,
        formaPagamento: "A_PRAZO",
        parcelas: parcelaUnicaAPrazo([{ quantidadeKg: 2, precoKg: 10 }]),
        retiraNaPropriedade: "true",
        itens: JSON.stringify([{ loteId: ids.polpaFilho, quantidadeKg: 2, precoKg: 10 }]),
      }),
    );
    await criarAjuste(
      adm(),
      ajusteSchema.parse({ loteId: ids.frutoFilho, data: "2026-11-10", sentido: "SAIDA", quantidadeKg: "1", motivo: "AMOSTRA" }),
    );
    expect(Number((await prisma.lote.findUniqueOrThrow({ where: { id: ids.polpaFilho } })).saldoKg)).toBe(3);
  });

  test("recepção com lote transferido não pode ser excluída", async () => {
    await expect(cancelarRecepcao(adm(), ids.recepcao, "Teste")).rejects.toThrow("O lote já teve movimentação");
  });

  test("OP com polpa transferida não reabre nem cancela", async () => {
    const polpa = await prisma.lote.findUniqueOrThrow({ where: { id: ids.polpa } });
    const mensagem = `O lote ${polpa.codigo} já teve venda, ajuste ou transferência`;
    await expect(reabrirOP(adm(), ids.op, "Teste")).rejects.toThrow(mensagem);
    await expect(cancelarOP(adm(), ids.op, "Teste")).rejects.toThrow(mensagem);
  });

  test("filho de polpa de OP aberta não sai na venda (regra pela OP do original)", async () => {
    const op = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    const polpa = await adicionarProducao(
      adm(),
      op.id,
      producaoSchema.parse({ produtoId: cat.produtoPolpaId, quantidadeKg: 8, localId: cat.localCamaraId }),
    );
    // Filho criado à mão: pelo serviço, polpa de OP aberta não é transferida em parte.
    const original = await prisma.lote.findUniqueOrThrow({ where: { id: polpa.loteId } });
    const filho = await prisma.lote.create({
      data: {
        filialId: fx.filialAId,
        codigo: `${original.codigo}/1`,
        produtoId: original.produtoId,
        origem: original.origem,
        data: original.data,
        validade: original.validade,
        localId: camara2,
        quantidadeInicialKg: 1,
        saldoKg: 1,
        custoKg: 0,
        loteOrigemId: original.id,
      },
    });
    expect((await lotesParaVenda(fx.filialAId, hoje)).map((l) => l.id)).not.toContain(filho.id);
    await expect(
      criarAjuste(
        adm(),
        ajusteSchema.parse({ loteId: filho.id, data: "2026-11-10", sentido: "SAIDA", quantidadeKg: "1", motivo: "AMOSTRA" }),
      ),
    ).rejects.toThrow(`O lote ${filho.codigo} está numa OP aberta`);
  });
});
```

Confirmar no Step 2 que os nomes de exportação (`lotesParaConsumo`, `reabrirOP`, `cancelarOP`, `lotesParaVenda`, `criarAjuste`) batem com os arquivos — todos já existem.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/familiaLote.test.ts`
Expected: FAIL — polpa filha fora de `lotesParaVenda`; mensagem antiga "já teve venda ou ajuste"; filho de OP aberta passa no ajuste.

- [ ] **Step 3: `estoque.ts`**

Substituir `LOTE_LIBERADO` por:
```ts
const RECEPCAO_ATIVA_OU_SEM: Prisma.LoteWhereInput = {
  OR: [{ recepcao: { is: null } }, { recepcao: { is: { status: "ATIVA" } } }],
};

/** Original que pode sair: recepção não excluída, ou polpa de OP encerrada (D-07). */
const ORIGINAL_LIBERADO: Prisma.LoteWhereInput = {
  OR: [
    { origem: "RECEPCAO", ...RECEPCAO_ATIVA_OU_SEM },
    { origem: "PRODUCAO", producaoOP: { is: { removidoEm: null, ordemProducao: { status: "ENCERRADA" } } } },
  ],
};

/** Lote que pode sair por venda ou ajuste; o filho segue o original (D-36). */
export const LOTE_LIBERADO: Prisma.LoteWhereInput = {
  OR: [{ loteOrigemId: null, ...ORIGINAL_LIBERADO }, { loteOrigem: { is: ORIGINAL_LIBERADO } }],
};

/** Fruto cuja recepção (a do original, no filho) não foi excluída. */
export const RECEPCAO_NAO_EXCLUIDA: Prisma.LoteWhereInput = {
  OR: [{ loteOrigemId: null, ...RECEPCAO_ATIVA_OU_SEM }, { loteOrigem: { is: RECEPCAO_ATIVA_OU_SEM } }],
};
```
Atenção: `{ origem: "RECEPCAO", ...RECEPCAO_ATIVA_OU_SEM }` produz `{ origem, OR }` — equivale ao `LOTE_LIBERADO` antigo.

Remover `export const SELECT_BLOQUEIO_PRODUCAO`. Em `listarLotes`, no `include`, trocar `recepcao: { select: { status: true } },` + `...SELECT_BLOQUEIO_PRODUCAO,` por `...SELECT_SITUACAO_LOTE,`. Em `liberarLoteVencido`, no `include`, trocar `recepcao: ...` + `...SELECT_BLOQUEIO_PRODUCAO` por `...SELECT_SITUACAO_LOTE`, e `if (lote.recepcao?.status === "CANCELADA")` por `if (recepcaoExcluida(lote))`.

Rodar `npx tsc --noEmit -p .` e corrigir todo uso restante de `SELECT_BLOQUEIO_PRODUCAO` (o `tsc` aponta).

- [ ] **Step 4: Venda, ajuste e OP**

`pedidoVenda.ts` (`criarPedido`): import `recepcaoExcluida, SELECT_SITUACAO_LOTE` no lugar de `SELECT_BLOQUEIO_PRODUCAO`; `include: SELECT_SITUACAO_LOTE` (remove o `recepcao` separado); `if (lote.recepcao?.status === "CANCELADA")` → `if (recepcaoExcluida(lote))`.

`ajusteEstoque.ts`: mesmo import; `select: { id: true, codigo: true, ...SELECT_SITUACAO_LOTE }`; `if (lote.recepcao?.status === "CANCELADA")` → `if (recepcaoExcluida(lote))`.

`ordemProducao.ts`:
- import `RECEPCAO_NAO_EXCLUIDA, recepcaoExcluida, SELECT_SITUACAO_LOTE` de `./estoque` (junto dos imports existentes de lá).
- `adicionarConsumo`: `include: { produto: {...}, ...SELECT_SITUACAO_LOTE }` (remove `recepcao`); `if (lote.recepcao?.status === "CANCELADA")` → `if (recepcaoExcluida(lote))`.
- `situacaoParaDesfazer`: doc e mensagem → `/** Reabrir e cancelar só enquanto nenhum lote de polpa da OP teve venda, ajuste ou transferência (mesmo desfeitos depois). */` e `` `O lote ${saida.lote.codigo} já teve venda, ajuste ou transferência` ``.
- `lotesParaConsumo`: trocar `OR: [{ recepcao: { is: null } }, { recepcao: { is: { status: "ATIVA" } } }],` por `...RECEPCAO_NAO_EXCLUIDA,`.

Procurar testes que esperam o texto antigo: `rg "já teve venda ou ajuste" src` e atualizar para "já teve venda, ajuste ou transferência".

- [ ] **Step 5: Etiqueta** — em `etiqueta/route.ts`:

No `include`, acrescentar depois de `producaoOP: {...}`:
```ts
      loteOrigem: {
        select: {
          producaoOP: {
            select: {
              embalagens: true,
              quantidadeKg: true,
              removidoEm: true,
              ordemProducao: { select: { status: true } },
            },
          },
        },
      },
```
Substituir o trecho do bloqueio até `pesoLiquidoKg` por:
```ts
  // Filho (D-36): a OP e as embalagens são as do original.
  const producao = lote.loteOrigem ? lote.loteOrigem.producaoOP : lote.producaoOP;
  // Polpa só ganha etiqueta depois de a OP ser encerrada (D-07).
  const bloqueio = bloqueioDaProducao({ codigo: lote.codigo, producaoOP: producao });
  if (bloqueio) {
    const aberta = producao?.ordemProducao.status === "ABERTA" && !producao.removidoEm;
    return new Response(aberta ? "Encerre a OP antes de imprimir a etiqueta" : bloqueio, { status: 409 });
  }

  const embalagens = producao?.embalagens ?? null;
  const pesoLiquidoKg = embalagens
    ? arredondar(Number(producao!.quantidadeKg) / embalagens, 3)
    : Number(lote.quantidadeInicialKg);
```
`copias: embalagens ?? 1` → `copias: lote.loteOrigem ? 1 : (embalagens ?? 1),` (as caixas transferidas já têm etiqueta; a do filho é reimpressão). No `Content-Disposition`: `` `inline; filename="etiqueta-${lote.codigo.replaceAll("/", "-")}.pdf"` ``.

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/server/services; npx tsc --noEmit -p .`
Expected: PASS em todos os testes de serviço; `tsc` limpo.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat(estoque): lote filho segue o original na venda, OP, ajuste e etiqueta"
```

---

### Task 4: Liberação de vencido por família

**Files:**
- Modify: `src/server/services/estoque.ts` (`liberarLoteVencido`, `revogarLiberacaoLote`)
- Test: `src/server/services/estoque.test.ts` (no `describe("liberação de lote vencido (D-35)")`)

**Interfaces:**
- Consumes: Task 2 (`transferirLote`).
- Produces: comportamento — liberar/revogar grava em todos os lotes da família.

- [ ] **Step 1: Testes que falham** — dentro do `describe("liberação de lote vencido (D-35)")`, acrescentar (a fixture já tem `polpa`, `liberar`, `lerLote`, `hoje`; criar um local extra no próprio teste):

```ts
  test("liberar e revogar valem para a família inteira (D-36)", async () => {
    const camara2 = await prisma.localArmazenamento.create({
      data: { filialId: fx.filialAId, nome: "Câmara 02", tipo: "CAMARA_FRIA" },
    });
    const original = await polpa("2026-11-12", 10);
    const filho = await transferirLote(fx.sessao("PRODUCAO"), original.id, camara2.id, 10 - 4, hoje);
    // original com 4 kg, filho com 6 kg; o original fica zerado e a família ainda tem saldo:
    await transferirLote(fx.sessao("PRODUCAO"), original.id, camara2.id, 4, hoje);
    expect(Number((await lerLote(original.id)).saldoKg)).toBe(0);

    await liberar(original.id);
    expect((await lerLote(filho.loteDestinoId)).liberadoAte).toEqual(d("2026-11-17"));
    expect((await lerLote(filho.loteDestinoId)).motivoLiberacao).toBe("Uso imediato");

    await revogarLiberacaoLote(fx.sessao("GESTOR"), filho.loteDestinoId);
    expect((await lerLote(original.id)).liberadoAte).toBeNull();
    expect((await lerLote(filho.loteDestinoId)).liberadoAte).toBeNull();
  });

  test("filho criado depois da liberação nasce liberado", async () => {
    const camara3 = await prisma.localArmazenamento.create({
      data: { filialId: fx.filialAId, nome: "Câmara 03", tipo: "CAMARA_FRIA" },
    });
    const original = await polpa("2026-11-12", 10);
    await liberar(original.id);
    const filho = await transferirLote(fx.sessao("PRODUCAO"), original.id, camara3.id, 3, hoje);
    expect((await lerLote(filho.loteDestinoId)).liberadoAte).toEqual(d("2026-11-17"));
  });
```
e acrescentar `transferirLote` ao import de `./estoque` (já feito na Task 2).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/estoque.test.ts`
Expected: FAIL — liberar o original zerado é recusado ("está zerado") e o filho não recebe a liberação.

- [ ] **Step 3: Implementação** — em `estoque.ts`, acrescentar:

```ts
/** Ids e códigos do original e de todos os filhos (D-36). */
async function familiaDoLote(filialId: string, lote: { id: string; loteOrigemId: string | null }) {
  const origemId = lote.loteOrigemId ?? lote.id;
  return prisma.lote.findMany({
    where: { filialId, OR: [{ id: origemId }, { loteOrigemId: origemId }] },
    select: { id: true, codigo: true, saldoKg: true },
    orderBy: { criadoEm: "asc" },
  });
}
```

Em `liberarLoteVencido`:
- Trocar `if (Number(lote.saldoKg) <= 0) throw new Error(\`O lote ${lote.codigo} está zerado\`);` por:
```ts
  const familia = await familiaDoLote(sessao.filialId, lote);
  if (familia.every((l) => Number(l.saldoKg) <= 0)) throw new Error(`O lote ${lote.codigo} está zerado`);
```
- Trocar `prisma.lote.update({ where: { id: lote.id }, data: {...} })` por `prisma.lote.updateMany({ where: { id: { in: familia.map((l) => l.id) } }, data: {...} })` (mesmo `data`).
- No `novo` da auditoria: `novo: { liberadoAte: situacao.liberadoAte, motivo: motivoLimpo, familia: familia.map((l) => l.codigo) },`.

Em `revogarLiberacaoLote`: depois da checagem "não está liberado", `const familia = await familiaDoLote(sessao.filialId, lote);`; trocar o `update` por `updateMany` com `where: { id: { in: familia.map((l) => l.id) } }`; `novo: { familia: familia.map((l) => l.codigo) }` em vez de `novo: null`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/services/estoque.test.ts; npx tsc --noEmit -p .`
Expected: PASS (inclusive os testes antigos de liberação: lote sem família é uma família de um).

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(estoque): liberação de vencido vale para a família do lote"
```

---

### Task 5: Rastreabilidade por família (serviço)

**Files:**
- Modify: `src/server/services/rastreabilidade.ts`
- Test: `src/server/services/rastreabilidade.test.ts` (novo `describe` com fixture própria)

**Interfaces:**
- Consumes: Task 2 (`transferirLote`), Task 3 (filho consumido/vendido).
- Produces:
  - `type LoteDaFamilia = { codigo: string; local: string; saldoKg: number; validade: Date; consultado: boolean }`
  - `Rastreio.familia: LoteDaFamilia[]` (sempre ao menos o próprio lote)
  - `OpConsumidora.lotesDaFamilia: string[]` (códigos da família consumidos na OP)

- [ ] **Step 1: Testes que falham** — ao fim de `rastreabilidade.test.ts`:

```ts
/**
 * Família: fruto 100 kg; 40 kg para a câmara (/1); OP consome 30 do /1 e produz 20 de polpa;
 * 5 kg da polpa vão para a recepção (polpa /1). Vendas: 10 do fruto /1 e 5 da polpa /1.
 */
describe("rastreabilidade por família (D-36)", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  const adm = () => fx.sessao("ADMINISTRADOR");
  const hoje = new Date("2026-11-10T00:00:00.000Z");
  const cod = { fruto: "", frutoFilho: "", polpa: "", polpaFilho: "", op: "" };

  beforeAll(async () => {
    fx = await criarFixtureProducao("rastreio-familia");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
    await configurarVendas(fx, cad);
    await prisma.configuracaoProducao.update({
      where: { filialId: fx.filialAId },
      data: { categoriaCompraFrutoId: cat.categoriaCompraId, prazoPagamentoProdutorDias: 7 },
    });
    const recepcao = await criarRecepcao(
      adm(),
      recepcaoSchema.parse({
        data: "2026-11-10",
        produtoId: cat.produtoFrutoId,
        localId: cat.localRecepcaoId,
        unidade: "KG",
        descarte: "0",
        origem: "PROPRIA",
        talhaoId: cat.talhaoId,
        pesoBruto: "100",
      }),
    );
    cod.fruto = recepcao.codigoLote;
    const frutoFilho = await transferirLote(adm(), recepcao.loteId, cat.localCamaraId, 40, hoje);
    cod.frutoFilho = frutoFilho.codigoDestino;

    const op = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    await adicionarConsumo(adm(), op.id, consumoSchema.parse({ loteId: frutoFilho.loteDestinoId, quantidadeKg: 30 }));
    const polpa = await adicionarProducao(
      adm(),
      op.id,
      producaoSchema.parse({ produtoId: cat.produtoPolpaId, quantidadeKg: 20, localId: cat.localCamaraId }),
    );
    await atualizarProcessoOP(
      adm(),
      op.id,
      processoOPSchema.parse({
        branqueamentoTemperaturaC: "85",
        branqueamentoTempoS: "12",
        aguaLitros: "0",
        carocoResiduoKg: "9",
        perdaKg: "1",
      }),
    );
    await encerrarOP(adm(), op.id, { confirmarVerificar: true });
    cod.polpa = polpa.codigoLote;
    cod.op = op.numero;
    const polpaFilho = await transferirLote(adm(), polpa.loteId, cat.localRecepcaoId, 5, hoje);
    cod.polpaFilho = polpaFilho.codigoDestino;

    const vender = (loteId: string, kg: number) =>
      criarPedido(
        adm(),
        pedidoVendaSchema.parse({
          data: "2026-11-10",
          clienteId: cad.clienteId,
          formaPagamento: "A_PRAZO",
          parcelas: parcelaUnicaAPrazo([{ quantidadeKg: kg, precoKg: 10 }]),
          retiraNaPropriedade: "true",
          itens: JSON.stringify([{ loteId, quantidadeKg: kg, precoKg: 10 }]),
        }),
      );
    await vender(frutoFilho.loteDestinoId, 10);
    await vender(polpaFilho.loteDestinoId, 5);
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("consultar o filho de fruto mostra a família inteira com a origem do original", async () => {
    const r = (await rastrearLote(adm(), cod.frutoFilho, { incluirCancelados: false }))!;
    expect(r.lote.codigo).toBe(cod.frutoFilho);
    expect(r.recepcao).not.toBeNull();
    expect(r.familia.map((l) => [l.codigo, l.consultado])).toEqual([
      [cod.fruto, false],
      [cod.frutoFilho, true],
    ]);
    expect(r.opsQueConsumiram).toHaveLength(1);
    expect(r.opsQueConsumiram[0]).toMatchObject({ kgDesteLote: 30, lotesDaFamilia: [cod.frutoFilho] });
    expect(r.clientes.map((c) => [c.caminho, c.loteVendido, c.kg, c.opNumero])).toEqual(
      expect.arrayContaining([
        ["DIRETO", cod.frutoFilho, 10, null],
        ["POLPA", cod.polpaFilho, 5, cod.op],
      ]),
    );
    expect(r.destino).toMatchObject({ entradaKg: 100, consumidoOpKg: 30, vendidoKg: 10, saldoKg: 60, confere: true });
  });

  test("consultar o original traz os mesmos clientes", async () => {
    const r = (await rastrearLote(adm(), cod.fruto, { incluirCancelados: false }))!;
    expect(r.clientes).toHaveLength(2);
    expect(r.familia.find((l) => l.consultado)?.codigo).toBe(cod.fruto);
  });

  test("filho de polpa: OP de origem e origem do fruto filho vêm dos originais", async () => {
    const r = (await rastrearLote(adm(), cod.polpaFilho, { incluirCancelados: false }))!;
    expect(r.opOrigem?.numero).toBe(cod.op);
    expect(r.frutosConsumidos).toHaveLength(1);
    expect(r.frutosConsumidos[0].codigo).toBe(cod.frutoFilho);
    expect(descreverOrigem(r.frutosConsumidos[0].origem)).toContain("Talhão 1");
    expect(r.familia).toHaveLength(2);
    expect(r.destino).toMatchObject({ entradaKg: 20, vendidoKg: 5, saldoKg: 15, confere: true });
  });

  test("busca pelo código do original encontra também os filhos", async () => {
    const encontrados = await buscarLotes(adm(), cod.fruto);
    expect(encontrados.map((l) => l.codigo)).toEqual(expect.arrayContaining([cod.fruto, cod.frutoFilho]));
  });
});
```
Acrescentar `import { transferirLote } from "./estoque";` no topo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/services/rastreabilidade.test.ts`
Expected: FAIL — `familia` indefinido, `recepcao` nula no filho, venda da polpa filha ausente.

- [ ] **Step 3: Tipos** — em `rastreabilidade.ts`:

Em `OpConsumidora`, depois de `consumoRemovido: boolean;`:
```ts
  /** Códigos dos lotes da família consumidos nesta OP (D-36). */
  lotesDaFamilia: string[];
```
Novo tipo, antes de `Rastreio`:
```ts
/** Original e filhos de uma transferência parcial (D-36). */
export type LoteDaFamilia = { codigo: string; local: string; saldoKg: number; validade: Date; consultado: boolean };
```
Em `Rastreio`, depois de `lote: LoteRastreio;`:
```ts
  /** Original e filhos; um item só quando o lote nunca foi dividido. */
  familia: LoteDaFamilia[];
```

Em `SELECT_OP.consumos.select.lote.select`, depois de `recepcao: { select: SELECT_ORIGEM_FRUTO },`:
```ts
          loteOrigem: { select: { recepcao: { select: SELECT_ORIGEM_FRUTO } } },
```

- [ ] **Step 4: `rastrearLote`** — substituir do `const lote = await prisma.lote.findFirst({` até o fim da construção de `opsQueConsumiram` e `itens`/`clientes`/retorno conforme abaixo:

```ts
  const lote = await prisma.lote.findFirst({
    where: { filialId: sessao.filialId, codigo: { equals: termo, mode: "insensitive" } },
    include: {
      produto: { select: { descricao: true, categoria: true, conservacao: true } },
      local: { select: { nome: true } },
    },
  });
  if (!lote) return null;

  // D-36: a consulta é pela família; origem para trás vem do original.
  const origemId = lote.loteOrigemId ?? lote.id;
  const [original, familia] = await Promise.all([
    prisma.lote.findUniqueOrThrow({
      where: { id: origemId },
      select: {
        recepcao: {
          select: {
            data: true,
            pesoBrutoKg: true,
            descarteKg: true,
            documento: true,
            status: true,
            ...SELECT_ORIGEM_FRUTO,
          },
        },
        producaoOP: { select: { ordemProducaoId: true } },
      },
    }),
    prisma.lote.findMany({
      where: { filialId: sessao.filialId, OR: [{ id: origemId }, { loteOrigemId: origemId }] },
      select: {
        id: true,
        codigo: true,
        saldoKg: true,
        validade: true,
        local: { select: { nome: true } },
        consumosOP: { select: { ordemProducaoId: true } },
      },
      orderBy: { criadoEm: "asc" },
    }),
  ]);
  const idsDaFamilia = familia.map((l) => l.id);
  const naFamilia = new Set(idsDaFamilia);

  const fruto = lote.produto.categoria === "FRUTO";
  const opIds = fruto
    ? [...new Set(familia.flatMap((l) => l.consumosOP.map((c) => c.ordemProducaoId)))]
    : original.producaoOP
      ? [original.producaoOP.ordemProducaoId]
      : [];
```
No `Promise.all` de `configuracao, ops, movimentos`, trocar `where: { loteId: lote.id }` por `where: { loteId: { in: idsDaFamilia } }`.

Em `frutosConsumidos`, trocar `origem: c.lote.recepcao ? origemDoFruto(c.lote.recepcao) : null,` por:
```ts
        origem: (() => {
          const recepcao = c.lote.recepcao ?? c.lote.loteOrigem?.recepcao ?? null;
          return recepcao ? origemDoFruto(recepcao) : null;
        })(),
```

Em `opsQueConsumiram`: trocar `c.loteId === lote.id` por `naFamilia.has(c.loteId)` e, no objeto retornado, depois de `consumoRemovido,`:
```ts
            lotesDaFamilia: [...new Set(ativos.map((c) => c.lote.codigo))],
```

Antes de `const itens = await prisma.itemPedidoVenda.findMany({`:
```ts
  // Polpa transferida também foi vendida: os filhos herdam o nº da OP da polpa original.
  if (opDoLotePolpa.size > 0) {
    const filhosDasPolpas = await prisma.lote.findMany({
      where: { filialId: sessao.filialId, loteOrigemId: { in: [...opDoLotePolpa.keys()] } },
      select: { id: true, loteOrigemId: true },
    });
    for (const filho of filhosDasPolpas) opDoLotePolpa.set(filho.id, opDoLotePolpa.get(filho.loteOrigemId!)!);
  }
```
Em `itens`: `loteId: { in: [...idsDaFamilia, ...opDoLotePolpa.keys()] }`. Em `clientes`: `caminho: naFamilia.has(i.loteId) ? ("DIRETO" as const) : ("POLPA" as const),`.

No retorno: depois de `const saldoKg = Number(lote.saldoKg);` acrescentar
```ts
  const saldoDaFamilia = arredondar(familia.reduce((s, l) => s + Number(l.saldoKg), 0), 3);
```
e no objeto: depois de `lote: {...},`
```ts
    familia: familia.map((l) => ({
      codigo: l.codigo,
      local: l.local.nome,
      saldoKg: Number(l.saldoKg),
      validade: l.validade,
      consultado: l.id === lote.id,
    })),
```
`recepcao: lote.recepcao ? {...}` → usar `original.recepcao` (as quatro referências dentro do bloco). `destinoDoLote(..., saldoKg)` → `destinoDoLote(..., saldoDaFamilia)`.

Atualizar o comentário do `rastrearLote` acrescentando: "Consulta por família (D-36): original e filhos de transferência parcial."

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/server/services/rastreabilidade.test.ts src/server/export; npx tsc --noEmit -p .`
Expected: testes de serviço PASS. O `tsc` pode acusar fixtures de `Rastreio` em `src/server/export/rastreabilidade.test.ts` sem `familia`/`lotesDaFamilia`: acrescentar `familia: []` e `lotesDaFamilia: []` nesses objetos (a Task 6 cobre o export).

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(rastreabilidade): consulta pela família do lote"
```

---

### Task 6: Rastreabilidade — tela e export

**Files:**
- Modify: `src/app/(dashboard)/producao/rastreabilidade/cartoes.tsx`
- Modify: `src/app/(dashboard)/producao/rastreabilidade/page.tsx`
- Modify: `src/server/export/rastreabilidade.ts`
- Test: `src/server/export/rastreabilidade.test.ts`

**Interfaces:**
- Consumes: Task 5 (`Rastreio.familia`, `LoteDaFamilia`, `OpConsumidora.lotesDaFamilia`).
- Produces: `CartaoFamilia({ familia, incluirCancelados })`; seção PDF "Lotes da família".

- [ ] **Step 1: Teste que falha** — em `src/server/export/rastreabilidade.test.ts`, reaproveitar o objeto `Rastreio` de exemplo do arquivo (ler o arquivo; ele já monta um) e acrescentar:

```ts
test("PDF traz a seção Lotes da família só quando o lote foi dividido (D-36)", () => {
  const familia = [
    { codigo: "FA-261110-01", local: "Recepção", saldoKg: 60, validade: new Date("2026-11-11"), consultado: true },
    { codigo: "FA-261110-01/1", local: "Câmara", saldoKg: 10, validade: new Date("2026-11-11"), consultado: false },
  ];
  const titulos = (r: Rastreio) => secoesDoRastreio(r).map((s) => s.titulo);
  expect(titulos({ ...RASTREIO, familia })).toContain("Lotes da família");
  expect(titulos({ ...RASTREIO, familia: familia.slice(0, 1) })).not.toContain("Lotes da família");
});
```
(`RASTREIO` = nome do objeto de exemplo existente no arquivo; ajustar ao nome real.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/export/rastreabilidade.test.ts`
Expected: FAIL — seção ausente.

- [ ] **Step 3: Export** — em `src/server/export/rastreabilidade.ts`, importar `type LoteDaFamilia` e acrescentar:

```ts
const COLUNAS_FAMILIA: ColunaExport<LoteDaFamilia>[] = [
  { rotulo: "Lote", valor: (l) => (l.consultado ? `${l.codigo} (consultado)` : l.codigo) },
  { rotulo: "Local", valor: (l) => l.local },
  { rotulo: "Validade", valor: (l) => l.validade },
  { rotulo: "Saldo (kg)", valor: (l) => l.saldoKg },
];
```
Em `COLUNAS_OP_CONSUMIDORA`, trocar `{ rotulo: "kg deste lote", valor: (op) => op.kgDesteLote },` por:
```ts
  { rotulo: "kg consumido", valor: (op) => op.kgDesteLote },
  { rotulo: "Lotes", valor: (op) => op.lotesDaFamilia.join(", ") },
```
Em `secoesDoRastreio`, logo depois da seção "Lote":
```ts
  if (r.familia.length > 1) {
    secoes.push(secaoPdf({ titulo: "Lotes da família", linhas: r.familia, colunas: COLUNAS_FAMILIA }));
  }
```
Renomear o título "Destino do lote" para `r.familia.length > 1 ? "Destino da família" : "Destino do lote"` (mantendo o sufixo "(não confere com o saldo)").

- [ ] **Step 4: Tela** — em `cartoes.tsx`, importar `type LoteDaFamilia` e acrescentar:

```tsx
export function CartaoFamilia({ familia, incluirCancelados }: { familia: LoteDaFamilia[]; incluirCancelados: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lotes da família</CardTitle>
        <CardDescription>
          O lote foi dividido em transferências entre locais. A origem, as OPs, os clientes e o destino abaixo somam
          todos eles.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lote</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead className="text-right">Saldo (kg)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {familia.map((l) => (
              <TableRow key={l.codigo} className={l.consultado ? "font-medium" : undefined}>
                <TableCell className="whitespace-nowrap">
                  {l.consultado ? l.codigo : <LinkRastreio codigo={l.codigo} incluirCancelados={incluirCancelados} />}
                  {l.consultado ? (
                    <Badge variant="outline" className="ml-2">
                      Consultado
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>{l.local}</TableCell>
                <TableCell>{formatarData(l.validade)}</TableCell>
                <TableCell className="text-right tabular-nums">{KG.format(l.saldoKg)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
```
Em `CartaoParaFrente`, trocar o parágrafo "Usou … deste lote" por:
```tsx
            <p className="text-sm">
              Usou <span className="font-medium tabular-nums">{KG.format(op.kgDesteLote)} kg</span>{" "}
              {rastreio.familia.length > 1 ? `dos lotes ${op.lotesDaFamilia.join(", ")}` : "deste lote"}
              {op.consumoRemovido ? <Removido /> : null}
            </p>
```
Em `CartaoDestino`, aceitar `familia?: boolean` e usar `{familia ? "Destino da família" : "Destino do lote"}` no título.

Em `page.tsx`: importar `CartaoFamilia`; depois de `<ExportarLinks ... />`:
```tsx
          {rastreio.familia.length > 1 ? (
            <CartaoFamilia familia={rastreio.familia} incluirCancelados={incluirCancelados} />
          ) : null}
```
e `<CartaoDestino destino={rastreio.destino} familia={rastreio.familia.length > 1} />`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/server/export/rastreabilidade.test.ts; npx tsc --noEmit -p .; npx eslint "src/app/(dashboard)/producao/rastreabilidade" src/server/export/rastreabilidade.ts`
Expected: PASS, sem erros.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(rastreabilidade): seção Lotes da família na tela e no PDF"
```

---

### Task 7: Tela de Estoque — diálogo Transferir

**Files:**
- Create: `src/lib/schemas/transferenciaLote.ts`
- Test: `src/lib/schemas/transferenciaLote.test.ts`
- Modify: `src/app/(dashboard)/producao/estoque/actions.ts`
- Create: `src/app/(dashboard)/producao/estoque/transferir-lote-dialog.tsx`; Delete: `mover-lote-dialog.tsx`
- Modify: `src/app/(dashboard)/producao/estoque/page.tsx:19,30,250-252`

**Interfaces:**
- Consumes: Task 2 (`transferirLote`).
- Produces: `transferenciaLoteSchema`, `transferirLoteAction(prev: FormState, formData: FormData): Promise<FormState>`, `TransferirLoteDialog({ lote: { id; codigo; localId; saldoKg: number }, locais })`.

- [ ] **Step 1: Teste que falha** — `src/lib/schemas/transferenciaLote.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { transferenciaLoteSchema } from "./transferenciaLote";

describe("transferenciaLoteSchema", () => {
  test("aceita kg decimal", () => {
    expect(transferenciaLoteSchema.parse({ loteId: "l", localId: "x", quantidadeKg: "12.5" }).quantidadeKg).toBe(12.5);
  });
  test("exige local e quantidade positiva", () => {
    const r = transferenciaLoteSchema.safeParse({ loteId: "l", localId: "", quantidadeKg: "0" });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.message)).toEqual([
      "Selecione o local de destino",
      "Informe uma quantidade maior que zero",
    ]);
  });
});
```
(Se o projeto já tiver um helper de número decimal com vírgula em `src/lib/schemas/campos.ts`, usar o mesmo e incluir um caso com `"12,5"`; senão, ficar só com o ponto — o `input type="number"` envia ponto.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/schemas/transferenciaLote.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Schema** — `src/lib/schemas/transferenciaLote.ts`:

```ts
import { z } from "zod";

/** Transferência de lote entre locais (D-36): kg ≤ saldo é conferido no serviço. */
export const transferenciaLoteSchema = z.object({
  loteId: z.string().trim().min(1, "Lote não informado"),
  localId: z.string().trim().min(1, "Selecione o local de destino"),
  quantidadeKg: z.coerce.number().positive("Informe uma quantidade maior que zero"),
});

export type TransferenciaLoteValues = z.infer<typeof transferenciaLoteSchema>;
```

- [ ] **Step 4: Action** — em `actions.ts`, substituir `moverLoteAction` (e o import de `prisma`, se só ela usava) por:

```ts
export async function transferirLoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const dados = transferenciaLoteSchema.safeParse({
    loteId: formData.get("loteId") ?? "",
    localId: formData.get("localId") ?? "",
    quantidadeKg: formData.get("quantidadeKg") ?? "",
  });
  if (!dados.success) return { erro: dados.error.issues[0].message };
  return executarNoLote(() =>
    transferirLote(sessao, dados.data.loteId, dados.data.localId, dados.data.quantidadeKg),
  );
}
```
Imports: `transferirLote` no lugar de `moverLote`; `import { transferenciaLoteSchema } from "@/lib/schemas/transferenciaLote";`. Mover a função para depois de `executarNoLote`.

- [ ] **Step 5: Diálogo** — criar `transferir-lote-dialog.tsx` (copiar a estrutura de `mover-lote-dialog.tsx`, que é removido com `git rm`):

```tsx
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { transferirLoteAction, type FormState } from "./actions";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

const ESTADO_INICIAL: FormState = {};

export function TransferirLoteDialog({
  lote,
  locais,
}: {
  lote: { id: string; codigo: string; localId: string; saldoKg: number };
  locais: { id: string; nome: string }[];
}) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(transferirLoteAction, ESTADO_INICIAL);
  const destinos = locais.filter((l) => l.id !== lote.localId);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Transferir</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir lote {lote.codigo}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="loteId" value={lote.id} />
          <p className="text-sm text-muted-foreground">
            Com o saldo inteiro, o lote só muda de local. Com parte dele, a parte vira o lote {lote.codigo}/N no novo
            local (ou soma no lote desta família que já estiver lá).
          </p>
          <div className="space-y-2">
            <Label htmlFor={`local-${lote.id}`}>Novo local</Label>
            <Select name="localId">
              <SelectTrigger id={`local-${lote.id}`} className="w-full">
                <SelectValue placeholder="Selecione o local" />
              </SelectTrigger>
              <SelectContent>
                {destinos.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`kg-${lote.id}`}>Quantidade (kg)</Label>
            <Input
              id={`kg-${lote.id}`}
              name="quantidadeKg"
              type="number"
              step="0.001"
              min="0.001"
              max={lote.saldoKg}
              defaultValue={lote.saldoKg}
              required
            />
            <p className="text-xs text-muted-foreground">Saldo do lote: {lote.saldoKg} kg</p>
          </div>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente || destinos.length === 0}>
            {pendente ? "Transferindo..." : "Transferir"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```
Formatar o saldo exibido com o formatador de kg que a página de Estoque já usa (ler `page.tsx`; se houver `KG.format`/`formatarKg`, usar o mesmo em vez de `{lote.saldoKg}` cru).

- [ ] **Step 6: Página** — em `page.tsx`: trocar o import de `MoverLoteDialog` por `TransferirLoteDialog` de `./transferir-lote-dialog`; renomear `podeMover` para `podeTransferir` (linha 30 e uso); trocar o uso por:
```tsx
                      <TransferirLoteDialog
                        lote={{ id: lote.id, codigo: lote.codigo, localId: lote.localId, saldoKg: Number(lote.saldoKg) }}
                        locais={locais}
                      />
```

- [ ] **Step 7: Rodar**

Run: `npx vitest run src/lib/schemas/transferenciaLote.test.ts; npx tsc --noEmit -p .; npx eslint "src/app/(dashboard)/producao/estoque" src/lib/schemas/transferenciaLote.ts`
Expected: PASS, sem erros. `rg "moverLote|MoverLote" src` sem resultados.

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "feat(estoque): diálogo Transferir com quantidade na tela de Estoque"
```

---

### Task 8: Documentação

**Files:**
- Modify: `docs/modulos/producao-estoque-vendas/08-duvidas-decisoes.md` (D-15, nova D-36)
- Modify: `docs/modulos/producao-estoque-vendas/03-regras-de-negocio.md` (RN-34)
- Modify: `content/ajuda/passo-a-passo.md` (5.3, 5.5, 5.6)
- Modify: `docs/fases/fase-7-producao-estoque-vendas.md` (parágrafo de status)
- Modify: `docs/backlog.md` (remover o item)
- Modify: spec (status) e memória `fluxo-fase-7.md`

- [ ] **Step 1: Doc 08** — ler o formato da tabela (colunas: id, assunto, pergunta, sugestão, fase, decisão). Na linha D-15, acrescentar ao fim da coluna Decisão: ` Transferência parcial feita pela D-36 (2026-11-18).` Acrescentar depois da D-35:

```markdown
| D-36 | Transferência parcial de lote | Parte de um lote vai para outro local (backlog da 7b). Mesmo lote com saldo por local, ou lote novo? | Lote filho. | — | **Lote filho `ORIGINAL/N`** (numerado a partir do original), com os dados do original e ligado a ele; se a família já tem lote no destino, soma nele; saldo inteiro sem família no destino só troca o local. O filho segue a recepção/OP do original para poder sair; a liberação de vencido vale para a família; a rastreabilidade consulta a família inteira (2026-11-18). |
```

- [ ] **Step 2: Doc 03** — ler o formato de uma RN (ex.: RN-33) e acrescentar depois dela:

```markdown
**RN-34 — Transferência entre locais.** Transferir kg de um lote para outro
local (perfis com `producao:escrever`): a quantidade é maior que zero e não
passa do saldo; o destino é um local ativo da filial, diferente do atual. Se
a família do lote (o original e os filhos de transferências anteriores) já
tem um lote no destino, os kg são somados nele; se não tem e é o saldo
inteiro, o lote só muda de local; se é parte, nasce o lote filho
`ORIGINAL/N` no destino, com produto, data, validade, custo e liberação do
original. Com movimento, só lote que pode sair (recepção não excluída, polpa
de OP encerrada); lote vencido pode ser transferido. A transferência gera
saída e entrada ligadas, conta como movimentação (impede excluir a recepção
e reabrir ou cancelar a OP) e é auditada (D-36).
```

- [ ] **Step 3: Ajuda** — em `content/ajuda/passo-a-passo.md`:

5.3: trocar "O botão **Mover** troca o local do lote inteiro." por:
```markdown
O botão **Transferir** leva o lote, ou parte dele, para outro local: escolha o local e a quantidade em kg (já vem com o saldo inteiro). Com o saldo inteiro, o lote só muda de local. Com parte dele, a parte vira um lote novo no destino com o mesmo código e uma barra no fim (`FA-261110-01/1`, `/2`…), com a mesma validade, custo e origem; se já existe um lote dessa família no destino, a quantidade é somada nele (devolver para o local de origem junta de volta). Polpa de OP aberta só pode mudar de local inteira.
```
Na liberação (mesma seção), acrescentar ao fim do parágrafo: ` Num lote dividido por transferência, liberar ou revogar vale para todos os lotes da família.`

5.5: acrescentar ao fim do segundo parágrafo: ` A etiqueta de um lote criado por transferência sai com uma cópia, com o peso de uma embalagem do lote original.`

5.6: acrescentar um item à lista:
```markdown
- **Lote dividido por transferência:** digitar o código original ou qualquer `/N` mostra a família inteira: a seção **Lotes da família** lista cada lote com local e saldo, e a origem, as OPs, os clientes e o destino somam todos eles.
```

- [ ] **Step 4: Fase 7** — no parágrafo de status de `docs/fases/fase-7-producao-estoque-vendas.md`, depois de "...implantada do zero, sem importação.", acrescentar: ` Transferência parcial de lote concluída em 2026-11-18 (D-36): parte do lote vai para outro local como lote filho \`ORIGINAL/N\`, que segue o original na venda, OP, liberação e rastreabilidade.`

- [ ] **Step 5: Backlog** — remover de `docs/backlog.md` o item "**Transferência parcial de lote entre locais**" (e o cabeçalho "## Produção e vendas" se ficar vazio).

- [ ] **Step 6: Spec** — trocar `Status: desenho aprovado em chat` por `Status: implementada (2026-11-18)`.

- [ ] **Step 7: Commit**

```bash
git add docs content
git commit -m "docs(estoque): transferência parcial de lote na ajuda, decisões e regras"
```

---

### Task 9: Verificação final e conferência no navegador

- [ ] **Step 1: Suíte completa**

Run: `npx vitest run; npx tsc --noEmit -p .; npx eslint src`
Expected: tudo verde. Se algo falhar, corrigir antes de seguir (sem `--no-verify`).

- [ ] **Step 2: Cenário de teste** — script temporário `scripts/cenario-transferencia.ts` com as fixtures de `producaoTestFixtures.ts` (empresa de teste, `usuarioEmpresa` do admin com a filial A), recepção de fruto, OP encerrada com polpa e embalagens, e modo `limpar` no fim. Rodar com `node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/cenario-transferencia.ts`.

- [ ] **Step 3: Navegador** (`npm run dev`, login local, escolher a empresa de teste):
  1. Estoque → Transferir 40 kg do fruto para a câmara → aparece `…/1` na câmara; ocupação certa.
  2. Transferir mais 10 kg para a câmara → soma no `/1`.
  3. Transferir o `/1` inteiro de volta → soma no original, `/1` zerado.
  4. Transferir parte da polpa → `/1`; vender o `/1` num pedido.
  5. Rastreabilidade do `/1` da polpa e do fruto original → seção "Lotes da família", clientes e destino somados; PDF com a seção.
  6. Etiqueta do `/1` da polpa → uma cópia, peso da embalagem, nome do arquivo sem `/`.
  7. Console do navegador sem erros.

- [ ] **Step 4: Limpeza** — rodar o script em modo `limpar`, apagar `scripts/cenario-transferencia.ts` e a pasta `.playwright-mcp/`.

- [ ] **Step 5: Memória** — atualizar `fluxo-fase-7.md` (e o item do backlog em `fora-do-escopo-vai-pro-backlog.md`) com a entrega e a branch.

- [ ] **Step 6: Relatório final** ao usuário: o que foi feito, decisões tomadas na implementação, pendências. Push/PR ficam com o usuário.
