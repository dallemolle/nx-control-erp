# Fase 5 — Controladoria e orçamento

Status: 🟢 **Concluída.** Os 3 sub-projetos estão implementados: Orçamento
(design em `docs/superpowers/specs/2026-09-09-orcamento-design.md`, tela em
`/controladoria/orcamento`), Fluxo de caixa por dimensão (design em
`docs/superpowers/specs/2026-09-10-fluxo-caixa-por-dimensao-design.md`,
tela em `/controladoria/fluxo-por-dimensao`) e Comparação entre safras
(design em
`docs/superpowers/specs/2026-09-11-comparacao-safras-design.md`, tela em
`/controladoria/comparacao-safras`).

## Escopo

### Orçamento — implementado

- Orçamento por categoria financeira, mês, ano (`Orcamento`, grade mensal).
  Orçamento por centro de custo/centro de lucro/projeto não foi feito —
  só categoria financeira e safra (esta última via o sub-projeto
  "Comparação entre safras", com modelo próprio) têm orçamento hoje.
- Comparativos: orçado × realizado × projetado, com variação absoluta e
  percentual. Realizado usa `LancamentoBancario` conciliado (direto ou via
  fallback baixa→parcela→título para dado histórico); projetado usa
  `Parcela` em aberto.
- Alerta de estouro: só para categorias `DESPESA` (ultrapassar o orçado de
  uma `RECEITA` é notícia boa, não estouro).

### Fluxo de caixa por dimensão — implementado

- Correção de origem: `LancamentoBancario` passou a carregar as 4
  dimensões (`centroCustoId`/`centroLucroId`/`safraId`/`projetoId`)
  diretamente, copiadas de `Titulo` na aprovação da baixa e capturáveis
  também no lançamento manual e no lançamento via conciliação — antes
  disso, um lançamento sem baixa vinculada não tinha como ser atribuído a
  nenhuma dimensão.
- Relatório por `CENTRO_CUSTO`/`CENTRO_LUCRO`/`SAFRA` (mês/ano), com
  fallback via baixa para dado histórico no realizado, sem fallback no
  projetado (parcela só existe via título). Linha "Não classificado"
  sempre presente (mesmo zerada) e linha "(inativo)" para dimensão
  desativada depois de já ter sido usada em algum lançamento — nenhuma
  soma pode desaparecer do relatório.
- Sem rollup hierárquico de Centro de Custo e sem Projeto no seletor do
  relatório ainda (dado já capturado, ver `docs/backlog.md`).

### Comparação entre safras — implementado

- Orçamento por safra em tabela dedicada (`OrcamentoSafra`) — um valor
  único por safra, sem grade mensal, porque a safra tem seu próprio
  período (`dataInicio`/`dataFim`, pode atravessar virada de ano civil).
- Realizado/projetado por safra reaproveitam a mesma lógica do Fluxo de
  caixa por dimensão, generalizada para aceitar qualquer intervalo de
  datas (`buscarRealizadoPorDimensaoNoPeriodo`/
  `buscarProjetadoPorDimensaoNoPeriodo`) em vez de duplicar a query —
  chamada com o período próprio de cada safra. Valor é o saldo líquido
  (entradas − saídas), diferente das colunas separadas do relatório por
  dimensão.
- Lista toda safra ativa da filial (`PLANEJADO`/`EM_ANDAMENTO`/`ENCERRADO`,
  sem limite de quantidade). Sem alerta de estouro nesta versão (não
  pedido no escopo original, ver `docs/backlog.md`).
- Duas decisões conscientes registradas em `docs/backlog.md`: o realizado
  ignora lançamento marcado com a safra mas datado fora do período
  oficial; o orçado é sempre ≥0 enquanto realizado/projetado têm sinal.

## Depende de

- Fase 1 (dimensões analíticas já modeladas).
- Fase 4 (fluxo de caixa realizado/projetado como base de comparação).

## Alimenta

- Fase 6 (relatórios de orçado x realizado, dashboards por dimensão).
