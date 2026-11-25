# Baixa rejeitada visível — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou
> superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** quem registrou uma baixa fica sabendo que ela foi rejeitada: a parcela mostra a rejeição com motivo,
Contas a pagar/receber mostra um aviso com filtro, e uma rejeição que não precisa de nova baixa pode ser dispensada.

**Arquitetura:** uma função pura (`rejeicaoEmAberto`) decide se a rejeição está em aberto; a tela, a contagem do aviso e
o filtro usam essa função. A `Baixa` ganha três colunas para a dispensa (`dispensadaPorId`, `dispensadaEm`,
`motivoDispensa`); nada mais é gravado.

**Stack:** Next.js 16 (App Router, Server Actions), Prisma 7 + Postgres, Vitest, Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-11-25-rejeicao-visivel-design.md`, que deve ser lida antes de cada tarefa.

## Restrições globais

- Branch `feat/rejeicao-visivel` (já criada, sem upstream). Não fazer push.
- Todo commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Conferir com
  `git log -1 --format=%B` antes de passar para a próxima tarefa.
- Vitest roda pelo **PowerShell**: `Set-Location D:\Projetos\nx-control-erp; npx vitest run <arquivos>`. Pelo Bash
  todos os testes falham ("reading 'config'"). Os testes de serviço usam o Postgres de dev (docker
  `nx-control-erp-db`).
- **Nunca rodar Prettier nem `prisma format`.** Formatar à mão, linhas até ~120. Editar com a ferramenta Edit (os
  arquivos misturam CRLF e LF).
- Textos da tela, mensagens de erro e comentários em português do Brasil.
- Rejeição em aberto = `statusAprovacao` `REJEITADO` **e** `dispensadaEm` nulo **e** nenhuma outra baixa da parcela
  com `criadoEm` maior que o `avaliadoEm` desta **e** parcela fora de `PAGO`, `CANCELADO` e `RENEGOCIADO`.
- Quem dispensa: `titulo:baixar` (Administrador, Financeiro e Tesouraria) com permissão de alterar a filial. Motivo
  com pelo menos 3 caracteres depois do `trim()`. Sem segregação de funções.
- Ação de auditoria: `DISPENSAR_REJEICAO`, com o rótulo "Dispensar rejeição".
- Aviso: "1 baixa rejeitada aguardando novo registro." / "N baixas rejeitadas aguardando novo registro."

## Arquivos

| Arquivo | O que muda |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261125120000_dispensa_rejeicao/migration.sql` | 3 colunas e a relação `BaixaRejeicaoDispensadaPor` |
| `src/lib/financeiro/rejeicaoEmAberto.ts` (+ `.test.ts`) | novo: a regra |
| `src/server/services/baixa.ts` (+ `baixa.test.ts`) | `dispensarRejeicao`, `RejeicaoNaoDispensavelError`, `contarRejeicoesEmAberto` |
| `src/server/services/titulo.ts` (+ `titulo.test.ts`) | `FiltroTitulos.rejeitadas`, filtro em `listarTitulos`, include da tela |
| `src/lib/auditoria/rotulos.ts` | rótulo `DISPENSAR_REJEICAO` |
| `src/app/(dashboard)/financeiro/_titulos/filtro-titulos-url.ts` (+ teste) | parâmetro `rejeitadas` |
| `src/app/(dashboard)/financeiro/_titulos/descrever-filtro-titulos.ts` | texto do filtro |
| `src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.ts` (+ teste) | rejeitadas na lista da parcela |
| `src/app/(dashboard)/financeiro/_titulos/baixas-da-parcela.tsx` | linha da rejeitada e botão Dispensar |
| `src/app/(dashboard)/financeiro/_titulos/dispensar-dialog.tsx` | novo: diálogo |
| `src/app/(dashboard)/financeiro/_titulos/aviso-rejeitadas.tsx` | novo: aviso no topo |
| `src/app/(dashboard)/financeiro/_titulos/actions.ts` | `dispensarRejeicaoAction` |
| `src/app/(dashboard)/financeiro/_titulos/titulo-table.tsx`, `contas-client-panel.tsx` | ligar o Dispensar |
| `src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx`, `contas-a-receber/page.tsx` | contagem e aviso |
| `src/ajuda/_titulos/{alvos.ts,exemplo.ts,cenas.tsx,cenas.test.ts}` | réplica do aviso, da rejeitada e do diálogo |
| `src/ajuda/contas-a-pagar/*`, `src/ajuda/contas-a-receber/*` | exemplo e roteiro `tratar-rejeitada` |
| `src/ajuda/aprovacoes/roteiros.ts` | dica e "E depois?" do `rejeitar-baixa` |
| `docs/api-v1.md`, `docs/backlog.md`, spec | nota da API, item 5 feito, status da spec |

---

### Tarefa 1: Colunas da dispensa e a regra `rejeicaoEmAberto`

**Arquivos:**
- Modificar: `prisma/schema.prisma` (model `Baixa`, perto da linha 676; model `Usuario`, linha ~191)
- Criar: `prisma/migrations/20261125120000_dispensa_rejeicao/migration.sql`
- Criar: `src/lib/financeiro/rejeicaoEmAberto.ts`
- Teste: `src/lib/financeiro/rejeicaoEmAberto.test.ts`

**Interfaces:**
- Produz:
  ```ts
  export type BaixaParaRejeicao = {
    id: string;
    statusAprovacao: string;
    criadoEm: Date;
    avaliadoEm: Date | null;
    dispensadaEm: Date | null;
  };
  export function rejeicaoEmAberto(
    baixa: BaixaParaRejeicao,
    baixasDaParcela: readonly Pick<BaixaParaRejeicao, "id" | "criadoEm">[],
    statusParcela: string,
  ): boolean;
  export function parcelaTemRejeicaoEmAberto(parcela: { status: string; baixas: readonly BaixaParaRejeicao[] }): boolean;
  ```
- Produz no Prisma: `Baixa.dispensadaPorId`, `Baixa.dispensadaEm`, `Baixa.motivoDispensa`, `Baixa.dispensadaPor`.

- [ ] **Passo 1: schema.** No model `Baixa`, depois de `motivoEstorno  String?`:

```prisma
  dispensadaPorId String?
  dispensadaEm    DateTime?
  motivoDispensa  String?
```

e, depois da linha `estornadoPor  Usuario? ...`:

```prisma
  dispensadaPor Usuario?             @relation("BaixaRejeicaoDispensadaPor", fields: [dispensadaPorId], references: [id])
```

No model `Usuario`, depois de `baixasEstornadas ...`:

```prisma
  baixasRejeicaoDispensada  Baixa[]                  @relation("BaixaRejeicaoDispensadaPor")
```

Alinhar as colunas à mão, como as linhas vizinhas. Não rodar `prisma format`.

- [ ] **Passo 2: migration.** Criar a pasta e gerar o SQL:

```powershell
Set-Location D:\Projetos\nx-control-erp
New-Item -ItemType Directory -Force prisma\migrations\20261125120000_dispensa_rejeicao
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --output prisma/migrations/20261125120000_dispensa_rejeicao/migration.sql
```

Conferir que o SQL tem só isto (o nome da constraint pode variar no formato do Prisma):

```sql
-- AlterTable
ALTER TABLE "baixas" ADD COLUMN     "dispensadaEm" TIMESTAMP(3),
ADD COLUMN     "dispensadaPorId" TEXT,
ADD COLUMN     "motivoDispensa" TEXT;

-- AddForeignKey
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_dispensadaPorId_fkey" FOREIGN KEY ("dispensadaPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Se aparecer qualquer outra mudança, parar e avisar: o banco de dev está fora de sincronia.

- [ ] **Passo 3: aplicar e gerar o client.**

```powershell
npx prisma migrate deploy; if ($?) { npx prisma generate }; if ($?) { npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code }
```

Esperado: o último comando sai com código 0 ("No difference detected" ou vazio).

- [ ] **Passo 4: teste que falha.** `src/lib/financeiro/rejeicaoEmAberto.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parcelaTemRejeicaoEmAberto, rejeicaoEmAberto, type BaixaParaRejeicao } from "./rejeicaoEmAberto";

const rejeitada: BaixaParaRejeicao = {
  id: "r1",
  statusAprovacao: "REJEITADO",
  criadoEm: new Date("2026-10-15T13:00:00.000Z"),
  avaliadoEm: new Date("2026-10-15T18:00:00.000Z"),
  dispensadaEm: null,
};
const depois = (id: string, statusAprovacao = "PENDENTE"): BaixaParaRejeicao => ({
  id,
  statusAprovacao,
  criadoEm: new Date("2026-10-16T09:00:00.000Z"),
  avaliadoEm: null,
  dispensadaEm: null,
});

describe("rejeicaoEmAberto", () => {
  it("rejeitada, sem dispensa, sem baixa depois e parcela em aberto: em aberto", () => {
    expect(rejeicaoEmAberto(rejeitada, [rejeitada], "VENCIDO")).toBe(true);
  });

  it("baixa que não é rejeitada nunca está em aberto", () => {
    for (const status of ["PENDENTE", "APROVADO", "ESTORNADO"]) {
      expect(rejeicaoEmAberto({ ...rejeitada, statusAprovacao: status }, [], "EM_ABERTO")).toBe(false);
    }
  });

  it("dispensada: resolvida", () => {
    const dispensada = { ...rejeitada, dispensadaEm: new Date("2026-10-16T10:00:00.000Z") };
    expect(rejeicaoEmAberto(dispensada, [dispensada], "EM_ABERTO")).toBe(false);
  });

  it("outra baixa registrada depois da rejeição, com qualquer status: resolvida", () => {
    for (const status of ["PENDENTE", "APROVADO", "REJEITADO", "ESTORNADO"]) {
      expect(rejeicaoEmAberto(rejeitada, [rejeitada, depois("b2", status)], "EM_ABERTO")).toBe(false);
    }
  });

  it("baixa registrada antes da rejeição não resolve", () => {
    const antes = { ...depois("b0", "ESTORNADO"), criadoEm: new Date("2026-10-01T09:00:00.000Z") };
    expect(rejeicaoEmAberto(rejeitada, [antes, rejeitada], "PARCIALMENTE_PAGO")).toBe(true);
  });

  it("parcela paga, cancelada ou renegociada: resolvida", () => {
    for (const status of ["PAGO", "CANCELADO", "RENEGOCIADO"]) {
      expect(rejeicaoEmAberto(rejeitada, [rejeitada], status)).toBe(false);
    }
  });

  it("sem avaliadoEm (dado antigo), compara com o registro da própria baixa", () => {
    const semData = { ...rejeitada, avaliadoEm: null };
    expect(rejeicaoEmAberto(semData, [semData], "EM_ABERTO")).toBe(true);
    expect(rejeicaoEmAberto(semData, [semData, depois("b2")], "EM_ABERTO")).toBe(false);
  });
});

describe("parcelaTemRejeicaoEmAberto", () => {
  it("rejeitada duas vezes: só a mais nova conta, e a parcela tem rejeição em aberto", () => {
    const segunda = { ...depois("r2", "REJEITADO"), avaliadoEm: new Date("2026-10-16T15:00:00.000Z") };
    expect(rejeicaoEmAberto(rejeitada, [rejeitada, segunda], "VENCIDO")).toBe(false);
    expect(rejeicaoEmAberto(segunda, [rejeitada, segunda], "VENCIDO")).toBe(true);
    expect(parcelaTemRejeicaoEmAberto({ status: "VENCIDO", baixas: [rejeitada, segunda] })).toBe(true);
  });

  it("relançada e aprovada: a parcela não tem rejeição em aberto", () => {
    expect(parcelaTemRejeicaoEmAberto({ status: "PAGO", baixas: [rejeitada, depois("b2", "APROVADO")] })).toBe(false);
  });

  it("parcela sem baixas", () => {
    expect(parcelaTemRejeicaoEmAberto({ status: "EM_ABERTO", baixas: [] })).toBe(false);
  });
});
```

- [ ] **Passo 5: rodar e ver falhar.**
  `npx vitest run src/lib/financeiro/rejeicaoEmAberto.test.ts`. Esperado: FAIL, com o módulo inexistente.

- [ ] **Passo 6: implementar** `src/lib/financeiro/rejeicaoEmAberto.ts`:

```ts
/**
 * Baixa rejeitada que ainda pede ação (spec 2026-11-25-rejeicao-visivel): ninguém dispensou, nenhuma baixa
 * foi registrada na parcela depois da rejeição e a parcela continua em aberto. Calculada na hora, nunca
 * gravada: assim cancelar, renegociar, quitar ou relançar resolvem a rejeição sem código a mais.
 */
export type BaixaParaRejeicao = {
  id: string;
  statusAprovacao: string;
  criadoEm: Date;
  avaliadoEm: Date | null;
  dispensadaEm: Date | null;
};

const PARCELA_FECHADA = new Set(["PAGO", "CANCELADO", "RENEGOCIADO"]);

export function rejeicaoEmAberto(
  baixa: BaixaParaRejeicao,
  baixasDaParcela: readonly Pick<BaixaParaRejeicao, "id" | "criadoEm">[],
  statusParcela: string,
): boolean {
  if (baixa.statusAprovacao !== "REJEITADO" || baixa.dispensadaEm !== null) return false;
  if (PARCELA_FECHADA.has(statusParcela)) return false;
  // Rejeição gravada antes de `avaliadoEm` existir: o registro da própria baixa é o limite.
  const rejeitadaEm = (baixa.avaliadoEm ?? baixa.criadoEm).getTime();
  return !baixasDaParcela.some((outra) => outra.id !== baixa.id && outra.criadoEm.getTime() > rejeitadaEm);
}

export function parcelaTemRejeicaoEmAberto(parcela: { status: string; baixas: readonly BaixaParaRejeicao[] }): boolean {
  return parcela.baixas.some((baixa) => rejeicaoEmAberto(baixa, parcela.baixas, parcela.status));
}
```

- [ ] **Passo 7: rodar e ver passar.** Mesmo comando. Esperado: PASS (10 testes).

- [ ] **Passo 8: commit.**

```powershell
git add prisma/schema.prisma prisma/migrations/20261125120000_dispensa_rejeicao src/lib/financeiro/rejeicaoEmAberto.ts src/lib/financeiro/rejeicaoEmAberto.test.ts
git commit -m @'
feat(baixa): colunas da dispensa de rejeição e regra de rejeição em aberto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Tarefa 2: Serviço — dispensar, contar e filtrar

**Arquivos:**
- Modificar: `src/server/services/baixa.ts` (classes de erro perto da linha 31; funções novas no fim)
- Modificar: `src/server/services/titulo.ts` (`FiltroTitulos` linha 22, `INCLUDE_TELA_TITULOS` linha 215,
  `listarTitulos` linha 296)
- Modificar: `src/lib/auditoria/rotulos.ts` (em ordem alfabética, depois de `DESFAZER_REPASSE`)
- Teste: `src/server/services/baixa.test.ts` (novo `describe` no fim do arquivo)

**Interfaces:**
- Consome: `rejeicaoEmAberto` e `parcelaTemRejeicaoEmAberto` (Tarefa 1).
- Produz:
  ```ts
  export class RejeicaoNaoDispensavelError extends Error {}
  export async function dispensarRejeicao(sessao: SessaoAtiva, baixaId: string, motivo: string): Promise<Baixa>;
  export async function contarRejeicoesEmAberto(filialId: string, tipo: TipoTitulo): Promise<number>;
  // titulo.ts
  export type FiltroTitulos = { ...; rejeitadas?: true };
  ```
  Em `listarTitulos`, as baixas da tela passam a trazer `dispensadaPor: { nome }` (os escalares `avaliadoEm`,
  `motivoRejeicao`, `dispensadaEm` e `motivoDispensa` já vêm com o `include`).

- [ ] **Passo 1: testes que falham.** No fim de `src/server/services/baixa.test.ts`, depois de acrescentar
  `dispensarRejeicao`, `contarRejeicoesEmAberto` e `RejeicaoNaoDispensavelError` ao import de `./baixa` e
  `listarTitulos` ao import de `./titulo`:

```ts
describe("rejeição em aberto e dispensa", () => {
  let fx: FixtureFinanceiro; // FINANCEIRO: registra e dispensa; quem rejeita é o sessaoAdmin
  let fxOutra: FixtureFinanceiro; // outra filial

  beforeAll(async () => {
    fx = await criarFixtureFinanceiro("BXR");
    fxOutra = await criarFixtureFinanceiro("BXRO");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fx);
    await limparFixtureFinanceiro(fxOutra);
  });

  async function parcelaNova(f: FixtureFinanceiro, tipo: TipoTitulo = "PAGAR") {
    const titulo = await criarTitulo(f.sessaoAdmin, tipo, {
      contraparteId: tipo === "PAGAR" ? f.fornecedorId : f.clienteId,
      documento: `NF-R-${Date.now()}-${Math.random()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: f.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: f.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });
    return titulo.parcelas[0];
  }

  async function baixaRejeitada(f: FixtureFinanceiro, tipo: TipoTitulo = "PAGAR") {
    const parcela = await parcelaNova(f, tipo);
    const baixa = await registrarBaixa(f.sessao, parcela.id, {
      data: new Date(),
      valorPago: 100,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: f.contaBancariaId,
    });
    await rejeitarBaixa(f.sessaoAdmin, baixa.id, "Valor diferente do comprovante");
    return { parcela, baixa };
  }

  test("dispensa grava quem, quando e o motivo, e registra a auditoria", async () => {
    const { baixa } = await baixaRejeitada(fx);
    const dispensada = await dispensarRejeicao(fx.sessao, baixa.id, "  pagamento não aconteceu  ");

    expect(dispensada.dispensadaPorId).toBe(fx.sessao.usuarioId);
    expect(dispensada.dispensadaEm).toBeInstanceOf(Date);
    expect(dispensada.motivoDispensa).toBe("pagamento não aconteceu");
    const auditoria = await prisma.auditLog.findFirst({ where: { entidadeId: baixa.id, acao: "DISPENSAR_REJEICAO" } });
    expect(auditoria).not.toBeNull();
  });

  test("motivo curto, perfil sem titulo:baixar, filial somente leitura e outra filial são recusados", async () => {
    const { baixa } = await baixaRejeitada(fx);
    await expect(dispensarRejeicao(fx.sessao, baixa.id, " a ")).rejects.toThrow("Informe o motivo da dispensa");
    await expect(dispensarRejeicao({ ...fx.sessao, perfil: "GESTOR" }, baixa.id, "motivo ok")).rejects.toThrow(
      PermissionError,
    );
    await expect(dispensarRejeicao(fx.sessaoSomenteLeitura, baixa.id, "motivo ok")).rejects.toThrow();
    await expect(dispensarRejeicao(fxOutra.sessao, baixa.id, "motivo ok")).rejects.toThrow();
    const intacta = await prisma.baixa.findUniqueOrThrow({ where: { id: baixa.id } });
    expect(intacta.dispensadaEm).toBeNull();
  });

  test("baixa que não é rejeitada, já dispensada ou já resolvida não é dispensada", async () => {
    const parcela = await parcelaNova(fx);
    const pendente = await registrarBaixa(fx.sessao, parcela.id, {
      data: new Date(),
      valorPago: 50,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fx.contaBancariaId,
    });
    await expect(dispensarRejeicao(fx.sessao, pendente.id, "motivo ok")).rejects.toThrow(
      "Só uma baixa rejeitada pode ser dispensada",
    );

    const { baixa: dispensada } = await baixaRejeitada(fx);
    await dispensarRejeicao(fx.sessao, dispensada.id, "primeira vez");
    await expect(dispensarRejeicao(fx.sessao, dispensada.id, "segunda vez")).rejects.toThrow(
      RejeicaoNaoDispensavelError,
    );

    // Relançada: a rejeição se resolveu sozinha.
    const { parcela: relancada, baixa: resolvida } = await baixaRejeitada(fx);
    await registrarBaixa(fx.sessao, relancada.id, {
      data: new Date(),
      valorPago: 100,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fx.contaBancariaId,
    });
    await expect(dispensarRejeicao(fx.sessao, resolvida.id, "motivo ok")).rejects.toThrow(
      "Esta rejeição já foi resolvida",
    );
  });

  test("contarRejeicoesEmAberto e o filtro rejeitadas: só as em aberto, por tipo e por filial", async () => {
    const fxConta = await criarFixtureFinanceiro("BXRC");
    try {
      const aberta = await baixaRejeitada(fxConta, "PAGAR");
      const dispensada = await baixaRejeitada(fxConta, "PAGAR");
      await dispensarRejeicao(fxConta.sessao, dispensada.baixa.id, "não houve pagamento");
      const cancelada = await baixaRejeitada(fxConta, "PAGAR");
      await cancelarParcela(fxConta.sessaoAdmin, cancelada.parcela.id);
      await baixaRejeitada(fxConta, "RECEBER");
      await baixaRejeitada(fxOutra, "PAGAR");

      expect(await contarRejeicoesEmAberto(fxConta.filialId, "PAGAR")).toBe(1);
      expect(await contarRejeicoesEmAberto(fxConta.filialId, "RECEBER")).toBe(1);

      const filtrados = await listarTitulos(fxConta.filialId, "PAGAR", { rejeitadas: true });
      expect(filtrados.map((t) => t.parcelas[0].id)).toEqual([aberta.parcela.id]);
      expect(await listarTitulos(fxConta.filialId, "PAGAR")).toHaveLength(3);
    } finally {
      await limparFixtureFinanceiro(fxConta);
    }
  });
});
```

O model de auditoria é `auditLog` (o teste de estorno no mesmo arquivo, linha ~594, consulta igual).

- [ ] **Passo 2: rodar e ver falhar.** `npx vitest run src/server/services/baixa.test.ts -t "rejeição em aberto"`.
  Esperado: FAIL, com as funções que ainda não existem.

- [ ] **Passo 3: rótulo da auditoria.** Em `src/lib/auditoria/rotulos.ts`, depois de
  `DESFAZER_REPASSE: "Desfazer repasse",`:

```ts
  DISPENSAR_REJEICAO: "Dispensar rejeição",
```

Se um teste de rótulos exigir que toda ação usada no código tenha rótulo, ele passa a cobrir esta.

- [ ] **Passo 4: implementar em `baixa.ts`.** Imports: `formatarDataHora` junto de `formatarData` e `formatarMoeda`;
  `import { rejeicaoEmAberto } from "@/lib/financeiro/rejeicaoEmAberto";`; `TipoTitulo` no import de tipos do
  `@prisma/client`. Depois de `BaixaParcelaFechadaError`:

```ts
/** A baixa não é uma rejeição em aberto: não é rejeitada, já foi dispensada ou já se resolveu. */
export class RejeicaoNaoDispensavelError extends Error {
  name = "RejeicaoNaoDispensavelError";
}
```

No fim do arquivo:

```ts
/**
 * Tira do aviso uma rejeição que não precisa de nova baixa (spec 2026-11-25-rejeicao-visivel): o pagamento
 * não aconteceu, por exemplo. Só esconde o aviso, sem mexer em saldo nem lançamento: não há segregação.
 */
export async function dispensarRejeicao(sessao: SessaoAtiva, baixaId: string, motivo: string) {
  requirePermission(sessao.perfil, "titulo:baixar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length < 3) throw new Error("Informe o motivo da dispensa");

  return prisma.$transaction(async (tx) => {
    // Leituras em sequência, sem include com várias relações (consultas paralelas na transação).
    const baixa = await tx.baixa.findFirstOrThrow({
      where: { id: baixaId, parcela: { titulo: { filialId: sessao.filialId } } },
    });
    if (baixa.statusAprovacao !== "REJEITADO") {
      throw new RejeicaoNaoDispensavelError("Só uma baixa rejeitada pode ser dispensada");
    }
    if (baixa.dispensadaEm) {
      const quem = baixa.dispensadaPorId
        ? await tx.usuario.findUnique({ where: { id: baixa.dispensadaPorId }, select: { nome: true } })
        : null;
      throw new RejeicaoNaoDispensavelError(
        `Esta rejeição já foi dispensada${quem ? ` por ${quem.nome}` : ""} em ${formatarDataHora(baixa.dispensadaEm)}`,
      );
    }
    const parcela = await tx.parcela.findUniqueOrThrow({ where: { id: baixa.parcelaId }, select: { status: true } });
    const daParcela = await tx.baixa.findMany({
      where: { parcelaId: baixa.parcelaId },
      select: { id: true, criadoEm: true },
    });
    if (!rejeicaoEmAberto(baixa, daParcela, parcela.status)) {
      throw new RejeicaoNaoDispensavelError(
        "Esta rejeição já foi resolvida: a parcela recebeu outra baixa ou não está mais em aberto",
      );
    }

    const dispensadaEm = new Date();
    // Condicional: de duas dispensas simultâneas, só uma passa.
    const { count } = await tx.baixa.updateMany({
      where: { id: baixaId, dispensadaEm: null },
      data: { dispensadaPorId: sessao.usuarioId, dispensadaEm, motivoDispensa: motivoLimpo },
    });
    if (count !== 1) throw new RejeicaoNaoDispensavelError("Esta rejeição já foi dispensada");

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Baixa",
        entidadeId: baixaId,
        acao: "DISPENSAR_REJEICAO",
        anterior: { dispensadaEm: null },
        novo: { dispensadaEm, motivoDispensa: motivoLimpo },
      },
      tx,
    );

    return tx.baixa.findUniqueOrThrow({ where: { id: baixaId } });
  });
}

/** Quantas rejeições em aberto há na filial, para o aviso de Contas a pagar/receber. */
export async function contarRejeicoesEmAberto(filialId: string, tipo: TipoTitulo): Promise<number> {
  const rejeitadas = await prisma.baixa.findMany({
    where: {
      statusAprovacao: "REJEITADO",
      dispensadaEm: null,
      parcela: { titulo: { filialId, tipo }, status: { notIn: ["PAGO", "CANCELADO", "RENEGOCIADO"] } },
    },
    select: {
      id: true,
      statusAprovacao: true,
      criadoEm: true,
      avaliadoEm: true,
      dispensadaEm: true,
      parcela: { select: { status: true, baixas: { select: { id: true, criadoEm: true } } } },
    },
  });
  return rejeitadas.filter((baixa) => rejeicaoEmAberto(baixa, baixa.parcela.baixas, baixa.parcela.status)).length;
}
```

- [ ] **Passo 5: implementar em `titulo.ts`.**
  1. Import: `import { parcelaTemRejeicaoEmAberto } from "@/lib/financeiro/rejeicaoEmAberto";`
  2. Em `FiltroTitulos`, depois de `classificacao?: ClassificacaoFiscal;`:
     ```ts
       /** Só títulos com alguma parcela com baixa rejeitada em aberto (aviso de Contas a pagar/receber). */
       rejeitadas?: true;
     ```
  3. Em `INCLUDE_TELA_TITULOS`, trocar o comentário por
     `// A tela lista as baixas na parcela (todas, inclusive rejeitadas) com conta, pessoas e se dá para estornar.`
     e, depois de `estornadoPor: { select: { nome: true } },`, acrescentar
     `dispensadaPor: { select: { nome: true } },`.
  4. Em `listarTitulos`, trocar o trecho depois de `sincronizarStatusDasParcelas` por:
     ```ts
       const temFiltroDeParcela =
         filtros.status !== undefined ||
         filtros.vencimentoDe !== undefined ||
         filtros.vencimentoAte !== undefined ||
         filtros.rejeitadas !== undefined;
       if (!temFiltroDeParcela) return titulos;

       return titulos.filter((titulo) =>
         titulo.parcelas.some(
           (parcela) =>
             parcelaBateFiltroDeParcela(parcela, filtros) && (!filtros.rejeitadas || parcelaTemRejeicaoEmAberto(parcela)),
         ),
       );
     ```
  `FiltroTitulosApi` não muda: a API não ganha o filtro.

- [ ] **Passo 6: rodar e ver passar.**
  `npx vitest run src/server/services/baixa.test.ts src/server/services/titulo.test.ts src/lib/auditoria`.
  Esperado: PASS em tudo, inclusive nos testes antigos.

- [ ] **Passo 7: tipos.** `npx tsc --noEmit`. Esperado: sem erros. `titulos-para-cliente.ts` ainda não usa os campos
  novos; tipos estruturais extras não quebram.

- [ ] **Passo 8: commit.**

```powershell
git add src/server/services/baixa.ts src/server/services/baixa.test.ts src/server/services/titulo.ts src/lib/auditoria/rotulos.ts
git commit -m @'
feat(baixa): dispensar rejeição, contar rejeições em aberto e filtro de rejeitadas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Tarefa 3: Dados para a tela — filtro na URL e rejeitadas na lista da parcela

**Arquivos:**
- Modificar: `src/app/(dashboard)/financeiro/_titulos/filtro-titulos-url.ts`
- Modificar: `src/app/(dashboard)/financeiro/_titulos/descrever-filtro-titulos.ts`
- Modificar: `src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.ts`
- Testes: `filtro-titulos-url.test.ts`, `titulos-para-cliente.test.ts` (mesma pasta)

**Interfaces:**
- Consome: `rejeicaoEmAberto` (Tarefa 1); `FiltroTitulos.rejeitadas` (Tarefa 2).
- Produz (`BaixaDaParcela`):
  ```ts
  status: "PENDENTE" | "APROVADO" | "REJEITADO" | "ESTORNADO";
  rejeitadaPor: string | null;
  rejeitadaEm: Date | null;
  motivoRejeicao: string | null;
  rejeicaoEmAberto: boolean;
  dispensadaPor: string | null;
  dispensadaEm: Date | null;
  motivoDispensa: string | null;
  ```
  `aprovadaPor` passa a ser nulo nas rejeitadas (`avaliadoPor` é quem rejeitou).

- [ ] **Passo 1: testes que falham.**

Em `filtro-titulos-url.test.ts`, acrescentar (seguindo o estilo de `get` do arquivo):

```ts
  it("rejeitadas=1 liga o filtro; outro valor é ignorado", () => {
    expect(filtroTitulosDaUrl((c) => (c === "rejeitadas" ? "1" : undefined)).rejeitadas).toBe(true);
    expect(filtroTitulosDaUrl((c) => (c === "rejeitadas" ? "sim" : undefined)).rejeitadas).toBeUndefined();
    expect(queryStringDosFiltros((c) => (c === "rejeitadas" ? "1" : undefined))).toBe("rejeitadas=1");
  });
```

(Importar `queryStringDosFiltros` se o arquivo ainda não importa. Se o arquivo tiver um teste que compara
`filtroTitulosDaUrl` vazio com um objeto exato, acrescentar `rejeitadas: undefined` nele.)

Em `titulos-para-cliente.test.ts`:
1. No helper `baixa(...)`, depois de `motivoEstorno: null,`:
   ```ts
       avaliadoEm: new Date("2026-10-15T18:00:00.000Z"),
       motivoRejeicao: null,
       dispensadaEm: null,
       motivoDispensa: null,
       dispensadaPor: null,
   ```
2. Trocar o teste "leva as baixas pendentes, aprovadas e estornadas, convertidas; rejeitadas ficam fora" por
   "leva todas as baixas, convertidas, inclusive rejeitadas". Usar a mesma parcela, mas com a rejeitada
   `baixa("rejeitada", "REJEITADO", { criadoEm: new Date("2026-10-14T13:00:00.000Z"), avaliadoEm: new Date("2026-10-14T18:00:00.000Z"), motivoRejeicao: "valor errado" })`,
   e esperar 4 itens na ordem rejeitada, pendente, estornada, aprovada (as três primeiras empatam na data; a
   rejeitada foi registrada antes, e pendente e estornada empatam no registro e mantêm a ordem de entrada). No objeto completo da estornada, acrescentar
   `rejeitadaPor: null, rejeitadaEm: null, motivoRejeicao: null, rejeicaoEmAberto: false, dispensadaPor: null,
   dispensadaEm: null, motivoDispensa: null`. Para a rejeitada:
   ```ts
       expect.objectContaining({
         id: "rejeitada",
         status: "REJEITADO",
         aprovadaPor: null,
         rejeitadaPor: "João",
         rejeitadaEm: new Date("2026-10-14T18:00:00.000Z"),
         motivoRejeicao: "valor errado",
         // Vieram baixas depois da rejeição: resolvida.
         rejeicaoEmAberto: false,
       }),
   ```
3. Trocar "parcela só com baixa rejeitada não tem pendente" por:
   ```ts
     it("parcela só com baixa rejeitada: sem pendente, com a rejeição em aberto", () => {
       const parcela = {
         ...tituloDoServico.parcelas[0],
         baixas: [baixa("rejeitada", "REJEITADO", { motivoRejeicao: "valor errado" })],
       };
       const [titulo] = titulosParaCliente([{ ...tituloDoServico, parcelas: [parcela] }]);
       expect(titulo.parcelas[0].temBaixaPendente).toBe(false);
       expect(titulo.parcelas[0].baixas).toEqual([
         expect.objectContaining({ id: "rejeitada", rejeicaoEmAberto: true, motivoRejeicao: "valor errado" }),
       ]);
     });

     it("rejeição dispensada leva quem, quando e o motivo, e não está em aberto", () => {
       const dispensadaEm = new Date("2026-10-16T12:00:00.000Z");
       const parcela = {
         ...tituloDoServico.parcelas[0],
         baixas: [
           baixa("rejeitada", "REJEITADO", {
             dispensadaEm,
             dispensadaPor: { nome: "Maria" },
             motivoDispensa: "pagamento não aconteceu",
           }),
         ],
       };
       const [titulo] = titulosParaCliente([{ ...tituloDoServico, parcelas: [parcela] }]);
       expect(titulo.parcelas[0].baixas[0]).toMatchObject({
         rejeicaoEmAberto: false,
         dispensadaPor: "Maria",
         dispensadaEm,
         motivoDispensa: "pagamento não aconteceu",
       });
     });
   ```

- [ ] **Passo 2: rodar e ver falhar.**
  `npx vitest run "src/app/(dashboard)/financeiro/_titulos/filtro-titulos-url.test.ts" "src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.test.ts"`.
  Esperado: FAIL nos testes novos.

- [ ] **Passo 3: `filtro-titulos-url.ts`.** Em `CAMPOS_FILTRO_TITULOS`, depois de `"classificacao",`, acrescentar
  `"rejeitadas",`. Em `filtroTitulosDaUrl`, depois de `classificacao: ...`:

```ts
    rejeitadas: get("rejeitadas") === "1" ? true : undefined,
```

- [ ] **Passo 4: `descrever-filtro-titulos.ts`.** No array devolvido, depois de `filtroDeClassificacao(...)`:

```ts
    filtros.rejeitadas ? "Com baixa rejeitada aguardando novo registro" : null,
```

- [ ] **Passo 5: `titulos-para-cliente.ts`.**
  1. Import: `import { rejeicaoEmAberto } from "@/lib/financeiro/rejeicaoEmAberto";`
  2. `BaixaDoServico` ganha, depois de `motivoEstorno: string | null;`:
     ```ts
       avaliadoEm: Date | null;
       motivoRejeicao: string | null;
       dispensadaEm: Date | null;
       motivoDispensa: string | null;
       dispensadaPor: { nome: string } | null;
     ```
  3. `BaixaDaParcela`: `status: "PENDENTE" | "APROVADO" | "REJEITADO" | "ESTORNADO";` e, depois de
     `motivoEstorno`:
     ```ts
       rejeitadaPor: string | null;
       rejeitadaEm: Date | null;
       motivoRejeicao: string | null;
       /** Rejeitada que ainda pede ação: aparece em destaque, com Dispensar, e conta no aviso. */
       rejeicaoEmAberto: boolean;
       dispensadaPor: string | null;
       dispensadaEm: Date | null;
       motivoDispensa: string | null;
     ```
  4. `baixasParaCliente` passa a receber a parcela inteira:
     ```ts
     /** Todas as baixas da parcela: pendentes, aprovadas, rejeitadas e estornadas. */
     function baixasParaCliente(parcela: { status: string; baixas: BaixaDoServico[] }): BaixaDaParcela[] {
       return [...parcela.baixas]
         .sort((a, b) => a.data.getTime() - b.data.getTime() || a.criadoEm.getTime() - b.criadoEm.getTime())
         .map((b) => {
           const rejeitada = b.statusAprovacao === "REJEITADO";
           return {
             id: b.id,
             data: b.data,
             registradaEm: b.criadoEm,
             status: b.statusAprovacao as BaixaDaParcela["status"],
             valorPago: numero(b.valorPago),
             valorJuros: numero(b.valorJuros),
             valorMulta: numero(b.valorMulta),
             valorDesconto: numero(b.valorDesconto),
             conta: nomeDaContaBancaria(b.contaBancaria),
             registradaPor: b.usuario.nome,
             aprovadaPor: rejeitada ? null : (b.avaliadoPor?.nome ?? null),
             estornadaPor: b.estornadoPor?.nome ?? null,
             estornadaEm: b.estornadoEm,
             motivoEstorno: b.motivoEstorno,
             rejeitadaPor: rejeitada ? (b.avaliadoPor?.nome ?? null) : null,
             rejeitadaEm: rejeitada ? b.avaliadoEm : null,
             motivoRejeicao: rejeitada ? b.motivoRejeicao : null,
             rejeicaoEmAberto: rejeicaoEmAberto(
               { id: b.id, statusAprovacao: b.statusAprovacao, criadoEm: b.criadoEm, avaliadoEm: b.avaliadoEm, dispensadaEm: b.dispensadaEm },
               parcela.baixas,
               parcela.status,
             ),
             dispensadaPor: b.dispensadaPor?.nome ?? null,
             dispensadaEm: b.dispensadaEm,
             motivoDispensa: b.motivoDispensa,
             conciliada: b.lancamentos.some((l) => l.grupoConciliacaoId !== null),
             deRepasse: b.repasseRecebimento !== null || b.repasseTaxa !== null,
           };
         });
     }
     ```
     (Quebrar a linha longa do `rejeicaoEmAberto` em várias, até ~120 colunas.)
  5. Em `titulosParaCliente`: `baixas: baixasParaCliente(parcela),`. No comentário de `titulosParaCliente`, tirar
     ", baixas rejeitadas" da lista do que é descartado.

- [ ] **Passo 6: rodar e ver passar.** Mesmo comando do passo 2. Esperado: PASS.

- [ ] **Passo 7: tipos.** `npx tsc --noEmit`. Esperado: sem erros. `BaixasDaParcela` ainda não trata
  `REJEITADO`: as rejeitadas aparecem como baixas comuns até a Tarefa 4. Não fazer commit separado de tela quebrada:
  seguir para a Tarefa 4 antes de testar no navegador.

- [ ] **Passo 8: commit.**

```powershell
git add "src/app/(dashboard)/financeiro/_titulos/filtro-titulos-url.ts" "src/app/(dashboard)/financeiro/_titulos/filtro-titulos-url.test.ts" "src/app/(dashboard)/financeiro/_titulos/descrever-filtro-titulos.ts" "src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.ts" "src/app/(dashboard)/financeiro/_titulos/titulos-para-cliente.test.ts"
git commit -m @'
feat(titulos): filtro de rejeitadas na URL e baixas rejeitadas na lista da parcela

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Tarefa 4: Tela — aviso, linha da rejeitada e Dispensar

**Arquivos:**
- Criar: `src/app/(dashboard)/financeiro/_titulos/aviso-rejeitadas.tsx`
- Criar: `src/app/(dashboard)/financeiro/_titulos/dispensar-dialog.tsx`
- Modificar: `_titulos/actions.ts`, `_titulos/baixas-da-parcela.tsx`, `_titulos/titulo-table.tsx` (linhas ~110-131 e
  ~323-333), `_titulos/contas-client-panel.tsx`, `contas-a-pagar/page.tsx`, `contas-a-receber/page.tsx`
- Teste: `src/app/(dashboard)/financeiro/_titulos/aviso-rejeitadas.test.tsx` (novo)

**Interfaces:**
- Consome: `dispensarRejeicao`, `contarRejeicoesEmAberto` (Tarefa 2); `BaixaDaParcela` novo (Tarefa 3).
- Produz:
  ```ts
  export async function dispensarRejeicaoAction(tipo: TipoTitulo, baixaId: string, motivo: string): Promise<FormState>;
  export function AvisoRejeitadas(props: { quantidade: number; href: string; filtroAtivo: boolean }): JSX.Element | null;
  export function textoDoAvisoRejeitadas(quantidade: number): string;
  export function DispensarDialog(props: { tipo: TipoTitulo; baixa: BaixaDaParcela | null; onOpenChange: (aberto: boolean) => void });
  // BaixasDaParcela ganha: podeDispensar: boolean; onDispensar: (baixa: BaixaDaParcela) => void
  ```

- [ ] **Passo 1: teste que falha** `aviso-rejeitadas.test.tsx`:

```tsx
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvisoRejeitadas, textoDoAvisoRejeitadas } from "./aviso-rejeitadas";

const html = (quantidade: number, filtroAtivo = false) =>
  renderToStaticMarkup(
    createElement(AvisoRejeitadas, { quantidade, href: "/financeiro/contas-a-pagar?rejeitadas=1", filtroAtivo }),
  );

describe("AvisoRejeitadas", () => {
  it("singular e plural", () => {
    expect(textoDoAvisoRejeitadas(1)).toBe("1 baixa rejeitada aguardando novo registro.");
    expect(textoDoAvisoRejeitadas(3)).toBe("3 baixas rejeitadas aguardando novo registro.");
  });

  it("sem rejeição em aberto, não mostra nada", () => {
    expect(html(0)).toBe("");
  });

  it("mostra o texto e o link Ver", () => {
    const saida = html(2);
    expect(saida).toContain("2 baixas rejeitadas aguardando novo registro.");
    expect(saida).toContain('href="/financeiro/contas-a-pagar?rejeitadas=1"');
    expect(saida).toContain("Ver");
  });

  it("com o filtro já ativo, o link some", () => {
    expect(html(2, true)).not.toContain("href=");
  });
});
```

- [ ] **Passo 2: rodar e ver falhar.** `npx vitest run "src/app/(dashboard)/financeiro/_titulos/aviso-rejeitadas.test.tsx"`.
  Esperado: FAIL, com o módulo inexistente.

- [ ] **Passo 3: `aviso-rejeitadas.tsx`** (Server Component, sem `"use client"`):

```tsx
// Espelhado na ajuda (src/ajuda/_titulos/cenas.tsx): mudou o texto? Ajuste a ajuda junto.
import Link from "next/link";

export function textoDoAvisoRejeitadas(quantidade: number): string {
  return quantidade === 1
    ? "1 baixa rejeitada aguardando novo registro."
    : `${quantidade} baixas rejeitadas aguardando novo registro.`;
}

/** Aviso no topo de Contas a pagar/receber: baixas rejeitadas que ninguém relançou nem dispensou. */
export function AvisoRejeitadas({
  quantidade,
  href,
  filtroAtivo,
}: {
  quantidade: number;
  href: string;
  filtroAtivo: boolean;
}) {
  if (quantidade === 0) return null;
  return (
    <div role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      <span className="font-medium">{textoDoAvisoRejeitadas(quantidade)}</span>{" "}
      Confira o motivo na parcela e lance de novo, ou dispense se não houver o que relançar.
      {!filtroAtivo && (
        <>
          {" "}
          <Link href={href} className="font-medium text-primary underline-offset-4 hover:underline">
            Ver
          </Link>
        </>
      )}
    </div>
  );
}
```

- [ ] **Passo 4: rodar e ver passar.** Mesmo comando do passo 2. Esperado: PASS.

- [ ] **Passo 5: action.** Em `_titulos/actions.ts`, depois de `estornarBaixaAction`:

```ts
export async function dispensarRejeicaoAction(tipo: TipoTitulo, baixaId: string, motivo: string): Promise<FormState> {
  const sessao = await requireSessaoAtiva();

  try {
    await baixaService.dispensarRejeicao(sessao, baixaId, motivo);
  } catch (erro) {
    return { erro: mensagemErro(erro) };
  }

  revalidatePath(rotaPara(tipo));
  return { sucesso: true };
}
```

- [ ] **Passo 6: `dispensar-dialog.tsx`.** Copiar `estornar-dialog.tsx` e mudar:
  - o comentário de espelhamento continua;
  - a action: `dispensarRejeicaoAction`;
  - `DialogTitle`: "Dispensar rejeição";
  - o resumo:
    ```tsx
    <p>{`Baixa de ${formatarData(baixa.data)} · ${baixa.conta} · ${formatarMoeda(baixa.valorPago)}`}</p>
    <p className="text-muted-foreground">
      {`Rejeitada${baixa.rejeitadaPor ? ` por ${baixa.rejeitadaPor}` : ""}: ${baixa.motivoRejeicao ?? ""}`}
    </p>
    <p className="text-muted-foreground">
      O aviso de baixa rejeitada some e a parcela continua como está. Se o pagamento aconteceu, registre a baixa de
      novo em vez de dispensar.
    </p>
    ```
  - o `Label`: "Por que não vai lançar de novo?"; o `id`: `motivo-dispensa`; o placeholder:
    "Ex.: o pagamento não aconteceu";
  - o botão de confirmar: `variant="default"`, texto `{pendente ? "Dispensando..." : "Dispensar"}`.
  Exportar `DispensarDialog` com as mesmas props de `EstornarDialog`.

- [ ] **Passo 7: `baixas-da-parcela.tsx`.**
  1. Novas props: `podeDispensar: boolean; onDispensar: (baixa: BaixaDaParcela) => void;`. O comentário da função:
     "As baixas de uma parcela, com o estorno para quem pode aprovar e a dispensa da rejeição para quem pode baixar."
  2. No `map`, antes do `return` atual, tratar a rejeitada:
     ```tsx
          if (baixa.status === "REJEITADO") {
            return (
              <li key={baixa.id}>
                <BaixaRejeitada baixa={baixa} podeDispensar={podeDispensar} onDispensar={onDispensar} />
              </li>
            );
          }
     ```
  3. Componente novo no mesmo arquivo:
     ```tsx
     function BaixaRejeitada({
       baixa,
       podeDispensar,
       onDispensar,
     }: {
       baixa: BaixaDaParcela;
       podeDispensar: boolean;
       onDispensar: (baixa: BaixaDaParcela) => void;
     }) {
       const porQuem = baixa.rejeitadaPor ? ` por ${baixa.rejeitadaPor}` : "";
       if (!baixa.rejeicaoEmAberto) {
         // Resolvida (relançada, dispensada ou parcela fechada): uma linha só, apagada.
         return (
           <p className="text-xs text-muted-foreground">
             {`Baixa de ${formatarData(baixa.data)} · ${formatarMoeda(baixa.valorPago)} · rejeitada${porQuem}: ` +
               `${baixa.motivoRejeicao ?? ""}` +
               (baixa.dispensadaEm
                 ? ` · dispensada${baixa.dispensadaPor ? ` por ${baixa.dispensadaPor}` : ""}: ${baixa.motivoDispensa}`
                 : "")}
           </p>
         );
       }
       const ajustes = textoDosAjustes(baixa);
       return (
         <div className="flex flex-wrap items-start justify-between gap-2">
           <div>
             <p>
               {`Baixa de ${formatarData(baixa.data)} · ${baixa.conta} · `}
               <span className="font-medium">{formatarMoeda(baixa.valorPago)}</span>
               {ajustes ? ` (${ajustes})` : null}
               <Badge variant="destructive" className="ml-2">
                 Rejeitada
               </Badge>
             </p>
             <p className="text-xs text-muted-foreground">{`registrada por ${baixa.registradaPor}`}</p>
             <p className="text-xs">
               {`rejeitada${porQuem}` +
                 (baixa.rejeitadaEm ? ` em ${formatarDataHora(baixa.rejeitadaEm)}` : "") +
                 `: ${baixa.motivoRejeicao ?? ""}`}
             </p>
           </div>
           {podeDispensar && (
             <Button
               type="button"
               variant="outline"
               size="sm"
               aria-label={`Dispensar rejeição da baixa de ${formatarData(baixa.data)} de ${formatarMoeda(baixa.valorPago)}`}
               onClick={() => onDispensar(baixa)}
             >
               Dispensar
             </Button>
           )}
         </div>
       );
     }
     ```
  O resto da lista (pendente, aprovada, estornada) não muda.

- [ ] **Passo 8: ligar na tabela e no painel.**
  - `titulo-table.tsx`: nova prop `onAbrirDispensa: (baixa: BaixaDaParcela) => void` (tipo e desestruturação, ao lado de
    `onAbrirEstorno`); no `<BaixasDaParcela ...>`, acrescentar `podeDispensar={podeBaixar}` e
    `onDispensar={onAbrirDispensa}`.
  - `contas-client-panel.tsx`: `import { DispensarDialog } from "./dispensar-dialog";`;
    `const [baixaDispensa, setBaixaDispensa] = useState<BaixaDaParcela | null>(null);`;
    `onAbrirDispensa={setBaixaDispensa}` no `TituloTable`; depois do `EstornarDialog`:
    ```tsx
          <DispensarDialog
            tipo={tipo}
            baixa={baixaDispensa}
            onOpenChange={(aberto) => !aberto && setBaixaDispensa(null)}
          />
    ```

- [ ] **Passo 9: páginas.** Em `contas-a-pagar/page.tsx` (e igual em `contas-a-receber/page.tsx`, com `"RECEBER"` e a
  rota `/financeiro/contas-a-receber`):
  - `SearchParams` ganha `rejeitadas?: string | string[];`;
  - imports: `contarRejeicoesEmAberto` de `@/server/services/baixa` e `AvisoRejeitadas` de
    `../_titulos/aviso-rejeitadas`;
  - no `Promise.all`, acrescentar no fim `contarRejeicoesEmAberto(sessao.filialId, "PAGAR")`, desestruturado como
    `rejeicoesEmAberto`;
  - entre `<BarraDeFiltros ... />` e `<ContasClientePanel`:
    ```tsx
          <AvisoRejeitadas
            quantidade={rejeicoesEmAberto}
            href="/financeiro/contas-a-pagar?rejeitadas=1"
            filtroAtivo={filtros.rejeitadas === true}
          />
    ```

- [ ] **Passo 10: tipos, lint e testes da pasta.**

```powershell
npx tsc --noEmit; if ($?) { npx eslint "src/app/(dashboard)/financeiro" }; if ($?) { npx vitest run "src/app/(dashboard)/financeiro" }
```

Esperado: sem erros, PASS.

- [ ] **Passo 11: commit.**

```powershell
git add "src/app/(dashboard)/financeiro"
git commit -m @'
feat(titulos): aviso de baixas rejeitadas, rejeição na parcela e Dispensar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Tarefa 5: Ajuda contextual

**Arquivos:**
- Modificar: `src/ajuda/_titulos/alvos.ts`, `exemplo.ts`, `cenas.tsx`, `cenas.test.ts`
- Modificar: `src/ajuda/contas-a-pagar/exemplo.ts`, `roteiros.ts`, `roteiros.test.ts`
- Modificar: `src/ajuda/contas-a-receber/exemplo.ts`, `roteiros.ts`, `roteiros.test.ts`
- Modificar: `src/ajuda/aprovacoes/roteiros.ts` (linhas ~152-166)

**Interfaces:**
- Consome: os textos da Tarefa 4 (aviso, linha da rejeitada, diálogo), que a réplica copia ao pé da letra.
- Produz: alvos `lista.avisoRejeitadas`, `lista.p1.dispensar`; cena `dispensar` com os alvos `dispensa.resumo`,
  `dispensa.motivo`, `dispensa.confirmar`; estados novos de `lista.p1.baixa`: `"rejeitada"` e `"dispensada"`;
  roteiro `tratar-rejeitada` nas duas telas.

- [ ] **Passo 1: alvos.** Em `ALVOS.lista`, depois de `"lista.tabela",` acrescentar `"lista.avisoRejeitadas",`; depois
  de `"lista.p1.estornar",` acrescentar `"lista.p1.dispensar",`. Nova chave no fim:
  `dispensar: ["dispensa.resumo", "dispensa.motivo", "dispensa.confirmar"],`.

- [ ] **Passo 2: exemplo.** Em `BaixaExemplo` (`_titulos/exemplo.ts`), depois de `motivoEstorno: string;`:

```ts
  rejeitadaPor: string;
  /** Data e hora no horário de Brasília: "15/10/2026 16:05". */
  rejeitadaEm: string;
  motivoRejeicao: string;
  motivoDispensa: string;
```

e no comentário de `baixa`: "pendente no roteiro de pagamento; aprovada na conta errada no de estorno; rejeitada no de
rejeição". Valores:
- `contas-a-pagar/exemplo.ts`: `rejeitadaPor: "João"`, `rejeitadaEm: "15/10/2026 16:05"`,
  `motivoRejeicao: "Comprovante sem juros: o boleto foi pago por R$ 1.000,00"`,
  `motivoDispensa: "Boleto não foi pago: o fornecedor vai emitir outro"`.
- `contas-a-receber/exemplo.ts`: `rejeitadaPor: "João"`, `rejeitadaEm: "15/10/2026 16:05"`,
  `motivoRejeicao: "PIX não entrou no extrato do Sicredi"`,
  `motivoDispensa: "Cliente não pagou: o PIX foi agendado e cancelado"`.

- [ ] **Passo 3: testes de cena que falham.** Em `_titulos/cenas.test.ts`, acrescentar `dispensar: CenaDispensar` na
  desestruturação e:

```ts
  test("baixa rejeitada em aberto: selo, motivo, Dispensar e o aviso no topo", () => {
    const saida = html(CenaLista, { "lista.linhaExemplo": "expandida", "lista.p1.baixa": "rejeitada" });
    expect(saida).toContain("Rejeitada");
    expect(saida).toContain(EXEMPLO.baixa.motivoRejeicao);
    expect(saida).toContain('data-alvo="lista.p1.dispensar"');
    expect(saida).toContain('data-alvo="lista.avisoRejeitadas"');
    expect(saida).toContain("1 baixa rejeitada aguardando novo registro.");
  });

  test("baixa rejeitada e dispensada: linha apagada com a dispensa, sem aviso nem botão", () => {
    const saida = html(CenaLista, { "lista.linhaExemplo": "expandida", "lista.p1.baixa": "dispensada" });
    expect(saida).toContain(EXEMPLO.baixa.motivoDispensa);
    expect(saida).not.toContain('data-alvo="lista.p1.dispensar"');
    expect(saida).not.toContain("aguardando novo registro");
  });

  test("janela Dispensar rejeição", () => {
    const saida = html(CenaDispensar, { "dispensa.motivo": EXEMPLO.baixa.motivoDispensa });
    expect(saida).toContain("Dispensar rejeição");
    expect(saida).toContain(EXEMPLO.baixa.motivoRejeicao);
    expect(saida).toContain('data-alvo="dispensa.confirmar"');
  });
```

Rodar `npx vitest run src/ajuda/_titulos/cenas.test.ts`. Esperado: FAIL.

- [ ] **Passo 4: cenas.** Em `_titulos/cenas.tsx`:
  1. `BaixaDoExemplo`: estados `"rejeitada"` e `"dispensada"`. Antes do `return` atual:
     ```tsx
       if (estado === "rejeitada" || estado === "dispensada") {
         const linha = `Baixa de ${baixa.data} · ${exemplo.conta} · `;
         return (
           <div className="space-y-1 text-sm">
             <div className="text-xs font-medium text-muted-foreground">Baixas</div>
             {estado === "dispensada" ? (
               <Alvo nome="lista.p1.baixa" className="p-1 text-xs text-muted-foreground">
                 {`Baixa de ${baixa.data} · ${baixa.valorFormatado} · rejeitada por ${baixa.rejeitadaPor}: ` +
                   `${baixa.motivoRejeicao} · dispensada por ${baixa.registradaPor}: ${baixa.motivoDispensa}`}
               </Alvo>
             ) : (
               <div className="flex flex-wrap items-start justify-between gap-2">
                 <Alvo nome="lista.p1.baixa" className="p-1">
                   <p>
                     {linha}
                     <span className="font-medium">{baixa.valorFormatado}</span>
                     {` (${baixa.ajuste})`}
                     <Badge variant="destructive" className="ml-2">
                       Rejeitada
                     </Badge>
                   </p>
                   <p className="text-xs text-muted-foreground">{`registrada por ${baixa.registradaPor}`}</p>
                   <p className="text-xs">
                     {`rejeitada por ${baixa.rejeitadaPor} em ${baixa.rejeitadaEm}: ${baixa.motivoRejeicao}`}
                   </p>
                 </Alvo>
                 <BotaoSimulado alvo="lista.p1.dispensar" variant="outline" size="sm">
                   Dispensar
                 </BotaoSimulado>
               </div>
             )}
           </div>
         );
       }
     ```
     Atualizar o comentário da função com os estados novos.
  2. `CenaLista`: antes de `<BarraDeFiltros .../>`, nada muda. Entre `<BarraDeFiltros ... />` e
     `<div className="space-y-4">`, igual à tela real:
     ```tsx
          {valores["lista.p1.baixa"] === "rejeitada" && (
            <Alvo nome="lista.avisoRejeitadas" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              <span className="font-medium">1 baixa rejeitada aguardando novo registro.</span> Confira o motivo na
              parcela e lance de novo, ou dispense se não houver o que relançar. <span className="font-medium text-primary">Ver</span>
            </Alvo>
          )}
     ```
     (Quebrar as linhas em ~120 colunas.)
  3. Nova cena, depois de `CenaEstornar`:
     ```tsx
     function CenaDispensar({ valores, exemplo }: PropsCena & Pick<ComExemplo, "exemplo">) {
       const { baixa } = exemplo;
       return (
         <JanelaSimulada titulo="Dispensar rejeição">
           <Alvo nome="dispensa.resumo" className="space-y-2 p-1">
             <p>{`Baixa de ${baixa.data} · ${exemplo.conta} · ${baixa.valorFormatado}`}</p>
             <p className="text-muted-foreground">{`Rejeitada por ${baixa.rejeitadaPor}: ${baixa.motivoRejeicao}`}</p>
             <p className="text-muted-foreground">
               O aviso de baixa rejeitada some e a parcela continua como está. Se o pagamento aconteceu, registre a
               baixa de novo em vez de dispensar.
             </p>
           </Alvo>
           <CampoSimulado
             alvo="dispensa.motivo"
             rotulo="Por que não vai lançar de novo?"
             valor={valores["dispensa.motivo"]}
             placeholder="Ex.: o pagamento não aconteceu"
           />
           <div className="flex gap-2">
             <BotaoSimulado variant="outline" largo>
               Cancelar
             </BotaoSimulado>
             <BotaoSimulado alvo="dispensa.confirmar" largo>
               Dispensar
             </BotaoSimulado>
           </div>
         </JanelaSimulada>
       );
     }
     ```
  4. Em `criarCenas`, acrescentar:
     ```tsx
         dispensar: function Dispensar(props: PropsCena) {
           return <CenaDispensar {...props} exemplo={exemplo} />;
         },
     ```

  Rodar `npx vitest run src/ajuda/_titulos/cenas.test.ts`. Esperado: PASS.

- [ ] **Passo 5: roteiro `tratar-rejeitada` em Contas a pagar.** Em `contas-a-pagar/roteiros.ts`, logo depois do
  roteiro `estornar-baixa`. O `eDepois.proximoRoteiro` do `estornar-baixa` continua `"mudar-vencimento"`; o do
  `pagar-parcela` também não muda.

```ts
  roteiro({
    id: "tratar-rejeitada",
    titulo: "Quando uma baixa é rejeitada",
    quandoUsar:
      "Quando aparece no alto da tela o aviso de baixa rejeitada: quem aprova recusou uma baixa e escreveu o " +
      "motivo. É preciso lançar de novo do jeito certo ou, se o pagamento não aconteceu, dispensar o aviso.",
    quemPode: QUEM_BAIXA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.avisoRejeitadas",
        instrucao: "Clique em “Ver” no aviso",
        explicacao:
          "O aviso conta as baixas rejeitadas da filial que ninguém lançou de novo nem dispensou, de todas as " +
          "pessoas. O Ver deixa na lista só os títulos com rejeição; Limpar filtros mostra todos de novo.",
        preenche: { "lista.p1.baixa": "rejeitada" },
      },
      { ...ABRIR_TITULO, preenche: { "lista.linhaExemplo": "expandida", "lista.p1.baixa": "rejeitada" } },
      {
        cena: "lista",
        alvo: "lista.p1.baixa",
        instrucao: "Leia o motivo da rejeição",
        explicacao:
          "A baixa rejeitada aparece embaixo da parcela com o selo “Rejeitada”, quem rejeitou, quando e o motivo. " +
          `No exemplo: “${EXEMPLO.baixa.motivoRejeicao}”.`,
        dica:
          "O pagamento aconteceu e só o registro estava errado? Clique em Baixar na parcela e lance de novo com o " +
          "valor, a data e a conta certos. A rejeição sai do aviso assim que a baixa nova é registrada.",
      },
      {
        cena: "lista",
        alvo: "lista.p1.dispensar",
        instrucao: "Se não há o que relançar, clique em “Dispensar”",
        explicacao:
          "Use quando a rejeição está certa e nada deve ser registrado: o pagamento não aconteceu, ou foi lançado " +
          "em outra parcela.",
      },
      {
        cena: "dispensar",
        alvo: "dispensa.motivo",
        instrucao: "Diga por que não vai lançar de novo",
        explicacao: "O motivo é obrigatório, com pelo menos 3 letras, e fica na baixa e na Auditoria.",
        preenche: { "dispensa.motivo": EXEMPLO.baixa.motivoDispensa },
      },
      {
        cena: "dispensar",
        alvo: "dispensa.confirmar",
        instrucao: "Clique em “Dispensar”",
        explicacao: "A parcela não muda: continua em aberto, com o botão Baixar.",
      },
      {
        cena: "lista",
        alvo: "lista.p1.baixa",
        instrucao: "Veja a rejeição dispensada",
        explicacao:
          "A baixa rejeitada continua embaixo da parcela, apagada e numa linha só, com quem dispensou e o motivo. " +
          "O aviso do alto da tela some.",
        preenche: { "lista.linhaExemplo": "expandida", "lista.p1.baixa": "dispensada" },
      },
    ],
    eDepois: {
      texto:
        "Rejeições resolvidas (lançadas de novo, dispensadas, ou de parcela paga, cancelada ou renegociada) ficam só " +
        "no histórico da parcela, numa linha apagada, e não contam no aviso.",
      proximoRoteiro: "mudar-vencimento",
    },
  }),
```

E no `eDepois.texto` do `pagar-parcela`, trocar
`"rejeitada, a parcela continua em aberto e nenhum lançamento é feito."` por
`"rejeitada, a parcela continua em aberto, nenhum lançamento é feito e a rejeição aparece embaixo da parcela, com o " + "motivo, e no aviso do alto da tela."`.
Mudar `proximoRoteiro` do `estornar-baixa` para `"tratar-rejeitada"`, para a sequência seguir a ordem da lista.

Em `contas-a-pagar/roteiros.test.ts`, no teste dos ids: título "são os 8 roteiros, com ids únicos" e
`"tratar-rejeitada"` entre `"estornar-baixa"` e `"mudar-vencimento"`.

- [ ] **Passo 6: o mesmo em Contas a receber.** Em `contas-a-receber/roteiros.ts`, o mesmo roteiro, depois do
  `estornar-baixa`, com o mesmo texto. Trocar "pagamento" por "recebimento" em `quandoUsar`, na `dica` e na
  `explicacao` do Dispensar ("o recebimento não aconteceu"). `EXEMPLO` vem do `./exemplo` da própria tela. No
  `eDepois.texto` do `receber-parcela` (linhas ~294-296), a mesma troca do passo 5; o `proximoRoteiro` do
  `estornar-baixa` vira `"tratar-rejeitada"`. No `roteiros.test.ts` de receber, a mesma mudança na lista de ids.
  Se `QUEM_BAIXA` tiver outro nome em receber, usar o equivalente do arquivo.

- [ ] **Passo 7: Aprovações.** Em `src/ajuda/aprovacoes/roteiros.ts`, roteiro `rejeitar-baixa`:
  - a `dica` do passo "Clique em Rejeitar" passa a ser:
    `"Quem registrou vê a rejeição embaixo da parcela, com o seu nome e o motivo, e o aviso “baixa rejeitada " + "aguardando novo registro” no alto de Contas a pagar ou Contas a receber."`
  - o `eDepois.texto`:
    `"A linha sai da lista e nenhum lançamento é feito: a parcela continua como estava e volta a aceitar baixa. " + "Quem registrou lança outra pelo botão Baixar da parcela, e ela volta para esta lista; se o pagamento não " + "aconteceu, dispensa o aviso na própria parcela."`

- [ ] **Passo 8: rodar os testes da ajuda.** `npx vitest run src/ajuda`. Esperado: PASS (alvos de todos os passos
  presentes nas cenas, ids certos). Também `npx tsc --noEmit`.

- [ ] **Passo 9: commit.**

```powershell
git add src/ajuda
git commit -m @'
feat(ajuda): roteiro de baixa rejeitada e Aprovações sem o "avise por fora"

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Tarefa 6: Documentação e verificação final

**Arquivos:**
- Modificar: `docs/api-v1.md` (seção `POST /baixas`, linha ~216)
- Modificar: `docs/backlog.md` (item 5, linha ~238)
- Modificar: `docs/superpowers/specs/2026-11-25-rejeicao-visivel-design.md` (status)

- [ ] **Passo 1: API.** Em `docs/api-v1.md`, depois do item da lista que começa "Cada parcela aceita **uma** baixa
  aguardando aprovação":

```markdown
- Baixa rejeitada: `GET /titulos` devolve cada baixa em `itens[].parcelas[].baixas[]` com `statusAprovacao`
  (`REJEITADO`), `motivoRejeicao` e `avaliadoEm` (quando foi rejeitada). Ela ainda pede ação enquanto
  `dispensadaEm` for nulo, nenhuma baixa da parcela tiver `criadoEm` posterior a `avaliadoEm` e a parcela não
  estiver paga, cancelada ou renegociada; nesse caso, registre a baixa de novo com os dados certos.
```

- [ ] **Passo 2: backlog.** No item "### 5. Rejeição não chega a quem registrou (prioridade alta)", logo abaixo do
  título, no formato dos itens 2 a 4:

```markdown
- **Status:** feito na branch `feat/rejeicao-visivel` (2026-11-25, spec
  `2026-11-25-rejeicao-visivel-design.md`): a parcela mostra a baixa rejeitada com motivo, quem e quando; Contas a
  pagar/receber tem o aviso "N baixas rejeitadas aguardando novo registro" com o filtro `rejeitadas=1`; a rejeição
  sai do aviso ao relançar, ao fechar a parcela ou pelo Dispensar (com motivo e auditoria); ajuda com o roteiro
  novo `tratar-rejeitada`.
```

- [ ] **Passo 3: spec.** Trocar `Status: desenho aprovado` por `Status: implementada (2026-11-25)`.

- [ ] **Passo 4: verificação completa.**

```powershell
npx tsc --noEmit; if ($?) { npx eslint }; if ($?) { npx vitest run }
```

Esperado: sem erros de tipo e de lint, todos os testes PASS. Se algum teste falhar fora do que este plano tocou,
registrar a saída e avisar; não corrigir às cegas.

- [ ] **Passo 5: commit.**

```powershell
git add docs/api-v1.md docs/backlog.md docs/superpowers/specs/2026-11-25-rejeicao-visivel-design.md
git commit -m @'
docs: baixa rejeitada visível — backlog, API e status da spec

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

- [ ] **Passo 6: conferência no navegador** (feita pelo agente principal, não por subagente). Subir
  `npm run dev`, entrar com o admin do seed (Empresa Demonstração) e, com um título de teste:
  1. registrar uma baixa, trocar o perfil para rejeitá-la em Aprovações com motivo (ou rejeitar com um segundo
     usuário);
  2. em Contas a pagar: aviso "1 baixa rejeitada...", Ver filtra, parcela com o selo e o motivo;
  3. relançar pelo Baixar: o aviso some e a rejeitada vira linha apagada;
  4. rejeitar a nova e dispensar: diálogo, motivo, aviso some, linha apagada com a dispensa; Auditoria mostra
     "Dispensar rejeição";
  5. ajuda: abrir o `?` de Contas a pagar e percorrer `tratar-rejeitada`;
  6. apagar os dados de teste do banco de dev e a pasta `.playwright-mcp/`.
