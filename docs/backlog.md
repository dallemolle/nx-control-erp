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

### 7. Diferença da Tesouraria compara datas diferentes

- **Problema:** o quadro da conta
  (`src/app/(dashboard)/financeiro/tesouraria/page.tsx`) subtrai o último saldo
  informado (de uma data) do saldo contábil com lançamentos de todas as datas
  (`calcularSaldoContabil` em `lancamentoBancario.ts`).
- **Exemplo:** informa o saldo do extrato de 31/10 = R$ 50.000,00 e tudo bate.
  Em 05/11 entra uma baixa de R$ 1.000,00: o quadro passa a mostrar diferença
  de R$ 1.000,00 em vermelho, sem nada errado.
- **Impacto:** dado enganoso; a pessoa procura erro que não existe ou se
  acostuma a ignorar o vermelho.
- **Caminhos:** calcular o saldo contábil até a data do saldo informado;
  mostrar as duas datas no quadro.
- **Cuidados:** saldo contábil inclui lançamentos não conciliados (é o
  esperado aqui, mas explicar); várias contas com datas diferentes.
- **Ao corrigir:** `src/ajuda/tesouraria/roteiros.ts`, roteiro
  `conferir-saldo`: explicação e dica do passo "Informe a data e o saldo do
  extrato" (manda usar o dia mais recente) e o passo "Veja o quadro de cada
  conta".

### 9. Reconciliar pendentes ignora Sugestão, Divergência e Duplicado

- **Problema:** `reconciliarPendentes` (`src/server/services/conciliacao.ts`)
  só reprocessa linhas `NAO_CONCILIADO`.
- **Exemplo:** linha importada como Divergência de valor porque o lançamento
  certo ainda não existia. O lançamento é criado depois; a linha continua
  Divergência e o automático nunca a concilia.
- **Impacto:** status velho e trabalho manual que o sistema poderia fazer.
- **Caminhos:** reprocessar todos os status não conciliados; ou reclassificar
  sem conciliar quando houver mais de um candidato.
- **Cuidados:** não desfazer escolhas que a pessoa já fez; desempenho com
  muitas linhas.
- **Ao corrigir:** dica do passo "Clique em Reconciliar pendentes" no
  `desconciliar` (`src/ajuda/conciliacao/roteiros.ts`).

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

### 11. Lançamento de baixa não diz de qual título é

- **Problema:** `efetivarBaixa` grava a descrição "Baixa aprovada — parcela nº
  N", sem documento nem contraparte.
- **Exemplo:** o depósito da operadora de cartão concilia com quatro
  lançamentos "Baixa aprovada — parcela nº 1" (dois brutos e duas taxas, de
  pedidos diferentes). Na Tesouraria, todas as baixas parecem iguais.
- **Impacto:** conciliação em grupo e leitura da Tesouraria dependem só de
  data e valor; risco de marcar o lançamento errado.
- **Caminhos:** incluir documento e contraparte na descrição (ex.: "NF-e 1234
  · Agro Insumos · parcela 1/3"); ou mostrar o título na lista a partir de
  `baixaId`, sem mexer na descrição gravada.
- **Cuidados:** lançamentos antigos (migrar descrição ou só mostrar o título).
- **Ao corrigir:** dica do passo "Marque os lançamentos que formam o movimento"
  no `conciliar-grupo` (`src/ajuda/conciliacao/roteiros.ts`) e a réplica
  (`src/ajuda/conciliacao/exemplo.ts`, `LANCAMENTOS_DO_DEPOSITO`).

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

### 14. "Margem líquida" do Fluxo estratégico é a margem operacional

- **Problema:** `calcularProjecaoEstrategica`
  (`src/server/services/fluxoDeCaixaEstrategico.ts`) calcula
  `margemLiquida = geracaoOperacional / receita`, ou seja (receita − custo) ÷
  receita. A tela e a exportação mostram isso como "Margem líquida", mas a conta
  não desconta CAPEX nem juros, que a própria tabela mostra logo acima.
- **Exemplo:** no cenário Pessimista da ajuda, o Ano 3 tem geração líquida de
  −R$ 54.190,91 e saldo negativo, mas a "margem líquida" mostra −36,9%, que é só
  a operação; com CAPEX e juros seria bem pior. Num cenário com muita dívida, a
  margem parece estável enquanto o caixa afunda.
- **Impacto:** dado enganoso num indicador de decisão (o nome promete uma coisa
  e a conta faz outra).
- **Caminhos:** renomear para "Margem operacional" (tela, exportação, manual);
  ou mudar a conta para geração líquida ÷ receita (mas a geração líquida inclui
  dívida nova como entrada, o que também distorce); ou mostrar as duas.
- **Cuidados:** a spec do fluxo estratégico (Fase 6) pode ter definido a
  fórmula de propósito: conferir antes; a exportação usa o mesmo rótulo.
- **Ao corrigir:** passo "Margem líquida" do roteiro `ler-projecao` em
  `src/ajuda/fluxo-de-caixa-estrategico/roteiros.ts` (avisa que não desconta
  CAPEX nem juros) e a réplica (`cenas.tsx`, rótulo da métrica); manual, seção 3.7.

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

### 64. Lista da Tesouraria sem paginação, com opções de edição em cada linha

- **Problema:** a lista da Tesouraria carrega todos os lançamentos da filial e,
  desde 2026-11-26, cada linha editável leva para o navegador as listas de
  contas, categorias e dimensões do diálogo de edição (`opcoesDe`).
- **Exemplo:** filial com milhares de lançamentos: o HTML da página repete as
  mesmas listas em cada linha e a página fica pesada.
- **Onde:** `src/app/(dashboard)/financeiro/tesouraria/page.tsx` (`opcoesDe`).
- **Impacto:** lentidão ao abrir a Tesouraria e consumo de memória no
  navegador, crescendo com o número de lançamentos.
- **Caminhos:** paginar ou filtrar a lista por período; mandar as listas uma
  vez só e, por linha, apenas o cadastro inativo que faltar.
- **Cuidados:** saldo e totais da tela dependem da lista completa; ao paginar,
  calcular no servidor. A linha editada precisa seguir mostrando o cadastro
  inativo que ela já usa.
- **Ao corrigir:** conferir se a ajuda da Tesouraria cita a lista inteira.

## Controladoria — lacunas achadas ao escrever a ajuda contextual

Mesmo formato e mesma numeração das lacunas do Financeiro (a numeração
continua, para cada item ter um número único). Prioridade a definir.

### 15. Realizado do Orçamento ignora o sentido do lançamento

- **Problema:** `buscarRealizadoPorCategoria` (`src/server/services/orcamento.ts`)
  soma `lancamento.valor` sem olhar `tipo` (ENTRADA/SAIDA). E o lançamento
  manual da Tesouraria e o avulso da Conciliação deixam escolher qualquer
  categoria em qualquer sentido (a lista não filtra receita/despesa), sem
  validação no serviço.
- **Exemplo:** a Agro Insumos devolve R$ 200,00 de adubo. A tesouraria lança
  uma entrada de R$ 200,00 na categoria Insumos Agrícolas. No Orçamento, o
  realizado de Insumos **sobe** R$ 200,00 em vez de cair, e pode até marcar
  Estouro por causa da devolução.
- **Onde:** `src/server/services/orcamento.ts` (`buscarRealizadoPorCategoria`);
  `src/app/(dashboard)/financeiro/tesouraria/lancamento-dialog-form.tsx` e
  `src/app/(dashboard)/financeiro/conciliacao/campos-lancamento-avulso.tsx`
  (lista de categorias).
- **Impacto:** realizado inflado e estouro falso em qualquer categoria com
  estorno, devolução ou lançamento no sentido "contrário".
- **Caminhos:** somar com sinal conforme o tipo da categoria (saída numa
  despesa soma, entrada numa despesa abate; o inverso para receita); e/ou
  filtrar a lista de categorias pelo sentido do lançamento, deixando a
  devolução como exceção explícita.
- **Cuidados:** o Fluxo por dimensão já separa entradas e saídas
  (`fluxoDeCaixaPorDimensao.ts`); conferir a Comparação entre safras na sessão
  da ajuda dela. Dados já lançados no sentido "errado" mudam de valor quando a
  regra mudar.
- **Ao corrigir:** passo "Realizado" do roteiro `ler-comparativo` em
  `src/ajuda/orcamento/roteiros.ts`, se a regra virar "com sinal"; manual,
  seção 4.1.

### 16. Variação e Estouro do Orçamento medem coisas diferentes

- **Problema:** em `montarLinhaComparativo`, a Variação (e a Variação %) é
  realizado − orçado, mas o alerta de Estouro é realizado + projetado > orçado.
  O selo "Estouro" aparece dentro da célula da Variação.
- **Exemplo:** na ajuda, Insumos Agrícolas em novembro: orçado R$ 1.500,00,
  realizado R$ 800,00, projetado R$ 1.000,00. A célula mostra "−R$ 700,00
  Estouro" e −46.7%: o número diz "sobrou" e o selo diz "estourou".
- **Onde:** `src/server/services/orcamento.ts` (`montarLinhaComparativo`),
  `src/app/(dashboard)/controladoria/orcamento/page.tsx` e a exportação
  (`orcamento/export/route.ts`, colunas Variação e Estouro).
- **Impacto:** leitura confusa justamente no indicador principal da tela; quem
  olha só a variação acha que está dentro do orçado.
- **Caminhos:** mostrar uma coluna "Previsto" (realizado + projetado) e a
  variação sobre ela; ou manter a variação do realizado e levar o selo para
  uma coluna própria ("Situação"); ou as duas variações lado a lado.
- **Cuidados:** a Comparação entre safras usa a mesma variação (só o
  realizado), mas não tem alerta de estouro (`orcamentoSafra.ts`): decidir a
  regra para as duas telas juntas. Testes de `orcamento.test.ts` fixam a regra
  atual.
- **Ao corrigir:** dica do passo "Linha vermelha com Estouro" do roteiro
  `ler-comparativo` (explica a diferença) e a réplica
  (`src/ajuda/orcamento/cenas.tsx`, colunas); manual, seção 4.1 (frase "mesmo
  que a variação... ainda seja negativa").

### 17. Grade do Orçamento: sem meses, sem confirmação e fácil de errar

- **Problema:** na grade "Valores orçados", (a) os 12 campos não têm o nome do
  mês; (b) ao rolar para o lado, o nome da categoria some; (c) o Salvar não
  mostra "salvo" (`state.sucesso` do `LinhaOrcamentoForm` não é usado); (d)
  campo numérico aceita "1.500", que é lido como R$ 1,50 sem aviso; (e)
  receita e despesa aparecem misturadas, sem indicar o tipo; (f) a Variação %
  sai com ponto ("17.5%"), fora do padrão brasileiro do resto da tela.
- **Exemplo:** para orçar novembro, o usuário conta 11 campos a partir da
  esquerda; se errar, grava outubro, e nada na tela confirma o que foi salvo.
- **Onde:** `src/app/(dashboard)/controladoria/orcamento/linha-orcamento-form.tsx`
  e `page.tsx`.
- **Impacto:** erro de digitação silencioso no orçamento, que alimenta o
  estouro e as decisões do mês.
- **Caminhos:** cabeçalho com os meses (Jan…Dez) e coluna do nome fixa
  (`sticky`); mensagem "Salvo" na linha; campo de moeda como nos títulos
  (vírgula decimal, sem ambiguidade de ponto); agrupar por Receita/Despesa;
  formatar a Variação % com vírgula.
- **Cuidados:** a grade rola na horizontal no celular (comentário no
  `page.tsx`); manter. A Comparação entre safras tem um formulário parecido
  (`comparacao-safras/linha-safra-form.tsx`), com os mesmos problemas (c), (d)
  e (f): corrigir junto, e ajustar o roteiro `orcar-safra` (dica do ponto de
  milhar, "E depois?" sem mensagem de salvo) e o `comparar-safras` ("-17.5%",
  "9.1%").
- **Ao corrigir:** roteiro `orcar-ano` (dica "A grade não mostra o nome dos
  meses", explicação do valor com ponto e a dica do ponto de milhar, texto do
  "E depois?" sobre não haver mensagem de salvo), passo da Venda de produtos
  ("17.5%") e o teste `roteiros.test.ts`; a réplica em `cenas.tsx`.

### 18. Fluxo por dimensão sem total e sem aviso de visão filtrada

- **Problema:** a tabela de `controladoria/fluxo-por-dimensao/page.tsx` (e a
  exportação) não tem linha de total, e a coluna "Saldo" é entradas − saídas
  do mês (realizado + projetado), não um saldo. Com o filtro Fiscal/Gerencial,
  a tela não mostra o aviso de visão filtrada que as telas de fluxo do
  Financeiro mostram (`AvisoVisaoFiltrada`).
- **Exemplo:** para conferir com o Fluxo de caixa de novembro, o usuário
  precisa somar as linhas à mão (na ajuda, R$ 24.774,10 no total). Com
  "Fiscal" selecionado, o saque e o recibo somem sem nenhum aviso na tela.
- **Onde:** `src/app/(dashboard)/controladoria/fluxo-por-dimensao/page.tsx` e
  `export/route.ts`.
- **Impacto:** relatório difícil de conciliar com os outros fluxos; "Saldo"
  pode ser lido como saldo bancário da área.
- **Caminhos:** linha de total no fim (tela e exportação); renomear "Saldo"
  para "Resultado do mês" ou "Líquido"; mostrar o aviso de visão filtrada
  (reaproveitar o componente do Financeiro, ajustando o texto).
- **Cuidados:** com a lacuna 10 aberta, o total soma as duas pernas das
  transferências em entradas e saídas (o líquido fica certo).
- **Ao corrigir:** roteiro `ler-por-dimensao` (passo "Saldo" e o "E depois?"
  que manda somar as linhas) e o passo "Veja o que mudou" do
  `filtrar-exportar`, que avisa que não há aviso; a réplica em
  `src/ajuda/fluxo-por-dimensao/cenas.tsx`.

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

### 21. Pendência fiscal: o link não abre o título

- **Problema:** em "Pendências fiscais" (`controladoria/fiscal-gerencial/
  page.tsx`), o link do documento abre Contas a pagar/receber filtrada só pelo
  parceiro e pela classificação Fiscal. O usuário ainda precisa achar o
  título na lista, abrir a linha para anexar e clicar em Editar para completar
  os dados.
- **Exemplo:** a Agro Insumos tem 20 notas fiscais no ano; para completar a
  chave da NF-e 2210, o link mostra as 20 e o usuário procura a certa.
- **Onde:** `page.tsx` (montagem do `href`); as listas de títulos em
  `src/app/(dashboard)/financeiro/_titulos/` não têm hoje um parâmetro para
  abrir um título específico.
- **Impacto:** a tela que existe para resolver pendências torna a resolução
  trabalhosa justamente para os parceiros com mais notas.
- **Caminhos:** aceitar `?titulo=<id>` nas listas (filtrar por ele e abrir a
  linha já expandida, com Anexos visível); ou abrir o formulário de edição
  direto da tela de pendências.
- **Cuidados:** permissão (quem só lê pode ver a pendência, mas não editar);
  o filtro de busca da lista não deve ficar "preso" no título depois.
- **Ao corrigir:** passo "Clique no documento" do roteiro `pendencias` em
  `src/ajuda/fiscal-gerencial/roteiros.ts` (diz que o link não abre o título
  direto).

## Produção — lacunas achadas ao escrever a ajuda contextual

Numeração continua a do Financeiro e da Controladoria.

### 22. Romaneio corrigido na recepção não chega à conta a pagar

- **Problema:** na criação, o "Romaneio / NF" da recepção vira o documento da
  conta a pagar (ou `RF-<lote>`, se vazio). O "Editar" da recepção muda o
  romaneio só na recepção (`atualizarDadosRecepcao`); o título continua com o
  documento antigo, sem aviso.
- **Exemplo:** o José da Silva entrega açaí sem romaneio; a conta nasce como
  "RF-FA-261120-01". No dia seguinte o romaneio 152 chega e é lançado pelo
  Editar: a recepção mostra 152, Contas a pagar continua "RF-FA-261120-01".
- **Onde:** `src/server/services/recepcaoFruto.ts` (`atualizarDadosRecepcao`);
  o formulário em `producao/recepcao/recepcao-acoes.tsx`.
- **Impacto:** o financeiro procura o pagamento pelo romaneio e não acha; os
  dois registros da mesma carga discordam.
- **Caminhos:** ao editar o romaneio, atualizar também o documento do título
  enquanto ele não tiver baixa (e registrar na auditoria); ou avisar no
  diálogo que o título precisa ser editado em Contas a pagar.
- **Cuidados:** título com baixa ou já conciliado; título com documento já
  mudado à mão em Contas a pagar (não sobrescrever sem perguntar).
- **Ao corrigir:** passo "Corrija e salve" do roteiro `corrigir-excluir` em
  `src/ajuda/recepcao/roteiros.ts` (diz que o documento da conta não muda).

### 23. Aba Processo da OP perde o que não foi salvo, sem aviso

- **Problema:** na OP, a aba Processo (branqueamento, água, caroço, perda,
  observação) só grava com "Salvar processo". As abas são links: trocar de
  aba, ou sair da tela, descarta o que foi digitado, sem aviso.
- **Exemplo:** a operadora digita 85 °C, 10 s, 400 L, 450 kg e 20 kg e clica
  em "Produção" para conferir a polpa; volta e os campos estão como antes. O
  balanço continua "Verificar" e ela não sabe por quê.
- **Onde:** `producao/processamento/[numero]/processo-form.tsx` e as abas em
  `[numero]/page.tsx`.
- **Impacto:** retrabalho e OP encerrada com "Verificar" confirmado por
  engano (a confirmação parece só burocracia quando o número "foi digitado").
- **Caminhos:** avisar ao sair com alterações não salvas (o editor de tema já
  faz isso com `beforeunload`; as abas precisam de um aviso próprio, porque são
  navegação do Next); ou salvar ao sair do campo.
- **Cuidados:** não salvar sozinho valores parciais que mudem o status de
  "Verificar" sem a pessoa ver; OP encerrada não tem formulário.
- **Ao corrigir:** dica do passo "Salvar processo" do roteiro
  `insumos-processo` em `src/ajuda/processamento/roteiros.ts`.

### 24. Estoque: data de referência não mostra o estoque de outro dia

- **Problema:** a "Data de referência" do Estoque muda só a conta dos dias e
  do status (OK, Vencendo, Vencido). O saldo é sempre o atual. O manual dizia
  que ela mostrava "como estava (ou estará) o estoque em outro dia" (texto
  corrigido em 2026-11-20).
- **Exemplo:** um lote de 300 kg vendido inteiro ontem; com a data de
  referência de anteontem, ele não aparece (está zerado), e os cartões não
  contam esses 300 kg.
- **Onde:** `src/server/services/estoque.ts` (`listarLotes` e
  `resumoPorStatus` leem `saldoKg` do lote); `producao/estoque/page.tsx`.
- **Impacto:** quem precisa do estoque de fim de mês (inventário,
  contabilidade) não tem como tirar depois do dia; e quem confia no rótulo
  pode tomar a foto atual por histórica.
- **Caminhos:** calcular o saldo na data somando os movimentos até ela (a
  tabela de movimentos já existe), com valor a custo na data; ou renomear o
  campo para "Calcular vencimento em" e criar uma posição de estoque por data
  no Relatório mensal.
- **Cuidados:** lotes filhos de transferência, estornos e OPs reabertas
  (custo do lote muda); desempenho com muitos movimentos.
- **Ao corrigir:** dica do passo "Mude a data de referência" do roteiro
  `filtrar-referencia` em `src/ajuda/estoque/roteiros.ts` (o Passo a passo,
  que também citava o campo, foi aposentado em 2026-11-21).

### 25. Ajuste de estoque errado não tem estorno

- **Problema:** ajuste lançado não pode ser editado nem excluído. Para
  corrigir, é preciso lançar o ajuste contrário, com motivo "Outro" ou
  "Inventário", sem nenhum vínculo com o ajuste errado.
- **Exemplo:** a Maria lança saída de 10 kg no AMC-261120-01 quando era no
  AMC-261118-01. A lista passa a ter três linhas (a errada, a entrada que a
  desfaz e a certa) e o filtro por motivo mostra "perdas" que não existiram.
- **Onde:** `src/server/services/ajusteEstoque.ts` (só `criarAjuste`);
  `producao/ajustes/page.tsx` (lista sem ações).
- **Impacto:** relatório de perdas inflado e histórico difícil de ler. Pior:
  o ajuste conta como movimento do lote mesmo desfeito, então a recepção
  daquele lote não pode mais ser excluída e a OP da polpa não pode mais ser
  reaberta nem cancelada.
- **Caminhos:** "Estornar" no ajuste (com motivo, gera o movimento contrário
  ligado ao original e some dos totais de perda); ou excluir ajuste do mesmo
  dia, enquanto o lote não teve outro movimento depois.
- **Cuidados:** saldo não pode ficar negativo ao estornar uma entrada;
  auditoria; a regra de "lote com movimento" da recepção e da OP deveria
  ignorar o par ajuste/estorno.
- **Ao corrigir:** roteiro `corrigir-ajuste` em
  `src/ajuda/ajustes/roteiros.ts` (ensina o ajuste contrário) e o "E depois?"
  dele.

## Vendas — lacunas achadas ao escrever a ajuda contextual

Numeração continua a da Produção.

### 26. Lista de lotes do pedido não diz qual vencido está liberado

- **Problema:** no Novo pedido, todo lote com validade anterior à data do
  pedido aparece com "· VENCIDO", liberado pelo gestor ou não. Só depois de
  escolher o lote o formulário diz "Liberado até ..." ou "Lote vencido: peça a
  liberação ao gestor".
- **Exemplo:** em 21/11 a lista mostra FC-261117-01 e AMR-261118-01, os dois
  "VENCIDO". O FC foi liberado até 21/11 e pode sair; o AMR não. A vendedora
  precisa escolher cada um para descobrir.
- **Onde:** rótulo do lote em `vendas/pedidos/novo/pedido-form.tsx` (o
  `liberadoAte` já chega em `opcoes.lotes`).
- **Impacto:** tentativa e erro no balcão; e lote liberado (que o gestor quer
  escoar primeiro) parece proibido e fica para trás.
- **Caminhos:** mostrar "· VENCIDO · liberado até dd/mm" quando a liberação
  cobre a data do pedido; ou separar os vencidos não liberados no fim da lista
  (ou escondê-los).
- **Cuidados:** a liberação vale pela data do pedido, que pode ser mudada
  depois de escolher o lote (o rótulo tem de acompanhar a data).
- **Ao corrigir:** passos "Lote vencido não sai" e "A não ser que o gestor
  tenha liberado" do roteiro `lancar-a-vista` em
  `src/ajuda/pedidos/roteiros.ts` e a cena `CenaLotes` em
  `src/ajuda/pedidos/cenas.tsx`.

### 27. Entrega marcada como entregue não pode ser corrigida

- **Problema:** depois de "Entregue", o botão some e o "Editar" só muda data
  prevista, endereço, responsável e observação. A data da entrega e o
  "Recebido por" ficam como foram lançados, e a entrega não volta para Em
  rota. O serviço (`atualizarEntrega`) já aceita esses campos e o status; falta
  a tela.
- **Exemplo:** a Rita marca o 131 como entregue em 23/11, recebido pelo Rui,
  mas quem recebeu foi a Lúcia, no dia 24 — ou clicou no pedido errado. Não há
  como corrigir pela tela; o atraso e o nome ficam errados para sempre.
- **Onde:** `vendas/_shared/entrega-acoes.tsx` (`EditarEntrega` e a regra que
  esconde `MarcarEntregue`).
- **Impacto:** atraso de entrega (e o alerta do Painel) e o comprovante de
  quem recebeu ficam errados; a única saída é cancelar o pedido inteiro e
  lançar de novo, o que desfaz estoque e financeiro sem motivo.
- **Caminhos:** no "Editar" de entrega entregue, mostrar "Entregue em" e
  "Recebido por"; e um "Desfazer entrega" que volta para Em rota (com
  auditoria, que já é registrada).
- **Cuidados:** a data de entrega não pode ficar antes da data do pedido;
  limitar o desfazer a quem pode cancelar pedido, se o usuário preferir.
- **Ao corrigir:** dica do passo "Clique em “Confirmar entrega”" do roteiro
  `confirmar-entrega` em `src/ajuda/entregas/roteiros.ts`.

## Cadastros — lacunas achadas ao escrever a ajuda contextual

Numeração continua a de Vendas.

### 28. Cliente e fornecedor inativos continuam nos títulos

- **Problema:** inativar um cliente tira ele do Novo pedido (a tela e o
  serviço filtram `ativo`), mas o Contas a receber continua oferecendo o
  cliente inativo e aceita lançar título para ele. O mesmo vale para
  fornecedor inativo no Contas a pagar.
- **Exemplo:** a Lanchonete Tucumã fechou e foi inativada; ela some do Novo
  pedido, mas aparece na escolha do cliente de uma conta a receber nova.
- **Onde:** `financeiro/contas-a-receber/page.tsx` e
  `financeiro/contas-a-pagar/page.tsx` (usam `listarClientes` e
  `listarFornecedores`, sem filtro) e `validarReferenciasDoTitulo` em
  `src/server/services/titulo.ts` (não confere `ativo`).
- **Impacto:** o inativar não faz o que promete fora de Vendas; título novo
  para quem não deveria mais comprar nem fornecer.
- **Caminhos:** oferecer só os ativos no título novo e recusar inativo no
  serviço; na edição, manter o já escolhido mesmo inativo.
- **Cuidados:** a lista do cadastro, os filtros e os relatórios continuam
  mostrando os inativos; a operadora de cartão usa cliente e fornecedor pelo
  CNPJ (a seção 7.7 do manual já pede reativar antes).
- **Ao corrigir:** dica do passo "Confira o status" do roteiro
  `inativar-cliente` em `src/ajuda/clientes/roteiros.ts`.

### 29. Dados bancários do cliente e do fornecedor não aparecem em nenhuma tela

- **Problema:** o cadastro guarda Pix (tipo e chave) ou depósito (banco,
  agência, conta, tipo e titular), mas nenhuma outra tela mostra esses dados:
  nem a lista do cadastro, nem o título, nem a baixa. Para ver, só abrindo o
  "Editar" do cadastro.
- **Exemplo:** para pagar o José da Silva, a tesouraria abre o título, não
  acha a chave Pix e tem de ir a Cadastros → Fornecedores → Editar.
- **Onde:** `meioPagamento`, `chavePix` e os demais só são lidos em
  `cadastros/clientes/` e `cadastros/fornecedores/` (formulário e serviço).
- **Impacto:** o dado existe mas não ajuda na hora de pagar; risco de pagar
  na conta errada copiando de outro lugar.
- **Caminhos:** mostrar os dados bancários do fornecedor no título a pagar e
  na baixa (e os do cliente no título a receber, para devolução);
  opcionalmente uma coluna na lista do cadastro.
- **Ao corrigir:** passo "Dados bancários: opcionais" do roteiro
  `cadastrar-cliente` e passo "A lista não muda" do `editar-cliente` em
  `src/ajuda/clientes/roteiros.ts`.

### 30. CNPJ/CPF repetido no fornecedor mostrava o erro do banco

- **Feito (2026-11-21), na mesma branch da ajuda de Fornecedores:** o
  serviço de fornecedor não usava `comMensagemDeDuplicidade`, e repetir um
  documento mostrava "Unique constraint failed…". Agora, ao criar e ao
  editar, aparece "Já existe um fornecedor com este CPF/CNPJ" (teste em
  `src/server/services/fornecedor.test.ts`). Item mantido só como histórico.

### 31. Conta bancária inativa: some do Fluxo (até no passado) e continua nos títulos

- **Problema:** inativar uma conta tira o saldo inicial e todos os
  lançamentos dela da Tesouraria e do Fluxo de caixa, também nos meses
  passados, sem aviso e mesmo com saldo diferente de zero. E o Contas a
  pagar e o Contas a receber continuam oferecendo a conta inativa (conta
  prevista e baixa): o que for lançado nela fica fora da Tesouraria e do
  Fluxo.
- **Exemplo:** a conta do Santander começou 2026 com R$ 1.500 e foi zerada
  por transferência em outubro. Inativada, o Fluxo de caixa de janeiro a
  setembro perde R$ 1.500. Se uma baixa cair nela por engano, o dinheiro
  "some".
- **Onde:** `buscarSaldoEmCaixaAteDasFiliais` em
  `src/server/services/fluxoDeCaixa.ts` e `listarResumoContas` em
  `lancamentoBancario.ts` (filtram `ativo`); `contas-a-pagar/page.tsx` e
  `contas-a-receber/page.tsx` (usam `listarContasBancarias` sem filtro);
  `definirAtivoContaBancaria` em `contaBancaria.ts` (não confere saldo).
- **Impacto:** o Fluxo de caixa de meses fechados muda depois do fato; e
  dinheiro lançado em conta inativa não aparece em nenhum saldo.
- **Caminhos:** recusar inativar conta com saldo contábil diferente de zero
  (ou pedir confirmação mostrando o saldo); no Fluxo, contar a conta inativa
  até a data em que foi inativada; oferecer só contas ativas no título novo
  e na baixa, e recusar no serviço.
- **Ao corrigir:** dica do passo "Confira o status" do roteiro
  `corrigir-inativar` em `src/ajuda/contas-bancarias/roteiros.ts`.

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

### 35. Categoria, centros, safra e projeto inativos continuam nos títulos (e a categoria, na Tesouraria)

- **Problema:** inativar uma categoria tira ela do Orçamento e da operadora
  de cartão; inativar um centro de custo ou de lucro, uma safra ou um projeto
  tira ele da Tesouraria e da Conciliação (a safra sai também da Recepção).
  Mas o Contas a pagar e o Contas a receber continuam oferecendo todos, e a
  Tesouraria continua oferecendo a categoria inativa (ela filtra só centros,
  safras e projetos).
- **Exemplo:** "Venda de bens usados" foi inativada depois da venda do
  trator, mas continua na escolha de categoria do título novo e do
  lançamento da Tesouraria.
- **Onde:** `contas-a-pagar/page.tsx`, `contas-a-receber/page.tsx` e
  `tesouraria/page.tsx` (listas sem filtro de `ativo`) e
  `validarReferenciasDoTitulo` em `src/server/services/titulo.ts`.
- **Impacto:** o inativar não faz o que promete; lançamentos novos em
  categorias e centros que deviam ter saído de uso.
- **Caminhos:** a mesma correção dos itens 28 (cliente e fornecedor) e 31
  (conta bancária): oferecer só os ativos no título e no lançamento novos,
  manter o já escolhido na edição, e recusar inativo no serviço. Vale fazer
  os três itens juntos.
- **Ao corrigir:** dicas dos passos "Confira o status" dos roteiros
  `inativar-categoria`, `inativar-centro-custo` e do último passo de
  `cadastrar-centro-lucro` (`src/ajuda/categorias`, `centros-de-custo`,
  `centros-de-lucro`); dica do último passo de `encerrar-safra` e de
  `cadastrar-projeto` (`src/ajuda/safras`, `projetos`).

### 36. O "pai" das categorias e dos centros de custo não é usado

- **Problema:** categorias e centros de custo têm um campo "pai" (e a tela
  de centros diz "Empresa → Unidade → Departamento → Centro de custo"), mas
  nenhum relatório usa a hierarquia: o Orçamento, o Fluxo por dimensão e o
  dashboard mostram cada item separado, sem somar os filhos no pai.
- **Exemplo:** "Taxas de cartão" dentro de "Despesas bancárias": o
  Orçamento mostra as duas linhas soltas, sem um total de "Despesas
  bancárias" com as filhas.
- **Onde:** `parentId` só é lido em `categoriaFinanceira.ts`,
  `centroCusto.ts` e `hierarquia.ts` (cadastro e checagem de ciclo).
- **Impacto:** quem monta a hierarquia esperando relatórios agrupados não
  vê diferença; o manual prometia o agrupamento (corrigido em 2026-11-21).
- **Caminhos:** no Orçamento e no Fluxo por dimensão, mostrar os pais com o
  total dos filhos (linhas recolhíveis); ou, se a hierarquia não for
  necessária, tirar o campo para não criar expectativa.
- **Ao corrigir:** dicas dos passos sobre o pai em
  `src/ajuda/categorias/index.tsx` e `src/ajuda/centros-de-custo/index.tsx`,
  e as seções 7.2 e 7.3 do manual.

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

### 39. Local com lotes pode ser inativado, e os lotes somem da ocupação

- **Problema:** `definirAtivoLocalArmazenamento` não confere se há lotes com
  saldo no local. Inativado, o local sai do quadro "Ocupação dos locais" e do
  filtro de local do Estoque, mas os lotes continuam lá dentro.
- **Exemplo:** a Câmara da loja é inativada com 200 kg do AMC-261120-01/1; o
  quadro de ocupação deixa de mostrar esses 200 kg, e não dá mais para filtrar
  o Estoque por esse local para achá-los.
- **Onde:** `src/server/services/localArmazenamento.ts`
  (`definirAtivoLocalArmazenamento`); `resumoProdutoLocal` em
  `src/server/services/estoque.ts` e `producao/estoque/page.tsx` (só locais
  ativos).
- **Impacto:** estoque "escondido": o saldo total continua certo, mas a
  visão por local fica incompleta e o lote é difícil de achar.
- **Caminhos:** recusar a inativação enquanto houver lote com saldo no local
  ("Transfira os lotes antes de inativar"); ou permitir e manter o local
  inativo com saldo no quadro e no filtro, marcado como inativo.
- **Ao corrigir:** dica do último passo de `cadastrar-local`
  (`src/ajuda/locais-armazenamento/index.tsx`) e a frase do item 4 da seção
  7.6 do manual.

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

### 48. Cor e logo da empresa em dois lugares

- **Problema:** o formulário "Editar empresa" ainda tem "Usar cor
  personalizada" e "Logo". A cor só pinta a barra lateral e só vale enquanto
  a empresa não tem tema salvo; o logo é o mesmo "Logo para fundo claro" do
  Tema e marca. Quem troca a cor ali com tema salvo não vê efeito nenhum.
- **Onde:** `empresas/empresa-dialog-form.tsx` (`corPrimaria`, `logo`),
  `src/app/(dashboard)/layout.tsx` (usa `corPrimaria` sem tema).
- **Impacto:** confusão: dois lugares para a mesma coisa, um que às vezes
  não funciona.
- **Caminhos:** tirar cor e logo do formulário e deixar só o Tema e marca
  (a cor antiga pode virar a primária/barra lateral de um tema inicial,
  numa migração); ou mostrar no formulário "Esta empresa tem tema: a cor
  daqui não vale".
- **Ao corrigir:** passo "Cor e logo: deixe para o Tema e marca" do roteiro
  `cadastrar-empresa` (`src/ajuda/empresas/roteiros.ts`) e a réplica do
  formulário em `src/ajuda/empresas/cenas.tsx`.

### 49. Filial nova não dá acesso a ninguém

- **Problema:** `criarFilial` não cria acesso para quem cadastrou. A filial
  não aparece em "Trocar filial" de ninguém até o Administrador marcar o
  acesso em Usuários. Já a empresa nova dá acesso ao criador na Matriz.
- **Impacto:** quem cria a filial acha que não deu certo; passo esquecido.
- **Caminhos:** dar Leitura e Alteração a quem criou, como na empresa nova;
  ou, ao salvar, mostrar "Dê acesso em Usuários" com o link.
- **Ao corrigir:** passo "Agora, dê acesso a ela" do roteiro
  `cadastrar-filial` (`src/ajuda/filiais/index.tsx`) e a seção 8.2 do
  manual.

### 50. Rótulo da conta de recebimento citava o cartão

- **Status:** feito na branch `feat/ajuda-configuracao-producao`.
- **Problema:** o campo se chamava "Conta de recebimento (Pix,
  transferência, cartão)", mas a venda na maquininha usa a conta de
  depósito da operadora e nem mostra a escolha de conta no pedido.
- **Correção:** rótulo "Conta de recebimento (Pix e transferência)" em
  `configuracao-producao/configuracao-form.tsx`.

### 51. Categoria e conta inativadas continuam na Configuração de produção

- **Problema:** a tela só lista categorias e contas ativas. Se a escolhida
  for inativada depois, o campo mostra o código interno em vez do nome, não
  há aviso, e a conta inativa faz o Salvar ser recusado ("Conta de
  recebimento padrão inválida") mesmo quando só se mudou outro campo. A
  categoria inativa continua sendo usada na conta a pagar da recepção e na
  conta a receber do pedido.
- **Exemplo:** "Insumos Agrícolas" é inativada; as compras do José da Silva
  continuam caindo nela, e quem abre a configuração vê um código no lugar
  do nome.
- **Onde:** `configuracao-producao/page.tsx` (listas com `ativo: true`),
  `salvarConfiguracaoProducao` em `configuracaoProducao.ts` (confere `ativo`
  só nas contas), `recepcaoFruto.ts` e `pedidoVenda.ts` (usam a categoria
  sem conferir `ativo`).
- **Impacto:** o inativar não faz o que promete, e a tela de configuração
  fica travada sem explicar por quê.
- **Caminhos:** junto com os itens 31 e 35: na configuração, mostrar a
  escolhida mesmo inativa, marcada "(inativa)", e avisar no topo; ao
  inativar uma categoria ou conta em uso na configuração, avisar ou
  recusar.
- **Ao corrigir:** dica do passo "Confira a mensagem" do roteiro
  `preparar-recepcao-vendas` (`src/ajuda/configuracao-producao/index.tsx`).

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
