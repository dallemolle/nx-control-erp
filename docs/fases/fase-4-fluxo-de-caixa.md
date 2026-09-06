# Fase 4 — Fluxo de caixa

Status: 🟡 **Em andamento.** Sub-projeto 1 (Fluxo de caixa realizado,
design em
`docs/superpowers/specs/2026-09-03-fluxo-caixa-realizado-design.md`)
implementado, tela em `/financeiro/fluxo-de-caixa`. Sub-projetos 2
(projetado) e 3 (estratégico) ainda sem desenho técnico — escopo abaixo
é só a descrição original em prosa.

## Escopo

### Fluxo de caixa realizado (método direto) — implementado

- Usa exclusivamente movimentações já conciliadas (Fase 3) — nunca
  regime de competência, nunca lançamento ainda não confirmado no
  extrato.
- Estrutura: saldo inicial + entradas de caixa − saídas de caixa = geração
  líquida de caixa; + saldo inicial = saldo final de caixa. Calculado sob
  demanda a partir de `LancamentoBancario`/`ContaBancaria` (Fase 2b/3) —
  sem tabela nova, sem cache.
- Visualização diária, semanal, mensal, anual, cada uma com sua "janela"
  natural (dias do mês / semanas do mês / meses do ano / últimos 5 anos),
  navegável com anterior/próximo.
- Sem consolidação por empresa, sem quebra por dimensão (centro de
  custo/lucro, safra, projeto) e sem alertas nesta fase — ficam pra Fase 5
  e para o sub-projeto "projetado", respectivamente.

### Fluxo de caixa projetado (12 meses) — ainda não desenhado

- Baseado em contas a receber/pagar em aberto (Fase 2), contratos
  recorrentes, financiamentos, parcelamentos, orçamento (Fase 5), premissas
  editáveis e histórico de recebimento/pagamento.
- Tabela mês a mês: saldo inicial, entradas, saídas, geração de caixa, saldo
  final.
- Alertas: saldo negativo, insuficiência de caixa, concentração de
  pagamentos/recebimentos, vencimentos relevantes, necessidade potencial de
  capital.

### Fluxo de caixa estratégico (5 anos) — ainda não desenhado

- Projeção anual, cenários base/otimista/pessimista.
- Premissas editáveis: crescimento de receita, margem, inflação, custos,
  despesas, CAPEX, endividamento, taxas de juros, prazo médio de
  recebimento/pagamento, capital de giro.

## Depende de

- Fase 2 (títulos em aberto como fonte da projeção).
- Fase 3 (movimentações conciliadas como fonte do realizado).

## Alimenta

- Fase 6 (dashboard executivo e relatórios de fluxo de caixa).
