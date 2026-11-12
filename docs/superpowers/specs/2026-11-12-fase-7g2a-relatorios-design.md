# Fase 7g2a — Relatório mensal e relatório de vendas

Data: 2026-11-12 · Status: desenho aprovado

Primeira metade da 7g2 (ver
[plano de entrega](../../modulos/producao-estoque-vendas/09-plano-de-entrega.md)).
A 7g2 foi dividida em duas entregas (D-27):

- **7g2a (este documento):** relatório mensal e relatório de vendas, com os
  gráficos sugeridos no doc 07.
- **7g2b (spec própria, sessão própria):** relatório de origem da
  matéria-prima e relatório de processamento.

Regras de origem: seções "Relatório mensal (REL_MENSAL)" e "Vendas
(REL_VENDAS)" do
[doc 7](../../modulos/producao-estoque-vendas/07-relatorios-indicadores.md);
RN-10, RN-13, RN-22, RN-26, RN-31, RN-32 e RN-33 do
[doc 3](../../modulos/producao-estoque-vendas/03-regras-de-negocio.md);
regras de contagem do painel (D-26, spec da
[7g1](2026-11-11-fase-7g1-painel-design.md)).

Decisões deste desenho (registrar no doc 08):

- **D-27 — 7g2 em duas entregas:** 7g2a = mensal + vendas; 7g2b = origem +
  processamento.
- **D-28 — Onde ficam os relatórios:** `/producao/relatorios/<nome>`, no
  grupo Produção do menu, logo abaixo do Painel, com `producao:ler`. Uma
  tela por relatório (não abas), porque cada um tem filtro próprio (ano ou
  período).
- **D-29 — Mesmas regras de contagem do painel (D-26):** pedidos, recepções
  e OPs cancelados ficam fora; linhas de OP removidas também; OP aberta conta
  no volume; o custo da polpa usa só OPs encerradas; a receber é posição de
  hoje, de qualquer data. Os números de um mês do relatório mensal batem com
  o painel filtrado naquele mês, e o total a receber do relatório de vendas
  bate com o do painel.

## 1. Modelo

Sem mudanças no schema e sem migration. Tudo sai de `RecepcaoFruto`,
`OrdemProducao` (via `listarOPs`), `PedidoVenda` + `ItemPedidoVenda` +
`Cliente`, `Titulo` + `Parcela` + `Baixa`, `Produto` e `Fruta`.

## 2. Cálculo

### Abordagem

Uma consulta por fonte para o intervalo inteiro (ano ou período), como no
painel. O mês é o mês UTC da data do evento (as datas do sistema são
gravadas em UTC, como no `periodoDaUrl`). Para o relatório mensal, as linhas
são separadas em 12 baldes e cada balde passa pelas **mesmas funções puras do
painel** (`agregarRecepcoes`, `agregarOPs`, `agregarVendas` de
`src/lib/producao/painel.ts`); o total do ano é a mesma função sobre o ano
inteiro. Sem SQL bruto e sem consulta por mês.

### Funções puras (`src/lib/producao/relatorios.ts`)

- `mesUTC(data: Date): number` — 0 a 11.
- `agruparPorMes<T>(linhas: T[], data: (l: T) => Date): T[][]` — 12 baldes.
- `canalPrincipal(itens)` — canal com maior faturamento; empate decidido pela
  ordem do enum `CanalVenda`; pedido sem canal conta como `null` ("Sem
  canal").
- Agregação de vendas por cliente, por produto, por canal e por forma de
  pagamento, a partir das linhas de item já normalizadas (as mesmas que o
  painel passa para `agregarVendas`, acrescidas de `clienteId`, `canal` e
  `formaPagamento`).
- Divisões com denominador zero devolvem `null` (a tela mostra "—"),
  reaproveitando `rendimento`, `custoMedioPolpa`, `precoMedio` e
  `margemPercentual` do painel.

### Consultas compartilhadas

A leitura dos itens vendidos e das parcelas abertas, hoje dentro de
`buscarPainelProducao`, sai para funções da pasta
`src/server/services/relatorioProducao/consultas.ts`, usadas pelo
painel, pelo mensal e pelo de vendas. O painel continua com o mesmo
resultado (o teste dele não muda).

## 3. Relatório mensal (`/producao/relatorios/mensal`)

Serviço: `buscarRelatorioMensal(sessao, ano)` em
`src/server/services/relatorioProducao/mensal.ts`.

- **Filtro:** `ano` na URL; padrão = ano corrente; links "◀ ano anterior" e
  "próximo ano ▶". Ano inválido cai no padrão.
- **Fontes (ano inteiro, filial da sessão):** recepções `ATIVA` em `groupBy`
  por `produtoId`, `origem` e `data`, somando `pesoBrutoKg`, `descarteKg` e
  `valorTotal`; OPs por `listarOPs(filialId, { inicio, fim })`; itens de
  pedidos `CONFIRMADO`.
- **Colunas por fruta:** só frutas com algum movimento no ano, em ordem de
  nome. Nada fixo em açaí/acerola.
- **Quatro tabelas, cada uma com linhas Jan–Dez e Total:**
  - **Recepção:** kg próprio e kg de terceiros por fruta (peso líquido =
    bruto − descarte, como no painel); total recebido.
  - **Processamento:** fruto processado (kg) e polpa produzida (kg) por
    fruta; rendimento por fruta (RN-10); nº de OPs.
  - **Vendas:** faturamento in natura (`categoria = FRUTO`), de polpa por
    fruta e total; kg vendidos; margem bruta R$ e % (RN-22).
  - **Custos:** custo da polpa (R$/kg) por fruta, só OPs encerradas
    (RN-13, D-29); fruto pago a terceiros (R$) = Σ `valorTotal` das
    recepções `TERCEIRO` ativas.
- **Polpa produzida por produto × mês:** uma linha por produto de polpa com
  produção no ano, colunas Jan–Dez e Total.
- **Gráficos (no topo, antes das tabelas):**
  - recebido × processado × vendido (kg) por mês — barras agrupadas;
  - faturamento (barras) e margem % (linha) por mês.
- Mês sem movimento: células "—" nas razões e 0 nas somas; ano sem nenhum
  movimento: a mensagem "Nada no ano." no lugar dos gráficos e das tabelas.

## 4. Relatório de vendas (`/producao/relatorios/vendas`)

Serviço: `buscarRelatorioVendas(sessao, periodo, hoje)` em
`src/server/services/relatorioProducao/vendas.ts`.

- **Filtro:** De/Até na URL (`inicio`, `fim`) por `periodoDaUrl`; padrão =
  mês atual; atalhos "Mês atual", "Mês anterior", "Ano". Os atalhos saem de
  `producao/painel/atalhos.ts` para `producao/_shared/` e o painel passa a
  importar de lá.
- **Base:** itens de pedidos `CONFIRMADO` com `data` no período (a mesma
  consulta do painel). Valor = kg × preço; custo = kg × custo/kg gravado;
  margem = valor − custo (RN-22).
- **Vendas por cliente** (substitui também o "Top 10" do doc 07, que seria
  repetição das dez primeiras linhas; o top 10 vira gráfico): todos os
  clientes, ordenados por faturamento, numerados. Colunas: kg, faturamento,
  % do total, preço médio, margem R$, margem %, canal principal, a receber.
  - **A receber:** posição de hoje (D-29), saldo das parcelas abertas
    (`EM_ABERTO`, `A_VENCER`, `VENCIDO`, `PARCIALMENTE_PAGO`) dos títulos de
    pedidos `CONFIRMADO` do cliente, de qualquer data, por
    `saldoRemanescenteParcela`.
  - Clientes **sem venda no período e com saldo a receber** também entram,
    com faturamento zero, no fim da lista (ordenados por a receber). Assim a
    soma da coluna fecha com o "a receber" do painel.
- **Por produto:** kg, faturamento, preço médio, custo médio (Σ custo ÷ Σ
  kg), margem %. Ordenado por faturamento.
- **Por canal:** kg, faturamento, % do total; pedido sem canal = "Sem
  canal".
- **Por forma de pagamento:** faturamento no período e a receber hoje (saldo
  agrupado pela forma do pedido de origem).
- **Linha de total** em todas as tabelas.
- **Gráficos (no topo):** faturamento por canal e top 10 clientes por
  faturamento, ambos em barras horizontais.
- Sem venda no período: tabelas com "Nada no período" (a tabela de clientes
  ainda mostra quem tem saldo a receber) e gráficos ocultos.

## 5. Gráficos

`recharts` pelo `src/components/ui/chart.tsx`, como o dashboard executivo,
em componentes cliente que recebem os dados já calculados pelo servidor.
Cores dos tokens do tema (claro e escuro). Rótulos em pt-BR, valores
formatados (kg, R$, %). No celular os gráficos ocupam a largura toda, um
embaixo do outro. Não vão para o PDF.

## 6. Exportação

Rotas `…/relatorios/mensal/export/route.ts` e
`…/relatorios/vendas/export/route.ts`, com `producao:ler` (senão 403) e os
mesmos parâmetros da tela.

- **PDF:** `gerarPdfSecoes` + `responderArquivoPdf`, cabeçalho por
  `cabecalhoDoRelatorio` (empresa, filial, ano ou período); uma seção por
  tabela.
- **CSV / Excel (`responderExport`):**
  - **Mensal** — formato longo: Bloco, Indicador, Fruta (vazio = total),
    Mês (1–12 ou "Total"), Valor, Unidade. Montagem em
    `src/server/export/relatorioMensal.ts`.
  - **Vendas** — uma tabela só com uma linha por item de cada seção:
    Seção, Item, Kg, Faturamento, % do total, Preço médio, Custo médio,
    Margem R$, Margem %, Canal principal, A receber (cada seção preenche só
    as colunas que se aplicam). Montagem em
    `src/server/export/relatorioVendas.ts`.
- Nomes: `relatorio-mensal-AAAA` e `relatorio-vendas-AAAA-MM-DD` (data do
  início do período).

## 7. Menu e permissões

`nav-items.ts`, grupo Produção, logo abaixo de "Painel": "Relatório mensal"
e "Relatório de vendas", ambos `producao:ler`. Os serviços chamam
`requirePermission(sessao.perfil, "producao:ler")`. Nenhuma escrita, nenhuma
auditoria nova.

## 8. Ajuda e documentos

- `content/ajuda/passo-a-passo.md`: seção "Relatórios de produção" com o
  mensal e o de vendas (filtros, o que cada tabela mostra, regras da D-29,
  canal principal, a receber como posição de hoje). A 7g2b acrescenta os
  outros dois.
- Doc 08: D-27, D-28, D-29.
- Doc 09: linha da 7g2 dividida em 7g2a e 7g2b.
- `docs/fases/fase-7-producao-estoque-vendas.md`: conclusão da 7g2a.

## 9. Testes

- **Unidade** (`src/lib/producao/relatorios.test.ts`): `mesUTC` e
  `agruparPorMes` (virada de ano, dia 31 às 23h UTC); `canalPrincipal`
  (empate, sem canal); agregações por cliente, canal e forma; denominador
  zero.
- **Integração** (Postgres real, fixtures de `producaoTestFixtures.ts`):
  - **Mensal** (`mensal.test.ts`): duas frutas, recepções própria e de
    terceiro, OPs encerrada e aberta, vendas in natura e de polpa em dois
    meses; uma recepção, uma OP e um pedido cancelados; eventos do ano
    anterior. Confere cada célula e o total, e que um mês bate com
    `buscarPainelProducao` filtrado no mesmo mês.
  - **Vendas** (`vendas.test.ts`): três clientes, um só com saldo a receber
    de pedido antigo; pedido sem canal; pedido cancelado; venda à vista paga
    e a prazo em aberto. Confere as quatro tabelas, o canal principal e que
    o total a receber é igual ao do painel.
  - **Painel:** o teste existente continua passando depois da extração das
    consultas compartilhadas.
- **Permissão** (`relatorios.permissao.test.ts`): recusa dos dois serviços
  simulando a falta de `producao:ler`, como na 7g1.
- **Exportação:** linhas do CSV dos dois relatórios (unidade).
- **Navegador:** desktop e celular (390px), com cenário montado numa empresa
  de teste; gráficos, navegação de ano, atalhos de período e os três
  formatos de exportação; dados de teste apagados no fim.

## 10. Fora da 7g2a

- Relatórios de origem e de processamento (7g2b).
- Comparação com o ano ou período anterior; metas; consulta entre filiais.
- Gráficos no PDF.
