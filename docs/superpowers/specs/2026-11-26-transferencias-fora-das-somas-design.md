# Transferências entre contas fora das entradas e saídas

Data: 2026-11-26 · Status: aprovada

Item 10 do [backlog](../../backlog.md), seção "Financeiro — lacunas achadas ao
escrever a ajuda contextual" ("Transferências entre contas inflam entradas e
saídas").

## Problema

A transferência entre contas (`criarTransferencia`,
`src/server/services/lancamentoBancario.ts`) gera dois lançamentos com
`origem: "TRANSFERENCIA"`: uma SAIDA na conta de origem e uma ENTRADA na de
destino. As somas por tipo não as tiram: o dinheiro que só trocou de conta
aparece como entrada e como saída.

- **Fluxo de caixa realizado** (`listarFluxoDeCaixaRealizado`,
  `fluxoDeCaixa.ts`): Entradas e Saídas infladas.
- **Fluxo estratégico** (`buscarAnoBaseConsolidado`,
  `fluxoDeCaixaEstrategico.ts`): entradas e saídas dos últimos 12 meses viram
  `receitaBase` e `custoBase`; com crescimentos diferentes, CAPEX em % da
  receita e margem sobre a receita, **a projeção de 5 anos sai errada**.
- **Dashboard executivo** (`dashboardExecutivo.ts`): gráfico Entradas × Saídas
  inflado.
- **Fluxo por dimensão** (`fluxoDeCaixaPorDimensao.ts`): as pernas caem em
  "Não classificado" e inflam entradas e saídas dele.

Com o filtro Fiscal/Gerencial as transferências já ficam de fora (não têm
classificação). Orçamento e relatório fiscal × gerencial não são afetados.

Cuidado: o realizado só conta lançamentos **conciliados**. Num saque do banco
para o Caixa, a perna do Caixa nasce conciliada e a do banco espera o extrato:
até a conciliação, as duas pernas não se anulam no realizado.

## Regra

Lançamento com `origem: "TRANSFERENCIA"` **não é entrada nem saída**: só move o
saldo entre contas. Ele continua contando em todo saldo (saldo conciliado,
contábil, aguardando conciliação, evolução do saldo).

## Decisões deste desenho

- **Coluna "Transferências" no realizado** (escolha do usuário): Entradas e
  Saídas sem transferências; a coluna mostra o líquido das transferências do
  período (entradas − saídas de transferência), quase sempre R$ 0,00 e
  diferente de zero quando só uma perna está conciliada. Geração líquida =
  entradas − saídas; Saldo final = inicial + geração + transferências.
- **Estratégico tira só as transferências** (escolha do usuário). Empréstimo
  recebido, aporte de sócio e outras entradas avulsas que não são receita
  continuam na base; a ajuda avisa e o corte por categoria vai ao backlog.
- **Geração de caixa (mês atual) do dashboard sem transferências**, igual à
  geração líquida do realizado.

## Componentes

### Regra comum — `src/server/services/fluxoDeCaixa.ts`

- `LancamentoParaFluxo` ganha `transferencia: boolean` (origem TRANSFERENCIA).
- `PeriodoFluxoDeCaixa` ganha `transferencias: number` (líquido).
- `calcularPeriodosFluxoDeCaixa`: entradas e saídas só de não transferências;
  `transferencias` = entradas − saídas de transferência; `geracaoLiquida` =
  entradas − saídas; `saldoFinal` = `saldoInicial` + `geracaoLiquida` +
  `transferencias`.
- Constante exportada para os `where` do Prisma:
  `SEM_TRANSFERENCIA = { origem: { not: "TRANSFERENCIA" } }` (ou equivalente),
  usada nas somas de entradas/saídas das outras telas.

### Fluxo de caixa realizado

- `listarFluxoDeCaixaRealizado` passa `transferencia` em cada lançamento.
- Tela (`src/app/(dashboard)/financeiro/fluxo-de-caixa/page.tsx`) e exportação
  (`.../fluxo-de-caixa/export/route.ts`): coluna "Transferências" entre "Saídas"
  e "Geração líquida". Na visão filtrada (Fiscal/Gerencial), a coluna continua
  (sempre zero), para a tabela não mudar de forma.

### Dashboard executivo

- `somasConciliadasNoPeriodo` ganha um parâmetro para excluir transferências.
  O gráfico Entradas × Saídas e a "Geração de caixa (mês atual)" usam as
  somas sem transferências. A **Evolução do saldo** continua com elas: o
  saldo de cada mês passa a ser calculado com as somas completas (ou com o
  líquido das transferências somado), para continuar batendo com o caixa.

### Fluxo estratégico

- `buscarAnoBaseConsolidado`: o `groupBy` da receita e do custo exclui
  transferências. O saldo de partida não muda.

### Fluxo por dimensão

- `somarRealizadoPorDimensao`: exclui transferências.

## Ajuda e documentos

- `src/ajuda/fluxo-de-caixa/` (exemplo, cenas, roteiros, teste): novembro tem o
  saque de R$ 2.000,00 dentro de Entradas e Saídas; ele sai das duas colunas
  (mês e semana em que ele cai), a coluna Transferências aparece na réplica
  (R$ 0,00 em todos os períodos do exemplo) e a geração e os saldos não mudam.
  O passo "Entradas e Saídas" deixa de dizer que a transferência entra nas
  duas colunas e passa a explicar a coluna Transferências (inclusive quando
  ela fica diferente de zero). O passo "Geração líquida" atualiza os números
  (R$ 17.400,00 − R$ 18.638,00 = −R$ 1.238,00).
- `src/ajuda/fluxo-por-dimensao/` (exemplo, roteiros, teste): "Não
  classificado" perde as duas pernas do saque (centro de custo: entradas
  25.500 → 23.500, saídas 2.000 → 0; safra: entradas 2.000 → 0, saídas
  2.045,90 → 45,90); os passos que citam o saque passam a dizer que a
  transferência não entra.
- `src/ajuda/dashboard-executivo/index.tsx`: a dica do gráfico Entradas ×
  Saídas passa a dizer que transferências não entram (o saldo continua com
  elas); o passo da Geração de caixa diz que transferências não entram.
- `src/ajuda/fluxo-de-caixa-estrategico/roteiros.ts`: a dica do ano-base deixa
  de citar transferências e mantém o aviso sobre empréstimos e aportes.
- `docs/backlog.md`: item 10 com "Status: feito"; item novo (63) "Ano-base do
  estratégico conta empréstimos e aportes como receita", com o caminho de
  basear receita e custo nas categorias.

## Testes

- `fluxoDeCaixa.test.ts`: `calcularPeriodosFluxoDeCaixa` com as duas pernas
  (entradas/saídas/geração sem a transferência, coluna 0, saldo igual); com só
  uma perna (coluna = ±valor, saldo final fecha).
- Integração (banco): realizado com transferência conciliada nos dois lados e
  só num lado; dashboard (gráfico, geração do mês, evolução do saldo igual ao
  caixa); ano-base do estratégico sem a transferência (o teste FG5 existente
  já cria uma ENTRADA de transferência de R$ 50 e espera receita 1.350: passa
  a 1.300); fluxo por dimensão sem as pernas.

## Fora do escopo

- Empréstimos e aportes na base do estratégico: → backlog (item 63).
- Fluxo projetado e saldo contábil: não somam entradas/saídas de lançamentos
  por tipo para exibição (a linha "Aguardando conciliação" mostra entradas e
  saídas não conciliadas, incluindo pernas de transferência pendentes):
  descartado, porque ali a linha existe justamente para levar ao saldo
  contábil e mostrar o que falta conciliar.
