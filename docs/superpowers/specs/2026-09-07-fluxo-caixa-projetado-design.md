# Design — Fluxo de Caixa Projetado (Fase 4b)

Status: Aprovado. Ainda não implementado.

## Contexto

A Fase 4 ("Fluxo de caixa") tem 3 sub-projetos. O sub-projeto 1 ("Fluxo
de caixa realizado") já foi implementado e mesclado em staging
(`src/server/services/fluxoDeCaixa.ts`,
`src/app/(dashboard)/financeiro/fluxo-de-caixa/`, design completo em
`docs/superpowers/specs/2026-09-03-fluxo-caixa-realizado-design.md`).
Este documento cobre o sub-projeto 2: **"Fluxo de caixa projetado"** —
uma projeção de 12 meses baseada nos títulos a pagar/receber já em
aberto (Fase 2), mostrando pra onde o saldo em caixa tende a ir, não só
onde já esteve.

Diferente do "realizado" (que agrega `LancamentoBancario` conciliado — o
que já aconteceu), o "projetado" agrega `Parcela` em aberto — o que ainda
vai vencer. O escopo original da Fase 4
(`docs/fases/fase-4-fluxo-de-caixa.md`) também cita contratos
recorrentes, financiamentos e orçamento (Fase 5) como insumos futuros,
mas nenhum desses conceitos existe no schema hoje (confirmado por
exploração direta de `prisma/schema.prisma` e `src/server/services/`).
Por isso, como já aconteceu com o "realizado" quando foi desenhado, este
v1 fica restrito ao que já existe: `Titulo`/`Parcela`/`Baixa` (Fase 2).
Contratos recorrentes, financiamentos e orçamento ficam para quando esses
conceitos de domínio forem desenhados (sub-projeto 3 e/ou Fase 5).

## Modelo de cálculo

Sem tabela nova, sem cache — mesma filosofia do "realizado": calculado
sob demanda a partir de dados já existentes.

- **Escopo**: filial ativa da sessão — mesmo isolamento usado em todo o
  resto do sistema. Sem consolidação por empresa nesta fase (Fase 5).
- **Fonte**: `Parcela` com `status IN (EM_ABERTO, A_VENCER, VENCIDO,
  PARCIALMENTE_PAGO)` — exclui `PAGO`, `CANCELADO`, `RENEGOCIADO`. O
  `Titulo.tipo` (`RECEBER`/`PAGAR`) separa entradas projetadas de saídas
  projetadas.
- **Valor por parcela** (saldo remanescente):
  ```
  saldoRemanescente = valorAtualizado - soma(Baixa.valorPago onde statusAprovacao = APROVADO)
  ```
  Baixas `PENDENTE`/`REJEITADO` não abatem nada. É a mesma subtração que
  `calcularStatusParcela` (`src/server/services/parcela.ts`) já faz para
  decidir status — mas ali ela devolve o enum, não o número. Extrair um
  helper puro novo, `saldoRemanescenteParcela(valorAtualizado, baixas)`,
  que devolve o valor (sem clamping em zero — não deveria ocorrer valor
  negativo no fluxo real, já que a parcela viraria `PAGO` e sairia do
  filtro, mas a função não precisa assumir isso).
- **Agrupamento**: por mês do calendário de `Parcela.dataVencimento`
  (sempre UTC, nunca hora local — mesma regra de todo o
  `fluxoDeCaixa.ts`).
- **Dois modos de janela**:
  - **Móvel (`MOVEL`, padrão)**: 12 meses começando no mês que contém a
    `dataReferencia` (padrão = hoje). Navegar anterior/próximo desloca a
    `dataReferencia` em ±1 mês (a janela desliza).
  - **Ano civil (`ANO_CIVIL`)**: Jan-Dez do ano de `dataReferencia`.
    Navegar desloca ±1 ano. Existe para comparar a projeção com um ano
    fechado ou um orçamento anual (futuro).
  - Os dois modos devolvem a mesma forma de linha mensal.
- **Saldo inicial**: âncora sempre em `buscarSaldoEmCaixaAte(filialId,
  agora)` (reuso direto de `src/server/services/fluxoDeCaixa.ts`) — o
  saldo real de caixa **hoje**, encadeado pra frente pelas parcelas
  projetadas de cada mês seguinte (mesmo `saldoFinal` de um mês vira
  `saldoInicial` do próximo, como já faz `calcularPeriodosFluxoDeCaixa`).
  Capturar o mesmo `new Date()` numa variável local e reusar tanto na
  busca do saldo quanto em qualquer outro corte de "agora" dentro da
  mesma chamada, evitando não-determinismo entre as duas operações.

  **Limitação aceita conscientemente**: se a janela pedida (ex.: modo
  `ANO_CIVIL` de um ano totalmente passado ou futuro) não cobre o mês
  corrente, a cadeia ainda parte do saldo de hoje mas não reconstrói o
  que aconteceria nos meses "invisíveis" entre hoje e o início da janela
  pedida. A tela mostra um texto auxiliar avisando que a projeção é
  "calculada a partir do saldo em caixa de hoje". Reconstruir a cadeia
  completa através de anos não exibidos fica para uma iteração futura —
  ver "Fora de escopo".
- **Alerta**: `alerta: boolean` calculado dentro da função pura de
  agregação (`saldoFinal < 0`, checagem estrita — zero não alerta), não
  em componente de UI, para ficar testável sem banco. É o único alerta
  desta versão.

## Serviços (`src/server/services/fluxoDeCaixaProjetado.ts`)

Tipos:

```ts
export type ModoJanelaProjetado = "MOVEL" | "ANO_CIVIL";

export type ParcelaParaProjecao = {
  dataVencimento: Date;
  saldo: number;
  tipo: "RECEBER" | "PAGAR";
};

export type PeriodoFluxoDeCaixaProjetado = SubPeriodo & { // SubPeriodo importado de ./fluxoDeCaixa
  saldoInicial: number;
  entradasProjetadas: number;
  saidasProjetadas: number;
  geracaoLiquida: number;
  saldoFinal: number;
  alerta: boolean;
};
```

Funções puras (sem I/O, mesmo espírito de `calcularJanela`/
`calcularPeriodosFluxoDeCaixa` em `fluxoDeCaixa.ts`):

- `calcularJanelaProjetada(modo, dataReferencia)` — `MOVEL`: 12 meses UTC
  a partir do mês de `dataReferencia`. `ANO_CIVIL`: idêntico a
  `calcularJanela("MES", dataReferencia)` do realizado — reusar essa
  chamada diretamente para este ramo em vez de duplicar a lógica.
- `saldoRemanescenteParcela(valorAtualizado, baixasAprovadas)`.
- `calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, saldoInicialAbsoluto)`
  — agrupa por `tipo` (RECEBER→entradasProjetadas, PAGAR→
  saidasProjetadas) em vez de por `ENTRADA|SAIDA` do lançamento; encadeia
  saldoFinal→próximo saldoInicial; seta `alerta`.

Funções assíncronas:

- `buscarParcelasEmAbertoNoPeriodo(filialId, inicio, fim)` — via Prisma:
  ```ts
  prisma.parcela.findMany({
    where: {
      titulo: { filialId },
      status: { in: ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"] },
      dataVencimento: { gte: inicio, lte: fim },
    },
    include: { titulo: { select: { tipo: true } }, baixas: { where: { statusAprovacao: "APROVADO" } } },
  })
  ```
  mapeando cada linha com `saldoRemanescenteParcela`.
- `listarFluxoDeCaixaProjetado(sessao, modo, dataReferencia)`:
  1. `requirePermission(sessao.perfil, "titulo:ler")`.
  2. `calcularJanelaProjetada(modo, dataReferencia)` → `periodos`.
  3. `Promise.all([buscarSaldoEmCaixaAte(sessao.filialId, agora), buscarParcelasEmAbertoNoPeriodo(sessao.filialId, periodos[0].inicio, periodos.at(-1).fim)])`.
  4. `calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, saldoInicialAbsoluto)`.

## Permissões

**Sem ação nova.** Reaproveita `titulo:ler` (já existe desde a Fase 2,
concedida aos 6 perfis) — fluxo de caixa projetado é uma view sobre o
mesmo dado, não precisa de permissão própria. Sem escrita nesta tela.

## Arquivos compartilhados — extrair antes de duplicar

`data-valida.ts` e `formatar-rotulo-periodo.ts` (hoje dentro de
`financeiro/fluxo-de-caixa/`) passam a ter 2 consumidores. Mover os dois
(+ seus testes) para uma pasta compartilhada nova,
`src/app/(dashboard)/financeiro/_fluxo-de-caixa/`, seguindo o mesmo
padrão de pasta com underscore já usado para código compartilhado dentro
de `financeiro/` (ver `financeiro/_titulos/`, consumida por
`contas-a-pagar`/`contas-a-receber`). Atualizar os 2 imports em
`fluxo-de-caixa/page.tsx` (único consumidor existente) depois de mover.

## UI e rotas

Nova entrada de nav "Fluxo de caixa projetado" →
`/financeiro/fluxo-de-caixa-projetado` (sem `permitido`, todo perfil tem
`titulo:ler`).

Estrutura espelha `financeiro/fluxo-de-caixa/`:

- `page.tsx` — server component. `requireSessaoAtiva()` +
  `requirePermission(sessao.perfil, "titulo:ler")` (checagem redundante
  com o serviço, mas é o padrão já seguido em todas as páginas
  existentes). Lê `searchParams.modo`/`searchParams.data`, valida
  (reusando `dataValida` de `_fluxo-de-caixa/`), chama
  `listarFluxoDeCaixaProjetado`. Tabela com colunas: Mês | Saldo inicial
  | Entradas projetadas | Saídas projetadas | Geração de caixa | Saldo
  final — rótulo do mês via `formatarRotuloPeriodo("MES", ...)` (reuso
  direto). Linha com `alerta: true` recebe destaque (`bg-destructive/10`
  na `TableRow`, texto do saldo final em `text-destructive font-medium`,
  seguindo o precedente de `tesouraria/page.tsx`) + um `<Badge
  variant="destructive">Saldo negativo</Badge>` na célula (não depender
  só de cor, por acessibilidade). Texto auxiliar fixo acima da tabela
  explicando que a projeção parte do saldo em caixa de hoje.
- `seletor-modo.tsx` — client component análogo a `seletor-periodo.tsx`:
  `Select` (Móvel/Ano civil) + anterior/próximo. Trocar de modo mantém a
  `dataReferencia` atual (não reseta pra hoje).
  `deslocarDataProjetado(data, modo, direcao: 1 | -1)` — `MOVEL` desloca
  1 mês, `ANO_CIVIL` desloca 1 ano. Função pura, testável sem DOM,
  `export`ada e coberta por teste próprio.
- URL: `?modo=MOVEL&data=2026-09-01` / `?modo=ANO_CIVIL&data=2026-01-01`.

## Testes

`fluxoDeCaixaProjetado.test.ts` (mesma estrutura de
`fluxoDeCaixa.test.ts`, fixture `financeiroTestFixtures.ts`):

- Puras (sem banco): `calcularJanelaProjetada` (`MOVEL` 12 meses a partir
  da referência, incluindo virada de ano; `ANO_CIVIL` jan-dez do ano de
  referência, comparável a `calcularJanela("MES", ...)`);
  `saldoRemanescenteParcela` (sem baixas, com baixas parciais, com baixas
  somando mais que o valor); `calcularPeriodosFluxoDeCaixaProjetado`
  (separa RECEBER/PAGAR no mesmo mês; encadeia saldoFinal→saldoInicial;
  mês sem parcela mantém saldo; saldoFinal negativo→`alerta:true`,
  exatamente zero→`alerta:false`; parcela fora de todos os sub-períodos é
  ignorada).
- Integração (banco real): só parcelas com status em aberto entram na
  soma; baixa `APROVADO` parcial abate do saldo, baixa `PENDENTE`/
  `REJEITADO` não abate nada (pegadinha real do domínio, teste
  explícito); separação RECEBER/PAGAR no mesmo mês; escopo de filial
  (parcela de outra filial não vaza); `saldoInicial` do primeiro mês bate
  com `buscarSaldoEmCaixaAte` chamado com a mesma referência de tempo
  capturada uma única vez no teste (evita flakiness); modos `MOVEL`/
  `ANO_CIVIL` com a mesma `dataReferencia` produzem janelas diferentes
  quando a referência não é 1º de janeiro.
- `seletor-modo.test.ts` (sem banco): `deslocarDataProjetado` desloca 1
  mês (`MOVEL`, incluindo dezembro→janeiro) ou 1 ano (`ANO_CIVIL`).

## Fora de escopo (explicitamente adiado)

- Contratos recorrentes, financiamentos, parcelamentos além de
  `Parcela`, e orçamento (Fase 5) como insumos da projeção — nenhum
  desses conceitos existe no schema hoje.
- Alertas de concentração de vencimentos e de necessidade potencial de
  capital — só o alerta de saldo final negativo entra nesta versão.
- Reconstrução da cadeia de saldo através de meses "invisíveis" quando a
  janela pedida (modo `ANO_CIVIL`) não cobre o mês corrente — a projeção
  sempre parte do saldo de hoje, com aviso textual na tela.
- Consolidação por empresa (soma de filiais) — Fase 5.
- Exportação (CSV/Excel/PDF) do relatório.
