# Backlog de melhorias

Pontos de melhoria identificados durante o desenho ou implementação de
alguma fase, mas conscientemente deixados fora do escopo da versão atual
(YAGNI) para não atrasar a entrega. Cada item deve ter contexto suficiente
para ser retomado sem precisar reconstruir o raciocínio original.

## Segurança — dependências

- **`uuid` vulnerável via `exceljs`** (severidade moderada,
  `GHSA-w5hq-g745-h8pq` — falta de checagem de limites de buffer em
  `v3`/`v5`/`v6` quando um buffer é fornecido pelo chamador). `exceljs`
  está na versão mais recente disponível (`4.4.0`) e ainda depende de uma
  versão vulnerável de `uuid`; o único fix que `npm audit fix --force`
  oferece é fazer downgrade do `exceljs` para `3.4.0` — uma regressão real,
  não uma correção. Risco prático baixo hoje: nenhum código deste projeto
  passa buffer controlado pelo usuário para geração de UUID (nem direto,
  nem através de qualquer chamada a `exceljs`) — o vetor de exploração da
  CVE não é alcançável pelo uso atual. Reavaliar quando `exceljs` lançar
  uma versão que atualize sua própria dependência de `uuid`.

## Alertas

- **Alerta de estouro na comparação entre safras** (Fase 5, sub-projeto
  2b). O escopo original em `docs/fases/fase-5-controladoria.md` não pede
  alerta para este comparativo (diferente do sub-projeto 1 — Orçamento —
  que pede explicitamente). Se no futuro for útil destacar visualmente
  quando o realizado ultrapassar o orçado de uma safra, o padrão já existe
  em `orcamento.ts`/`orcamento` UI e pode ser replicado sem retrabalho.

- **Alertas de concentração de vencimentos e necessidade de capital**
  (Fase 4, sub-projeto 2 — Fluxo de caixa projetado). Na v1 só existe
  alerta de saldo final negativo. Alertar sobre concentração de
  vencimentos em uma janela curta, ou sobre necessidade de captação
  antecipada, ficou para uma iteração futura.

## Comparação entre safras (Fase 5, sub-projeto 2b)

- **Sinal do orçado por safra (sempre ≥ 0) não bate com o sinal do
  realizado/projetado (saldo líquido, pode ser negativo).** `orçado`
  reaproveita `valorOrcamentoSchema` (não aceita negativo), enquanto
  `realizado`/`projetado` são `entradas − saídas` e rotineiramente
  negativos numa safra com custo alto — a Variação pode parecer um
  estouro grande numa safra que na prática está dentro do esperado.
  Decisão consciente ao aprovar o desenho: manter como está por ora. Se
  isso confundir o usuário na prática, a correção é decidir se "orçado"
  significa custo esperado (mantém ≥0, mas aí a Variação teria que
  comparar contra saídas, não contra o saldo líquido) ou resultado líquido
  esperado (permitir negativo no schema usado por esta tela).
  **Atualização (2026-11-20, ajuda contextual):** a ajuda da tela orienta a
  orçar o **resultado esperado** da safra, que é o único jeito de a Variação
  fazer sentido com a conta atual, e avisa que não dá para orçar prejuízo.
  Ao corrigir: roteiro `orcar-safra` (passo do orçado e a dica sobre
  negativo) e a observação do índice em `src/ajuda/comparacao-safras/`;
  manual, seção 4.3 (frase "o orçado que faz sentido é o resultado
  esperado").
  **Atualização (2026-11-27, item 16):** o Orçamento mensal passou a mostrar
  a coluna Previsto (realizado + projetado) e a Variação sobre ela, a mesma
  base do Estouro. Ao corrigir o sinal aqui, levar a Comparação entre safras
  para a mesma regra (Previsto e Variação sobre ele) e trocar o passo
  "Variação: realizado menos orçado" do roteiro em
  `src/ajuda/comparacao-safras/roteiros.ts`.

## API REST de automação (lançamentos via agente)

- **Idempotência é opt-in.** Resolvido em 2026-11-03 com o header
  `Idempotency-Key` (tabela `requisicoes_idempotentes`, ver
  `docs/api-v1.md`), mas um cliente que não envia o header continua sem
  proteção contra reenvio. Tornar obrigatório em `POST` quebraria
  integrações existentes — reavaliar se aparecer duplicidade vinda de um
  cliente que não manda a chave. Também em aberto: chaves não expiram
  (a tabela cresce com o volume de POSTs com chave) e uma requisição
  interrompida depois de gravar fica em `409` para sempre (sem
  "destravamento" automático).

## Auditoria — workflow de aprovação de pagamentos (Fase 6, sub-projeto 6d)

- **Workflow de aprovação de pagamentos de 5 passos** (cadastro →
  aprovação → programação → pagamento → conciliação), citado na prosa
  original da Fase 6, ficou fora do escopo. Hoje o fluxo real é de 3
  passos: cadastro → aprovação-que-já-é-pagamento (`aprovarBaixa` cria o
  `LancamentoBancario` na própria transação de aprovação) → conciliação.
  Não existe "programação" em nenhum lugar do schema. Desacoplar
  aprovação de pagamento é uma mudança de comportamento real (não uma
  extensão pequena) e não deve ser feita sem um pedido de negócio
  explícito — retomar só se/quando isso for pedido.
- **Ramo de classificação automática sem match** (dentro de
  `processarLinhasPendentes`, em `conciliacao.ts`) não gera `AuditLog` —
  decisão consciente, não um gap: é uma classificação derivada
  (`SUGESTAO`/`DIVERGENCIA_VALOR`/`DIVERGENCIA_DATA`/`DUPLICADO`, sem
  vincular nenhum `LancamentoBancario`), o mesmo princípio já aplicado a
  `recalcularEPersistirStatusParcela`, que também não audita por ser
  derivado, não uma ação de usuário.

## Produção — custo da OP

- **Histórico do preço de referência do produto** (rateio do custo da OP,
  2026-11-16). O rateio usa o preço do cadastro no momento do encerramento e
  o resultado fica congelado no `custoKg` do lote; o preço usado fica só na
  auditoria `ENCERRAR` da OP. Se for preciso consultar "qual preço valia em
  tal data" (ex.: para explicar um custo antigo sem abrir a auditoria),
  criar um histórico de preços por produto.

## Banco de dados — consultas paralelas na transação

### Include com várias relações dentro de `prisma.$transaction`

- **Problema:** dentro de `prisma.$transaction(async (tx) => …)`, um `include`
  (ou `select`) com mais de uma relação faz o Prisma consultar as relações em
  paralelo (`Promise.all`) na única conexão da transação. O pg 8 avisa
  (`DeprecationWarning: Calling client.query() when the client is already
  executing a query is deprecated`) e o pg 9 vai recusar a chamada.
- **Exemplo:** `tx.baixa.findFirstOrThrow({ include: { lancamentos, repasseRecebimento,
  repasseTaxa } })` no estorno de baixa emitia o aviso; corrigido lendo em
  sequência (`findFirstOrThrow`, `findMany`, `count`).
- **Onde:** visto nos testes de recepção ("cancelar é recusado depois de o lote
  ser consumido numa OP", código de Ordem de Produção). Depois da correção do
  estorno, ainda emitem o aviso (rodando cada arquivo sozinho):
  `src/server/services/recepcaoFruto.test.ts` e
  `src/server/services/estoque.test.ts`. Na suíte toda saem 9 avisos (um por
  processo de teste), sem dar para atribuir cada um a um arquivo.
- **Impacto:** quebra quando o pg for atualizado para a versão 9.
- **Caminhos:** em transações, ler em sequência ou uma relação por consulta.
- **Cuidados:** manter a mesma ordem de checagens e as mesmas mensagens ao
  trocar o `include` por leituras separadas; localizar com
  `NODE_OPTIONS=--trace-deprecation` (a pilha aponta o adaptador, não o
  arquivo, então rode os testes um arquivo por vez).

## Financeiro — lacunas achadas ao escrever a ajuda contextual

Achadas entre 2026-11-19 e 2026-11-20, conferindo os roteiros da ajuda contra o
código. Cada item será tratado com mais profundidade numa sessão própria (spec
antes do código). O formato é o mesmo em todos, para não perder detalhe:
**Problema**, **Exemplo**, **Onde**, **Impacto**, **Caminhos**, **Cuidados** e
**Ao corrigir**, que lista os textos da ajuda e do manual que contornam o
problema e precisam mudar junto.

**Prioridade (decisão do usuário, 2026-11-20):** os itens 2 a 5 são correções
de **prioridade alta**, para fazer depois da ajuda contextual dos menus (os
módulos ainda não estão em uso). Os demais estão com prioridade a definir.

### 1. Desconto na baixa não abate o saldo da parcela

- **Status:** feito na branch `fix/desconto-abate-parcela` (2026-11-25, spec
  `2026-11-25-desconto-abate-parcela-design.md`): o saldo e o status usam
  pago − juros − multa + desconto; baixa que não abate nada é recusada; o
  diálogo mostra a prévia.
- **Problema:** `calcularStatusParcela` (`src/server/services/parcela.ts`)
  compara só a soma de `valorPago` das baixas aprovadas com `valorAtualizado`.
  `valorDesconto`, `valorJuros` e `valorMulta` são só registro.
- **Exemplo:** parcela de R$ 1.000,00 paga com R$ 50,00 de desconto: valor pago
  R$ 950,00, desconto 50,00. A parcela fica PARCIALMENTE_PAGO, com R$ 50,00 em
  aberto para sempre, aparecendo na projeção e no aging.
- **Impacto:** dado errado em Contas a pagar/receber, projeção, aging e
  inadimplência do dashboard.
- **Caminhos:** considerar `valorPago + valorDesconto − valorJuros −
  valorMulta` contra o valor da parcela; ou o desconto abater o saldo devedor.
- **Cuidados:** relatórios que somam `valorPago` (fluxo realizado, fiscal ×
  gerencial, vendas); parcela com várias baixas parciais; o lançamento bancário
  continua com o valor pago (é o que saiu da conta).
- **Ao corrigir:** dica do passo "Informe o valor pago" em
  `src/ajuda/contas-a-pagar/roteiros.ts` (roteiro `pagar-parcela`) e do passo
  "Informe o valor recebido" em `src/ajuda/contas-a-receber/roteiros.ts`
  (roteiro `receber-parcela`): hoje mandam combinar com o financeiro.

### 2. Aprovação às cegas (prioridade alta)

- **Status:** feito na branch `feat/aprovacao-com-detalhes` (2026-11-21, spec
  `2026-11-21-aprovacao-com-detalhes-design.md`): a linha mostra data, conta,
  parcela n/total, valor da parcela e ajustes, com avisos de data fora do
  normal, valor diferente do saldo e outra baixa pendente; ajuda com o roteiro
  novo `entender-avisos`.
- **Problema:** Aprovações pendentes
  (`src/app/(dashboard)/financeiro/aprovacoes/page.tsx`) mostra só documento,
  contraparte, valor pago e quem registrou.
- **Exemplo:** a baixa foi registrada com data 15/01 em vez de 15/10, ou na
  conta errada. Quem aprova não vê nada disso e aprova; o lançamento sai com a
  data e a conta erradas.
- **Onde:** `listarBaixasPendentes` (`src/server/services/baixa.ts`) já traz
  `contaBancaria` e a parcela; a tela não usa.
- **Impacto:** controle. A segregação de funções (quem registra não aprova)
  perde o sentido se o aprovador não pode conferir.
- **Caminhos:** mostrar na linha data, conta bancária, número da parcela/total
  de parcelas, valor da parcela, juros, multa e desconto, e o tipo
  (pagamento/recebimento); ou um detalhe expansível. Talvez um link para o
  título.
- **Cuidados:** a tela é usada em celular? Tabela larga.
- **Ao corrigir:** dica do passo "Confira o valor com o comprovante" em
  `src/ajuda/aprovacoes/roteiros.ts` (roteiro `aprovar-baixa`) diz que a tela
  não mostra data nem conta; atualizar a réplica (`src/ajuda/aprovacoes/cenas.tsx`)
  com as colunas novas.

### 3. Baixa aprovada não pode ser desfeita (prioridade alta)

- **Status:** feito na branch `feat/estorno-de-baixa` (2026-11-23, spec
  `2026-11-23-estorno-de-baixa-design.md`): "Estornar" na lista de baixas da
  parcela (Administrador e Tesouraria, com motivo e a mesma segregação da
  aprovação); a baixa fica ESTORNADO, o lançamento é apagado e a parcela,
  recalculada; lançamento conciliado e baixa de repasse bloqueiam; ajuda com o
  roteiro novo `estornar-baixa`.

- **Problema:** não existe estorno de baixa. `efetivarBaixa`
  (`src/server/services/baixa.ts`) aprova, recalcula a parcela e cria o
  `LancamentoBancario`; nada desfaz isso. O lançamento também não pode ser
  excluído (ver item 6).
- **Exemplo:** aprovou a baixa de R$ 1.012,00 na conta errada. A conta certa
  nunca recebe a saída, a errada fica com uma saída que o banco não tem, e a
  diferença aparece na Tesouraria e na Conciliação sem solução.
- **Impacto:** dado errado sem correção pelo sistema.
- **Caminhos:** um "Estornar baixa" auditado, com motivo, que: marca a baixa
  como estornada (status novo, não apaga), remove ou contra-lança o lançamento,
  recalcula a parcela. Quem pode: Administrador e Tesouraria? Segregação
  também no estorno?
- **Cuidados:** lançamento já conciliado (exigir desconciliar antes, como em
  Repasses de cartão, ou estornar com contra-lançamento); baixas criadas por
  venda à vista e por repasse de cartão (têm fluxo próprio de desfazer: cancelar
  pedido e Desfazer repasse); relatórios que somam baixas aprovadas;
  reclassificação fiscal do título que já mexe nos lançamentos da baixa.
- **Ao corrigir:** `src/ajuda/aprovacoes/roteiros.ts`: dica do passo "Confira o
  valor com o comprovante" e "E depois?" do `aprovar-baixa` ("A aprovação não
  pode ser desfeita"); criar roteiro de estorno onde a ação ficar (Contas a
  pagar/receber?); manual, seção 3.2.

### 4. Parcela com baixa pendente aceita outra baixa (prioridade alta)

- **Status:** feito na branch `fix/baixa-pendente-unica` (2026-11-24, spec
  `2026-11-24-baixa-pendente-unica-design.md`): uma baixa pendente por parcela
  (trava com `FOR UPDATE`, API 409), baixa só em parcela em aberto; a parcela
  mostra a pendente e "Baixa aguardando aprovação" no lugar do Baixar; ajuda de
  Aprovações sem o exemplo de baixa em dobro.
- **Problema:** o botão Baixar continua na parcela enquanto a baixa espera
  aprovação, e `registrarBaixa` (`src/server/services/baixa.ts`) não olha as
  baixas pendentes.
- **Exemplo:** Maria registra a baixa da parcela 1 na segunda; na terça, sem
  ver aprovação, registra de novo. As duas vão para Aprovações pendentes, e se o
  aprovador aprovar as duas, a saída é lançada em dobro.
- **Impacto:** dado errado (pagamento em dobro no sistema), pego só se o
  aprovador perceber.
- **Caminhos:** impedir nova baixa enquanto houver pendente na parcela; ou
  avisar ("já existe baixa pendente de R$ X registrada por Y em Z") e exigir
  confirmação; mostrar na parcela um selo "baixa pendente".
- **Cuidados:** pagamento parcial legítimo (duas baixas parciais seguidas);
  soma das pendentes + pagas não pode passar do valor da parcela?
- **Ao corrigir:** `src/ajuda/aprovacoes/roteiros.ts`, "Quando usar" do
  `rejeitar-baixa` ("a parcela continua com o botão Baixar..."); roteiros de
  baixa de Contas a pagar/receber, se a regra mudar o que o usuário vê.

### 5. Rejeição não chega a quem registrou (prioridade alta)

- **Status:** feito na branch `feat/rejeicao-visivel` (2026-11-25, spec
  `2026-11-25-rejeicao-visivel-design.md`): a parcela mostra a baixa rejeitada com motivo, quem e quando; Contas a
  pagar/receber tem o aviso "N baixas rejeitadas aguardando novo registro" com o filtro `rejeitadas=1`; a rejeição
  sai do aviso ao relançar, ao fechar a parcela ou pelo Dispensar (com motivo e auditoria); ajuda com o roteiro
  novo `tratar-rejeitada`.

- **Problema:** `rejeitarBaixa` grava `motivoRejeicao`, mas ele só aparece na
  Auditoria, que o perfil Financeiro não acessa. A parcela não mostra que houve
  baixa rejeitada.
- **Exemplo:** a Tesouraria rejeita "valor diferente do comprovante". Maria
  (Financeiro) não sabe; a parcela continua em aberto e ninguém relança.
- **Impacto:** controle; pagamento real fica sem registro no sistema.
- **Caminhos:** mostrar na parcela as baixas rejeitadas com motivo, quem e
  quando; aviso no painel de quem registrou; filtro de baixas rejeitadas.
- **Cuidados:** não poluir a parcela com rejeições antigas já resolvidas.
- **Ao corrigir:** dica do passo "Clique em Rejeitar" no `rejeitar-baixa`
  (`src/ajuda/aprovacoes/roteiros.ts`): manda avisar a pessoa por fora.

### 10. Transferências entre contas inflam entradas e saídas

- **Status:** feito na branch `fix/transferencias-fora-das-somas` (2026-11-26,
  spec e plano `2026-11-26-transferencias-fora-das-somas*`): transferências
  fora de entradas e saídas no realizado (coluna Transferências), no
  dashboard (gráfico e geração do mês), no ano-base do estratégico e no fluxo
  por dimensão; saldos continuam com elas.
- **Problema:** a transferência gera uma SAIDA e uma ENTRADA
  (`criarTransferencia`, origem TRANSFERENCIA). Na visão "Todos", as somas por
  tipo não tiram essas duas pernas: o dinheiro que só trocou de conta aparece
  como entrada e como saída. Com o filtro Fiscal/Gerencial elas saem, porque a
  transferência não tem classificação.
- **Exemplo:** o saque de R$ 2.000,00 do banco para o Caixa soma R$ 2.000,00 em
  Entradas e R$ 2.000,00 em Saídas no mês. A geração líquida não muda, mas os
  totais sobem. Uma aplicação financeira mensal de R$ 50.000,00 indo e voltando
  dobra os totais do mês.
- **Onde e impacto, tela por tela:**
  - Fluxo de caixa realizado (`listarFluxoDeCaixaRealizado`,
    `fluxoDeCaixa.ts`): colunas Entradas e Saídas infladas; saldos e geração
    corretos.
  - **Fluxo de caixa estratégico** (`buscarAnoBaseConsolidado` em
    `fluxoDeCaixaEstrategico.ts`): a soma das entradas dos últimos 12 meses vira
    `receitaBase` e a das saídas, `custoBase`. A projeção aplica crescimentos
    diferentes à receita e ao custo, calcula capex como % da receita e a margem
    como geração ÷ receita. Com a transferência dentro das duas bases, **a
    projeção dos 5 anos sai errada** (não só os totais): é o efeito mais sério.
  - Dashboard executivo (`dashboardExecutivo.ts`): gráfico entradas × saídas
    dos 6 meses inflado; a geração de caixa do mês fica certa.
  - Fluxo por dimensão (`fluxoDeCaixaPorDimensao.ts`): as pernas da
    transferência caem no grupo "sem dimensão", inflando entradas e saídas dele.
  - Orçamento (`buscarRealizadoPorCategoria`) e relatório fiscal × gerencial
    não são afetados: o primeiro ignora lançamento sem categoria, o segundo
    exige classificação.
- **Caminhos:** excluir `origem: "TRANSFERENCIA"` das somas de entradas e
  saídas, mantendo-as no saldo (o saldo por conta precisa delas); ou mostrar
  uma linha/coluna "Transferências entre contas" separada; no estratégico,
  basear receita e custo só em lançamentos com categoria de receita/despesa.
- **Cuidados:** o saldo final de cada período tem de continuar batendo com o
  banco; transferência para conta de outra filial (hoje não existe, só mesma
  filial); conta inativa num dos lados. Família próxima, para avaliar junto:
  outras entradas que não são receita (empréstimo recebido, aporte de sócio)
  também entram na `receitaBase` do estratégico se lançadas como entrada
  avulsa sem categoria de receita.
- **Ao corrigir:** dica do passo "Entradas e Saídas" do roteiro `ler-fluxo` em
  `src/ajuda/fluxo-de-caixa/roteiros.ts`; manual, seções 3.5 e 3.7; a ajuda do
  fluxo estratégico, quando existir; na ajuda do Fluxo por dimensão
  (`src/ajuda/fluxo-por-dimensao/`), o passo "Não classificado" (o saque
  aparece como entrada e saída) e os números do exemplo (`exemplo.ts`).

### 12. Manual: tabela de status da Conciliação incompleta

- **Status:** descartado em 2026-11-21: o Passo a passo foi aposentado, e os
  6 status estão no roteiro `entender-status` da ajuda da Conciliação.
- **Problema:** o Passo a passo, seção 3.4, lista 3 status (Conciliado,
  Sugestão, Não conciliado); a tela tem 6 (mais Divergência de valor,
  Divergência de data e Duplicado). A descrição de Sugestão também está
  imprecisa ("Criar lançamento" não resolve sugestão).
- **Caminhos:** reescrever a tabela com os 6 status e a regra do automático
  (mesmo valor, mesmo sentido, até 3 dias, um só candidato), como na ajuda
  (roteiro `entender-status`).

### 13. Baixa aprovada e não conciliada some da projeção

- **Status:** feito na branch `fix/projecao-aguardando-conciliacao` (2026-11-25, spec
  e plano `2026-11-25-projecao-aguardando-conciliacao*`): linha "Aguardando
  conciliação" no projetado (saldo conciliado → saldo contábil); Caixa
  disponível do dashboard é o contábil; saldo projetado em 30 dias igual à
  tela (com atrasados); estratégico parte do contábil.

- **Problema:** a projeção parte do saldo em caixa **conciliado**
  (`buscarSaldoEmCaixaAte`, que só soma lançamentos com `conciliado: true`),
  mas cada parcela entra pelo que falta pagar depois das baixas **aprovadas**
  (`saldoRemanescenteParcela` em `fluxoDeCaixaProjetado.ts`). Entre a
  aprovação e a conciliação, o pagamento não está em nenhum dos dois lados.
- **Exemplo:** a parcela de R$ 1.012,00 do adubo é paga e aprovada em 19/11; o
  extrato só é conciliado na semana seguinte. Nesse meio tempo, o saldo de
  partida ainda tem os R$ 1.012,00 (o lançamento não está conciliado) e a
  parcela já não aparece como saída. A projeção fica R$ 1.012,00 otimista. No
  recebimento acontece o contrário: a projeção fica pessimista.
- **Onde mais:** o "saldo projetado em 30 dias" do Dashboard executivo
  (`dashboardExecutivo.ts`) faz a mesma conta (caixa conciliado + parcelas em
  aberto). Ele também ignora as parcelas em atraso, que a tela do projetado
  mostra na linha "Em atraso": os dois números não batem entre si.
- **Impacto:** dado errado temporário, do tamanho do que está aprovado e não
  conciliado. Numa filial que concilia uma vez por mês, pode ser o mês inteiro
  de pagamentos.
- **Caminhos:** partir do saldo contábil (todos os lançamentos, conciliados ou
  não), como a Tesouraria; ou somar ao saldo de partida os lançamentos de baixa
  ainda não conciliados; ou mostrar uma linha "Aprovado, aguardando
  conciliação". Alinhar o dashboard com a tela (mesma função, com ou sem
  atrasados, e dizer qual).
- **Cuidados:** o Fluxo de caixa realizado deve continuar só com conciliados
  (é o retrato do banco); conta Caixa já nasce conciliada e não tem o problema;
  lançamentos manuais não conciliados (sem título) também ficam fora hoje.
- **Ao corrigir:** dica do passo "Entradas e saídas projetadas" do roteiro
  `ler-projecao` em `src/ajuda/fluxo-de-caixa-projetado/roteiros.ts` (manda
  conciliar em dia) e o passo "O ponto de partida é o saldo de hoje"; manual,
  seção 3.6 e a seção do Dashboard executivo.

### 59. Cancelar ou renegociar parcela com baixa pendente

- **Status:** feito na branch `fix/parcela-com-baixa-pendente` (2026-11-26, spec
  e plano `2026-11-26-parcela-com-baixa-pendente*`): cancelar e renegociar
  recusam parcela com baixa pendente (e somem da tela); renegociar só parcela
  em aberto; aprovar baixa de parcela cancelada/renegociada é recusado, com
  aviso em Aprovações.

- **Problema:** cancelar a parcela e renegociar não olham as baixas pendentes
  dela.
- **Onde:** `cancelarParcela` em `src/server/services/titulo.ts`;
  `src/server/services/renegociacao.ts`; `aprovarBaixa`/`efetivarBaixa` em
  `src/server/services/baixa.ts`.
- **Exemplo:** a baixa da parcela 1 espera aprovação; alguém cancela a parcela.
  Depois a Tesouraria aprova a baixa: sai o lançamento de uma parcela
  cancelada.
- **Impacto:** dado errado.
- **Caminhos:** bloquear cancelar/renegociar enquanto houver pendente; ou
  rejeitar a pendente junto, com motivo automático; ou recusar a aprovação de
  baixa em parcela fechada.
- **Cuidados:** cancelamento de pedido de venda também cancela parcelas.
- **Ao corrigir:** roteiro `cancelar-parcela` em
  `src/ajuda/contas-a-pagar/roteiros.ts` e
  `src/ajuda/contas-a-receber/roteiros.ts`; roteiro `renegociar`, se a regra
  mudar o que o usuário vê.

### 60. Repasse de cartão trava parcelas sem ordem

- **Status:** feito na branch `fix/parcela-com-baixa-pendente` (2026-11-26):
  `ORDER BY id` no `FOR UPDATE`.

- **Problema:** `confirmarRepasses` (`src/server/services/repasseCartao.ts`,
  ~linha 111) faz `SELECT id FROM parcelas WHERE id IN (...) FOR UPDATE` sem
  `ORDER BY id`.
- **Onde:** `src/server/services/repasseCartao.ts`.
- **Exemplo:** duas confirmações com parcelas em comum, em ordem diferente,
  travam uma a outra (deadlock) e o Postgres aborta uma delas com erro.
- **Impacto:** erro intermitente; nenhum dado errado.
- **Caminhos:** `ORDER BY id` no SELECT.

## Controladoria — lacunas achadas ao escrever a ajuda contextual

Mesmo formato e mesma numeração das lacunas do Financeiro (a numeração
continua, para cada item ter um número único). Prioridade a definir.

### 19. Sem rateio: um título só pode ter um centro de custo

- **Problema:** título e lançamento têm um único `centroCustoId`,
  `centroLucroId`, `safraId` e `projetoId`. Não há rateio (percentual ou valor)
  entre dois ou mais valores da mesma dimensão.
- **Exemplo:** uma nota de diesel de R$ 3.000,00 usada metade na Lavoura e
  metade no Pomar precisa ser lançada como dois títulos, ou fica toda num
  centro de custo só. Energia elétrica da sede e da agroindústria, mesmo caso.
- **Onde:** modelos `Titulo` e `LancamentoBancario` (`prisma/schema.prisma`);
  consultas em `fluxoDeCaixaPorDimensao.ts` e `orcamentoSafra.ts`.
- **Impacto:** a análise por dimensão fica distorcida ou obriga a quebrar
  documentos fiscais em vários títulos (o que atrapalha a conferência com a
  nota).
- **Caminhos:** tabela de rateio por título (dimensão, valor ou %), herdada
  pelo lançamento da baixa; as consultas passam a somar a fração de cada
  rateio. Mais simples: rateio só de centro de custo, que é o caso mais comum.
- **Cuidados:** baixa parcial e juros/desconto precisam seguir a mesma
  proporção; importação de títulos por planilha; exportações; dados
  existentes viram rateio de 100%.
- **Ao corrigir:** observação do índice da ajuda
  (`src/ajuda/fluxo-por-dimensao/index.ts`) e os campos de dimensão das cenas
  de títulos (`src/ajuda/_titulos/`).

### 20. Status de safra e projeto aparece como código (EM_ANDAMENTO)

- **Feito (2026-11-21), na branch da ajuda de Safras e Projetos:** o rótulo
  foi para `ROTULOS_STATUS_SAFRA_PROJETO` (`src/lib/schemas/enums.ts`) e é
  usado nas listas e nos formulários de Safras e Projetos, na Comparação entre
  safras e na sua exportação. A ajuda da Comparação (réplica, passo "Status" e
  a frase do `filtrar-exportar`) foi ajustada junto. Histórico.

## Produção — lacunas achadas ao escrever a ajuda contextual

Numeração continua a do Financeiro e da Controladoria. Itens 22 a 25 feitos em 2026-11-27; nada pendente.

## Vendas — lacunas achadas ao escrever a ajuda contextual

Numeração continua a da Produção. Itens 26 e 27 feitos em 2026-11-27; nada pendente.

## Cadastros — lacunas achadas ao escrever a ajuda contextual

Numeração continua a de Vendas.

### 30. CNPJ/CPF repetido no fornecedor mostrava o erro do banco

- **Feito (2026-11-21), na mesma branch da ajuda de Fornecedores:** o
  serviço de fornecedor não usava `comMensagemDeDuplicidade`, e repetir um
  documento mostrava "Unique constraint failed…". Agora, ao criar e ao
  editar, aparece "Já existe um fornecedor com este CPF/CNPJ" (teste em
  `src/server/services/fornecedor.test.ts`). Item mantido só como histórico.

### 32. Saldo inicial das contas bancárias aparecia sem formato

- **Feito (2026-11-21), na mesma branch da ajuda de Contas bancárias:** a
  lista mostrava o Decimal cru (`48000`, `1350.5`); agora mostra em reais
  com `formatarMoeda`. Item mantido só como histórico.

### 33. Código repetido em bancos e centros mostrava o erro do banco de dados

- **Feito (2026-11-21), na branch da ajuda dos cadastros financeiros:**
  banco, centro de custo e centro de lucro não usavam
  `comMensagemDeDuplicidade`; repetir o código mostrava "Unique constraint
  failed…". Agora aparece "Já existe um banco (centro de custo, centro de
  lucro) com este código" (teste em
  `src/server/services/duplicidadeCadastros.test.ts`). Histórico.

### 34. Tipo da categoria aparecia como código (RECEITA, DESPESA)

- **Feito (2026-11-21), na mesma branch:** a lista e o formulário de
  categorias mostram "Receita" e "Despesa" (`ROTULOS_TIPO_CATEGORIA_FINANCEIRA`).
  Histórico. O item 20 (status de safra e projeto como código), o mesmo
  problema em outra tela, também foi feito.

### 37. Código de projeto repetido mostrava o erro do banco de dados

- **Feito (2026-11-21), na branch da ajuda de Safras e Projetos:** o projeto
  não usava `comMensagemDeDuplicidade`; agora aparece "Já existe um projeto
  com este código" (teste em
  `src/server/services/duplicidadeCadastros.test.ts`). Histórico.

### 38. Safra e projeto Encerrados não bloqueiam nada, e a safra pode repetir o nome

- **Problema:** o status (Planejado, Em andamento, Encerrado) só é exibido:
  uma safra ou projeto Encerrado continua aceitando títulos, lançamentos e,
  no caso da safra, recepções. E a safra não tem nome único na filial: dá
  para cadastrar duas "2025/26", que aparecem iguais em todas as listas.
- **Exemplo:** a 2024/25 está Encerrada, mas uma recepção de hoje pode ser
  marcada nela por engano; duas "2026/27" cadastradas por duas pessoas
  dividem os valores sem ninguém perceber.
- **Onde:** `safraSchema`/`projetoSchema` e os serviços de título,
  lançamento e recepção (nenhum lê `status`); `model Safra` em
  `prisma/schema.prisma` (sem `@@unique([filialId, nome])`, o projeto tem
  por código).
- **Impacto:** o status não protege o fechamento da safra; nome repetido
  embaralha a Comparação entre safras e o Fluxo por dimensão.
- **Caminhos:** decidir se Encerrado deve bloquear lançamentos novos (ou só
  avisar, já que uma venda pode chegar depois da colheita); criar o índice
  único de nome da safra por filial (migração, conferindo duplicadas
  existentes) e usar `comMensagemDeDuplicidade`.
- **Ao corrigir:** passo "Informe o nome" de `cadastrar-safra`, passo
  "Confira o status" de `encerrar-safra` e passo "Escolha o status" de
  `cadastrar-projeto` (`src/ajuda/safras`, `projetos`).

## Administração — lacunas achadas ao escrever a ajuda contextual

Mesma numeração das seções acima.

### 40. Administrador podia mudar o próprio perfil

- **Feito (2026-11-21), na branch da ajuda de Usuários:** o serviço já
  recusava desativar o próprio acesso, mas não mudar o próprio perfil: um
  Administrador que se rebaixava perdia a tela Usuários na hora e, se fosse o
  único, a empresa ficava sem administrador. Agora aparece "Você não pode
  mudar seu próprio perfil", e a própria linha mostra o perfil como texto,
  sem o "Desativar" (que antes quebrava a página com o erro do servidor).
  Teste em `src/server/services/usuario.test.ts`. Histórico.

### 41. Administrador podia tirar o próprio acesso à filial ativa

- **Feito (2026-11-21), na mesma branch:** desmarcar a própria Leitura na
  filial em que está mandava a pessoa para "Selecionar filial" (ou de volta
  à escolha de empresa, se não tivesse outra). Agora o serviço recusa ("Você
  não pode remover seu próprio acesso à filial ativa") e a caixinha fica
  travada. Tirar só a Alteração continua permitido. Teste em
  `src/server/services/usuarioEmpresaFilial.test.ts`. Histórico.

### 42. Gerar e revogar chave de API não ficavam na auditoria

- **Feito (2026-11-21), na mesma branch:** uma credencial da API nascia ou
  era revogada sem rastro. Agora as duas ações ficam na Auditoria (entidade
  `ApiKey`, com usuário, nome, prefixo e validade; nunca a chave nem o hash).
  Teste em `src/server/services/apiKey.test.ts`. Histórico.

### 43. Não há troca nem redefinição de senha

- **Problema:** a senha é definida pelo Administrador ao cadastrar o usuário
  e nunca mais muda: a pessoa não troca a própria senha e o Administrador não
  consegue redefinir. Também não há "Esqueci minha senha" no login.
- **Exemplo:** a Joana esquece a senha inicial; a única saída hoje é mexer
  direto no banco de dados. Uma senha que vazou não tem como ser trocada.
- **Onde:** `src/server/services/usuario.ts` (só `criarUsuarioEVincular` grava
  `senhaHash`); a tela de login e a de Usuários.
- **Impacto:** segurança (senha vazada não se troca; a senha inicial é
  conhecida por quem cadastrou) e operação (quem esquece fica sem acesso).
- **Caminhos:** (1) "Minha conta" para a pessoa trocar a própria senha,
  pedindo a atual; (2) "Redefinir senha" na linha de Usuários, gerando uma
  senha temporária com troca obrigatória no próximo login; (3) depois,
  "Esqueci minha senha" por email. Registrar na auditoria sem a senha.
- **Cuidados:** a pessoa pode estar em várias empresas: quem redefine é o
  Administrador de qualquer uma delas? Definir a regra antes.
- **Ao corrigir:** dica do passo "Defina a senha inicial" do roteiro
  `cadastrar-usuario` (`src/ajuda/usuarios/roteiros.ts`) e a seção 8.3 do
  manual.

### 44. Empresas mostrava e alterava as empresas de todos os clientes

- **Feito (2026-11-21), na branch da ajuda de Empresas e Filiais (decisão do
  usuário: "só as minhas"):** `listarEmpresas()` devolvia todas as empresas
  do banco, e editar, inativar e o Tema e marca aceitavam qualquer `id`,
  conferindo só o perfil. O Administrador de qualquer empresa via e alterava
  (ou inativava) as dos outros clientes. Agora tudo passa por
  `empresaAdministrada`: só valem empresas em que a pessoa é Administrador
  com vínculo ativo; as outras dão "Empresa não encontrada" (e 404 na página
  do tema). Criar empresa continua livre: quem cria vira Administrador.
  Teste em `src/server/services/empresaEscopo.test.ts`. Histórico.

### 45. Empresa inativa continuava aberta para quem já estava nela

- **Feito (2026-11-21), na mesma branch:** inativar tirava a empresa de
  "Trocar empresa", mas `requireVinculoAtivo` não olhava se a empresa estava
  ativa: quem já estava dentro, e as chaves de API, continuavam usando. Agora
  a sessão e a API exigem empresa ativa, e ninguém inativa a empresa em que
  está ("Troque de empresa antes de inativar esta"; a linha não mostra
  "Inativar"). Histórico.

### 46. Inativar a filial em que se está tirava a pessoa dela

- **Feito (2026-11-21), na mesma branch:** agora o serviço recusa ("Troque de
  filial antes de inativar esta") e a linha não mostra "Inativar". Histórico.

### 47. CNPJ/CPF repetido em empresa e filial mostrava o erro do banco

- **Feito (2026-11-21), na mesma branch:** "Já existe uma empresa com este
  CNPJ/CPF" e "Já existe uma filial com este CNPJ/CPF". Histórico.

### 50. Rótulo da conta de recebimento citava o cartão

- **Status:** feito na branch `feat/ajuda-configuracao-producao`.
- **Problema:** o campo se chamava "Conta de recebimento (Pix,
  transferência, cartão)", mas a venda na maquininha usa a conta de
  depósito da operadora e nem mostra a escolha de conta no pedido.
- **Correção:** rótulo "Conta de recebimento (Pix e transferência)" em
  `configuracao-producao/configuracao-form.tsx`.

### 52. Mudar os limites da produção muda o passado

- **Problema:** o "Verificar" do balanço de massa e do branqueamento e o
  "vencendo" do estoque não são gravados: são recalculados com a
  configuração atual. Subir a tolerância tira o "Verificar" de OPs já
  encerradas, inclusive no Relatório de processamento e na
  Rastreabilidade.
- **Exemplo:** a OP-261119-01 (acerola, diferença de 10%) marca
  "Verificar" com 3%; com a tolerância em 10%, passa a OK, como se tivesse
  sido conferida.
- **Onde:** `resumirOP`/`balancoMassa`/`statusBranqueamento` em
  `src/lib/producao/op.ts`, chamados com `obterConfiguracaoProducao` em
  `ordemProducao.ts`, `rastreabilidade.ts` e no detalhe da OP.
- **Impacto:** o registro de controle de qualidade de uma OP pode mudar
  depois do fato; a única pista é a Auditoria da configuração.
- **Caminhos:** gravar na OP, ao encerrar, a tolerância e os mínimos usados
  (ou o próprio status) e calcular as OPs encerradas com eles.
- **Ao corrigir:** passo "Mudou algum número?" do roteiro
  `alertas-controles` (`src/ajuda/configuracao-producao/index.tsx`) e a
  seção 8.5 do manual.

### 53. Filtro de datas da Auditoria contava o dia em UTC

- **Status:** feito na branch `feat/ajuda-auditoria`.
- **Problema:** a coluna Data/hora mostra o horário de Brasília, mas o
  filtro "Data de"/"Data até" ia de 00:00 a 23:59 UTC. O que acontecia
  depois das 21h aparecia com o dia certo na tela, mas saía do "até" desse
  dia e entrava no "de" do dia seguinte (também no export).
- **Correção:** `filtroAuditoriaDaUrl` (`auditoria/filtro-auditoria-url.ts`)
  usa o dia de Brasília (UTC-3); o cabeçalho do PDF escreve as datas no
  mesmo fuso.

### 54. Entidade e ação da Auditoria apareciam como código

- **Status:** feito na branch `feat/ajuda-auditoria`.
- **Problema:** filtros, tabela e export mostravam `CategoriaFinanceira`,
  `UsuarioEmpresaFilial`, `CRIAR_LANCAMENTO_E_CONCILIAR`.
- **Correção:** `src/lib/auditoria/rotulos.ts` com os nomes em português
  (código desconhecido aparece como está); os filtros ordenam pelo nome. O
  teste lê `src/server` e falha se uma entidade ou ação nova ficar sem
  rótulo.

### 55. Valor anterior e novo da Auditoria são difíceis de ler

- **Problema:** na tela, os valores aparecem cortados, em JSON, com o nome
  interno do campo (`custoPadraoKg`, `statusAprovacao`) e, nos campos que
  apontam para outro registro, o código dele (`contaBancariaId`,
  `parentId`). Não há como abrir a linha, nem saber qual título ou cliente
  foi alterado: o "ID do registro" só sai no export.
- **Exemplo:** a troca da taxa de débito da Cartões Rurais aparece como
  `{"condicoes":[{"modalidade":"DEBITO",...` cortado; para ver 1,5% → 1,4%
  é preciso exportar e ler o JSON.
- **Onde:** `auditoria/page.tsx` (colunas Valor anterior/novo com
  `truncate`); os nomes de campo vêm de cada `registrarAuditoria`.
- **Impacto:** a tela responde "quem e quando", mas o "o quê" pede export e
  conhecimento técnico; o Auditor (contador) não tem esse conhecimento.
- **Caminhos:** abrir a linha num painel com campo a campo (rótulo em
  português, valores formatados, nome no lugar do código, só o que mudou
  nas listas) e o nome do registro alterado (ex.: "Fruta Açaí"), com link
  para ele.
- **Ao corrigir:** passos "Leia o valor anterior"/"Leia o valor novo" do
  roteiro `quem-alterou` e o passo "Escolha o formato" de `exportar`
  (`src/ajuda/auditoria/index.tsx`), e a seção 8.4 do manual.

## Gestão — lacunas achadas ao escrever a ajuda contextual

Numeração continua a das seções anteriores.

### 56. Inadimplência do Dashboard executivo dependia do status gravado

- **Status:** feito na branch `feat/ajuda-dashboard-executivo`.
- **Problema:** o card somava as parcelas a receber com status `VENCIDO`,
  que só é recalculado quando alguém abre a lista de títulos. Uma parcela
  que venceu ontem ficava fora até alguém abrir Contas a receber, e a
  vencida paga em parte (`PARCIALMENTE_PAGO`) nunca entrava. O aging, na
  mesma tela, já usava a data de vencimento: os dois se contradiziam.
- **Correção:** inadimplência = saldo das parcelas a receber com vencimento
  antes de hoje (`calcularIndicadoresExecutivos` em
  `dashboardExecutivo.ts`, função pura, testada sem banco).

### 57. Dashboard executivo calculava "hoje" e o mês em UTC

- **Status:** feito na branch `feat/ajuda-dashboard-executivo`.
- **Problema:** depois das 21h de Brasília, o dashboard já estava no dia
  seguinte: a parcela que vence hoje virava atrasada no aging e saía das
  obrigações de 7 dias; no último dia do mês, a geração de caixa e o
  fiscal × gerencial passavam ao mês seguinte.
- **Correção:** `diaDeHoje` usa `hojeDeCalendario` (o dia de Brasília),
  como a Produção.

### 58. Gráficos do Dashboard executivo sem formato de moeda

- **Status:** feito na branch `feat/ajuda-dashboard-executivo`.
- **Problema:** eixos e dicas mostravam o número cru (38000), e as faixas do
  aging apareciam como "0-30", sem dizer que são dias de atraso de parcelas
  vencidas. O "% gerencial nas entradas" saía com ponto ("19.0%").
- **Correção:** `dashboard-executivo/formatos.ts` (eixo "38 mil", dica
  "R$ 38.000,00", faixas "1–30 dias" … "Mais de 90 dias", percentual
  "19,0%"); título do aging diz "vencidas, por dias de atraso".

## Interface — formulários

### 65. Erro do servidor apaga o que foi digitado no diálogo

- **Problema:** os diálogos com formulário (`useActionState` e campos não
  controlados, com `defaultValue`) voltam aos valores iniciais depois de
  cada envio, inclusive quando o servidor devolve erro. A mensagem aparece,
  mas os campos que a pessoa mudou se perdem.
- **Exemplo:** no "Editar" de uma entrega entregue, a Rita troca "Recebido
  por" de Rui para Lúcia e a data para 19/11, antes da data do pedido. O erro
  "A entrega não pode ser antes da data do pedido" aparece, e o campo volta a
  "Rui"; ela corrige a data, salva, e o nome errado fica gravado sem ela
  perceber. (Visto ao fazer o item 27, em 2026-11-27.)
- **Onde:** é o reset automático de formulário do React 19 depois de uma
  action; vale para quase todos os diálogos (`use-acao-do-dialogo.ts` e os
  que usam `useActionState` direto).
- **Impacto:** retrabalho e dado errado gravado quando a pessoa não confere
  tudo de novo depois do erro.
- **Caminhos:** a action devolver os valores enviados no estado de erro e o
  formulário usar esses valores como `defaultValue` (com `key` para
  remontar); ou chamar o envio por `onSubmit` com `preventDefault` e
  `startTransition`, que não dispara o reset.
- **Cuidados:** muitos formulários; fazer pelo hook comum e migrar aos
  poucos; selects da Base UI também têm valor inicial.

## Ajuda contextual (spec 2026-11-19-ajuda-contextual)

- **Ajuda com simulação nas demais telas do Financeiro.** Feito (2026-11-20):
  todas as telas do Financeiro têm ajuda (engine em `src/components/ajuda/`,
  conteúdo em `src/ajuda/`, cenas de títulos comuns em `src/ajuda/_titulos/`).
  Item mantido aqui só como histórico; pode ser removido na próxima limpeza.
- **Ajuda com simulação nos outros menus** (Produção, Vendas, Cadastros,
  Controladoria, Administração), depois do Financeiro, na mesma engine.
  Controladoria: Orçamento feito (2026-11-20, 3 roteiros, lacunas 15 a 17);
  Fluxo de caixa por dimensão feito (2026-11-20, 3 roteiros, lacunas 18 e 19);
  Comparação entre safras feita (2026-11-20, 3 roteiros, lacuna 20 e
  atualização do item de sinal do orçado da Fase 5); Fiscal × gerencial feita
  (2026-11-20, 3 roteiros, lacuna 21). **Toda a Controladoria tem ajuda.**
  Produção, na ordem do trabalho (recepção, processamento, estoque, ajustes,
  rastreabilidade, painel, relatórios): Recepção de fruto feita (2026-11-20,
  4 roteiros, lacuna 22); Processamento feito (2026-11-20, 6 roteiros,
  lacuna 23); Estoque feito (2026-11-20, 5 roteiros, lacuna 24); Ajustes de
  estoque feito (2026-11-20, 4 roteiros, lacuna 25); Rastreabilidade feita
  (2026-11-20, 4 roteiros, sem lacuna nova); Painel feito (2026-11-20, 3
  roteiros, sem lacuna nova); Relatório mensal feito (2026-11-20, 3
  roteiros, sem lacuna nova); Relatório de vendas feito (2026-11-20, 3
  roteiros, sem lacuna nova); Relatório de origem feito (2026-11-20, 3
  roteiros, sem lacuna nova); Relatório de processamento feito (2026-11-20,
  3 roteiros, sem lacuna nova). **Toda a Produção tem ajuda.** Vendas:
  Pedidos feito (2026-11-20, 6 roteiros, lacuna 26; a venda na maquininha é
  simulada sem salvar, para não mudar os números de novembro); Entregas feito
  (2026-11-21, 3 roteiros, lacuna 27). **Todo o Vendas tem ajuda.** Cadastros
  (telas ricas sozinhas, as simples em grupos): Clientes feito (2026-11-21,
  4 roteiros, lacunas 28 e 29); Fornecedores feito (2026-11-21, 3 roteiros,
  lacuna 30 já corrigida); Contas bancárias feito (2026-11-21, 3
  roteiros, lacuna 31 e lacuna 32 já corrigida); Produtos feito
  (2026-11-21, 3 roteiros, sem lacuna nova); Operadoras de cartão feito
  (2026-11-21, 3 roteiros, sem lacuna nova). Todas as telas ricas de
  Cadastros têm ajuda. Bancos, Categorias, Centros de custo e Centros de
  lucro feitos (2026-11-21, um grupo só, 7 roteiros; lacunas 33 e 34 já
  corrigidas, 35 e 36 no backlog). Safras e Projetos feitos (2026-11-21,
  3 roteiros; lacunas 20 e 37 corrigidas, 35 ampliada, 38 no backlog).
  Frutas, Talhões, Locais de armazenamento e Insumos feitos (2026-11-21,
  6 roteiros; lacuna 39 no backlog; manual 7.6 atualizado). **Todo o
  Cadastros tem ajuda.** Administração (ordem escolhida pelo usuário:
  Usuários; Empresas + Filiais; Configuração de produção; Auditoria; e o
  Dashboard executivo, da Gestão): Usuários feito (2026-11-21, 4 roteiros;
  lacunas 40 a 42 corrigidas, 43 no backlog). Empresas + Filiais feitos
  (2026-11-21, 3 + 1 roteiros; lacunas 44 a 47 corrigidas, a 44 uma falha de
  isolamento entre clientes; 48 e 49 no backlog). Configuração de produção
  feita (2026-11-21, 3 roteiros; lacuna 50 corrigida, 51 e 52 no backlog;
  manual 8.5 ganhou o card Compra de fruto). Auditoria feita (2026-11-21,
  3 roteiros; lacunas 53 e 54 corrigidas, 55 no backlog). Dashboard
  executivo feito (2026-11-21, 3 roteiros; lacunas 56 a 58 corrigidas).
  **Todas as telas têm ajuda com simulação**, e o Passo a passo foi
  aposentado (item abaixo).
- **Aposentar o Passo a passo.** Feito (2026-11-21, branch
  `feat/aposentar-passo-a-passo`). O manual saiu; o que não tinha tela
  (Introdução, Primeiros acessos e Glossário) foi para a página curta Ajuda →
  Primeiros passos (`content/ajuda/primeiros-passos.md`), e os Perfis apontam
  para a ajuda de Usuários. O endereço antigo redireciona para a página nova
  (`next.config.ts`). Saíram também os links `#ajuda/...` (`src/ajuda/link.ts`
  e o modo link do `BotaoAjuda`). O formato do CSV de títulos já estava no
  próprio diálogo de importação. Achado: o `MarkdownContent` não renderiza
  tabelas (falta `remark-gfm`), então as tabelas do manual saíam como texto
  cru; o glossário virou lista. Item mantido como histórico.
