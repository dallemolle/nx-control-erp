# Fase 7g1 — Painel de produção e relatório de estoque

Data: 2026-11-11 · Status: implementada (2026-11-11)

Ajustes na implementação: `VerificarOP` fica em `src/lib/producao/op.ts`
(o filtro da URL não importa o serviço); os cartões de status do Estoque
sempre abrem a lista por lote; a aba "Por produto e local" ganhou
exportação própria (CSV/Excel por produto × local, PDF com resumo,
saldos e ocupação); a ajuda do painel é a seção 5.7.

Primeira metade do sétimo sub-projeto da Fase 7 (ver
[plano de entrega](../../modulos/producao-estoque-vendas/09-plano-de-entrega.md)).
A 7g foi dividida em duas entregas (D-24):

- **7g1 (este documento):** painel de produção com alertas e o relatório de
  estoque, que completa a tela de Estoque da 7b.
- **7g2 (spec própria, sessão própria):** relatórios mensal, de vendas, de
  origem e de processamento, com os gráficos sugeridos no doc 07.

Regras de origem: seções "Painel de produção (PAINEL)" e "Estoque
(REL_ESTOQUE)" do
[doc 7](../../modulos/producao-estoque-vendas/07-relatorios-indicadores.md);
RN-10, RN-11, RN-12, RN-13, RN-15, RN-16, RN-17, RN-22, RN-24, RN-26,
RN-31, RN-32 e RN-33 do
[doc 3](../../modulos/producao-estoque-vendas/03-regras-de-negocio.md).

Decisões deste desenho (registrar no doc 08):

- **D-24 — 7g em duas entregas:** 7g1 = painel + estoque; 7g2 = mensal,
  vendas, origem e processamento.
- **D-25 — Relatório de estoque na tela existente:** a tela
  `/producao/estoque` já tem saldo por produto × local, valor a custo,
  ocupação, data de referência e ordem FEFO. A 7g1 só acrescenta o resumo
  por status de validade e o PDF em seções. Sem rota nova em
  `/producao/relatorios/estoque`.
- **D-26 — Regras de contagem do painel:**
  - pedidos, recepções e OPs **cancelados ficam fora** de todos os
    números; linhas de OP removidas (`removidoEm`) também;
  - **OP aberta conta no volume** (fruto processado, polpa, rendimento,
    nº de OPs); **o custo médio da polpa usa só OPs encerradas**, as únicas
    com custo gravado (RN-13). O cartão traz a nota "só OPs encerradas";
  - **a receber em aberto** é posição de hoje, não do período: saldo das
    parcelas abertas dos títulos gerados por pedidos não cancelados, de
    qualquer data;
  - **alertas de lote e de entrega olham para hoje**; **OPs a verificar
    seguem o período** do painel, como a lista de Processamento.
- **Sem gráficos na 7g1.** O doc 07 sugere gráficos só para os relatórios
  da 7g2.

## 1. Modelo

Sem mudanças no schema e sem migration. Tudo sai de `RecepcaoFruto`,
`OrdemProducao` (+ `ConsumoOP`, `ProducaoOP`, `InsumoOP`), `PedidoVenda` +
`ItemPedidoVenda`, `Entrega`, `Lote`, `Titulo` + `Parcela` + `Baixa`.
Índices usados: `recepcoes_fruto(filialId, data)`,
`ordens_producao(filialId, data)`, `pedidos_venda(filialId, data)`,
`lotes(filialId, validade)`, `entregas(status, dataPrevista)`.

## 2. Cálculo puro (`src/lib/producao/painel.ts`)

Funções sem banco, testadas em unidade. Recebem totais já agregados e
devolvem os indicadores, com `null` quando o denominador é zero (a tela
mostra "—"):

- `percentualTerceiros(kgTerceiros, kgTotal)` — RN-33.
- `percentualDescarte(descarte, bruto)` — `Σ descarte ÷ Σ bruto`.
- `rendimento(polpa, fruto)` — RN-10.
- `custoMedioPolpa(custoTotal, polpa)` — `Σ custo total ÷ Σ polpa` das OPs
  encerradas.
- `precoMedio(faturamento, kg)`, `ticketMedio(faturamento, pedidos)` — RN-32.
- `margemPercentual(margem, faturamento)` — RN-22.

## 3. Serviço (`src/server/services/relatorioProducao/painel.ts`)

`buscarPainelProducao(sessao, { inicio, fim }, hoje)` devolve um objeto
tipado `PainelProducao`. Tudo na filial da sessão. Agregação no banco
(`groupBy`/`aggregate`) sempre que dá; laço em memória só onde o valor é
produto linha a linha (valor de estoque, margem), igual ao
`resumoProdutoLocal`. Nada de consulta por produto ou por mês. As consultas
independentes rodam em `Promise.all`.

### Recepção e processamento (período, RN-31)

- **Fruto recebido por fruta:** recepções `ATIVA` com `data` no período,
  `groupBy` por `produtoId` e `origem`, somando `pesoBrutoKg` e
  `descarteKg`. Líquido = bruto − descarte. Produto → fruta pelo cadastro.
  Daí saem kg líquido por fruta, % de terceiros por fruta e descarte %
  (total e por fruta).
- **OPs do período:** `status ≠ CANCELADA`, `data` no período, com linhas
  ativas (`removidoEm = null`). Por fruta: nº de OPs, fruto consumido (Σ
  consumo), polpa produzida (Σ produção), rendimento. Custo médio da polpa
  por fruta: só `ENCERRADA`, `Σ (custoFrutoTotal + custoInsumosTotal) ÷ Σ
  polpa dessas OPs`.
- As mesmas OPs (com fruta e linhas) alimentam o alerta "a verificar"
  (seção 5), calculado pelo mesmo resumo da lista de Processamento
  (`resumoComCustoGravado` / `linhasEmNumeros`), para os números baterem.

### Vendas (período, RN-31)

- Itens de pedidos `CONFIRMADO` com `data` no período, com produto
  (categoria e fruta) do lote. Valor = kg × preço; custo = kg × custo/kg
  gravado; margem = valor − custo (RN-22).
- **Faturamento:** total; in natura (`categoria = FRUTO`); polpa por fruta.
- **Kg vendidos, preço médio, nº de pedidos** (distintos), **ticket médio**
  (RN-32), **margem bruta** R$ e %.
- **Tabela "vendas do período por produto":** kg e faturamento, ordenada
  por faturamento.

### A receber em aberto (hoje, RN-26)

Parcelas com status `EM_ABERTO`, `A_VENCER`, `VENCIDO` ou
`PARCIALMENTE_PAGO` de títulos ligados a `PedidoVenda` com `status =
CONFIRMADO` na filial. Saldo de cada parcela por `saldoRemanescenteParcela`
(valor atualizado − baixas aprovadas), somado.

### Estoque (hoje)

- Lotes com `saldoKg > 0`. **Estoque de polpa (kg):** categoria `POLPA`.
  **Fruto aguardando (kg):** categoria `FRUTO` com `validade ≥ hoje`.
  **Valor a custo:** Σ `max(0, saldo) × custoKg` (RN-17).
- **Tabela "estoque atual por produto":** saldo e valor por produto.

## 4. Tela (`/producao/painel`, `producao:ler`)

- **Menu:** primeiro item do grupo Produção, rótulo "Painel".
- **Filtro:** De/Até na URL (`inicio`, `fim`) por `periodoDaUrl`, o mesmo
  da lista de OPs: padrão = mês atual. Atalhos "Mês atual", "Mês
  anterior" e "Ano" (1º de janeiro até 31 de dezembro do ano corrente).
- **Cabeçalho:** título, período e os links de exportação
  (`ExportarLinks`).
- **Bloco 1 — Recepção e processamento:** cartões com uma linha por fruta
  cadastrada que teve movimento no período (nada fixo em açaí/acerola):
  fruto recebido (kg), % terceiros, descarte %, fruto processado (kg),
  nº de OPs, polpa produzida (kg), rendimento, custo médio da polpa (R$/kg,
  com a nota "só OPs encerradas").
- **Bloco 2 — Vendas:** faturamento total, in natura e polpa por fruta; kg
  vendidos; preço médio; nº de pedidos; ticket médio; margem bruta (R$ e
  %); a receber em aberto (com a nota "posição de hoje").
- **Bloco 3 — Estoque e alertas:** estoque de polpa, fruto aguardando,
  valor do estoque, e os alertas da seção 5.
- **Tabelas:** estoque atual por produto; vendas do período por produto.
- Sem dado no período: cartões com "—" e tabelas com "Nada no período".
- Layout em grade responsiva; no celular (390px) os cartões empilham e as
  tabelas rolam na horizontal dentro do próprio contêiner.

## 5. Alertas

Cada alerta mostra a contagem (e kg, quando há). Zero = cartão neutro, sem
link. Maior que zero = cartão destacado e link para a lista filtrada.

| Alerta | Regra | Link |
|---|---|---|
| Lotes vencendo | Lotes com saldo e `statusDoLote = VENCENDO` hoje (RN-16): nº e kg. | `/producao/estoque?status=VENCENDO` |
| Lotes vencidos com saldo | `statusDoLote = VENCIDO` hoje: nº e kg. | `/producao/estoque?status=VENCIDO` |
| Entregas pendentes / em rota | Status `PENDENTE` ou `EM_ROTA`. | `/vendas/entregas` |
| Entregas com atraso | Em aberto com `atrasoEntregaDias(entrega, hoje) > 0` (RN-24). | `/vendas/entregas?atraso=1` |
| OPs com balanço a verificar | OPs do período, não canceladas, com balanço `Verificar` (RN-11). | `/producao/processamento?verificar=balanco&inicio=…&fim=…` |
| OPs com branqueamento a verificar | Idem, branqueamento `Verificar` (RN-12). | `/producao/processamento?verificar=branqueamento&inicio=…&fim=…` |

O status dos lotes usa `statusDoLote` com a configuração de produção da
filial (dias de alerta por conservação), a mesma da lista de estoque.

### Filtros novos nas listas

- **Entregas** (`vendas/entregas/filtros.ts`, `entrega.ts`): parâmetro
  `atraso=1` = só entregas com atraso > 0. Filtra depois do cálculo do
  atraso, que já é feito na listagem. Vale para tela e exportação, e a barra
  de filtros ganha a opção "Só atrasadas".
- **OPs** (`processamento/filtros.ts`, `ordemProducao.ts`): parâmetro
  `verificar=balanco|branqueamento` em `FiltroOPs`. Filtra depois do resumo,
  que já é calculado por OP na listagem. Exclui canceladas quando ativo.
  Vale para tela e exportação, com o seletor "A verificar" (Todas /
  Balanço / Branqueamento) na barra de filtros.

## 6. Relatório de estoque (`/producao/estoque`)

- **Resumo por status de validade**, no topo, nas duas abas: três cartões,
  **OK / Vencendo / Vencido**, cada um com nº de lotes com saldo e kg, na
  data de referência da tela (RN-16). Lote zerado não entra.
- Clicar num cartão aplica `status=` na URL, mantendo os outros filtros.
  Clicar no cartão do status ativo limpa o filtro. O resumo ignora o filtro
  de status (mostra sempre os três), mas respeita produto e local.
- Serviço: `resumoPorStatus(filialId, { produtoId, localId }, referencia)`
  em `estoque.ts`, reaproveitando `statusDoLote`.
- **PDF em seções** (`gerarPdfSecoes`): resumo por status e, conforme a
  aba (`visao`), a lista de lotes ou a tabela produto × local com a
  ocupação dos locais. CSV e Excel continuam iguais (uma linha por lote).

## 7. Exportação do painel (`/producao/painel/export`)

- `producao:ler`, senão 403. Mesmos parâmetros de período da tela.
- **PDF** (`gerarPdfSecoes` + `responderArquivoPdf`): cabeçalho por
  `cabecalhoDoRelatorio` (empresa, filial, período); seções Recepção e
  processamento, Vendas, Estoque e alertas, Estoque por produto, Vendas
  por produto.
- **CSV / Excel** (`responderExport`): uma linha por indicador, colunas
  Bloco, Indicador, Fruta (vazio quando é total), Valor, Unidade
  (kg, %, R$, R$/kg, nº). Montagem em `src/server/export/painelProducao.ts`.
- Nome do arquivo: `painel-producao-AAAA-MM-DD`.

## 8. Permissões

Painel, exportação e filtros novos exigem `producao:ler`; o filtro de
entregas segue `venda:ler`, como a lista. Todo perfil com `producao:ler` tem
`venda:ler`, então o bloco de vendas aparece para todos que veem o painel.
Nenhuma escrita, então nenhuma auditoria nova.

## 9. Ajuda e documentos

- `content/ajuda/passo-a-passo.md`: seção "Painel de produção" (o que cada
  bloco mostra, as regras de contagem da D-26 e o que cada alerta abre) e o
  resumo por status no Estoque.
- `docs/fases/fase-7-producao-estoque-vendas.md`: conclusão da 7g1 e a
  divisão 7g1/7g2.
- Doc 09: linha da 7g dividida em 7g1 e 7g2. Doc 08: D-24, D-25 e D-26.

## 10. Testes

- **Unitário** (`src/lib/producao/painel.test.ts`): cada função da seção 2,
  incluindo denominador zero.
- **Integração** (`src/server/services/relatorioProducao/painel.test.ts`,
  Postgres real): um cenário fixo com duas frutas e números conferidos à
  mão pelas fórmulas da planilha:
  - recepção própria e de terceiro, com descarte, e uma recepção cancelada;
  - uma OP encerrada (custo gravado), uma aberta e uma cancelada; uma OP
    com balanço fora da tolerância e uma de açaí com branqueamento abaixo
    do mínimo;
  - vendas in natura e de polpa, um pedido cancelado, uma venda a prazo em
    aberto e uma à vista paga;
  - um lote vencendo, um vencido com saldo, um zerado;
  - uma entrega atrasada, uma no prazo e uma entregue;
  - eventos fora do período, que não podem entrar.
  O teste confere cada indicador, cada alerta e as duas tabelas.
- **Filtros novos:** `listarEntregas` com `atraso` e `listarOPs` com
  `verificar` (integração); `filtrosDeEntregas` e `filtrosDasOPs` (unidade).
- **Estoque:** `resumoPorStatus` respeitando produto, local e data de
  referência, sem contar lote zerado.
- **Exportação:** linhas do CSV do painel (unidade). Hoje todo perfil tem
  `producao:ler`, então a recusa do serviço é testada simulando a falta da
  permissão (arquivo de teste próprio); o 403 da rota usa o mesmo
  `requirePermission`.
- Conferência no navegador, no desktop e no celular (390px): painel com o
  cenário, cliques nos alertas, resumo do estoque, os três formatos de
  exportação.

## 11. Fora da 7g1

- Relatórios mensal, de vendas, de origem e de processamento, e todos os
  gráficos (7g2).
- Comparação com período anterior, metas e consulta entre filiais.
- Rateio do custo por qualidade (D-06, backlog).
