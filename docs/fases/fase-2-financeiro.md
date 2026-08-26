# Fase 2 — Financeiro

Status: ⚪ **Planejada.** Escopo abaixo, sem desenho técnico ainda — o design
detalhado (modelo de dados de títulos/parcelas, fluxos de aprovação, telas)
será feito quando esta fase entrar em desenvolvimento, seguindo o mesmo
processo de brainstorm → design → plano usado na Fase 1.

## Escopo

### Contas a pagar

- Cadastro de títulos: fornecedor, documento, parcela, datas (emissão,
  competência, vencimento, pagamento), valor original, juros, multa,
  desconto, valor atualizado, valor pago, saldo.
- Vínculo com banco/conta bancária, forma de pagamento, categoria financeira,
  centro de custo, centro de lucro, safra, projeto (dimensões já existentes
  desde a Fase 1).
- Status: em aberto, a vencer, vencido, parcialmente pago, pago, cancelado,
  renegociado.
- Operações: cadastro manual, importação, parcelamento, baixa parcial/total,
  cancelamento, renegociação, alteração de vencimento, anexos, aprovação de
  pagamento, histórico de alterações (via `AuditLog`, já existente).

### Contas a receber

- Mesma estrutura de contas a pagar, espelhada para cliente/recebimento
  (documento, parcela, datas, valor, desconto, juros, multa, valor recebido,
  saldo, forma de recebimento).
- Status equivalentes: em aberto, a vencer, vencido, parcialmente recebido,
  recebido, cancelado, renegociado.

### Bancos e tesouraria

- Cadastro de contas bancárias por empresa já existe (`ContaBancaria`,
  Fase 1) — esta fase adiciona as movimentações de fato: lançamentos
  manuais, saldo contábil informado vs. saldo bancário vs. saldo disponível.
- Suporte a conta corrente, aplicação, investimento e
  empréstimo/financiamento (enum já modelado).

## Depende de

- Fase 1 completa (empresas, cadastros básicos, RBAC, auditoria).

## Alimenta

- Fase 3 (conciliação bancária compara estas movimentações com o extrato).
- Fase 4 (fluxo de caixa realizado e projetado usa estes títulos e
  movimentações como fonte de dados).
