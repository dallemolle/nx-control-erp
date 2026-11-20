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

## Financeiro — baixa

- **Desconto na baixa não abate o saldo da parcela.** `calcularStatusParcela`
  (`src/server/services/parcela.ts`) compara só a soma de `valorPago` das baixas
  aprovadas com `valorAtualizado`; `valorDesconto` (e juros/multa) são só registro.
  Uma parcela paga com desconto fica PARCIALMENTE_PAGO com a diferença em aberto.
  A ajuda de Contas a pagar e a de Contas a receber (roteiros de baixa)
  orientam a combinar com o financeiro. Correção provável: considerar `valorPago + valorDesconto − juros −
  multa` contra o valor da parcela (ou o desconto abater o saldo), com cuidado com
  relatórios que somam `valorPago`.

Os quatro itens abaixo (achados na ajuda de Aprovações pendentes, 2026-11-20) são
**correções de prioridade alta**, para depois da ajuda contextual dos menus
(os módulos ainda não estão em uso).

- **Aprovação às cegas.** Aprovações pendentes mostra só documento,
  contraparte, valor pago e quem registrou. Data, conta bancária, número da
  parcela, juros, multa e desconto da baixa não aparecem, e o lançamento sai
  com essa data e nessa conta. Mostrar esses campos na linha (ou num detalhe).
  A ajuda da tela orienta a perguntar a quem registrou.
- **Baixa aprovada não pode ser desfeita.** Não existe estorno de baixa nem
  exclusão do lançamento que ela gera (`efetivarBaixa` em
  `src/server/services/baixa.ts`). Uma aprovação errada (conta, data ou valor)
  fica sem correção pelo sistema. Precisa de um estorno auditado que reabra a
  parcela e remova (ou contra-lance) o lançamento, com cuidado com lançamento
  já conciliado.
- **Parcela com baixa pendente aceita outra baixa.** O botão Baixar continua
  na parcela enquanto a baixa espera aprovação, e `registrarBaixa` não checa
  pendentes: baixa em dobro passa e só é pega se o aprovador perceber.
  Avisar (ou impedir) quando já houver baixa pendente na parcela.
- **Rejeição não chega a quem registrou.** O motivo fica só na Auditoria, que
  o perfil Financeiro não acessa, e a parcela não mostra que houve baixa
  rejeitada. Mostrar a rejeição e o motivo na parcela (ou num aviso).

## Ajuda contextual (spec 2026-11-19-ajuda-contextual)

- **Ajuda com simulação nas demais telas do Financeiro.** Feitas: Contas a
  pagar, Contas a receber e Aprovações pendentes (engine em `src/components/ajuda/`, conteúdo em
  `src/ajuda/`, cenas de títulos comuns em `src/ajuda/_titulos/`). Faltam, uma
  tela por sessão: Repasses de cartão, Tesouraria,
  Conciliação e os três fluxos de caixa. Critério de cada uma: quem nunca
  usou o sistema consegue lançar seguindo só a ajuda.
- **Ajuda com simulação nos outros menus** (Produção, Vendas, Cadastros,
  Controladoria, Administração), depois do Financeiro, na mesma engine.
