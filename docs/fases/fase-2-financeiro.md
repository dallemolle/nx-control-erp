# Fase 2 — Financeiro

Status: 🟡 **Em andamento.** Sub-projeto 1 (Contas a Pagar/Receber —
Títulos, design em
`docs/superpowers/specs/2026-08-31-financeiro-titulos-design.md`)
implementado. Sub-projeto 2 (Tesouraria — lançamentos bancários,
transferências entre contas e saldo contábil × bancário informado, tela
`/financeiro/tesouraria`) implementado. Falta apenas a Fase 3
(conciliação bancária) para fechar o ciclo desta área.

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

- Cadastro de contas bancárias por filial já existe (`ContaBancaria`,
  Fase 1). Suporte a conta corrente, aplicação, investimento e
  empréstimo/financiamento (enum já modelado).
- **Lançamentos bancários** (`LancamentoBancario`): entrada/saída
  manual, transferência entre duas contas (duas pernas atômicas), e
  criação automática ao aprovar uma `Baixa` (origem `BAIXA`, vinculada
  ao título pago/recebido). Lançamentos são append-only — correções se
  fazem com um lançamento de estorno, nunca editando o original.
- **Saldo contábil** é sempre calculado (`saldoInicial` da conta + soma
  dos lançamentos), nunca uma coluna armazenada.
- **Saldo bancário** é um valor informado manualmente pelo usuário
  (`SaldoBancarioInformado`, histórico completo por data) — sem
  integração com banco real nesta fase. A tela `/financeiro/tesouraria`
  mostra os dois lado a lado (contábil × último informado) por conta.
  "Saldo disponível" não foi modelado — sem regra de bloqueio/reserva de
  valores definida, ficou fora de escopo.
- Novas permissões `lancamento:ler`/`lancamento:escrever` — `TESOURARIA`
  tem as duas, os demais perfis (exceto `ADMINISTRADOR`, que tem tudo)
  só leitura.

## Depende de

- Fase 1 completa (empresas, filiais, cadastros básicos, RBAC, auditoria).

## Alimenta

- Fase 3 (conciliação bancária compara estas movimentações com o extrato).
- Fase 4 (fluxo de caixa realizado e projetado usa estes títulos e
  movimentações como fonte de dados).
