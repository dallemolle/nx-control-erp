# Fase 3 — Conciliação bancária

Status: 🟢 **Concluída.** Design técnico em
`docs/superpowers/specs/2026-09-02-conciliacao-bancaria-design.md`,
implementado e mesclado em `staging`. Tela em `/financeiro/conciliacao`.

## Escopo implementado

### Importação de extrato bancário

- Formato: **OFX** (parser próprio, sem dependência externa). CSV/Excel
  ficaram fora do MVP — o OFX já cobre o caso real mais comum e traz um
  identificador único (`FITID`) por transação, o que torna a dedupe
  confiável sem heurística.
- Cada linha importada: data, valor, tipo (entrada/saída — derivado de
  `TRNTYPE` quando presente, com fallback pro sinal de `TRNAMT`), histórico
  (`NAME`/`MEMO`), identificador bancário (`FITID`).
- Deduplicação por `contaBancariaId` + identificador bancário
  (`@@unique` no banco) — reimportar o mesmo arquivo, ou um período
  sobreposto, nunca duplica linha.
- Resumo da importação (linhas novas/ignoradas/conciliadas
  automaticamente) é mostrado na tela ao final.
- Arquivo OFX malformado (campos `TRNAMT`/`DTPOSTED` inválidos) é
  rejeitado com mensagem clara, antes de qualquer escrita no banco.

### Conciliação

- Compara os `LancamentoBancario` do sistema (Fase 2b — manual,
  transferência, ou gerado automaticamente ao aprovar uma `Baixa`) com as
  linhas do extrato importado.
- Matching automático por valor + data (tolerância de ±3 dias) + mesma
  conta bancária + mesmo tipo — sem similaridade textual/fuzzy nesta fase.
- Classificação: conciliado automaticamente, sugestão de conciliação (mais
  de um candidato exato), não conciliado, divergência de valor, divergência
  de data, duplicado (já existe um lançamento igual, mas reclamado por
  outra linha).
- Conciliação manual como fallback pra sugestão/divergência/duplicado/não
  conciliado, com um seletor dos lançamentos candidatos.
- Linha sem lançamento correspondente pode virar um `LancamentoBancario`
  novo direto da tela (fecha o ciclo sem sair pra Tesouraria).
- Botão "Reconciliar pendentes" reprocessa toda linha `NAO_CONCILIADO` da
  filial ativa — cobre o caso de o lançamento correspondente só ter sido
  criado depois da importação, ou de uma desconciliação ter resetado o
  status.
- Filtro por status na listagem.
- Conciliação é 1:1 nesta fase — consolidação/split (um lançamento do
  banco cobrindo vários movimentos do sistema, ou vice-versa) fica fora de
  escopo; o próprio schema impede via `@unique`.
- Toda operação de conciliação/desconciliação registrada em `AuditLog`
  (usuário, data, lançamento envolvido, ação).

## Fora de escopo (adiado)

- CSV/Excel de extrato.
- Conciliação N:1/1:N.
- Matching por similaridade textual de histórico/nome.
- Processamento em lote otimizado para extratos muito grandes — o loop de
  conciliação automática processa linha a linha; extratos muito extensos
  (milhares de transações) podem se aproximar do limite de tempo de uma
  função serverless. Vale revisar se isso se tornar um problema real em
  produção.

## Depende de

- Fase 2 (contas a pagar/receber e movimentações bancárias como o "lado A"
  da conciliação).

## Alimenta

- Fase 4 (fluxo de caixa realizado deve refletir apenas movimentações
  efetivamente conciliadas/confirmadas em caixa).
