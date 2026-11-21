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

- **Problema:** o status de safra e de projeto aparece como o valor do banco
  (PLANEJADO, EM_ANDAMENTO, ENCERRADO) na Comparação entre safras, nas listas
  de Cadastros → Safras e Projetos e nas opções do formulário de cadastro. Só
  a exportação da Comparação traduz ("Em andamento").
- **Exemplo:** na Comparação, a 2025/26 mostra "EM_ANDAMENTO"; o PDF exportado
  da mesma tela mostra "Em andamento".
- **Onde:** `controladoria/comparacao-safras/page.tsx`,
  `cadastros/safras/page.tsx` e `safra-dialog-form.tsx`,
  `cadastros/projetos/page.tsx` (e o formulário de projeto, conferir); o
  rótulo certo já existe em `comparacao-safras/export/route.ts`
  (`STATUS_LABEL`).
- **Impacto:** acabamento: texto técnico na tela de quem não é da TI.
- **Caminhos:** mover o `STATUS_LABEL` para `src/lib` e usar em todos os
  lugares; no formulário, só o rótulo muda (o valor enviado continua o código).
- **Cuidados:** a ajuda de Cadastros, quando existir, deve usar o rótulo novo.
- **Ao corrigir:** passo "Status" do roteiro `comparar-safras` (cita os
  códigos) e a réplica (`src/ajuda/comparacao-safras/cenas.tsx`); a frase do
  `filtrar-exportar` que diz que só o arquivo traz o status por extenso.

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
  `filtrar-referencia` em `src/ajuda/estoque/roteiros.ts` e o parágrafo da
  seção 5.3 do Passo a passo.

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
  lacuna 30 já corrigida). Faltam as demais telas de Cadastros e a
  Administração.
- **Aposentar o Passo a passo.** Decisão do usuário (2026-11-20): quando todas
  as telas tiverem ajuda com simulação, o menu Ajuda → Passo a passo
  (`content/ajuda/passo-a-passo.md`) deixa de ser usado. Antes de retirar,
  conferir se algum conteúdo do manual (seções sem tela, como Primeiros
  acessos e Perfis) não ficou sem lugar na ajuda; depois, tirar o item do
  menu, a página e os links `#ajuda/...` do manual.
