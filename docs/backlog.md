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

### 6. Lançamento manual e transferência não podem ser corrigidos

- **Problema:** não há edição nem exclusão de `LancamentoBancario`
  (`src/server/services/lancamentoBancario.ts`), seja manual (Tesouraria ou
  Conciliação) ou transferência.
- **Exemplo:** lançou a tarifa de R$ 45,90 como R$ 459,00. A saída fica errada
  no saldo, no fluxo e no orçamento.
- **Contorno atual:** a ajuda manda anular com um lançamento de mesmo valor no
  sentido contrário e lançar o certo. Isso deixa dois registros falsos no fluxo
  de caixa, na categoria e na conciliação (a anulação não tem linha no extrato).
- **Impacto:** dado errado sem correção; mesma família do item 3.
- **Caminhos:** excluir (enquanto não conciliado) e estornar (depois), com
  motivo e auditoria; editar descrição, categoria e dimensões sempre (não mexem
  no saldo); para transferência, os dois lados juntos (`transferenciaId`).
- **Cuidados:** lançamento conciliado (grupo de conciliação); lançamento
  criado pela "diferença" de um grupo; lançamentos de baixa (origem BAIXA) não
  entram aqui, são o item 3.
- **Ao corrigir:** `src/ajuda/tesouraria/roteiros.ts` (constante
  `SEM_CORRECAO`, passo "Clique em Salvar" do `transferir`, "E depois?" do
  `ver-lancamentos` com o contorno); `src/ajuda/conciliacao/roteiros.ts`
  ("E depois?" do `criar-lancamento`); manual, seção 3.3.

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

### 8. Confirmar 1:1 na Conciliação aceita valor diferente

- **Problema:** `confirmarConciliacaoManual`
  (`src/server/services/conciliacao.ts`) só confere a conta e se o lançamento
  está livre: não compara valor nem sentido com a linha do extrato. A caixa de
  candidatos (`buscarCandidatosLancamento`) traz lançamentos do mesmo sentido em
  ±30 dias, de qualquer valor.
- **Exemplo:** linha de R$ 990,00 conciliada com lançamento de R$ 1.000,00. O
  realizado fica com R$ 1.000,00 e os R$ 10,00 somem.
- **Impacto:** dado errado no fluxo realizado, escondido pela conciliação.
  A conciliação em grupo já exige soma exata; o 1:1 é a porta aberta.
- **Caminhos:** exigir valor e sentido iguais no 1:1 e, se diferente, mandar
  para "Conciliar em grupo" com "Lançar a diferença"; ou filtrar os candidatos
  por valor igual e deixar o resto para o grupo.
- **Cuidados:** linhas em Divergência de valor hoje resolvidas pelo 1:1.
- **Ao corrigir:** dica do passo "Escolha o lançamento na caixa da linha" em
  `src/ajuda/conciliacao/roteiros.ts` (roteiro `confirmar-sugestao`) e o
  "Quando usar" dele (cita Divergência de valor).

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
  fluxo estratégico, quando existir.

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

- **Problema:** o Passo a passo, seção 3.4, lista 3 status (Conciliado,
  Sugestão, Não conciliado); a tela tem 6 (mais Divergência de valor,
  Divergência de data e Duplicado). A descrição de Sugestão também está
  imprecisa ("Criar lançamento" não resolve sugestão).
- **Caminhos:** reescrever a tabela com os 6 status e a regra do automático
  (mesmo valor, mesmo sentido, até 3 dias, um só candidato), como na ajuda
  (roteiro `entender-status`).

### 13. Baixa aprovada e não conciliada some da projeção

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

## Ajuda contextual (spec 2026-11-19-ajuda-contextual)

- **Ajuda com simulação nas demais telas do Financeiro.** Feito (2026-11-20):
  todas as telas do Financeiro têm ajuda (engine em `src/components/ajuda/`,
  conteúdo em `src/ajuda/`, cenas de títulos comuns em `src/ajuda/_titulos/`).
  Item mantido aqui só como histórico; pode ser removido na próxima limpeza.
- **Ajuda com simulação nos outros menus** (Produção, Vendas, Cadastros,
  Controladoria, Administração), depois do Financeiro, na mesma engine.
