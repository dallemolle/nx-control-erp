# Backlog de melhorias

Pontos de melhoria identificados durante o desenho ou implementação de
alguma fase, mas conscientemente deixados fora do escopo da versão atual
(YAGNI) para não atrasar a entrega. Cada item deve ter contexto suficiente
para ser retomado sem precisar reconstruir o raciocínio original.

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

## Cobertura de relatórios

- **Projeto como dimensão de relatório** (Fase 5, sub-projeto 2a — Fluxo
  de caixa por dimensão). O dado já é capturado (`LancamentoBancario.
  projetoId`, `Titulo.projetoId`) e passa pela mesma validação de
  filial/fallback via baixa que Centro de Custo/Lucro/Safra, mas a tela
  `/controladoria/fluxo-por-dimensao` hoje só oferece `CENTRO_CUSTO`,
  `CENTRO_LUCRO` e `SAFRA` no seletor. Adicionar `"PROJETO"` a
  `TipoDimensao` e ao seletor é a extensão mais barata do backlog — a
  infraestrutura de dados já suporta.

- **Rollup hierárquico de Centro de Custo** (Fase 5, sub-projeto 2a). Se
  `CentroCusto` vier a ter hierarquia (centro-pai/centro-filho), o
  relatório por dimensão hoje trata cada `centroCustoId` como uma linha
  isolada, sem somar filhos no total do pai. Não implementado porque a
  hierarquia em si não existe no modelo hoje.

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

## Qualidade de testes

- **Teste de rollback do orçamento não exercita falha real de transação**
  (Fase 5, sub-projeto 1 — Orçamento, `salvarValoresOrcamentoDoAno`). O
  teste de rollback simula a falha mas não força um erro genuíno no meio
  da transação Prisma — a correção da atomicidade foi verificada por
  leitura direta do código (duas vezes, por revisores diferentes), não
  por um teste que efetivamente prova o rollback sob falha real. Retomar
  se o padrão de "atomic multi-row persist" for reusado em outro lugar e
  quiser um teste mais forte de referência.
