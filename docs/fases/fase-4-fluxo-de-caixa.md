# Fase 4 — Fluxo de caixa

Status: 🟢 **Concluída.** Os 3 sub-projetos estão implementados: Fluxo
de caixa realizado (design em
`docs/superpowers/specs/2026-09-03-fluxo-caixa-realizado-design.md`,
tela em `/financeiro/fluxo-de-caixa`), Fluxo de caixa projetado (design
em `docs/superpowers/specs/2026-09-07-fluxo-caixa-projetado-design.md`,
tela em `/financeiro/fluxo-de-caixa-projetado`) e Fluxo de caixa
estratégico (design em
`docs/superpowers/specs/2026-09-08-fluxo-caixa-estrategico-design.md`,
tela em `/financeiro/fluxo-de-caixa-estrategico`).

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

### Fluxo de caixa projetado (12 meses) — implementado

- Baseado em `Titulo`/`Parcela`/`Baixa` em aberto (Fase 2) — contratos
  recorrentes, financiamentos, parcelamentos além de `Parcela` e
  orçamento (Fase 5) não existem no schema hoje, ficam para quando esses
  conceitos de domínio forem desenhados.
- Saldo inicial ancorado no saldo em caixa **conciliado** de hoje
  (reusa `buscarSaldoEmCaixaAte` do realizado), encadeado pelas parcelas
  em aberto (`EM_ABERTO`/`A_VENCER`/`VENCIDO`/`PARCIALMENTE_PAGO`) mês a
  mês. Parcela vencida com vencimento anterior ao início da janela
  exibida não aparece (limitação documentada na spec e na própria tela).
- Dois modos de janela: móvel (padrão, 12 meses a partir do mês atual) e
  ano civil (Jan-Dez de um ano escolhido, pra comparar com um orçamento
  anual futuro).
- Alerta: só saldo final negativo (destaque visual + badge). Concentração
  de vencimentos e necessidade potencial de capital ficam para uma
  iteração futura.

### Fluxo de caixa estratégico (5 anos) — implementado

- Projeção anual de 5 anos, 3 cenários fixos (base/otimista/pessimista),
  por **empresa** — a única feature do sistema além de gestão de
  Empresa/Usuário com esse escopo em vez de por filial, consolidando
  todas as filiais da empresa. Ano base a partir dos últimos 12 meses do
  fluxo de caixa realizado.
- 5 premissas editáveis por cenário (reduzidas das 10 do escopo
  original): crescimento de receita, crescimento de custos/despesas (já
  embute inflação), CAPEX (% da receita), novo endividamento anual,
  taxa de juros anual. Margem líquida é métrica calculada/exibida, não
  input. Prazo médio de recebimento/pagamento e capital de giro ficam
  para uma iteração futura — exigem modelar descasamento de caixa no
  tempo.
- Sem amortização de dívida modelada (juros incidem sobre o saldo
  devedor acumulado, que nunca é amortizado) — simplificação
  documentada, adequada a uma visão direcional de 5 anos.
- Único dado persistido de toda a Fase 4 (`CenarioEstrategico`, 1
  migration) — os 3 cenários por empresa são garantidos via `upsert`
  idempotente, sem criação eager nem migration de backfill. Primeira
  permissão de escrita do perfil GESTOR em todo o sistema
  (`planejamentoEstrategico:escrever`); leitura restrita a
  ADMINISTRADOR/GESTOR/AUDITOR (não a todos os 6 perfis, diferente do
  padrão do resto do sistema) — dado consolidado de empresa inteira é
  mais sensível que dado de uma filial.

## Depende de

- Fase 2 (títulos em aberto como fonte da projeção).
- Fase 3 (movimentações conciliadas como fonte do realizado).

## Alimenta

- Fase 6 (dashboard executivo e relatórios de fluxo de caixa).
