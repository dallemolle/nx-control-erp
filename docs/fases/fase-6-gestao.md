# Fase 6 — Gestão

Status: ⚪ **Planejada.** Escopo abaixo, sem desenho técnico ainda.

## Escopo

### Dashboard executivo

- Indicadores: caixa disponível, saldo bancário, contas a pagar/receber,
  inadimplência, geração de caixa, necessidade de capital de giro,
  endividamento, obrigações dos próximos 7/30 dias, recebimentos esperados,
  saldo projetado.
- Gráficos: entradas x saídas, evolução do saldo, aging de contas a
  pagar/receber, orçado x realizado, fluxo de caixa por centro de
  custo/lucro/safra.

### Relatórios

Exportáveis em Excel, CSV e PDF: contas a pagar/receber, aging de
fornecedores/clientes, fluxo de caixa realizado/projetado, conciliação
bancária, orçado x realizado, caixa por centro de custo/lucro/safra,
necessidade de capital de giro, obrigações e recebimentos futuros,
movimentação bancária, auditoria de alterações.

### Filtros globais

Empresa, filial, período, banco, conta bancária, centro de custo, centro de
lucro, safra, projeto, categoria, fornecedor, cliente, status, tipo de
movimento — combináveis simultaneamente em todas as telas e relatórios
relevantes. Empresa sem filial selecionada consolida (soma) todas as
filiais do usuário naquela empresa; com filial selecionada, detalha só
aquela unidade.

### Auditoria completa e aprovações

- A infraestrutura de auditoria (`AuditLog`) já existe desde a Fase 1; esta
  fase estende a cobertura para todas as operações das Fases 2-5
  (baixa, conciliação/desconciliação, aprovação, alteração de vencimento).
- Workflow de aprovação de pagamentos: cadastro → aprovação → programação →
  pagamento → conciliação.

## Depende de

- Fases 2-5 (é a camada de consolidação/visualização sobre todas elas).
