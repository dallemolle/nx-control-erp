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

## Dashboard executivo (Fase 6)

- **Gráfico "Orçado x Realizado" por categoria, consolidado por empresa.**
  Cortado da v1 do dashboard executivo: `CategoriaFinanceira` é cadastrada
  por filial, então não existe uma identidade única "esta categoria" que
  some naturalmente entre filiais (duas filiais podem ter categorias de
  mesmo nome como linhas totalmente diferentes no banco). Revisitar quando
  o sub-projeto de Filtros globais (ou um cadastro de categoria
  compartilhado entre filiais) existir.

- **Gráfico "Fluxo de caixa por dimensão" (centro de custo/lucro/safra),
  consolidado por empresa.** Mesmo problema do item acima —
  `CentroCusto`/`CentroLucro`/`Safra` são cadastros por filial, sem chave
  comum entre filiais para agregar. A tela por filial já existe
  (sub-projeto 2a, `/controladoria/fluxo-por-dimensao`); o que falta é uma
  visão consolidada por empresa, que depende da mesma solução do item
  acima.

- **Volume de queries por render (~23 × número de filiais, sequenciais).**
  `dashboardExecutivo.ts` roda a consolidação inteira dentro de loops
  `for...await` (não `Promise.all`), e `buscarSaldoEmCaixaAte` recalcula um
  agregado de todo o histórico 7 vezes por filial (6 fins de mês + agora).
  Não é um problema hoje (poucas filiais por empresa, mesmo padrão já
  aceito em `fluxoDeCaixaEstrategico.ts`), mas é o ponto mais provável de
  reclamação de performance conforme o número de filiais crescer. Ganhos
  mais baratos, em ordem: paralelizar os loops por filial com
  `Promise.all`; trocar `include` (todas as colunas de `Parcela`) por
  `select` nos dois `findMany` de parcela; a longo prazo, derivar os 6
  saldos de fim de mês de um único agregado em vez de 6 chamadas a
  `buscarSaldoEmCaixaAte`.

- **`filial.findMany` da consolidação não filtra `ativo: true`.** Uma
  filial desativada ainda entra nos indicadores/gráficos consolidados.
  Decisão consciente: mantém o mesmo comportamento de
  `buscarAnoBaseConsolidado` (Fase 4), e é genuinamente discutível nos dois
  sentidos — uma filial desativada pode ainda ter contas a pagar reais em
  aberto que a visão consolidada deveria mostrar. Esta é a 3ª vez que essa
  decisão aparece no código (mesma pergunta caberia num helper
  compartilhado `buscarFiliaisDaEmpresa(empresaId)` que decidisse isso uma
  vez só, em vez de replicar a escolha a cada novo serviço consolidado).

- **Sem formatador de moeda compartilhado.** `formatarMoeda` em
  `dashboard-executivo/page.tsx` é só `valor.toFixed(2)` — sem separador de
  milhar, sem `R$` — mesmo padrão já usado em 13 arquivos do projeto, mas
  este é o primeiro dashboard "executivo" com números de 7 dígitos, onde a
  falta de formatação mais pesa. Bom gatilho para extrair um formatador
  compartilhado em `src/lib/` quando a próxima tela financeira for tocada.

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

## Relatórios exportáveis (Fase 6, sub-projeto 6b)

- **Export em PDF.** Cortado da v1 — é o formato mais caro (layout de
  página, cabeçalho/rodapé, paginação) e os 2 formatos escolhidos (CSV,
  Excel) já cobrem os casos de uso reais levantados. O mecanismo genérico
  (`ColunaExport<T>`) já existe em `src/lib/export/`; adicionar PDF é
  criar um terceiro `gerarPdf` ao lado de `gerarCsv`/`gerarExcel`, sem
  tocar nas rotas já existentes além de adicionar o novo `formato=pdf`.

- **Wiring dos ~8 relatórios restantes.** O mecanismo genérico está
  validado com 2 relatórios (contas a pagar/receber, fluxo de caixa
  realizado). Os demais da lista original da Fase 6 — fluxo de caixa
  projetado, conciliação bancária, orçado x realizado, caixa por centro
  de custo/lucro/safra, obrigações e recebimentos futuros, movimentação
  bancária, auditoria de alterações — ficam para wiring futuro repetitivo
  sobre o mesmo `gerarCsv`/`gerarExcel`/`responderExport`/`ExportarLinks`.
  "Necessidade de capital de giro" fica de fora até existir modelo de
  dados para o conceito (mesma decisão já registrada para o Dashboard
  executivo).

- **`?formato=` desconhecido cai silenciosamente em CSV.** Hoje só existem
  `csv`/`xlsx`, então qualquer outro valor (incluindo erro de digitação)
  vira CSV sem aviso. Passa a importar quando `formato=pdf` existir —
  nesse ponto, `responderExport` deveria recusar formatos que a rota ainda
  não sabe gerar (ex.: `400`) em vez de mascarar como CSV.

- **Data do nome do arquivo é calculada em UTC.** `new Date().
  toISOString().slice(0, 10)` — depois das 21h (horário de Brasília,
  UTC-3), o arquivo é nomeado com a data de amanhã. Cosmético, e
  consistente com a convenção UTC já usada em todo o projeto.

- **Rótulo diferente entre tela e export do Fluxo de caixa.** A tabela usa
  "Geração de caixa"; o export usa "Geração líquida" (nome que a spec
  já definia). O export está de acordo com o desenho; a tela é que ficou
  destoante — alinhar os dois nomes quando a tela for tocada de novo.

- **`import * as Papa from "papaparse"` em `csv.ts` diverge do
  `import Papa from "papaparse"` já usado em `importacaoTitulo.ts`.**
  Ambos compilam (foi uma correção necessária de interop de módulo feita
  pelo implementador da Task 1), mas os dois estilos convivendo no projeto
  é uma pequena inconsistência — padronizar em um dos dois quando algum
  desses arquivos for tocado de novo.

- **`exceljs` é uma dependência pesada** (traz `archiver`, `unzipper`,
  `glob@7`, `fstream`, algumas já descontinuadas). Só é importado por
  Route Handlers hoje (nunca por um componente client), o que é o correto
  — não existe uma convenção `server-only` neste projeto para impedir um
  import client acidental no futuro que arrastaria toda essa árvore pro
  bundle do navegador. Considerar adicionar `import "server-only"` em
  `src/lib/export/excel.ts` se isso vier a ser um problema real.
