# Backlog de melhorias

Pontos de melhoria identificados durante o desenho ou implementação de
alguma fase, mas conscientemente deixados fora do escopo da versão atual
(YAGNI) para não atrasar a entrega. Cada item deve ter contexto suficiente
para ser retomado sem precisar reconstruir o raciocínio original.

## Segurança — dependências

- **`mysql2`/`deepmerge-ts` vulneráveis via `@prisma/config` (dependência
  do CLI `prisma`, dev-only).** `npm audit` (checado em 2026-09-12) marca
  como alta severidade. Este projeto usa só Postgres — `mysql2` só existe
  porque o CLI do Prisma dá suporte genérico a múltiplos bancos. Checado
  contra a versão mais recente do Prisma disponível na época (`7.10.0`):
  ainda depende da mesma `deepmerge-ts@7.1.5` vulnerável — não é algo que
  uma atualização da nossa dependência resolva hoje, é um fix pendente do
  próprio Prisma. O único caminho que `npm audit fix --force` oferece é
  fazer downgrade do `prisma` para `6.19.3` (versão major anterior à que
  o projeto usa — rejeitado, risco real de regressão). Reavaliar quando o
  Prisma lançar uma versão que já traga `deepmerge-ts >= 8.0.0`.

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

- **Realizado/projetado por safra ignora lançamentos marcados fora da
  janela `dataInicio`/`dataFim`.** `listarComparativoSafras` conta apenas
  lançamentos/parcelas cuja data cai dentro do período oficial da safra —
  um insumo comprado antes do início oficial, ou uma venda liquidada
  depois do fim, mesmo estando marcado com aquela safra, não aparece no
  comparativo (e, diferente do relatório de fluxo por dimensão do
  sub-projeto 2a, não há uma linha "Não classificado" para reconciliar).
  Decisão consciente ao aprovar o desenho: manter como está por ora. Se
  vier a ser um problema real (compras de pré-safra, liquidações
  pós-colheita), a mudança é pequena — trocar o período por um filtro
  "todo lançamento marcado com esta safra, sem corte de data" em
  `orcamentoSafra.ts`'s `listarComparativoSafras`.

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

## Fluxo de caixa projetado

- **Reconstrução da cadeia de saldo em janelas fora do intervalo visível**
  (Fase 4, sub-projeto 2). Quando o modo `ANO_CIVIL` mostra um ano
  totalmente passado ou totalmente futuro (sem interseção com o mês
  atual), a projeção ainda parte do saldo em caixa de **hoje**, mas não
  reconstrói o que aconteceria nos meses "invisíveis" entre hoje e o
  início da janela pedida — o usuário vê um aviso na tela, mas o número
  do saldo inicial da janela pode não refletir a realidade de um ano
  distante. Reconstruir a cadeia completa através de anos não exibidos
  ficou para uma iteração futura.

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

## Financeiro — controles e conciliação

- **Recebimento por cartão: prazo de repasse, parcelas e taxa da operadora**
  (spec da venda a prazo em parcelas, 2026-11-16; não urgente, mas precisa
  ser tratado). Hoje a venda no cartão (`formaPagamento` `CARTAO` do pedido)
  é baixada na hora, pelo valor cheio, na conta de recebimento. Na prática a
  operadora paga depois (crédito 1x em ~30 dias; parcelado mês a mês) e
  desconta a taxa (MDR). Efeitos: saldo e fluxo realizado mostram dinheiro
  que ainda não entrou, a projeção não vê os repasses futuros, a conciliação
  dá divergência de valor em toda venda no cartão (o extrato traz o líquido)
  e a taxa nunca vira despesa, inflando a margem. Caminho: cadastro de
  condições da operadora (taxa e prazo por modalidade: débito, crédito 1x,
  parcelado em N), venda no cartão gera título a receber contra a operadora
  com as parcelas do repasse (valor líquido) e lança a taxa como despesa;
  depósito que junta várias vendas já concilia com a conciliação em grupo.
  Antes de priorizar, confirmar com a Hortitex quanto do faturamento passa
  pelo cartão.

## Produção — custo da OP

- **Histórico do preço de referência do produto** (rateio do custo da OP,
  2026-11-16). O rateio usa o preço do cadastro no momento do encerramento e
  o resultado fica congelado no `custoKg` do lote; o preço usado fica só na
  auditoria `ENCERRAR` da OP. Se for preciso consultar "qual preço valia em
  tal data" (ex.: para explicar um custo antigo sem abrir a auditoria),
  criar um histórico de preços por produto.
