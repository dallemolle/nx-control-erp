# Fase 3 — Conciliação bancária

Status: ⚪ **Planejada.** Escopo abaixo, sem desenho técnico ainda.

## Escopo

### Importação de extrato bancário

- Formatos: OFX (prioritário), CSV, Excel.
- Cada lançamento importado: data, histórico, documento, valor, tipo, banco,
  conta, identificador bancário, saldo (quando disponível).
- Deduplicação por identificador bancário + data + valor + documento +
  histórico — nenhuma movimentação deve ser importada duas vezes.

### Conciliação

- Compara movimentos do sistema financeiro (Fase 2) com movimentos do
  extrato importado.
- Matching automático por similaridade: valor, data, documento,
  fornecedor/cliente, histórico, identificador bancário.
- Classificação: conciliado automaticamente, sugestão de conciliação, não
  conciliado, divergência de valor, divergência de data, duplicidade.
- Conciliação manual como fallback.
- Toda operação de conciliação/desconciliação registrada em `AuditLog`
  (usuário, data, lançamentos envolvidos, critério usado).

## Depende de

- Fase 2 (contas a pagar/receber e movimentações bancárias como o "lado A"
  da conciliação).

## Alimenta

- Fase 4 (fluxo de caixa realizado deve refletir apenas movimentações
  efetivamente conciliadas/confirmadas em caixa).
