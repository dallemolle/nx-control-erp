# Design — Fluxo de Caixa Realizado (Fase 4a)

Status: Aprovado. Ainda não implementado.

## Contexto

A Fase 4 ("Fluxo de caixa") cobre três blocos com naturezas bem diferentes:
realizado (método direto, só com o que já aconteceu de fato em caixa),
projetado (12 meses, baseado em títulos em aberto + contratos recorrentes
+ premissas editáveis) e estratégico (5 anos, cenários macro). São grandes
demais pra uma spec só — por isso, seguindo o mesmo padrão da Fase 2
(Títulos + Tesouraria), a Fase 4 foi dividida em sub-projetos, cada um com
seu próprio ciclo design → spec → plano:

1. **Fluxo de caixa realizado** — este documento.
2. **Fluxo de caixa projetado (12 meses)** — sub-projeto seguinte, ainda
   não desenhado. Precisa de conceitos de domínio que não existem hoje
   (contratos recorrentes, financiamentos).
3. **Fluxo de caixa estratégico (5 anos)** — sub-projeto seguinte, ainda
   não desenhado. Cenários e premissas macro (crescimento, margem,
   inflação, CAPEX, endividamento).

Escolha de começar pelo "realizado": é o mais simples dos três (nenhum
conceito de domínio novo — só agrega o que a Fase 3 já conciliou), entrega
valor visível de imediato, e não depende de nada que ainda falta construir
(diferente do "projetado", que depende de contratos recorrentes
inexistentes, e do "estratégico", que faz mais sentido calibrado contra
dados reais de "realizado").

Nota sobre o escopo original (`docs/fases/fase-4-fluxo-de-caixa.md`): o
bloco "projetado" lista "orçamento (Fase 5)" como um dos insumos, mas a
Fase 5 na verdade **depende** da Fase 4, não o contrário — tratado como
insumo opcional/futuro, não bloqueio; "premissas editáveis" cobre o mesmo
papel até a Fase 5 existir. Isso não afeta o "realizado" (este documento),
só fica registrado aqui pra quando o "projetado" for desenhado.

## Modelo de cálculo

**Sem tabela nova, sem cache** — reaproveita os `LancamentoBancario` já
existentes (Fase 2b/3) como única fonte, calculado sob demanda. Mesma
filosofia já usada em `calcularSaldoContabil` (Tesouraria): "sempre
calculado, nunca uma coluna armazenada". Alternativa considerada e
descartada: materializar um "fechamento" por período numa tabela própria
— desnecessário no volume de dados desta fase, e criaria uma segunda fonte
de verdade pra manter sincronizada com `LancamentoBancario`. Revisitar só
se performance virar problema real em produção.

- **Escopo**: filial ativa da sessão — mesmo padrão de isolamento usado em
  todo o resto do sistema. Sem consolidação por empresa nesta fase (isso é
  explicitamente escopo da Fase 5, que já lida com consolidação de
  dimensões por empresa).
- **Fonte**: só `LancamentoBancario` com `conciliado: true`. Regra herdada
  diretamente do que a Fase 3 já deixou escrito em
  `docs/fases/fase-2-financeiro.md`/`fase-3-conciliacao.md` ("fluxo de
  caixa realizado deve refletir apenas movimentações efetivamente
  conciliadas/confirmadas em caixa"). Um `LancamentoBancario` que existe no
  sistema mas ainda não foi conciliado com o extrato bancário real não
  entra na conta — evita contar dinheiro que ainda não foi confirmado como
  tendo de fato batido na conta.
- **Saldo em caixa até uma data `D`** (função auxiliar, não persistida):

  ```
  saldoEmCaixaAte(filialId, D) =
      soma(ContaBancaria.saldoInicial de todas as contas ativas da filial)
    + soma(LancamentoBancario.valor onde conciliado=true, tipo=ENTRADA, data <= D)
    - soma(LancamentoBancario.valor onde conciliado=true, tipo=SAIDA, data <= D)
  ```

- **Por período** (dia/semana/mês/ano), dentro do intervalo visualizado:
  - `saldoInicial` = `saldoEmCaixaAte(filialId, inícioDoPeríodo - 1 dia)`
  - `entradas` = soma dos `LancamentoBancario` conciliados com `tipo=ENTRADA`
    e `data` dentro do período
  - `saidas` = soma dos `LancamentoBancario` conciliados com `tipo=SAIDA`
    e `data` dentro do período
  - `geracaoLiquida` = `entradas - saidas`
  - `saldoFinal` = `saldoInicial + geracaoLiquida`

  `saldoFinal` do período deve ser sempre igual a
  `saldoEmCaixaAte(filialId, fimDoPeríodo)` — são a mesma conta feita de
  dois jeitos diferentes, e essa igualdade vira uma checagem de
  consistência direta em teste.

- **Granularidades e janela exibida**: dia, semana (segunda a domingo),
  mês (calendário), ano (calendário). Cada granularidade tem uma janela
  natural que a tabela mostra de uma vez — a navegação anterior/próximo
  troca a janela inteira, não um período isolado:
  - `DIA` → todos os dias do mês de `dataReferencia` (navegação troca de
    mês).
  - `SEMANA` → todas as semanas do mês de `dataReferencia` (navegação
    troca de mês).
  - `MES` → todos os meses do ano de `dataReferencia` (navegação troca de
    ano).
  - `ANO` → os últimos 5 anos civis até o ano de `dataReferencia`
    (navegação anterior/próximo desloca esse bloco de 5 em 5 anos).

  Sem intervalo de datas livre nesta fase — só essas janelas fixas por
  granularidade.

## Serviços (`src/server/services/fluxoDeCaixa.ts`)

- `calcularJanela(granularidade, dataReferencia)` — **função pura**,
  devolve `{ inicio: Date, fim: Date, periodos: { inicio: Date; fim: Date
  }[] }` — a janela natural da granularidade (ver seção acima) já
  recortada nos sub-períodos que a tabela vai exibir como linhas (ex.:
  granularidade `MES` com `dataReferencia` em 2026 devolve os 12 meses de
  2026, cada um com seu `inicio`/`fim`).
- `calcularPeriodosFluxoDeCaixa(periodos, lancamentos, saldoInicialAbsoluto)`
  — **função pura**, sem I/O, testável sem banco. Recebe os sub-períodos
  de `calcularJanela`, a lista de lançamentos já conciliados (com `data`,
  `valor`, `tipo`) dentro da janela inteira, e o saldo absoluto até o
  início do primeiro sub-período; devolve a lista de `{ periodo,
  saldoInicial, entradas, saidas, geracaoLiquida, saldoFinal }` pra
  exibir, encadeando o saldo final de um sub-período como saldo inicial do
  próximo. Mesmo espírito de `calcularStatusParcela`/
  `classificarLinhaExtrato`: toda a lógica de agrupamento/soma isolada
  numa função sem banco, fácil de testar exaustivamente.
- `buscarSaldoEmCaixaAte(filialId, data)` — async, faz as duas somas
  (`ContaBancaria.saldoInicial` + `LancamentoBancario` agregado) via
  Prisma.
- `listarFluxoDeCaixaRealizado(sessao, granularidade, dataReferencia)` —
  async; exige `requirePermission`/escopo de filial como todo o resto do
  sistema (reaproveita a ação de leitura já existente, sem ação nova —
  ver seção de Permissões); chama `calcularJanela`, busca os
  `LancamentoBancario` conciliados dentro da janela inteira + o saldo
  absoluto do início da janela via `buscarSaldoEmCaixaAte`, e delega o
  cálculo pra `calcularPeriodosFluxoDeCaixa`.

## Permissões

**Sem ação nova.** Reaproveita `lancamento:ler` (já existe desde a Fase
2b, concedida a todo perfil exceto nenhum — todos os seis perfis já têm
leitura de lançamentos bancários) — fluxo de caixa realizado é views
sobre o mesmo dado, não precisa de uma permissão própria. Sem escrita
nesta tela (é só leitura).

## UI e rotas

Nova entrada de nav "Fluxo de caixa" → `/financeiro/fluxo-de-caixa` (sem
`permitido`, todo perfil tem `lancamento:ler`).

- Um `Select` de granularidade (Dia / Semana / Mês / Ano).
- Navegação anterior/próximo (dois botões) desloca a janela inteira (ver
  "Granularidades e janela exibida") — implementado via `searchParams` da
  URL (`?granularidade=MES&data=2026-09-01`), mesmo padrão já usado no
  filtro de status da tela de Conciliação.
- Tabela: uma linha por sub-período da janela (rótulo formatado conforme a
  granularidade — "15/09/2026", "Semana de 15 a 21/09/2026",
  "Setembro/2026", "2026"), com saldo inicial, entradas, saídas, geração
  de caixa, saldo final.
- Sem alertas, sem quebra por centro de custo/lucro/safra/projeto nesta
  fase — ver "Fora de escopo".

## Testes

- `fluxoDeCaixa.test.ts` (funções puras `calcularJanela` e
  `calcularPeriodosFluxoDeCaixa`, sem banco): `calcularJanela` devolve os
  sub-períodos certos pra cada granularidade (12 meses pro ano de
  referência, os dias do mês de referência, os últimos 5 anos, etc.);
  `calcularPeriodosFluxoDeCaixa` agrupa e soma corretamente; saldo inicial
  de um sub-período é o saldo final do anterior; sub-período sem nenhum
  lançamento aparece com entradas/saídas zeradas e saldo final = saldo
  inicial; mistura de ENTRADA/SAIDA no mesmo sub-período soma
  corretamente.
- Teste de integração (banco real): `listarFluxoDeCaixaRealizado` só
  conta `LancamentoBancario` com `conciliado: true` (um lançamento não
  conciliado no meio do período não deve aparecer na soma); o `saldoFinal`
  do último período retornado bate com `buscarSaldoEmCaixaAte` calculado
  direto pra mesma data (checagem de consistência); escopo de filial (um
  lançamento de outra filial não vaza pro cálculo).

## Fora de escopo (explicitamente adiado)

- Fluxo de caixa projetado e estratégico — sub-projetos próprios, ainda
  não desenhados.
- Alertas (saldo negativo, insuficiência de caixa, concentração de
  vencimentos) — só aparecem no bloco "projetado" no escopo original.
- Quebra por centro de custo, centro de lucro, safra ou projeto — Fase 5
  ("Comparativos por dimensão").
- Consolidação por empresa (soma de filiais) — Fase 5.
- Intervalo de datas livre (o usuário só navega período-a-período dentro
  da granularidade escolhida, sem escolher um range arbitrário).
- Exportação (CSV/Excel/PDF) do relatório.
