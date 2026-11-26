# Projeção considera o que aguarda conciliação

Data: 2026-11-25 · Status: implementada (2026-11-25)

Item 13 do [backlog](../../backlog.md), seção "Financeiro — lacunas achadas ao
escrever a ajuda contextual" ("Baixa aprovada e não conciliada some da
projeção").

## Problema

O Fluxo de caixa projetado parte do saldo em caixa **conciliado**
(`buscarSaldoEmCaixaAte`, só `conciliado: true`), mas cada parcela entra pelo
que falta pagar depois das baixas **aprovadas** (`saldoRemanescenteParcela`).
Entre a aprovação e a conciliação, o pagamento não está em nenhum dos dois
lados.

Exemplo: a parcela de R$ 1.012,00 do adubo é paga e aprovada em 19/11; o
extrato só é conciliado na semana seguinte. Nesse meio tempo o saldo de partida
ainda tem os R$ 1.012,00 e a parcela já não aparece como saída: a projeção fica
R$ 1.012,00 otimista. No recebimento, fica pessimista. O mesmo vale para
lançamentos manuais e para o lado bancário das transferências, que nascem não
conciliados.

O "Saldo projetado (30 dias)" do Dashboard executivo faz a mesma conta (caixa
conciliado + parcelas dos próximos 30 dias) e ainda ignora as parcelas em
atraso, que a tela do projetado soma na linha "Em atraso": os dois números não
batem.

## Regra

- **Saldo conciliado**: saldo inicial das contas ativas + lançamentos
  conciliados até agora (como hoje).
- **Aguardando conciliação**: lançamentos **não conciliados** das contas
  ativas, sem corte de data (entradas e saídas separadas).
- **Saldo contábil** = saldo conciliado + entradas aguardando − saídas
  aguardando. É o mesmo saldo contábil da Tesouraria, somado pelas contas.

Toda projeção parte do saldo contábil. O que é retrato do banco (Fluxo de
caixa realizado, gráfico "Evolução do saldo", card "Geração de caixa (mês
atual)", ano-base do estratégico) continua só com conciliados.

## Decisões deste desenho

- **Linha à parte, não saldo contábil escondido** (escolha do usuário): a
  pessoa vê quanto ainda falta conferir com o extrato, e o resultado bate com a
  Tesouraria.
- **Todos os não conciliados, não só baixas**: lançamento manual, transferência
  e repasse de cartão também são dinheiro que já se moveu no sistema.
- **Saldo projetado (30 dias) igual à tela** (escolha do usuário): inclui os
  atrasados e o que aguarda conciliação.
- **Caixa disponível mostra o contábil** (escolha do usuário), com o valor
  aguardando conciliação embaixo.

## Componentes

### Serviço — `src/server/services/fluxoDeCaixa.ts`

- Nova `buscarAguardandoConciliacaoDasFiliais(filialIds): Promise<{ entradas:
  number; saidas: number }>`: `groupBy` por `tipo` em `lancamentoBancario` com
  `filialId in`, `conciliado: false`, `contaBancaria: { ativo: true }`.
- Nova `buscarAguardandoConciliacao(filialId)` (atalho de uma filial).
- `buscarSaldoEmCaixaAteDasFiliais` não muda.

### Fluxo de caixa projetado — `fluxoDeCaixaProjetado.ts` e `page.tsx`

- `FluxoDeCaixaProjetado` ganha `aguardandoConciliacao: LinhaAguardando |
  null`, com `saldoInicial` (conciliado), `entradasProjetadas`,
  `saidasProjetadas`, `geracaoLiquida`, `saldoFinal` (contábil) e `alerta`
  (`saldoFinal < 0`), no mesmo formato das linhas "Em atraso" e "A vencer
  até".
- `calcularPeriodosFluxoDeCaixaProjetado` recebe o aguardando em
  `anteriores.aguardandoConciliacao` (opcional). Quando vem, a linha parte de
  `saldoInicialAbsoluto` e "Em atraso" parte do `saldoFinal` dela. Sem ele,
  comportamento atual.
- `listarFluxoDeCaixaProjetado` busca o aguardando em paralelo (fora do filtro
  Fiscal/Gerencial). Com classificação, `aguardandoConciliacao` é `null`: a
  visão filtrada é um acumulado que parte de 0, e a parcela paga já sai dela.
- A linha aparece sempre (sem classificação), mesmo zerada, como "Em atraso".
  Rótulo: "Aguardando conciliação". Ela vem antes de "Em atraso" na tabela e
  na exportação (`export/route.ts`).
- Texto do topo da tela: a projeção parte do saldo em caixa de hoje,
  conciliado, mais o que foi lançado e ainda aguarda conciliação.

### Dashboard executivo — `dashboardExecutivo.ts` e `page.tsx`

- `buscarIndicadoresExecutivos` busca o aguardando das filiais em paralelo.
- `calcularIndicadoresExecutivos` recebe `caixaConciliado` e
  `aguardandoConciliacao: { entradas, saidas }` em vez de `caixaDisponivel`, e
  devolve:
  - `caixaDisponivel` = contábil;
  - `aguardandoConciliacao` = entradas − saídas aguardando (novo campo, para o
    card);
  - `saldoProjetado30Dias` = contábil + (a receber vencido − a pagar vencido) +
    recebimentos esperados (30 dias) − obrigações (30 dias). O saldo vencido usa
    o mesmo corte de `hoje` dos outros cards (vencimento antes de hoje).
- Card "Caixa disponível": linha pequena embaixo, "R$ X aguardando
  conciliação" (só quando diferente de zero).
- Card "Saldo projetado (30 dias)": linha pequena embaixo, "Inclui atrasados e
  o que aguarda conciliação".
- "Obrigações (30 dias)" e "Recebimentos esperados (30 dias)" continuam sem
  os atrasados (a inadimplência já tem card).
- A API não expõe o dashboard: sem mudança em `docs/api-v1.md`.

### Fluxo estratégico — `fluxoDeCaixaEstrategico.ts`

- `buscarAnoBaseConsolidado`: o saldo de partida passa a ser o contábil
  (conciliado + aguardando das filiais). O realizado dos 12 meses continua
  conciliado.

## Ajuda e documentos

- `src/ajuda/fluxo-de-caixa-projetado/` (`roteiros.ts`, `cenas.tsx`,
  `exemplo.ts`, `roteiros.test.ts`): o exemplo ganha um pagamento aprovado e
  não conciliado; a réplica mostra a linha "Aguardando conciliação"; o roteiro
  `ler-projecao` ganha o passo da linha nova; os passos "O ponto de partida é o
  saldo de hoje" e "Entradas e saídas projetadas" deixam de mandar conciliar
  em dia para a projeção ficar certa.
- `src/ajuda/dashboard-executivo/index.tsx`: textos de "Caixa disponível"
  (passa a ser o contábil, com o aguardando embaixo) e "Saldo projetado (30
  dias)" (inclui atrasados e o que aguarda conciliação; bate com o projetado).
- `src/ajuda/fluxo-de-caixa-estrategico/` (`roteiros.ts`, `exemplo.ts`): o
  saldo de partida é o contábil.
- `docs/backlog.md`: o item 13 ganha "Status: feito", como os itens 1 a 5.
- O manual (Passo a passo) foi aposentado em 2026-11-21: nada a mudar.

## Testes

- `fluxoDeCaixaProjetado.test.ts`: `calcularPeriodosFluxoDeCaixaProjetado` com
  aguardando (linha parte do conciliado, "Em atraso" parte do contábil, alerta
  negativo); sem aguardando, igual a hoje.
- `fluxoDeCaixa.test.ts` (banco): `buscarAguardandoConciliacaoDasFiliais` soma
  só não conciliados de contas ativas, separando entradas e saídas.
- `dashboardExecutivo.test.ts`: caixa disponível contábil; saldo projetado com
  atrasado a receber e a pagar; o caso do adubo (pagamento aprovado e não
  conciliado não muda o saldo projetado).
- Teste de serviço (banco) do projetado: baixa aprovada em conta bancária não
  conciliada → aparece na linha, e o saldo final dos meses é o mesmo de antes
  da aprovação.
- `fluxoDeCaixaEstrategico.test.ts`: saldo de partida com aguardando.
- Navegador: aprovar uma baixa em conta bancária e conferir o projetado, o
  dashboard e a Tesouraria (saldo contábil = saldo final da linha nova).

## Fora do escopo

- Saldo da filial desativada no aviso de pendências (`filiaisConsolidadas.ts`)
  continua conciliado: descartado (o aviso só detecta se ainda há saldo, e a
  regra atual serve).
- Lançamento em conta Caixa com data futura fica fora do saldo conciliado
  (corte em "agora"), e numa transferência Caixa → banco com data futura o lado
  do banco entra no aguardando: → backlog (item 61; caso raro).
- Alerta quando o aguardando conciliação fica velho (ex.: mais de 30 dias):
  descartado (a Conciliação já lista os pendentes; enfeite).
